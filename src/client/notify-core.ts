/**
 * Pure notification planning: diff two Session-status snapshots into the
 * notification events they imply.
 *
 * This module deliberately has no DOM and no DSH import, so `node --test` can
 * exercise every transition rule directly (see `tests/notify-core.test.ts`).
 */

/** The status facts this plugin reads for one Session. */
export interface SessionStatusLike {
  /** Latest known running state; absent until a baseline or event establishes it. */
  readonly running?: boolean | undefined
  /** Highest-precedence request currently awaiting user interaction. */
  readonly pendingInteraction?: { readonly key: string; readonly kind: string } | undefined
}

/** Catalog facts this plugin reads for one Session. */
export interface SessionRowLike {
  /** Human-facing label used as the notification title. */
  readonly title: string
  /** Whether the Session is a direct-parent subagent rather than an Agent of its own. */
  readonly subagent: boolean
}

/** Preference gates applied while planning. */
export interface NotifyGates {
  /** Emit `complete` events (a main Agent stopped running). */
  readonly notifyOnComplete: boolean
  /** Emit `interaction` events (an Agent is waiting on the user). */
  readonly notifyOnInteraction: boolean
}

/** One notification the status diff asks for, keyed by the caller's Session identity. */
export type NotifyEvent<K extends string> =
  | {
    readonly type: 'complete'
    readonly sessionId: K
    readonly title: string
  }
  | {
    readonly type: 'interaction'
    readonly sessionId: K
    readonly title: string
    /** Domain discriminator: `approval`, `question`, `plan-review`, ... */
    readonly kind: string
    /** Whether the waiting Session is a subagent (worded differently in the body). */
    readonly subagent: boolean
  }

/**
 * Diff two status snapshots into the notifications they imply.
 *
 * Rules, checked per Session in snapshot iteration order:
 * - A Session absent from the previous snapshot establishes a baseline and
 *   never notifies, so a page reload cannot replay old work.
 * - `complete` fires only on a true → false running transition (an unknown
 *   `undefined` baseline never notifies) and is skipped for subagents: a
 *   subagent stopping is not the task the user is waiting for, and its parent
 *   reports the same completion once the whole turn settles.
 * - `interaction` fires whenever a *new* pending-interaction key appears,
 *   including on subagents — a subagent blocked on approval stalls the parent
 *   turn, so the user must still be told.
 * @param previous - status snapshot before the change.
 * @param next - status snapshot after the change.
 * @param row - catalog lookup supplying the display title and subagent flag.
 * @param gates - preference gates.
 * @returns the notifications to show.
 */
export function planNotifications<K extends string>(
  previous: ReadonlyMap<K, SessionStatusLike>,
  next: ReadonlyMap<K, SessionStatusLike>,
  row: (sessionId: K) => SessionRowLike,
  gates: NotifyGates,
): NotifyEvent<K>[] {
  const events: NotifyEvent<K>[] = []
  for (const [sessionId, status] of next) {
    const before = previous.get(sessionId)
    if (before === undefined) continue
    const catalog = row(sessionId)

    if (gates.notifyOnComplete
      && before.running === true
      && status.running === false
      && !catalog.subagent) {
      events.push({ type: 'complete', sessionId, title: catalog.title })
    }

    const interaction = status.pendingInteraction
    if (gates.notifyOnInteraction
      && interaction !== undefined
      && before.pendingInteraction?.key !== interaction.key) {
      events.push({
        type: 'interaction',
        sessionId,
        title: catalog.title,
        kind: interaction.kind,
        subagent: catalog.subagent,
      })
    }
  }
  return events
}
