/**
 * Node-half custom-endpoint channel: deliver one notification to an HTTP
 * endpoint the user configures (URL, method, headers, body).
 *
 * This module is deliberately free of DSH and Node-only imports: the trigger
 * wiring in `index.ts` owns the services, and `node --test` exercises the
 * template rendering, destination resolution, and response handling directly.
 *
 * The sender lives in the node half because it must run with no browser
 * attached: the phone still learns about a finished task after the page — or
 * the whole browser — is gone.
 */

/** One trigger forwarded to the configured endpoint. */
export type PushKind = 'complete' | 'approval' | 'question' | 'test'

/** Methods the endpoint may use. `GET` carries no body. */
export type PushMethod = 'POST' | 'PUT' | 'PATCH' | 'GET'

/** Every method this plugin accepts, in display order. */
export const PUSH_METHODS: readonly PushMethod[] = ['POST', 'PUT', 'PATCH', 'GET']

/** One configured request header. */
export interface PushHeader {
  /** Header name; a blank name is an unfinished row and is not sent. */
  readonly name: string
  /** Header value, sent verbatim. */
  readonly value: string
}

/** The endpoint as configured, already resolved to a usable destination. */
export interface PushEndpoint {
  /** Absolute http(s) URL, including any path the endpoint needs. */
  readonly url: string
  /** Request method. */
  readonly method: PushMethod
  /** Headers to send, blank rows removed. */
  readonly headers: readonly PushHeader[]
  /** Body template, rendered against the trigger's variables. */
  readonly body: string
}

/** The variables one trigger offers to the body template. */
export interface PushFacts {
  /** Trigger discriminator: `complete`, `approval`, `question`, or `test`. */
  readonly event: PushKind
  /** Notification title; callers pass the Session display title. */
  readonly title: string
  /** Built-in wording for this trigger, before any template substitution. */
  readonly body: string
  /** Suggested urgency the endpoint may map however it likes. */
  readonly level: 'default' | 'high'
  /** Notification group, so a receiver can filter everything DSH sends. */
  readonly group: string
  /** Session the trigger belongs to; empty for the test push. */
  readonly sessionId: string
  /** Trigger time, ISO 8601. */
  readonly time: string
  /** Notification icon URL; empty when unset. */
  readonly icon: string
}

/** Delivery outcome, reported by both the sender log and the test route. */
export interface PushOutcome {
  /** Whether the endpoint answered with a 2xx status. */
  readonly ok: boolean
  /** HTTP status; 0 when the request never reached the endpoint. */
  readonly status: number
  /** Failure reason, present only when `ok` is false. */
  readonly error?: string
}

/** Notification group, so a receiver can filter everything DSH sends. */
export const PUSH_GROUP = 'dsh'

/** Per-request timeout. */
const TIMEOUT_MS = 5000

/**
 * Default body template. It is JSON for the relay notification service this
 * plugin was built against; a plain-text or form endpoint can replace it with
 * any text that uses the same `{{…}}` variables.
 */
export const DEFAULT_BODY_TEMPLATE =
  '{"title":"{{title}}","body":"{{body}}","level":"{{level}}","group":"{{group}}","icon":"{{icon}}"}'

/**
 * Push copy is fixed Chinese, like this plugin's primary UI language: the host
 * half has no locale channel (the browser's locale preference is projected to
 * the client only), and a bilingual line would double the length of every
 * phone notification for no reader.
 */
const BODY: Record<PushKind, string> = {
  complete: '任务已完成',
  approval: '等待你的审批',
  question: '等待你的回答',
  test: '这是一条测试推送。',
}

/** Suffix marking a subagent as the source, mirroring the desktop body copy. */
const SUBAGENT_SUFFIX = '（子代理）'

/** Variables a template may use, in the order the settings card documents them. */
export const PUSH_VARIABLES: readonly string[] = ['title', 'body', 'event', 'level', 'group', 'sessionId', 'time', 'icon']

/**
 * Build the variables for one trigger.
 * @param kind - trigger kind.
 * @param title - notification title, normally the Session display title.
 * @param subagent - whether the trigger came from a subagent.
 * @param sessionId - Session identity; empty for the test push.
 * @param now - timestamp in milliseconds.
 * @param icon - configured icon URL; empty substitutes an empty string.
 * @returns the complete variable set for the body template.
 */
export function pushFacts(
  kind: PushKind,
  title: string,
  subagent: boolean,
  sessionId: string,
  now: number,
  icon = '',
): PushFacts {
  return {
    event: kind,
    title,
    body: subagent ? BODY[kind] + SUBAGENT_SUFFIX : BODY[kind],
    // A blocked turn is actionable now; a finished task can wait for the next look.
    level: kind === 'approval' || kind === 'question' ? 'high' : 'default',
    group: PUSH_GROUP,
    sessionId,
    time: new Date(now).toISOString(),
    icon,
  }
}

/**
 * Build the variables for the settings card's test push.
 * @param now - timestamp in milliseconds.
 * @param icon - configured icon URL; the test push must show what a real one would.
 * @returns the test trigger's variables.
 */
export function testFacts(now: number, icon = ''): PushFacts {
  return pushFacts('test', 'DSH 测试推送', false, '', now, icon)
}

/** Replace every known `{{name}}` placeholder; unknown ones stay verbatim. */
function substitute(text: string, facts: PushFacts): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const value = Object.hasOwn(facts, name) ? facts[name as keyof PushFacts] : undefined
    return value === undefined ? whole : value
  })
}

/** Substitute placeholders in every string of a decoded JSON template. */
function substituteJson(value: unknown, facts: PushFacts): unknown {
  if (typeof value === 'string') return substitute(value, facts)
  if (Array.isArray(value)) return value.map(item => substituteJson(item, facts))
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, substituteJson(child, facts)]))
  }
  return value
}

/**
 * Render a body template against one trigger's variables.
 *
 * A template that is valid JSON is rendered through its parsed structure and
 * re-serialized, so a value carrying quotes, backslashes, or newlines still
 * produces valid JSON; anything else is substituted as plain text. Unknown
 * placeholders stay verbatim rather than being blanked, so a typo shows up in
 * the delivered body instead of silently truncating it.
 * @param template - configured body template.
 * @param facts - variables for this trigger.
 * @returns the request body.
 */
export function renderBody(template: string, facts: PushFacts): string {
  let parsed: unknown
  try {
    parsed = JSON.parse(template)
  } catch {
    return substitute(template, facts)
  }
  return JSON.stringify(substituteJson(parsed, facts))
}

/**
 * Resolve a usable endpoint from raw Config fields.
 * @param url - configured URL.
 * @param method - configured method.
 * @param headers - configured header rows.
 * @param body - configured body template.
 * @returns the normalized endpoint, or undefined when no usable URL is set.
 */
export function resolveEndpoint(
  url: string,
  method: PushMethod,
  headers: readonly PushHeader[],
  body: string,
): PushEndpoint | undefined {
  const target = url.trim()
  try {
    const parsed = new URL(target)
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname
      || parsed.username || parsed.password) return undefined
  } catch {
    return undefined
  }
  return {
    url: target,
    method,
    headers: headers
      .filter(header => header.name.trim() !== '')
      .map(header => ({ name: header.name.trim(), value: header.value })),
    body,
  }
}

/** Fields read from an endpoint's answer, whose meaning this module owns. */
interface AnswerBody {
  error?: unknown
}

/**
 * Read an endpoint's answer into a delivery outcome.
 * @param status - HTTP status; 0 when the request never completed.
 * @param value - decoded body, or undefined when the body was not JSON.
 * @returns the normalized outcome.
 */
function outcomeOf(status: number, value: AnswerBody | undefined): PushOutcome {
  const ok = status >= 200 && status < 300
  if (ok) return { ok, status }
  const reported = typeof value?.error === 'string' && value.error !== '' ? value.error : undefined
  return { ok, status, error: reported ?? `接口返回 HTTP ${status}` }
}

/**
 * Deliver one trigger to the configured endpoint.
 *
 * Never throws: a transport failure becomes an unsuccessful outcome, because
 * every caller is a notification path that must not break the work it reports.
 * @param endpoint - resolved destination.
 * @param facts - variables for this trigger.
 * @param fetchImpl - fetch implementation; tests pass a stub.
 * @returns the delivery outcome.
 */
export async function sendPush(
  endpoint: PushEndpoint,
  facts: PushFacts,
  fetchImpl: typeof fetch = fetch,
): Promise<PushOutcome> {
  const headers: Record<string, string> = {}
  for (const header of endpoint.headers) headers[header.name] = header.value
  const init: RequestInit = { method: endpoint.method }
  // A GET request cannot carry a body, so the template is only rendered for
  // methods that can send one.
  if (endpoint.method !== 'GET') {
    const body = renderBody(endpoint.body, facts)
    if (body !== '') {
      init.body = body
      const hasContentType = Object.keys(headers).some(name => name.toLowerCase() === 'content-type')
      if (!hasContentType) headers['content-type'] = 'application/json'
    }
  }
  if (Object.keys(headers).length > 0) init.headers = headers
  init.signal = AbortSignal.timeout(TIMEOUT_MS)

  let response: Response
  try {
    response = await fetchImpl(endpoint.url, init)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, status: 0, error: message }
  }
  const value = await response.json().catch((): undefined => undefined) as AnswerBody | undefined
  return outcomeOf(response.status, value)
}

/** One header row read off an untrusted JSON body. */
function readHeaders(value: unknown): PushHeader[] | undefined {
  if (!Array.isArray(value)) return undefined
  const rows: PushHeader[] = []
  for (const row of value) {
    if (typeof row !== 'object' || row === null) continue
    const { name, value: header } = row as Record<string, unknown>
    rows.push({ name: typeof name === 'string' ? name : '', value: typeof header === 'string' ? header : '' })
  }
  return rows
}

/** Read the test request's endpoint overrides off a decoded JSON body. */
export function readPushDraft(value: unknown): Partial<{
  url: string
  method: PushMethod
  headers: PushHeader[]
  body: string
  icon: string
}> {
  if (typeof value !== 'object' || value === null) return {}
  const body = value as Record<string, unknown>
  const text = (key: string): string | undefined => {
    const field = body[key]
    return typeof field === 'string' ? field : undefined
  }
  const url = text('url')
  const method = text('method')
  const template = text('body')
  const icon = text('icon')
  const headers = readHeaders(body.headers)
  return {
    ...url === undefined ? {} : { url },
    ...method === undefined || !PUSH_METHODS.includes(method as PushMethod)
      ? {}
      : { method: method as PushMethod },
    ...headers === undefined ? {} : { headers },
    ...template === undefined ? {} : { body: template },
    ...icon === undefined ? {} : { icon },
  }
}
