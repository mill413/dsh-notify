/**
 * Client-side live preference handle over this plugin entry's Cordis `Config`.
 *
 * Reads ride the shared configuration form (`ctx.configForms`), the client half
 * of the settings service: the Host projects the entry's `.volatile()` Config
 * fields into that form and pushes accepted values back. Writes go through the
 * same form's atomic, revision-fenced `mutate`. Defaults hold until the form
 * resolves, and the service is read optionally — no settings provider means the
 * defaults still drive the watcher.
 *
 * This mirrors `dsh-polish`'s preference handle: it replaces the removed
 * `ctx.settingsScope`, because 0.1.7 addresses a form by its profile entry id,
 * which is this plugin's own row id.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: pulls `ctx.configForms` (the shared configuration form service).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'

/** Notification preferences owned by the browser half. */
export interface NotifyPrefs {
  /** Master switch for browser system notifications. */
  enabled: boolean
  /** Notify when a main Agent stops running (its turn finished). */
  notifyOnComplete: boolean
  /** Notify when an Agent is waiting for approval or an answer. */
  notifyOnInteraction: boolean
  /** Suppress notifications while the page is visible and focused. */
  onlyWhenBackground: boolean
}

/** Default values match the shipped behaviour and the Host Config schema. */
export const PREFS_DEFAULTS: NotifyPrefs = {
  enabled: true,
  notifyOnComplete: true,
  notifyOnInteraction: true,
  onlyWhenBackground: true,
}

/**
 * The settings form's entry id. A client must not import the Host half, so the
 * id is spelled here; it is the row id this package's `cordis.patch.yml`
 * declares, which is also the entry whose Config carries the fields.
 */
export const NS = 'dsh-notify'

/** Reactive owner handle for the plugin preferences. */
export interface PrefsLive {
  /** @returns the current preference (defaults before the form resolves). */
  get(): NotifyPrefs
  /** @returns whether the form is ready and the Host document accepts writes. */
  writable(): boolean
  /**
   * Save a complete draft atomically.
   * @param value - the full preference document to persist.
   */
  save(value: NotifyPrefs): Promise<void>
  /**
   * Observe preference replacements.
   * @param listener - invoked after each change.
   * @returns the disposer removing this listener.
   */
  subscribe(listener: () => void): () => void
  /** Stop deriving and observing the settings form. */
  dispose(): void
}

/**
 * Build the live preference over `ctx.configForms` (optional service).
 * @param ctx - client root context.
 * @returns the reactive preference handle.
 */
export function createPrefsLive(ctx: ClientContext): PrefsLive {
  const form = ctx.get('configForms')?.get<NotifyPrefs>(NS)
  let current: NotifyPrefs = { ...PREFS_DEFAULTS }
  let currentWritable = false
  const listeners = new Set<() => void>()

  const reconsider = (): void => {
    if (form === undefined) return
    const snapshot = form.getSnapshot()
    currentWritable = snapshot.status === 'ready' && snapshot.writable
    if (snapshot.status === 'ready' && typeof snapshot.value === 'object' && snapshot.value !== null) {
      current = normalizePrefs({ ...PREFS_DEFAULTS, ...snapshot.value })
    }
    listeners.forEach((listener) => listener())
  }
  reconsider()
  const unsubscribe = form?.subscribe(reconsider)

  return {
    get: () => current,
    writable: () => currentWritable,
    async save(value) {
      if (form === undefined || !currentWritable) throw new Error('Settings are not writable')
      const next = normalizePrefs(value)
      // One revision-fenced write for every field: the toggles describe one
      // coherent notification policy and must never land half-applied.
      const landed = await form.mutate((Object.keys(next) as Array<keyof NotifyPrefs>)
        .map((key) => ({ op: 'set' as const, path: [key], value: next[key] })))
      if (!landed) throw new Error('Settings write was refused')
      reconsider()
    },
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    dispose: () => { unsubscribe?.() },
  }
}

/**
 * Coerce a possibly partial document into complete booleans; a legacy or
 * hand-edited patch value of the wrong type falls back to the default.
 * @param value - candidate document.
 * @returns a complete preference document.
 */
export function normalizePrefs(value: Partial<NotifyPrefs>): NotifyPrefs {
  const bool = (key: keyof NotifyPrefs): boolean =>
    typeof value[key] === 'boolean' ? value[key] : PREFS_DEFAULTS[key]
  return {
    enabled: bool('enabled'),
    notifyOnComplete: bool('notifyOnComplete'),
    notifyOnInteraction: bool('notifyOnInteraction'),
    onlyWhenBackground: bool('onlyWhenBackground'),
  }
}

/**
 * Whether two preference documents carry the same values.
 * @param left - one document.
 * @param right - the other.
 * @returns whether every field matches.
 */
export function samePrefs(left: NotifyPrefs, right: NotifyPrefs): boolean {
  return (Object.keys(PREFS_DEFAULTS) as Array<keyof NotifyPrefs>)
    .every(key => left[key] === right[key])
}

/**
 * Choose the draft a settings card holds after the form published a new
 * persisted document.
 *
 * The card preserves an edit the user has not saved, so a Host push for an
 * unrelated reason cannot silently discard a flip the user just made. The
 * comparison is against the *previous* published document rather than the new
 * one: before the first read there is no previous document, so the first read
 * always adopts the persisted values — a card that started from the shipped
 * defaults must not mistake them for a user edit — and afterwards a draft is
 * preserved only while it still equals what was published last.
 * @param draft - the draft the card currently holds.
 * @param published - the document just published by the form.
 * @param previous - the document published before this one, or null before the first read.
 * @returns the draft to hold.
 */
export function adoptDraft(
  draft: NotifyPrefs,
  published: NotifyPrefs,
  previous: NotifyPrefs | null,
): NotifyPrefs {
  if (previous === null || samePrefs(draft, previous)) return published
  return draft
}
