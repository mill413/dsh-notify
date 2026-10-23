import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import { build } from 'esbuild'
import { notificationTag, type SessionStatusLike } from '../src/client/notify-core.ts'

// Exercise the real client entry point so a future call-site change cannot
// reintroduce long tags while the pure tag helper's tests keep passing.
const { outputFiles } = await build({
  entryPoints: [fileURLToPath(new URL('../src/client/index.ts', import.meta.url))],
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  packages: 'external',
  write: false,
})
const clientCode = outputFiles[0]!.text
const sessionId = 'session-35c6de18-8f3c-401f-9073-a1850e4aa42e'

function clientHarness() {
  let snapshot = new Map<string, SessionStatusLike>()
  const listeners = new Set<() => void>()
  const notifications: Array<{ title: string; tag?: string }> = []
  const module = { exports: {} as { apply: (ctx: unknown) => void } }
  const context = vm.createContext({
    module,
    exports: module.exports,
    require: () => ({}),
    window: {
      isSecureContext: true,
      Notification: class {
        static permission = 'granted'
        constructor(title: string, options: { tag?: string }) {
          notifications.push({ title, tag: options.tag })
        }
      },
    },
    document: { visibilityState: 'hidden', hasFocus: () => false },
    console,
  })
  vm.runInContext(clientCode, context)
  const services = {
    locale: { register: () => () => {}, bind: () => (key: string) => key },
    slots: { inject: (_name: string, register: () => void) => register(), register: () => {} },
  }
  module.exports.apply({
    ...services,
    get: (key: keyof typeof services) => services[key],
    effect: (effect: () => unknown) => effect(),
    sessions: { list: { getSnapshot: () => ({ byId: { [sessionId]: { displayTitle: 'Task' } } }) } },
    uiSession: { sessionStatus: {
      getSnapshot: () => snapshot,
      subscribe: (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener) },
    } },
  })
  return {
    notifications,
    publish(status: SessionStatusLike) {
      snapshot = new Map([[sessionId, status]])
      for (const listener of listeners) listener()
    },
  }
}

test('background completion reaches Notification with a Windows-safe replacement tag', () => {
  const client = clientHarness()
  client.publish({ running: true })
  client.publish({ running: false })
  assert.equal(client.notifications.length, 1)
  assert.equal(client.notifications[0]?.tag, notificationTag('complete', sessionId))
  client.publish({ running: false })
  assert.equal(client.notifications.length, 1)
})

test('approval and question notifications also use bounded tags without replaying a request', () => {
  const client = clientHarness()
  client.publish({ running: true })
  const pendingInteraction = { key: 'approval-1', kind: 'approval' }
  client.publish({ running: true, pendingInteraction })
  client.publish({ running: true, pendingInteraction })
  assert.equal(client.notifications.length, 1)
  client.publish({ running: true, pendingInteraction: { key: 'question-2', kind: 'question' } })
  assert.equal(client.notifications.length, 2)
  for (const notification of client.notifications) {
    assert.equal(notification.tag, notificationTag('interaction', sessionId))
    assert.ok(('n#dsh-app://app#' + notification.tag).length <= 64)
  }
})
