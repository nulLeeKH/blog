import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from '../build.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const dirs = []
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))
const tmp = prefix => { const dir = mkdtempSync(join(tmpdir(), prefix)); dirs.push(dir); return dir }
const opts = { staticDir: join(repo, 'static'), brandDir: join(repo, 'brand') }
const templates = join(repo, 'templates')

test('both post templates build cleanly as drafts and stay out of a production build', async () => {
  const src = tmp('tpl-')
  cpSync(join(templates, '0000-00-00-title.md'), join(src, '2026-01-01-single.md'))
  cpSync(join(templates, '0000-00-00-title'), join(src, '2026-01-02-folder'), { recursive: true })
  const out = join(tmp('tpl-out-'), 'dist')
  await build({ src, out, ...opts, drafts: true }) // link check included: every sample link and image resolves
  for (const slug of ['single', 'folder']) {
    const html = readFileSync(join(out, 'posts', slug, 'index.html'), 'utf8')
    for (const part of ['markdown-alert-note', 'class="code"', 'class="mermaid"', '<math', 'data-footnotes', 'contains-task-list', 'draft-badge']) {
      assert.ok(html.includes(part), `${slug}: ${part}`)
    }
  }
  assert.ok(readFileSync(join(out, 'posts/folder/index.html'), 'utf8').includes('<figcaption>'))
  assert.ok(existsSync(join(out, 'posts/folder/image.svg')))
  await build({ src, out, ...opts })
  assert.ok(!existsSync(join(out, 'posts/single')) && !existsSync(join(out, 'posts/folder')), 'templates start as drafts')
})

test('new.mjs creates a dated draft from the template and refuses bad input', () => {
  const dir = tmp('new-')
  cpSync(templates, join(dir, 'templates'), { recursive: true })
  mkdirSync(join(dir, 'posts'))
  const run = (...args) => spawnSync(process.execPath, [join(repo, 'new.mjs'), ...args], { cwd: dir, encoding: 'utf8' })
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
  assert.equal(run('my-post').status, 0)
  assert.ok(existsSync(join(dir, `posts/${today}-my-post.md`)))
  assert.equal(run('my-post').status, 1, 'existing post is not overwritten')
  assert.equal(run('my-post', '--folder').status, 1, 'same slug as a folder is refused too')
  cpSync(join(dir, `posts/${today}-my-post.md`), join(dir, 'posts/2020-01-01-old-one.md'))
  const again = run('old-one')
  assert.equal(again.status, 1, 'a slug used on another date is refused')
  assert.match(again.stderr, /slug "old-one" is already used by posts\/2020-01-01-old-one\.md/)
  assert.equal(run('photos', '--folder').status, 0)
  assert.ok(existsSync(join(dir, `posts/${today}-photos/index.md`)) && existsSync(join(dir, `posts/${today}-photos/image.svg`)))
  assert.equal(run('Bad Slug').status, 2)
  assert.equal(run().status, 2)
})
