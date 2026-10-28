import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repo = fileURLToPath(new URL('..', import.meta.url))
const lint = message => spawnSync(`${repo}node_modules/.bin/commitlint`, [], { cwd: repo, input: message, encoding: 'utf8' }).status

test('commit messages use the blog types: post, edit, draft, site', () => {
  for (const ok of ['post: 다시 키보드를 잡으며', 'edit(hello-world): 오타 수정', 'draft: BFS 정리 중', 'site: pnpm으로 전환',
    'site: 첫 공개\n\n본문.\n\nCo-Authored-By: Someone <x@example.com>']) assert.equal(lint(ok), 0, ok)
  for (const bad of ['feat: something', 'Initial commit', 'post:', 'Post: 대문자', `post: ${'가'.repeat(100)}`]) assert.equal(lint(bad), 1, bad)
})
