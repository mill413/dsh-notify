/**
 * dsh-notify, node half.
 *
 * This half owns the *custom endpoint* channel and the plugin's settings
 * presentation:
 *
 * 1. It carries the Cordis `Config` — the notification preferences the settings
 *    service projects into this entry's form. The browser half reads those
 *    fields through `ctx.configForms` and writes them back with an atomic,
 *    revision-fenced mutation, so the preferences persist in the active
 *    profile's Cordis patch like any other plugin setting.
 * 2. It delivers the two trigger kinds the browser half notifies on to the
 *    endpoint the user configured (URL, method, headers, body template). The
 *    sender lives here because it must work with no page open.
 * 3. It serves the settings card's test delivery through the Connection API
 *    fence, so the card can verify the endpoint with the draft it holds.
 *
 * `auto: false` tells the settings service not to generate a page for this
 * entry: the browser half renders its own card into the plugin row.
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-settings'
// Type-only: the `agent/status` and `agent/disposed` events, plus `Agent.session`.
import type {} from '@deepseek-ai/dsh-agent'
// Type-only: the `approval/request` and `user-questions/request` answerer waterfals.
import type {} from '@deepseek-ai/dsh-user-approval'
import type {} from '@deepseek-ai/dsh-user-questions'
// Type-only: `ctx.sessionTitle`, the Session display title a push is headed by.
import type {} from '@deepseek-ai/dsh-session-title'
// Type-only: `ctx.connection`, the authenticated `/api` route fence.
import type {} from '@deepseek-ai/dsh-client-connection'
import type { Session } from '@deepseek-ai/dsh-session'
import {
  DEFAULT_BODY_TEMPLATE,
  PUSH_METHODS,
  pushFacts,
  resolveEndpoint,
  sendPush,
  testFacts,
  type PushHeader,
  type PushKind,
  type PushMethod,
  type PushOutcome,
} from './push.ts'

/** The one Cordis entry (and therefore settings form) owned by this plugin. */
export const NS = 'dsh-notify'

/** Browser-half preference fields, as the settings form reads them. */
export interface Config {
  /** Master switch for browser system notifications. */
  enabled: Volatile<boolean>
  /** Notify when a main Agent stops running (its turn finished). */
  notifyOnComplete: Volatile<boolean>
  /** Notify when an Agent is waiting for approval or an answer. */
  notifyOnInteraction: Volatile<boolean>
  /** Suppress browser notifications while the page is visible and focused. */
  onlyWhenBackground: Volatile<boolean>
  /** Master switch for delivering to the custom endpoint. */
  endpointEnabled: Volatile<boolean>
  /** Absolute http(s) URL, path included. */
  endpointUrl: Volatile<string>
  /** Request method; `GET` carries no body. */
  endpointMethod: Volatile<PushMethod>
  /** Extra request headers, sent verbatim. */
  endpointHeaders: Volatile<PushHeader[]>
  /** Body template rendered against the trigger's variables. */
  endpointBody: Volatile<string>
}

/**
 * Plain values the Config schema accepts and validates, derived from the
 * runtime interface so the two cannot drift. The annotation is what keeps this
 * export's type portable: schemastery's inferred type reaches into its own
 * internal `Dict` helper, which a declaration file cannot name.
 */
type ConfigValues = { [K in keyof Config]: Config[K] extends Volatile<infer V> ? V : never }

/**
 * Schema of the preferences. Each field is a `.volatile()` default so a
 * deployment can seed it from cordis.yml while a user overrides it from the
 * settings form; `.volatile()` is also what makes the field live-changeable
 * and visible to that form.
 */
export const Config: z<ConfigValues, Config> = z.object({
  enabled: z.boolean().default(true).volatile(),
  notifyOnComplete: z.boolean().default(true).volatile(),
  notifyOnInteraction: z.boolean().default(true).volatile(),
  onlyWhenBackground: z.boolean().default(true).volatile(),
  endpointEnabled: z.boolean().default(false).volatile(),
  endpointUrl: z.string().default('').volatile(),
  endpointMethod: z.union(PUSH_METHODS).default('POST').volatile(),
  endpointHeaders: z.array(z.object({
    name: z.string().default(''),
    value: z.string().default(''),
  })).default([]).volatile(),
  endpointBody: z.string().default(DEFAULT_BODY_TEMPLATE).volatile(),
})

/** Route the browser card posts its test delivery to; the client spells its relative form. */
export const TEST_ROUTE = '/api/dsh-notify/test'

/** Whether this Session is a subagent rather than an Agent of its own. */
function isSubagent(session: Session): boolean {
  return session.header.origin === 'subagent'
}

/**
 * Install the custom-endpoint channel over the Host's own lifecycle events.
 *
 * The rules mirror the browser half: `complete` only on a true → false running
 * transition of a main Agent (a subagent stopping is not the task the user is
 * waiting for), `interaction` on every answerer request, subagents included —
 * a subagent blocked on a question stalls the parent turn. The first observed
 * status of each Agent establishes a baseline and never notifies, so a plugin
 * reload cannot replay a completion.
 * @param ctx - host plugin context.
 * @param config - live plugin Config.
 */
function installPush(ctx: Context, config: Config): void {
  const running = new Map<string, boolean>()

  const push = (kind: PushKind, session: Session): void => {
    const target = resolveEndpoint(
      config.endpointUrl.get(),
      config.endpointMethod.get(),
      config.endpointHeaders.get(),
      config.endpointBody.get(),
    )
    if (target === undefined) {
      ctx.logger.warn('dsh-notify: the custom endpoint is enabled but its URL is not a usable http(s) URL')
      return
    }
    const title = ctx.get('sessionTitle')?.get(session)?.title ?? session.id
    const facts = pushFacts(kind, title, isSubagent(session), session.id, Date.now())
    void sendPush(target, facts).then((outcome) => {
      if (outcome.ok) return
      ctx.logger.warn('dsh-notify: custom endpoint delivery failed: %s', outcome.error ?? 'unknown error')
    })
  }

  ctx.on('agent/status', ({ agent, status }) => {
    const previous = running.get(agent.id)
    running.set(agent.id, status === 'running')
    if (previous !== true || status !== 'idle') return
    if (!config.endpointEnabled.get() || !config.notifyOnComplete.get()) return
    const session = agent.session
    if (isSubagent(session)) return
    push('complete', session)
  })

  ctx.effect(() => () => { running.clear() }, 'dsh-notify: running baseline')

  ctx.on('approval/request', function (request, next) {
    if (config.endpointEnabled.get() && config.notifyOnInteraction.get()) push('approval', request.agent.session)
    return next()
  })

  ctx.on('user-questions/request', function (request, next) {
    // An ask with no owner Agent is not attributable to a Session, so there is
    // no title to head the push with; the desktop channel still reports it.
    const agent = request.agent
    if (agent !== undefined && config.endpointEnabled.get() && config.notifyOnInteraction.get()) {
      push('question', agent.session)
    }
    return next()
  })
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
function readDraft(value: unknown): Partial<{
  url: string
  method: PushMethod
  headers: PushHeader[]
  body: string
}> {
  if (typeof value !== 'object' || value === null) return {}
  const body = value as Record<string, unknown>
  const text = (key: string): string | undefined => {
    const field = body[key]
    return typeof field === 'string' && field !== '' ? field : undefined
  }
  const url = text('url')
  const method = text('method')
  const template = text('body')
  const headers = readHeaders(body.headers)
  return {
    ...url === undefined ? {} : { url },
    ...method === undefined || !PUSH_METHODS.includes(method as PushMethod)
      ? {}
      : { method: method as PushMethod },
    ...headers === undefined ? {} : { headers },
    ...template === undefined ? {} : { body: template },
  }
}

/**
 * Deliver one test push to the endpoint named by the request, falling back to
 * the saved Config for fields the card left untouched.
 * @param config - live plugin Config.
 * @param request - the POSTed JSON body, if any.
 * @returns the delivery outcome as JSON, with a 4xx/5xx status when it failed.
 */
async function handleTest(config: Config, request: Request): Promise<Response> {
  const body = await request.json().catch((): undefined => undefined)
  const draft = readDraft(body)
  const target = resolveEndpoint(
    draft.url ?? config.endpointUrl.get(),
    draft.method ?? config.endpointMethod.get(),
    draft.headers ?? config.endpointHeaders.get(),
    draft.body ?? config.endpointBody.get(),
  )
  if (target === undefined) {
    const outcome: PushOutcome = { ok: false, status: 0, error: '请先填写可用的 http(s) 通知接口地址' }
    return Response.json(outcome, { status: 400 })
  }
  const outcome = await sendPush(target, testFacts(Date.now()))
  return Response.json(outcome, { status: outcome.ok ? 200 : 502 })
}

/**
 * Serve the settings card's test delivery. The route rides Connection's
 * authenticated `/api` fence, so only this page can ask the Host to send.
 * @param ctx - host plugin context.
 * @param config - live plugin Config.
 */
function installTestRoute(ctx: Context, config: Config): void {
  ctx.inject(['connection'], (cctx) => {
    cctx.effect(() => {
      const dispose = cctx.connection.fetch.register({
        path: TEST_ROUTE,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: request => handleTest(config, request),
      })
      return () => { void dispose() }
    }, 'dsh-notify: test push route')
  })
}

/**
 * Register the settings presentation policy and this plugin's Host behaviour.
 *
 * The policy is registered against this plugin's own fiber inside an optional
 * `settings` injection child, so a late-loading or replaced Settings service
 * picks it up and the plugin still runs in a deployment without Settings.
 * @param ctx - host plugin context.
 * @param config - live plugin Config.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.inject(['settings'], (sctx) => {
    sctx.effect(() => sctx.settings.configure({ auto: false }, ctx.fiber))
  })
  installPush(ctx, config)
  installTestRoute(ctx, config)
}
