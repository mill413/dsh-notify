/**
 * dsh-notify, browser half.
 *
 * Two pieces, no UI of its own beyond the settings card:
 *
 * 1. A watcher over the Session status snapshot (`ctx.uiSession.sessionStatus`),
 *    which the harness already maintains for per-Session running state and the
 *    highest-precedence pending interaction. Diffing that snapshot is enough to
 *    know both "the task finished" and "someone is waiting for you", without
 *    this plugin retaining Sessions or subscribing to any event stream.
 * 2. A settings card in the Plugins page that owns the master switch, the
 *    trigger toggles, the browser permission flow, and a test notification.
 *
 * Every DSH package is reached through the Cordis context, so the bundle only
 * imports React and the UI primitives at runtime.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createElement } from 'react'
// Type-only: pulls `ctx.sessions` (the Client Session list) and `ctx.uiSession`
// (the unified Session status snapshot).
import type {} from '@deepseek-ai/dsh-api-session-controller/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
// Type-only: pulls `ctx.uiWorkspace` (reveal a Session from a notification click).
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
// Type-only: pulls `ctx.configForms` (the client settings transport).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls `ctx.locale` and the slot declarations.
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { NotifySettingsCard, type NotifySettingsCardInjected } from './NotifySettingsCard.tsx'
import { planNotifications, type NotifyEvent } from './notify-core.ts'
import {
  isPageBackground,
  notifyEnvironment,
  requestNotifyPermission,
  showSystemNotification,
} from './notifications.ts'
import { createPrefsLive, NS, type NotifyPrefs } from './prefs.ts'
import { createTriggerLog, type TriggerLog } from './trigger-log.ts'
import { en, zh, type NotifyKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Desktop-notification card copy. */
    'dsh-notify': NotifyKey
  }
}

export type { NotifyPrefs } from './prefs.ts'
export type { NotifyKey } from './locales.ts'

/** Required services: the Session list and status snapshot, slots, and copy. */
export const inject = ['sessions', 'uiSession', 'slots', 'locale', 'configForms'] as const

/** Localization namespace, identical to the plugin's Cordis entry id. */
export { NS } from './prefs.ts'

/** Loose face of the slot registry; the typed registry needs a slot-owner peer. */
interface SlotsFace {
  inject(name: string, register: () => unknown): void
  register(options: Record<string, unknown>, component: unknown): unknown
}

/** Loose face of the locale service; the card receives an already-bound `t`. */
interface LocaleFace {
  register(ns: string, dicts: Record<string, Record<string, string>>): () => void
  bind(ns: string): (key: NotifyKey) => string
}

/** @returns the catalog facts used for one Session's notification wording. */
function catalogRow(ctx: ClientContext, sessionId: SessionId): { title: string; subagent: boolean } {
  const row = ctx.sessions.list.getSnapshot().byId[sessionId]
  return {
    title: row?.displayTitle ?? sessionId,
    // A subagent row is not the Agent the user is waiting on; its own stop is
    // reported by the parent's turn instead.
    subagent: row?.origin === 'subagent' || row?.parentId !== undefined,
  }
}

/** Map a pending-interaction domain discriminator onto its body copy. */
function interactionKey(kind: string): NotifyKey {
  switch (kind) {
    case 'approval': return 'notify.interaction.approval'
    case 'question': return 'notify.interaction.question'
    case 'plan-review': return 'notify.interaction.plan-review'
    default: return 'notify.interaction.other'
  }
}

/**
 * Reveal one Session, best-effort: a missing Workspace service or a refused
 * navigation must never break the notification click.
 */
function revealSession(ctx: ClientContext, sessionId: SessionId): void {
  try {
    ctx.get('uiWorkspace')?.openSession(sessionId)
  } catch (error: unknown) {
    console.warn('[dsh-notify] could not reveal session', sessionId, error)
  }
}

/**
 * Install the Session-status watcher.
 *
 * The first snapshot establishes a baseline, so a page reload never replays
 * notifications for work that finished while it was closed.
 */
function installWatcher(
  ctx: ClientContext,
  prefs: ReturnType<typeof createPrefsLive>,
  triggers: TriggerLog,
  t: (key: NotifyKey) => string,
): void {
  const status = ctx.uiSession.sessionStatus
  let previous = status.getSnapshot()

  const show = (event: NotifyEvent<SessionId>, current: NotifyPrefs): void => {
    const remember = (outcome: 'sent' | 'foreground' | 'unsupported'): void => {
      triggers.record({ at: Date.now(), kind: event.type, title: event.title, outcome })
    }
    if (current.onlyWhenBackground && !isPageBackground()) {
      // The quiet default: recorded so the card can explain the silence.
      remember('foreground')
      return
    }
    const onClick = (): void => { revealSession(ctx, event.sessionId) }
    const sent = event.type === 'complete'
      ? showSystemNotification({
        title: event.title,
        body: t('notify.complete.body'),
        tag: `dsh-notify-complete-${event.sessionId}`,
        onClick,
      })
      : showSystemNotification({
        title: event.title,
        body: t(interactionKey(event.kind)) + (event.subagent ? t('notify.interaction.subagent') : ''),
        tag: `dsh-notify-interaction-${event.sessionId}`,
        onClick,
      })
    remember(sent ? 'sent' : 'unsupported')
  }

  ctx.effect(() => {
    previous = status.getSnapshot()
    return status.subscribe(() => {
      const next = status.getSnapshot()
      const before = previous
      previous = next
      const current = prefs.get()
      if (!current.enabled) return
      const lookup = (id: SessionId): { title: string; subagent: boolean } => catalogRow(ctx, id)
      for (const event of planNotifications(before, next, lookup, current)) {
        show(event, current)
      }
    })
  }, 'dsh-notify: session status watcher')
}

/** Register the settings card inside this plugin's Plugins-page entry. */
function installSettingsCard(
  ctx: ClientContext,
  prefs: ReturnType<typeof createPrefsLive>,
  triggers: TriggerLog,
  t: (key: NotifyKey) => string,
): void {
  const slots = ctx.get('slots') as unknown as SlotsFace
  const injected: NotifySettingsCardInjected = {
    prefs,
    t,
    triggers,
    environment: notifyEnvironment,
    requestPermission: requestNotifyPermission,
    showTest: (title, body) => showSystemNotification({ title, body, tag: 'dsh-notify-test' }),
  }
  slots.inject('plugins.bundle.config', () => slots.register({
    name: 'plugins.bundle.config',
    key: '@mill413/dsh-notify',
    locale: NS,
    inject: () => injected,
  }, ({ view }: { view: 'summary' | 'page' }) =>
    view === 'summary' ? t('card.description') : createElement(NotifySettingsCard, injected)))
}

/** Browser entry point. */
export function apply(ctx: ClientContext): void {
  const prefs = createPrefsLive(ctx)
  const triggers = createTriggerLog()
  const locale = ctx.get('locale') as unknown as LocaleFace
  ctx.effect(() => locale.register(NS, { zh, en }), 'dsh-notify: dictionaries')
  ctx.effect(() => () => { prefs.dispose() }, 'dsh-notify: preferences')
  const t = locale.bind(NS)

  installWatcher(ctx, prefs, triggers, t)
  installSettingsCard(ctx, prefs, triggers, t)
}
