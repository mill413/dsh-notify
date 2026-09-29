// The settings card's draft-adoption rule. This is the rule that decides
// whether a freshly mounted card shows the persisted document or the shipped
// defaults, so it is pinned here rather than only exercised in a browser.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adoptDraft, normalizePrefs, PREFS_DEFAULTS, samePrefs, type NotifyPrefs } from '../src/client/prefs.ts'

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

test('samePrefs compares every field', () => {
  assert.equal(samePrefs(STORED, { ...STORED }), true)
  assert.equal(samePrefs(STORED, { ...STORED, enabled: false }), false)
})

test('normalizePrefs fills missing and wrongly typed fields from the defaults', () => {
  assert.deepEqual(normalizePrefs({ notifyOnComplete: false }), { ...PREFS_DEFAULTS, notifyOnComplete: false })
  assert.deepEqual(
    normalizePrefs({ enabled: 'yes', notifyOnComplete: 1 } as unknown as Partial<NotifyPrefs>),
    PREFS_DEFAULTS,
  )
})
