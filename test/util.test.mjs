import test from 'node:test'
import assert from 'node:assert/strict'
import { esc, termSlug, kstDate } from '../lib/util.mjs'

test('esc escapes HTML specials', () => {
  assert.equal(esc(`<a href="x">&'`), '&lt;a href=&quot;x&quot;&gt;&amp;&#39;')
  assert.equal(esc(undefined), '')
})

test('termSlug', () => {
  assert.equal(termSlug('Node JS'), 'node-js')
  assert.equal(termSlug('C#'), 'c')
  assert.equal(termSlug('자바_스크립트'), '자바-스크립트')
  assert.equal(termSlug(' GitHub  Pages '), 'github-pages')
  assert.equal(termSlug('자바'.normalize('NFD')), '자바')
  assert.equal(termSlug('Node.js'), 'node.js')
  assert.equal(termSlug('.NET'), 'net')
  for (const name of ['??', '.', '..', '...', '-.-']) assert.throws(() => termSlug(name), /slug/, name)
})

test('kstDate', () => {
  assert.equal(kstDate('2026-10-03').toISOString(), '2026-10-02T15:00:00.000Z')
  assert.throws(() => kstDate('2026-02-30'), /invalid date/)
  assert.throws(() => kstDate('2026-1-3'), /invalid date/)
})
