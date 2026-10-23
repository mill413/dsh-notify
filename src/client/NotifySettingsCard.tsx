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
import { ensureCardStyle } from './settings-style.ts'
import {
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  IconPlusOutlineRegular,
  Button,
  Menu,
  Input,
  Switch,
} from '@deepseek-ai/dsh-client-ui-primitives'
import {
  adoptDraft,
  ENDPOINT_METHODS,
  PREFS_DEFAULTS,
  samePrefs,
  type EndpointHeader,
  type NotifyPrefs,
  type NotifyToggleKey,
  type PrefsLive,
} from './prefs.ts'
import type { NotifyEnvironment, NotifyPermission } from './notifications.ts'
import type { PushTestDraft, PushTestOutcome } from './push-client.ts'
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
  /** Ask the node half to deliver one notification to this endpoint; @returns its outcome. */
  testPush: (draft: PushTestDraft) => Promise<PushTestOutcome>
}

/** The persistence-backed toggles, in display order. */
const FIELDS: ReadonlyArray<{ key: NotifyToggleKey; label: NotifyKey; hint: NotifyKey }> = [
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

/** Render the dsh-notify settings card. */
export function NotifySettingsCard(props: Partial<NotifySettingsCardInjected>): React.ReactElement | null {
  const { prefs, t, triggers, environment, requestPermission, showTest, testPush } = props
  const persistedRef = useRef<NotifyPrefs | null>(null)
  const [open, setOpen] = useState(false)
  const [methodOpen, setMethodOpen] = useState(false)
  const [persisted, setPersisted] = useState<NotifyPrefs | null>(null)
  const [draft, setDraft] = useState<NotifyPrefs>(PREFS_DEFAULTS)
  const [writable, setWritable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)
  const [env, setEnv] = useState<NotifyEnvironment | null>(null)
  const [notice, setNotice] = useState<NotifyKey | null>(null)
  const [trigger, setTrigger] = useState<TriggerRecord | undefined>(undefined)
  const [testing, setTesting] = useState(false)
  const [pushNotice, setPushNotice] = useState<string | null>(null)

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

  // One structural comparison over the whole document: the endpoint fields are
  // part of the same atomic save as the toggles.
  const dirty = !samePrefs(draft, persisted)
  const disabled = !writable || saving
  const permission = env?.permission ?? 'default'

  const save = (): void => {
    if (!dirty || disabled) return
    setSaving(true)
    setFailed(false)
    prefs.save(draft)
      .then(() => {
        setDraft(prefs.get())
        setPushNotice(null)
        setSaving(false)
      })
      .catch(() => { setFailed(true); setSaving(false) })
  }

  const patch = (change: Partial<NotifyPrefs>): void => {
    setFailed(false)
    setDraft((value) => ({ ...value, ...change }))
  }

  const setHeader = (index: number, change: Partial<EndpointHeader>): void => {
    patch({
      endpointHeaders: draft.endpointHeaders.map((row, at) => (at === index
        ? { name: change.name ?? row.name, value: change.value ?? row.value }
        : row)),
    })
  }

  const runTest = (): void => {
    if (testPush === undefined || t === undefined) return
    setPushNotice(null)
    setTesting(true)
    void testPush({
      url: draft.endpointUrl,
      method: draft.endpointMethod,
      headers: draft.endpointHeaders,
      body: draft.endpointBody,
      icon: draft.endpointIcon,
    })
      .then((outcome) => {
        setPushNotice(outcome.ok ? t('push.test.ok') : `${t('push.test.failed')}${outcome.error ?? ''}`)
        setTesting(false)
      })
      .catch(() => { setPushNotice(t('push.test.failed')); setTesting(false) })
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
      <Button
        type="button"
        className="dsn-header"
        aria-expanded={open}
        aria-label={`${t(open ? 'card.collapse' : 'card.expand')}: ${t('card.title')}`}
        onClick={() => { setMethodOpen(false); setOpen(!open) }}
      >
        <span className="dsn-headText">
          <span className="dsn-name">{t('card.title')}</span>
          <span className="dsn-description">{t('card.description')}</span>
        </span>
        {dirty ? <span className="dsn-pending">{t('card.unsaved')}</span> : null}
        <IconChevronDownOutlineRegular className={open ? 'dsn-chevron dsn-chevronOpen' : 'dsn-chevron'} />
      </Button>
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
                    <Button type="button" variant="outline" size="sm" onClick={ask}>
                      {t('action.request')}
                    </Button>
                  )
                  : null}
                {env?.supported === true
                  ? (
                    <Button type="button" variant="outline" size="sm" disabled={permission !== 'granted'} onClick={test}>
                      {t('action.test')}
                    </Button>
                  )
                  : (
                    <Button type="button" variant="outline" size="sm" onClick={() => { setEnv(environment?.() ?? null); setNotice(null) }}>
                      {t('action.refresh')}
                    </Button>
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

            <p className="dsn-section">{t('push.section')}</p>

            <div className="dsn-field">
              <div className="dsn-toggleRow">
                <span className="dsn-toggleLabel">{t('push.field.enabled')}</span>
                <Switch
                  checked={draft.endpointEnabled}
                  label={t('push.field.enabled')}
                  disabled={disabled}
                  onChange={() => { patch({ endpointEnabled: !draft.endpointEnabled }) }}
                />
              </div>
              <p className="dsn-hint">{t('push.field.enabled.desc')}</p>
            </div>

            <div className="dsn-field">
              <label className="dsn-toggleLabel" htmlFor="dsn-push-url">{t('push.field.url')}</label>
              <Input
                id="dsn-push-url"
                className="dsn-input"
                value={draft.endpointUrl}
                disabled={disabled}
                placeholder={t('push.field.url.placeholder')}
                onChange={(event) => { patch({ endpointUrl: event.target.value }) }}
              />
              <p className="dsn-hint">{t('push.field.url.desc')}</p>
            </div>

            <div className="dsn-field">
              <label className="dsn-toggleLabel" htmlFor="dsn-push-method">{t('push.field.method')}</label>
              <Menu
                open={methodOpen && !disabled}
                portal
                autoFocus
                selectedId={draft.endpointMethod}
                items={ENDPOINT_METHODS.map(method => ({ id: method, label: method }))}
                onSelect={(id) => {
                  const method = ENDPOINT_METHODS.find(candidate => candidate === id)
                  if (method !== undefined) patch({ endpointMethod: method })
                  setMethodOpen(false)
                }}
                onClose={() => { setMethodOpen(false) }}
                anchor={(
                  <Button
                    id="dsn-push-method"
                    type="button"
                    variant="outline"
                    size="sm"
                    className="dsn-method"
                    disabled={disabled}
                    aria-label={t('push.field.method')}
                    aria-haspopup="menu"
                    aria-expanded={methodOpen && !disabled}
                    onClick={() => { setMethodOpen(!methodOpen) }}
                  >
                    {draft.endpointMethod}
                    <IconChevronDownOutlineRegular />
                  </Button>
                )}
              />
              <p className="dsn-hint">{t('push.field.method.desc')}</p>
            </div>

            <div className="dsn-field">
              <span className="dsn-toggleLabel">{t('push.field.headers')}</span>
              {draft.endpointHeaders.map((row, index) => (
                // Rows are positional and have no stable identity of their own.
                // eslint-disable-next-line react/no-array-index-key
                <div className="dsn-headerRow" key={index}>
                  <Input
                    className="dsn-input dsn-headerName"
                    value={row.name}
                    disabled={disabled}
                    placeholder={t('push.field.headers.name')}
                    aria-label={`${t('push.field.headers.name')} ${index + 1}`}
                    onChange={(event) => { setHeader(index, { name: event.target.value }) }}
                  />
                  <Input
                    className="dsn-input dsn-headerValue"
                    value={row.value}
                    disabled={disabled}
                    placeholder={t('push.field.headers.value')}
                    aria-label={`${t('push.field.headers.value')} ${index + 1}`}
                    onChange={(event) => { setHeader(index, { value: event.target.value }) }}
                  />
                  <Button
                    type="button"
                    variant="ghost" size="sm"
                    disabled={disabled}
                    aria-label={`${t('push.field.headers.remove')} ${index + 1}`}
                    onClick={() => {
                      patch({ endpointHeaders: draft.endpointHeaders.filter((_, at) => at !== index) })
                    }}
                  >
                    <IconCloseOutlineRegular />
                  </Button>
                </div>
              ))}
              <div className="dsn-actions">
                <Button
                  type="button"
                  variant="outline" size="sm"
                  disabled={disabled}
                  onClick={() => { patch({ endpointHeaders: [...draft.endpointHeaders, { name: '', value: '' }] }) }}
                >
                  <IconPlusOutlineRegular />
                  {t('push.field.headers.add')}
                </Button>
              </div>
              <p className="dsn-hint">{t('push.field.headers.desc')}</p>
            </div>

            <div className="dsn-field">
              <label className="dsn-toggleLabel" htmlFor="dsn-push-body">{t('push.field.body')}</label>
              <textarea
                id="dsn-push-body"
                className="dsn-textarea"
                value={draft.endpointBody}
                disabled={disabled}
                placeholder={t('push.field.body.placeholder')}
                onChange={(event) => { patch({ endpointBody: event.target.value }) }}
              />
              <p className="dsn-hint">{t('push.field.body.desc')}</p>
              <p className="dsn-hint">{t('push.field.variables')}</p>
            </div>

            <div className="dsn-field">
              <label className="dsn-toggleLabel" htmlFor="dsn-push-icon">{t('push.field.icon')}</label>
              <Input
                id="dsn-push-icon"
                className="dsn-input"
                value={draft.endpointIcon}
                disabled={disabled}
                placeholder={t('push.field.icon.placeholder')}
                onChange={(event) => { patch({ endpointIcon: event.target.value }) }}
              />
              <p className="dsn-hint">{t('push.field.icon.desc')}</p>
            </div>

            <div className="dsn-field">
              <div className="dsn-actions">
                <Button type="button" variant="outline" size="sm" disabled={testing} onClick={runTest}>
                  {t(testing ? 'push.test.sending' : 'push.test')}
                </Button>
              </div>
              {pushNotice !== null ? <p className="dsn-hint" role="status">{pushNotice}</p> : null}
            </div>

            <div className="dsn-footer">
              {failed ? <p className="dsn-failed" role="status">{t('card.failed')}</p> : null}
              <Button type="button" variant="primary" size="sm" disabled={!dirty || disabled} onClick={save}>
                {t(saving ? 'card.saving' : 'card.save')}
              </Button>
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
