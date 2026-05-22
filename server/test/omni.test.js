import test from 'node:test'
import assert from 'node:assert/strict'
import { OMNI_STATUSES, validatePage } from '../src/omni/schema.js'
import { createOmniSeed } from '../src/omni/seed.js'

test('omni seed starts with configurable five-page seed data', () => {
  const seed = createOmniSeed()
  assert.equal(seed.pages.length, 5)
  assert.equal(seed.pages.every((page) => page.status === 'active'), true)
  assert.equal(seed.pages.every((page) => page.policySetId), true)
  assert.equal(seed.pages.every((page) => page.agentProfileId), true)
})

test('page validation accepts active, paused, and archived statuses', () => {
  assert.deepEqual(OMNI_STATUSES.page, ['active', 'paused', 'archived'])
  assert.equal(validatePage({ id: 'page_1', name: 'MAN KYND', status: 'active' }).ok, true)
  assert.equal(validatePage({ id: 'page_2', name: '', status: 'deleted' }).ok, false)
})
