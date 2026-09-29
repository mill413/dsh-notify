/**
 * The last notification decision, kept for the settings card.
 *
 * A notification plugin is otherwise silent about its own silences: a trigger
 * that the quiet gate skipped is indistinguishable from a trigger that never
 * fired. This holds one record so the card can say which happened, without a
 * console and without turning the feature into a log viewer.
 *
 * The record is per page load and never persisted: it answers "just now", not
 * "last week".
 */

/** One observed trigger and what the plugin did with it. */
export interface TriggerRecord {
  /** Epoch milliseconds of the decision. */
  readonly at: number
  /** Which trigger fired. */
  readonly kind: 'complete' | 'interaction'
  /** Session label the notification was about. */
  readonly title: string
  /** Why nothing (or something) appeared. */
  readonly outcome: 'sent' | 'foreground' | 'unsupported'
}

/** Read-and-observe face of the last trigger. */
export interface TriggerLog {
  /**
   * Record one decision, replacing the previous record.
   * @param record - the decision to remember.
   */
  record(record: TriggerRecord): void
  /** @returns the latest decision, or undefined before the first one. */
  getSnapshot(): TriggerRecord | undefined
  /**
   * Observe record replacements.
   * @param listener - invoked after each record.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
}

/**
 * Build one trigger log.
 * @param now - clock seam for tests.
 * @returns the log handle.
 */
export function createTriggerLog(now: () => number = Date.now): TriggerLog {
  let current: TriggerRecord | undefined
  const listeners = new Set<() => void>()
  return {
    record: (record) => {
      current = { ...record, at: record.at || now() }
      listeners.forEach((listener) => listener())
    },
    getSnapshot: () => current,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}
