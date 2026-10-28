import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { balance, shareImages, titleLines, wrap } from '../lib/og.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const dirs = []
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))
const tmp = prefix => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir }
// width in em: Latin is half an em, Hangul a full em
const ems = s => [...s].reduce((w, c) => w + (c >= 'ᄀ' ? 1 : 0.5), 0)

test('wrap keeps Korean words whole and fits the width', () => {
  const lines = wrap('정적 블로그 빌더를 직접 만들고 GitHub Pages에 올리기', 10, 100, 5)
  for (const line of lines) assert.ok(ems(line) * 10 <= 100, line)
  assert.equal(lines.join(' '), '정적 블로그 빌더를 직접 만들고 GitHub Pages에 올리기')
})

test('wrap cuts a word wider than a line and ends a truncated last line with …', () => {
  assert.deepEqual(wrap('abcdefghij', 10, 30, 5), ['abcdef', 'ghij'])
  const cut = wrap('하나 둘 셋 넷 다섯 여섯 일곱', 10, 50, 2)
  assert.equal(cut.length, 2)
  assert.ok(cut[1].endsWith('…') && ems(cut[1]) * 10 <= 50, cut[1])
})

test('balance keeps the line count but evens the lines out', () => {
  const text = '배운 것을 잊지 않으려고 차근차근 정리해 두는 공부 노트입니다.'
  const greedy = wrap(text, 28, 720, 2), even = balance(text, 28, 720, 2) // the site card's description box
  assert.equal(even.length, greedy.length)
  assert.ok(Math.abs(ems(even[0]) - ems(even[1])) < Math.abs(ems(greedy[0]) - ems(greedy[1])))
})

test('titleLines shrinks only a title that overflows, not one that ends with its own …', () => {
  assert.deepEqual(titleLines('그래서 결론은…'), { size: 68, lines: ['그래서 결론은…'] })
  const long = titleLines('배운 것을 정리하다 보니 생각보다 길어진 글…')
  assert.equal(long.size, 68)
  assert.equal(long.lines.length, 2)
  assert.ok(Math.abs(ems(long.lines[0]) - ems(long.lines[1])) <= 3, long.lines.join(' / '))
  const over = titleLines('아주 긴 제목이 여러 줄로 나뉘어도 카드 안에 들어가야 합니다 '.repeat(3))
  assert.equal(over.size, 52)
  assert.ok(over.lines.length === 3 && over.lines[2].endsWith('…'))
})

test('titleLines cuts no word that fits a line', () => {
  assert.deepEqual(titleLines('getBoundingClientRect 호출이 느린 이유'), { size: 68, lines: ['getBoundingClientRect', '호출이 느린 이유'] })
  assert.deepEqual(titleLines('ConcurrentModificationException은 왜 생길까'), { size: 60, lines: ['ConcurrentModificationException은', '왜 생길까'] })
})

test('titleLines counts full-width symbols as a full em and leaves emoji out', () => {
  const circled = titleLines('①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳') // D2Coding draws these 1em wide
  assert.deepEqual(circled.lines, ['①②③④⑤⑥⑦⑧⑨⑩', '⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'])
  assert.deepEqual(titleLines('Rust 🦀 입문기 🚀').lines, ['Rust 입문기'])
})

test('post cards draw an apostrophe and survive control characters', async () => {
  const card = async title => {
    const out = tmp('og-')
    mkdirSync(join(out, 'posts/a'), { recursive: true })
    const site = { title: 'nulLeeKH', description: '설명', url: 'https://blog.nulleekh.com' }
    await shareImages(out, { site, posts: [{ slug: 'a', title, date: '2026-10-03' }], staticDir: join(repo, 'static'), brandDir: join(repo, 'brand'), fontDir: join(repo, 'static/fonts') })
    return readFileSync(join(out, 'posts/a/og.png'))
  }
  assert.notDeepEqual(await card("Don't panic"), await card('Don t panic'))
  await card('터미널 \x1b[31m 색') // resvg rejects XML-invalid characters
})

test('shareImages writes 1200×630 cards and a 180px touch icon', async () => {
  const out = tmp('og-')
  mkdirSync(join(out, 'posts/a'), { recursive: true })
  const site = { title: 'nulLeeKH', description: '설명', url: 'https://blog.nulleekh.com' }
  const posts = [{ slug: 'a', title: '아주 긴 제목이 여러 줄로 나뉘어도 카드 안에 들어가야 합니다 '.repeat(3), date: '2026-10-03', category: { name: '개발' } }]
  await shareImages(out, { site, posts, staticDir: join(repo, 'static'), brandDir: join(repo, 'brand'), fontDir: join(repo, 'static/fonts') })
  const size = f => { const b = readFileSync(join(out, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)] } // PNG IHDR
  assert.deepEqual(size('og.png'), [1200, 630])
  assert.deepEqual(size('posts/a/og.png'), [1200, 630])
  assert.deepEqual(size('apple-touch-icon.png'), [180, 180])
})

test('a long category ends with … instead of running into the address', async () => {
  const card = async name => {
    const out = tmp('og-')
    mkdirSync(join(out, 'posts/a'), { recursive: true })
    const site = { title: 'nulLeeKH', description: '설명', url: 'https://blog.nulleekh.com' }
    await shareImages(out, { site, posts: [{ slug: 'a', title: '제목', date: '2026-10-03', category: { name } }], staticDir: join(repo, 'static'), brandDir: join(repo, 'brand'), fontDir: join(repo, 'static/fonts') })
    return readFileSync(join(out, 'posts/a/og.png'))
  }
  assert.deepEqual(await card('Distributed Systems and Cloud Infrastructure'), await card('Distributed Systems and Cloud…'))
})

test('the card icon keeps the favicon\'s own viewBox, and a broken or missing icon names its file', async () => {
  const favicon = readFileSync(join(repo, 'static/favicon.svg'), 'utf8')
  const draw = async svg => {
    const staticDir = tmp('og-static-'), out = tmp('og-')
    writeFileSync(join(staticDir, 'favicon.svg'), svg)
    const site = { title: 'nulLeeKH', description: '설명', url: 'https://blog.nulleekh.com' }
    await shareImages(out, { site, posts: [], staticDir, brandDir: join(repo, 'brand'), fontDir: join(repo, 'static/fonts') })
    return readFileSync(join(out, 'og.png'))
  }
  const doubled = favicon.replace('viewBox="0 0 32 32">', 'viewBox="0 0 64 64"><g transform="scale(2)">').replace('</svg>', '</g></svg>')
  assert.notEqual(doubled, favicon)
  assert.deepEqual(await draw(doubled), await draw(favicon))
  await assert.rejects(draw('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32"></svg>'), /favicon\.svg: SVG data parsing failed/)
  const site = { title: 'nulLeeKH', description: '설명', url: 'https://blog.nulleekh.com' }
  await assert.rejects(shareImages(tmp('og-'), { site, posts: [], staticDir: tmp('og-static-'), brandDir: join(repo, 'brand'), fontDir: join(repo, 'static/fonts') }), /favicon\.svg: ENOENT/)
})
