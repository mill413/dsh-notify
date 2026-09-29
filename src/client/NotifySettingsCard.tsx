/**
 * Settings card contributed by `dsh-notify`, rendered on this plugin's page in
 * the Plugins settings section (`plugins.bundle.config`).
 *
 * It mirrors the harness plugin-card chrome — a disclosure header naming the
 * plugin, a body disclosing its fields, a footer carrying the save — through an
 * injected stylesheet, so the card reads as one of the settings panel's own
 * rather than an add-on.
 *
 * Besides the persisted toggles the card owns the *permission* conversation,
 * because that state is not the plugin's to persist: it belongs to the browser
 * and can be revoked outside this page at any time.
 */

import { useEffect, useRef, useState } from 'react'
import { IconChevronDownOutlineRegular, Switch } from '@deepseek-ai/dsh-client-ui-primitives'
import { adoptDraft, PREFS_DEFAULTS, type NotifyPrefs, type PrefsLive } from './prefs.ts'
import type { NotifyEnvironment, NotifyPermission } from './notifications.ts'
import type { TriggerRecord, TriggerLog } from './trigger-log.ts'
import type { NotifyKey } from './locales.ts'

/** Dependencies injected by the card's slot registration. */
export interface NotifySettingsCardInjected {
  /** Live handle over this plugin entry's Config. */
  prefs: PrefsLive
  /** Namespace-bound translate. */
  t: (key: NotifyKey) => string
  /** Latest trigger decision, so a silence explains itself. */
  triggers: TriggerLog
  /** Read the browser's current notification capability. */
  environment: () => NotifyEnvironment
  /** Ask the browser for permission (must run inside a user gesture). */
  requestPermission: () => Promise<NotifyPermission>
  /** Show one test notification; @returns whether it was shown. */
  showTest: (title: string, body: string) => boolean
}

/** The persistence-backed toggles, in display order. */
const FIELDS: ReadonlyArray<{ key: keyof NotifyPrefs; label: NotifyKey; hint: NotifyKey }> = [
  { key: 'enabled', label: 'card.field.enabled', hint: 'card.field.enabled.desc' },
  { key: 'notifyOnComplete', label: 'card.field.notifyOnComplete', hint: 'card.field.notifyOnComplete.desc' },
  { key: 'notifyOnInteraction', label: 'card.field.notifyOnInteraction', hint: 'card.field.notifyOnInteraction.desc' },
  { key: 'onlyWhenBackground', label: 'card.field.onlyWhenBackground', hint: 'card.field.onlyWhenBackground.desc' },
]

/** Permission state → its status copy. */
const PERMISSION_LABEL: Record<NotifyPermission, NotifyKey> = {
  granted: 'perm.granted',
  default: 'perm.default',
  denied: 'perm.denied',
  unsupported: 'perm.unsupported',
  insecure: 'perm.insecure',
}

/** Permission state → its explanatory copy. */
const PERMISSION_HINT: Record<NotifyPermission, NotifyKey> = {
  granted: 'perm.hint.granted',
  default: 'perm.hint.default',
  denied: 'perm.hint.denied',
  unsupported: 'perm.hint.unsupported',
  insecure: 'perm.hint.insecure',
}

/** Inject the once-only card chrome stylesheet. */
function ensureCardStyle(): void {
  if (document.getElementById('dsn-notify-card-style') !== null) return
  const style = document.createElement('style')
  style.id = 'dsn-notify-card-style'
  style.textContent = `
    .dsn-card { list-style: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 12px; background: var(--dsw-alias-bg-layer-3); transition: border-color .16s, background .16s; }
    .dsn-card:hover { border-color: var(--dsw-alias-label-dimmed); }
    .dsn-cardOpen { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-label-dimmed); }
    .dsn-header { width: 100%; appearance: none; border: 0; background: none; font: inherit; color: inherit; text-align: left; cursor: pointer; display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; }
    .dsn-header:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
    .dsn-headText { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
    .dsn-name { font-size: 15px; font-weight: 600; line-height: 1.4; color: var(--dsw-alias-label-primary); }
    .dsn-description { font-size: 13px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-chevron { flex: none; color: var(--dsw-alias-label-tertiary); transition: transform .16s; }
    .dsn-chevronOpen { transform: rotate(180deg); }
    .dsn-body { border-top: 1px solid var(--dsw-alias-border-l2); margin: 0 16px; padding-bottom: 8px; }
    .dsn-readOnly { margin: 12px 0 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-pending { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
    .dsn-field { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; }
    .dsn-field + .dsn-field { border-top: 1px solid var(--dsw-alias-border-l2); }
    .dsn-toggleRow { display: flex; align-items: center; gap: 12px; }
    .dsn-toggleLabel { flex: 1; min-width: 0; font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
    .dsn-hint { margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-tertiary); }
    .dsn-statusRow { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .dsn-statusLabel { font-size: 13px; font-weight: 500; line-height: 1.5; color: var(--dsw-alias-label-primary); }
    .dsn-badge { flex: none; border-radius: 999px; padding: 1px 8px; font-size: 11px; line-height: 17px; font-weight: 500; white-space: nowrap; background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-secondary); }
    .dsn-badgeOk { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-brand-primary); }
    .dsn-badgeBad { background: var(--dsw-alias-bg-module-platform); color: var(--dsw-alias-label-error); }
    .dsn-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .dsn-button { appearance: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; padding: 5px 12px; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); }
    .dsn-button:hover:not(:disabled) { border-color: var(--dsw-alias-label-dimmed); }
    .dsn-button:disabled { opacity: .5; cursor: default; }
    .dsn-button:focus-visible, .dsn-save:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
    .dsn-footer { display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 12px 0 4px; border-top: 1px solid var(--dsw-alias-border-l2); }
    .dsn-failed { flex: 1; min-width: 0; margin: 0; font-size: 12px; line-height: 1.5; color: var(--dsw-alias-label-error); }
    .dsn-save { appearance: none; border: 1px solid transparent; border-radius: 8px; padding: 5px 14px; font: inherit; font-size: 13px; line-height: 1.5; cursor: pointer; background: var(--dsw-alias-label-primary); color: var(--dsw-alias-bg-layer-3); }
    .dsn-save:disabled { opacity: .4; cursor: default; }
    @media (prefers-reduced-motion: reduce) { .dsn-card, .dsn-chevron { transition: none; } }
  `
  document.head.appendChild(style)
}

/** Render the dsh-notify settings card. */
export function NotifySettingsCard(props: Partial<NotifySettingsCardInjected>): React.ReactElement | null {
  const { prefs, t, triggers, environment, requestPermission, showTest } = props
  const persistedRef = useRef<NotifyPrefs | null>(null)
  const [open, setOpen] = useState(false)
  const [persisted, setPersisted] = useState<NotifyPrefs | null>(null)
  const [draft, setDraft] = useState<NotifyPrefs>(PREFS_DEFAULTS)
  const [writable, setWritable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [env, setEnv] = useState<NotifyEnvironment | null>(null)
  const [notice, setNotice] = useState<NotifyKey | null>(null)
  const [trigger, setTrigger] = useState<TriggerRecord | undefined>(undefined)

  useEffect(() => {
    if (prefs === undefined || t === undefined) return undefined
    ensureCardStyle()
    const read = (): void => {
      const value = prefs.get()
      // Capture the previously published document BEFORE scheduling the update:
      // React runs the updater during the next render, by which time the ref has
      // already been advanced, and the first read must still see `null` so it
      // adopts the persisted values instead of keeping the shipped defaults.
      const previous = persistedRef.current
      setPersisted(value)
      setWritable(prefs.writable())
      setDraft((draft) => adoptDraft(draft, value, previous))
      persistedRef.current = value
    }
    read()
    return prefs.subscribe(read)
  }, [prefs, t])

  useEffect(() => {
    if (environment === undefined) return undefined
    const refresh = (): void => { setEnv(environment()) }
    refresh()
    // Permission can be changed from the browser's own site settings while this
    // page stays mounted, so re-read whenever the window regains focus.
    window.addEventListener('focus', refresh)
    return () => { window.removeEventListener('focus', refresh) }
  }, [environment])

  useEffect(() => {
    if (triggers === undefined) return undefined
    const read = (): void => { setTrigger(triggers.getSnapshot()) }
    read()
    return triggers.subscribe(read)
  }, [triggers])

  if (prefs === undefined || t === undefined || persisted === null) return null

  const dirty = FIELDS.some(({ key }) => draft[key] !== persisted[key])
  const disabled = !writable || saving
  const permission = env?.permission ?? 'default'

  const save = (): void => {
    if (!dirty || disabled) return
    setSaving(true)
    setFailed(false)
    prefs.save(draft)
      .then(() => { setDraft(prefs.get()); setSaving(false) })
      .catch(() => { setFailed(true); setSaving(false) })
  }

  const ask = (): void => {
    setNotice(null)
    if (requestPermission === undefined) return
    void requestPermission().then((result) => {
      setEnv(environment?.() ?? null)
      setNotice(result === 'granted' ? 'perm.hint.granted' : null)
    })
  }

  const test = (): void => {
    setNotice(null)
    if (showTest === undefined || t === undefined) return
    const shown = showTest(t('notify.test.title'), t('notify.test.body'))
    setNotice(shown ? 'action.testSent' : 'action.testFailed')
    setEnv(environment?.() ?? null)
  }

  const badgeClass = permission === 'granted'
    ? 'dsn-badge dsn-badgeOk'
    : permission === 'default' ? 'dsn-badge' : 'dsn-badge dsn-badgeBad'

  return (
    <li className={open ? 'dsn-card dsn-cardOpen' : 'dsn-card'}>
      <button
        type="button"
        className="dsn-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'card.collapse' : 'card.expand')}: ${t('card.title')}`}
        onClick={() => { setOpen(!open) }}
      >
        <span className="dsn-headText">
          <span className="dsn-name">{t('card.title')}</span>
          <span className="dsn-description">{t('card.description')}</span>
        </span>
        {dirty ? <span className="dsn-pending">{t('card.unsaved')}</span> : null}
        <IconChevronDownOutlineRegular className={open ? 'dsn-chevron dsn-chevronOpen' : 'dsn-chevron'} />
      </button>
      {open
        ? (
          <div className="dsn-body">
            {!writable ? <p className="dsn-readOnly" role="status">{t('card.readOnly')}</p> : null}

            <div className="dsn-field">
              <div className="dsn-statusRow">
                <span className="dsn-statusLabel">{t('perm.label')}</span>
                <span className={badgeClass}>{t(PERMISSION_LABEL[permission])}</span>
              </div>
              <p className="dsn-hint">{t(PERMISSION_HINT[permission])}</p>
              {notice !== null ? <p className="dsn-hint" role="status">{t(notice)}</p> : null}
              <div className="dsn-actions">
                {env?.supported === true && permission === 'default'
                  ? (
                    <button type="button" className="dsn-button" onClick={ask}>
                      {t('action.request')}
                    </button>
                  )
                  : null}
                {env?.supported === true
                  ? (
                    <button type="button" className="dsn-button" disabled={permission !== 'granted'} onClick={test}>
                      {t('action.test')}
                    </button>
                  )
                  : (
                    <button type="button" className="dsn-button" onClick={() => { setEnv(environment?.() ?? null); setNotice(null) }}>
                      {t('action.refresh')}
                    </button>
                  )}
              </div>
              <p className="dsn-hint">{t('trigger.label')}：{describeTrigger(trigger, t)}</p>
            </div>

            {FIELDS.map(({ key, label, hint }) => (
              <div className="dsn-field" key={key}>
                <div className="dsn-toggleRow">
                  <span className="dsn-toggleLabel">{t(label)}</span>
                  <Switch
                    checked={draft[key]}
                    label={t(label)}
                    disabled={disabled}
                    onChange={() => {
                      setFailed(false)
                      setDraft((value) => ({ ...value, [key]: !value[key] }))
                    }}
                  />
                </div>
                <p className="dsn-hint">{t(hint)}</p>
              </div>
            ))}

            <div className="dsn-footer">
              {failed ? <p className="dsn-failed" role="status">{t('card.failed')}</p> : null}
              <button type="button" className="dsn-save" disabled={!dirty || disabled} onClick={save}>
                {t(saving ? 'card.saving' : 'card.save')}
              </button>
            </div>
          </div>
        )
        : null}
    </li>
  )
}

/**
 * Render the last trigger decision in one line.
 *
 * The timestamp is what makes the line trustworthy: "skipped" without a time
 * could be from this run or from an hour ago, and the reader is usually asking
 * about the run they just watched.
 * @param trigger - the recorded decision, or undefined before the first one.
 * @param t - namespace-bound translate.
 * @returns the line's text.
 */
function describeTrigger(trigger: TriggerRecord | undefined, t: (key: NotifyKey) => string): string {
  if (trigger === undefined) return t('trigger.none')
  const time = new Date(trigger.at).toLocaleTimeString(undefined, { hour12: false })
  const kind = t(trigger.kind === 'complete' ? 'trigger.kind.complete' : 'trigger.kind.interaction')
  const outcome = t(trigger.outcome === 'sent'
    ? 'trigger.outcome.sent'
    : trigger.outcome === 'foreground' ? 'trigger.outcome.foreground' : 'trigger.outcome.unsupported')
  return `${time} · ${kind} · ${outcome}`
}
