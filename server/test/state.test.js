import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createState } from '../src/state.js'

test('createState returns defaults', () => {
  const s = createState()
  assert.equal(s.leader, '—')
  assert.deepEqual(s.messages, [])
  assert.equal(s.presence.Boss, false)
})

test('addMessage appends with id and ts', () => {
  const s = createState()
  const msg = s.addMessage({ sender: 'Boss', text: 'hi' })
  assert.equal(msg.role, 'Boss')
  assert.equal(msg.sender, 'บอส')
  assert.equal(msg.text, 'hi')
  assert.ok(msg.id)
  assert.ok(msg.ts)
  assert.ok(msg.createdAt)
  assert.equal(s.messages.length, 1)
})

test('addMessage parses [TAG] prefix', () => {
  const s = createState()
  const msg = s.addMessage({ sender: 'Code', text: '[PROPOSE] use option A' })
  assert.equal(msg.tag, 'PROPOSE')
  assert.equal(msg.text, 'use option A')
})

test('setLeader updates leader and flips operator', () => {
  const s = createState()
  s.setLeader('Code')
  assert.equal(s.leader, 'Code')
  assert.equal(s.operator, 'Codex')
  assert.equal(s.snapshot().executor, 'Codex')
})

test('setField supports doneDefinition alias', () => {
  const s = createState()
  s.setField('doneDefinition', 'ship without console errors')
  assert.equal(s.dod, 'ship without console errors')
  assert.equal(s.snapshot().doneDefinition, 'ship without console errors')
})

test('setPresence flips online flag', () => {
  const s = createState()
  s.setPresence('Code', true)
  assert.equal(s.presence.Code, true)
})
