// The settings card's draft-adoption rule and the endpoint field coercion. The
// adoption rule decides whether a freshly mounted card shows the persisted
// document or the shipped defaults, so it is pinned here rather than only
// exercised in a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adoptDraft,
  createPrefsLive,
  DEFAULT_BODY_TEMPLATE,
  normalizePrefs,
  PREFS_DEFAULTS,
  samePrefs,
  type NotifyPrefs,
} from '../src/client/prefs.ts'

const STORED: NotifyPrefs = { ...PREFS_DEFAULTS, notifyOnComplete: false, onlyWhenBackground: false }

test('the first read adopts the persisted document', () => {
  assert.deepEqual(adoptDraft(PREFS_DEFAULTS, STORED, null), STORED)
})

test('a later read replaces a draft that still matches the previous document', () => {
  const published: NotifyPrefs = { ...STORED, notifyOnInteraction: false }
  assert.deepEqual(adoptDraft(STORED, published, STORED), published)
})

test('an unsaved draft survives a push for an unrelated field', () => {
  const draft: NotifyPrefs = { ...STORED, enabled: false }
  const published: NotifyPrefs = { ...STORED, notifyOnInteraction: false }
  assert.deepEqual(adoptDraft(draft, published, STORED), draft)
})

test('samePrefs compares every field, header rows included', () => {
  assert.equal(samePrefs(STORED, { ...STORED }), true)
  assert.equal(samePrefs(STORED, { ...STORED, enabled: false }), false)
  // A re-read hands back fresh array and row objects for the same values.
  const reread: NotifyPrefs = {
    ...STORED,
    endpointHeaders: [{ name: 'Authorization', value: 'Bearer t' }],
  }
  const again: NotifyPrefs = {
    ...STORED,
    endpointHeaders: [{ name: 'Authorization', value: 'Bearer t' }],
  }
  assert.equal(samePrefs(reread, again), true)
  assert.equal(samePrefs(reread, { ...again, endpointHeaders: [{ name: 'Authorization', value: 'Bearer u' }] }), false)
  assert.equal(samePrefs(reread, { ...again, endpointHeaders: [] }), false)
})

test('normalizePrefs fills missing and wrongly typed fields from the defaults', () => {
  assert.deepEqual(normalizePrefs({ notifyOnComplete: false }), { ...PREFS_DEFAULTS, notifyOnComplete: false })
  assert.deepEqual(
    normalizePrefs({ enabled: 'yes', notifyOnComplete: 1 } as unknown as Partial<NotifyPrefs>),
    PREFS_DEFAULTS,
  )
})

test('normalizePrefs coerces the endpoint fields', () => {
  assert.equal(normalizePrefs({ endpointUrl: 'https://h/p' }).endpointUrl, 'https://h/p')
  assert.equal(normalizePrefs({ endpointUrl: 7 } as unknown as Partial<NotifyPrefs>).endpointUrl, '')
  assert.equal(normalizePrefs({ endpointMethod: 'PATCH' }).endpointMethod, 'PATCH')
  assert.equal(
    normalizePrefs({ endpointMethod: 'BREW' } as unknown as Partial<NotifyPrefs>).endpointMethod,
    PREFS_DEFAULTS.endpointMethod,
  )
  assert.equal(normalizePrefs({ endpointBody: '' }).endpointBody, '')
  assert.equal(normalizePrefs({}).endpointBody, DEFAULT_BODY_TEMPLATE)
})

test('normalizePrefs keeps usable header rows and drops the rest', () => {
  assert.deepEqual(
    normalizePrefs({
      endpointHeaders: [
        { name: 'Authorization', value: 'Bearer t' },
        { name: 7, value: null },
        'junk',
        null,
      ] as unknown as NotifyPrefs['endpointHeaders'],
    }).endpointHeaders,
    [{ name: 'Authorization', value: 'Bearer t' }, { name: '', value: '' }],
  )
  assert.deepEqual(
    normalizePrefs({ endpointHeaders: 'nope' } as unknown as Partial<NotifyPrefs>).endpointHeaders,
    [],
  )
})

/** Build a live preference over a stub settings form that records its writes. */
function liveWith(seen: { ops?: readonly { path: readonly string[]; value: unknown }[] }): ReturnType<typeof createPrefsLive> {
  const form = {
    getSnapshot: () => ({ status: 'ready', writable: true, value: STORED, revision: 1 }),
    subscribe: () => () => {},
    mutate: (ops: readonly { path: readonly string[]; value: unknown }[]) => {
      seen.ops = ops
      return Promise.resolve(true)
    },
  }
  const ctx = { get: (name: string) => (name === 'configForms' ? { get: () => form } : undefined) }
  return createPrefsLive(ctx as unknown as Parameters<typeof createPrefsLive>[0])
}

test('one save writes every field, header rows in the same atomic write', async () => {
  const seen: { ops?: readonly { path: readonly string[]; value: unknown }[] } = {}
  const draft: NotifyPrefs = {
    ...STORED,
    endpointEnabled: true,
    endpointUrl: 'https://example.com/notify',
    endpointHeaders: [{ name: 'Authorization', value: 'Bearer t' }],
  }
  await liveWith(seen).save(draft)
  const written = new Map(seen.ops?.map(op => [op.path.join('.'), op.value]))
  assert.deepEqual(written.get('enabled'), true)
  assert.deepEqual(written.get('endpointEnabled'), true)
  assert.deepEqual(written.get('endpointUrl'), 'https://example.com/notify')
  assert.deepEqual(written.get('endpointHeaders'), [{ name: 'Authorization', value: 'Bearer t' }])
  assert.equal(seen.ops?.length, Object.keys(PREFS_DEFAULTS).length)
})
