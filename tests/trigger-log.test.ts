// The last-trigger record shown in the settings card: it is the difference
// between "the quiet gate skipped it" and "nothing ever fired".
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createTriggerLog } from '../src/client/trigger-log.ts'

test('an empty log reports nothing', () => {
  assert.equal(createTriggerLog().getSnapshot(), undefined)
})

test('recording replaces the previous decision and notifies listeners', () => {
  let ticks = 0
  const log = createTriggerLog(() => 1000)
  const stop = log.subscribe(() => { ticks += 1 })
  log.record({ at: 0, kind: 'complete', title: 'A', outcome: 'foreground' })
  assert.equal(ticks, 1)
  assert.deepEqual(log.getSnapshot(), { at: 1000, kind: 'complete', title: 'A', outcome: 'foreground' })
  log.record({ at: 5000, kind: 'interaction', title: 'B', outcome: 'sent' })
  assert.equal(ticks, 2)
  assert.deepEqual(log.getSnapshot(), { at: 5000, kind: 'interaction', title: 'B', outcome: 'sent' })
  stop()
  log.record({ at: 6000, kind: 'complete', title: 'C', outcome: 'sent' })
  assert.equal(ticks, 2)
  assert.equal(log.getSnapshot()?.title, 'C')
})
