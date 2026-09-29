// Transition rules for the Session-status diff. `node --test` strips the types
// and runs this directly; the module under test imports nothing from the DOM or
// from DSH on purpose.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { planNotifications, type NotifyGates, type SessionRowLike, type SessionStatusLike } from '../src/client/notify-core.ts'

const GATES: NotifyGates = { notifyOnComplete: true, notifyOnInteraction: true }
const MAIN: SessionRowLike = { title: 'Main task', subagent: false }
const CHILD: SessionRowLike = { title: 'Explore', subagent: true }

/** Build a status map from plain entries. */
function statuses(...entries: Array<[string, SessionStatusLike]>): Map<string, SessionStatusLike> {
  return new Map(entries)
}

/** A row lookup that always answers with the same catalog facts. */
const row = (info: SessionRowLike) => () => info

test('true -> false running transition on a main session notifies completion', () => {
  const events = planNotifications(
    statuses(['s1', { running: true }]),
    statuses(['s1', { running: false }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events, [{ type: 'complete', sessionId: 's1', title: 'Main task' }])
})

test('an unknown baseline never notifies completion', () => {
  const events = planNotifications(
    statuses(['s1', { running: undefined }]),
    statuses(['s1', { running: false }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events, [])
})

test('a session absent from the previous snapshot establishes a baseline only', () => {
  const events = planNotifications(statuses(), statuses(['s1', { running: false }]), row(MAIN), GATES)
  assert.deepEqual(events, [])
})

test('a subagent finishing on its own does not notify completion', () => {
  const events = planNotifications(
    statuses(['child', { running: true }]),
    statuses(['child', { running: false }]),
    row(CHILD),
    GATES,
  )
  assert.deepEqual(events, [])
})

test('starting to run notifies nothing', () => {
  const events = planNotifications(
    statuses(['s1', { running: false }]),
    statuses(['s1', { running: true }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events, [])
})

test('a new pending interaction notifies with its kind', () => {
  const events = planNotifications(
    statuses(['s1', { running: true, pendingInteraction: undefined }]),
    statuses(['s1', { running: true, pendingInteraction: { key: 'a', kind: 'approval' } }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events, [{
    type: 'interaction',
    sessionId: 's1',
    title: 'Main task',
    kind: 'approval',
    subagent: false,
  }])
})

test('an unchanged pending interaction does not notify twice', () => {
  const pending = { key: 'a', kind: 'question' }
  const events = planNotifications(
    statuses(['s1', { running: true, pendingInteraction: pending }]),
    statuses(['s1', { running: true, pendingInteraction: { ...pending } }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events, [])
})

test('a replaced pending interaction key notifies again', () => {
  const events = planNotifications(
    statuses(['s1', { running: true, pendingInteraction: { key: 'a', kind: 'question' } }]),
    statuses(['s1', { running: true, pendingInteraction: { key: 'b', kind: 'question' } }]),
    row(MAIN),
    GATES,
  )
  assert.equal(events.length, 1)
  assert.equal(events[0]?.type, 'interaction')
})

test('a subagent waiting for approval still notifies, flagged as a subagent', () => {
  const events = planNotifications(
    statuses(['child', { running: true }]),
    statuses(['child', { running: true, pendingInteraction: { key: 'a', kind: 'approval' } }]),
    row(CHILD),
    GATES,
  )
  assert.deepEqual(events, [{
    type: 'interaction',
    sessionId: 'child',
    title: 'Explore',
    kind: 'approval',
    subagent: true,
  }])
})

test('disabled gates suppress their own event kind only', () => {
  const complete = planNotifications(
    statuses(['s1', { running: true }]),
    statuses(['s1', { running: false }]),
    row(MAIN),
    { notifyOnComplete: false, notifyOnInteraction: true },
  )
  assert.deepEqual(complete, [])

  const interaction = planNotifications(
    statuses(['s1', { running: true }]),
    statuses(['s1', { running: true, pendingInteraction: { key: 'a', kind: 'approval' } }]),
    row(MAIN),
    { notifyOnComplete: false, notifyOnInteraction: false },
  )
  assert.deepEqual(interaction, [])
})

test('one snapshot change can yield both events, completion first', () => {
  const events = planNotifications(
    statuses(['s1', { running: true }]),
    statuses(['s1', { running: false, pendingInteraction: { key: 'a', kind: 'approval' } }]),
    row(MAIN),
    GATES,
  )
  assert.deepEqual(events.map(event => event.type), ['complete', 'interaction'])
})
