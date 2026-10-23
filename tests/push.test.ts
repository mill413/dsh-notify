// The custom-endpoint channel: the variables each trigger offers, how a body
// template is rendered (including JSON escaping), destination resolution, and
// how an endpoint's answer is read back. The Host wiring in index.ts is a thin
// subscriber over these rules.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_BODY_TEMPLATE,
  PUSH_GROUP,
  PUSH_METHODS,
  PUSH_VARIABLES,
  pushFacts,
  renderBody,
  readPushDraft,
  resolveEndpoint,
  sendPush,
  testFacts,
  type PushEndpoint,
} from '../src/push.ts'

const FACTS = pushFacts(
  'complete',
  '修复登录',
  false,
  'session-1',
  Date.UTC(2026, 9, 10, 14, 0, 0),
  'https://example.com/logo.png',
)

const ENDPOINT: PushEndpoint = {
  url: 'https://example.com/notify',
  method: 'POST',
  headers: [],
  body: DEFAULT_BODY_TEMPLATE,
}

/** Build a fetch stub answering with one status and JSON body. */
function answering(status: number, body: unknown): typeof fetch {
  return (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch
}

test('a completion offers the Session title and normal urgency', () => {
  assert.deepEqual(FACTS, {
    event: 'complete',
    title: '修复登录',
    body: '任务已完成',
    level: 'default',
    group: PUSH_GROUP,
    sessionId: 'session-1',
    time: '2026-10-10T14:00:00.000Z',
    icon: 'https://example.com/logo.png',
  })
})

test('a waiting trigger is high urgency and names what is waited for', () => {
  assert.equal(pushFacts('approval', 't', false, 's', 0).body, '等待你的审批')
  assert.equal(pushFacts('question', 't', false, 's', 0).body, '等待你的回答')
  assert.equal(pushFacts('approval', 't', false, 's', 0).level, 'high')
  assert.equal(pushFacts('question', 't', false, 's', 0).level, 'high')
})

test('a subagent trigger marks its source, like the desktop body does', () => {
  assert.equal(pushFacts('approval', 't', true, 's', 0).body, '等待你的审批（子代理）')
})

test('the test trigger is recognizable as a test', () => {
  assert.equal(testFacts(0).event, 'test')
  assert.equal(testFacts(0).level, 'default')
  assert.match(testFacts(0).title, /测试/)
})

test('every documented variable really substitutes', () => {
  for (const name of PUSH_VARIABLES) {
    assert.equal(renderBody(`{{${name}}}`, FACTS).replace(/^"|"$/g, '').length > 0, true, name)
  }
})

test('a plain-text template is substituted verbatim', () => {
  assert.equal(renderBody('title={{title}}\nlevel={{level}}', FACTS), 'title=修复登录\nlevel=default')
})

test('a JSON template keeps its structure when a value carries JSON syntax', () => {
  const hostile = pushFacts('complete', 'a "quoted"\ntitle\\', false, 'session-1', 0)
  const body = renderBody(DEFAULT_BODY_TEMPLATE, hostile)
  assert.deepEqual(JSON.parse(body), {
    title: 'a "quoted"\ntitle\\',
    body: '任务已完成',
    level: 'default',
    group: PUSH_GROUP,
    icon: '',
  })
})

test('an unset icon substitutes to an empty string, not the literal placeholder', () => {
  const body = renderBody('{"title":"{{title}}","icon":"{{icon}}"}', pushFacts('complete', 't', false, 's', 0))
  assert.deepEqual(JSON.parse(body), { title: 't', icon: '' })
})

test('a configured icon reaches the template verbatim', () => {
  const body = renderBody('{"icon":"{{icon}}"}', pushFacts('complete', 't', false, 's', 0, 'https://example.com/a.png'))
  assert.deepEqual(JSON.parse(body), { icon: 'https://example.com/a.png' })
})

test('a JSON template nests and keeps its own fields', () => {
  const body = renderBody('{"a":[{"b":"{{event}}"}],"c":7}', FACTS)
  assert.deepEqual(JSON.parse(body), { a: [{ b: 'complete' }], c: 7 })
})

test('an unknown placeholder stays verbatim instead of blanking the body', () => {
  assert.equal(renderBody('{"x":"{{nope}}"}', FACTS), '{"x":"{{nope}}"}')
})

test('resolveEndpoint requires an http(s) URL and drops blank header rows', () => {
  assert.deepEqual(resolveEndpoint(' https://h/p ', 'PUT', [{ name: ' A ', value: 'b' }, { name: '  ', value: 'x' }], 'b'), {
    url: 'https://h/p',
    method: 'PUT',
    headers: [{ name: 'A', value: 'b' }],
    body: 'b',
  })
  assert.equal(resolveEndpoint('', 'POST', [], ''), undefined)
  assert.equal(resolveEndpoint('example.com/notify', 'POST', [], ''), undefined)
})

test('every offered method is accepted', () => {
  for (const method of PUSH_METHODS) {
    assert.equal(resolveEndpoint('http://h/p', method, [], '')?.method, method)
  }
})

test('a delivered answer reports success', async () => {
  const outcome = await sendPush(ENDPOINT, FACTS, answering(200, { ok: true }))
  assert.deepEqual(outcome, { ok: true, status: 200 })
})

test('a partial-success status still counts as delivered', async () => {
  const outcome = await sendPush(ENDPOINT, FACTS, answering(207, { delivered: 1, failed: 1 }))
  assert.equal(outcome.ok, true)
})

test('a failing answer reports the endpoint message, else the status', async () => {
  const reported = await sendPush(ENDPOINT, FACTS, answering(502, { error: '全部通道投递失败' }))
  assert.equal(reported.ok, false)
  assert.equal(reported.error, '全部通道投递失败')

  const bare = await sendPush(ENDPOINT, FACTS, answering(404, {}))
  assert.equal(bare.error, '接口返回 HTTP 404')
})

test('a transport failure comes back as an outcome, never a throw', async () => {
  const unreachable = (() => Promise.reject(new Error('connect ECONNREFUSED'))) as unknown as typeof fetch
  const failed = await sendPush(ENDPOINT, FACTS, unreachable)
  assert.deepEqual(failed, { ok: false, status: 0, error: 'connect ECONNREFUSED' })
})

test('the request carries the method, headers, and rendered body verbatim', async () => {
  let seen: { url: string; init: RequestInit | undefined } | undefined
  const spy = ((url: string, init?: RequestInit) => {
    seen = { url, init }
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as unknown as typeof fetch
  await sendPush({
    url: 'https://example.com/notify',
    method: 'PUT',
    headers: [{ name: 'Authorization', value: 'Bearer t' }],
    body: '{"t":"{{title}}"}',
  }, FACTS, spy)
  assert.equal(seen?.url, 'https://example.com/notify')
  assert.equal(seen?.init?.method, 'PUT')
  assert.deepEqual(seen?.init?.headers, {
    Authorization: 'Bearer t',
    'content-type': 'application/json',
  })
  assert.equal(seen?.init?.body, '{"t":"修复登录"}')
})

test('a configured content type wins over the JSON default', async () => {
  let seen: RequestInit | undefined
  const spy = ((_url: string, init?: RequestInit) => {
    seen = init
    return Promise.resolve(new Response('', { status: 200 }))
  }) as unknown as typeof fetch
  await sendPush({
    url: 'https://example.com/notify',
    method: 'POST',
    headers: [{ name: 'content-type', value: 'application/x-www-form-urlencoded' }],
    body: 'title={{title}}',
  }, FACTS, spy)
  assert.deepEqual(seen?.headers, { 'content-type': 'application/x-www-form-urlencoded' })
})

test('GET sends headers only', async () => {
  let seen: RequestInit | undefined
  const spy = ((_url: string, init?: RequestInit) => {
    seen = init
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as unknown as typeof fetch
  await sendPush({
    url: 'https://example.com/ping',
    method: 'GET',
    headers: [{ name: 'X-Token', value: 't' }],
    body: 'ignored {{title}}',
  }, FACTS, spy)
  assert.equal(seen?.method, 'GET')
  assert.equal(seen?.body, undefined)
  assert.deepEqual(seen?.headers, { 'X-Token': 't' })
})

test('an empty body template sends no body', async () => {
  let seen: RequestInit | undefined
  const spy = ((_url: string, init?: RequestInit) => {
    seen = init
    return Promise.resolve(new Response('{}', { status: 200 }))
  }) as unknown as typeof fetch
  await sendPush({ url: 'https://example.com/n', method: 'POST', headers: [], body: '' }, FACTS, spy)
  assert.equal(seen?.body, undefined)
  assert.equal(seen?.headers, undefined)
})

test('prototype property names are not template variables', () => {
  assert.equal(renderBody('{{constructor}} {{toString}} {{__proto__}}', FACTS),
    '{{constructor}} {{toString}} {{__proto__}}')
})

test('malformed destinations and URL credentials are rejected before sending', () => {
  for (const url of ['https://', 'http://[invalid', 'file:///tmp/notify', 'https://user:password@example.com/notify']) {
    assert.equal(resolveEndpoint(url, 'POST', [], ''), undefined, url)
  }
  assert.equal(resolveEndpoint('http://127.0.0.1:8080/notify', 'POST', [], '')?.url,
    'http://127.0.0.1:8080/notify')
})

test('test drafts preserve explicitly cleared fields instead of using saved settings', () => {
  assert.deepEqual(readPushDraft({ url: '', body: '', icon: '', headers: [] }),
    { url: '', body: '', icon: '', headers: [] })
  assert.deepEqual(readPushDraft({ url: 42, method: 'DELETE', body: null }), {})
  assert.deepEqual(readPushDraft(undefined), {})
})
