import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { build, site } from '../build.mjs'

const repo = fileURLToPath(new URL('..', import.meta.url))
const fixtures = join(repo, 'test/fixtures/posts')
const opts = { staticDir: join(repo, 'static'), brandDir: join(repo, 'brand') }
const dirs = []
after(() => dirs.forEach(d => rmSync(d, { recursive: true, force: true })))

function tmp() {
  const dir = mkdtempSync(join(tmpdir(), 'build-'))
  dirs.push(dir)
  return dir
}

// A posts/ directory made from { 'relative/path': content }.
function posts(files) {
  const src = tmp()
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(src, path)), { recursive: true })
    writeFileSync(join(src, path), content)
  }
  return src
}

// A copy of static/ plus { 'relative/path': content }.
function statics(files) {
  const dir = tmp()
  cpSync(opts.staticDir, dir, { recursive: true })
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), content)
  }
  return dir
}

const read = (out, path) => readFileSync(join(out, path), 'utf8')
// Paths as stored on disk (APFS lookups ignore normalization, readdir does not).
const listing = out => readdirSync(out, { recursive: true, withFileTypes: true })
  .filter(d => d.isFile()).map(d => join(d.parentPath, d.name).slice(out.length + 1)).sort()
const sha8 = path => createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 8)
const encoded = path => `${site.url}${encodeURI(path)}`

let prod, prodResult
before(async () => {
  prod = tmp()
  prodResult = await build({ src: fixtures, out: prod, ...opts })
})

test('a production build writes every page, feed and asset, without drafts', () => {
  const files = listing(prod)
  for (const f of [
    'index.html', 'posts/first/index.html', 'posts/folder/index.html', 'posts/folder/img/diagram.svg',
    'categories/index.html', 'categories/개발/index.html', 'tags/index.html', 'tags/node-js/index.html',
    'tags/자바스크립트/index.html', '404.html', 'rss.xml', 'sitemap.xml', 'robots.txt',
    'style.css', 'app.js', 'favicon.svg', 'apple-touch-icon.png', 'og.png', 'posts/first/og.png', 'posts/folder/og.png', 'fonts/OFL.txt',
  ]) assert.ok(files.includes(f), f)
  // D2Coding ships as is (no subsetting): the same bytes as static/fonts, license alongside
  for (const f of ['fonts/D2Coding-Regular.woff2', 'fonts/D2Coding-Bold.woff2', 'fonts/OFL.txt']) {
    assert.ok(readFileSync(join(prod, f)).equals(readFileSync(join(opts.staticDir, f))), f)
  }
  assert.ok(!files.some(f => /draft|메모|초안|\.md$/.test(f)), 'drafts and markdown sources stay out')
  assert.deepEqual(prodResult, { posts: 2, drafts: 1, categories: 1, tags: 2 })
})

test('pages link older and newer posts, terms, and cache-busted assets', () => {
  const folder = read(prod, 'posts/folder/index.html')
  const first = read(prod, 'posts/first/index.html')
  assert.match(folder, /<a class="pn" href="\/posts\/first\/" rel="prev">/)
  assert.doesNotMatch(folder, /rel="next"/)
  assert.match(first, /<a class="pn" href="\/posts\/folder\/" rel="next">/)
  assert.match(first, /<p class="kicker"><a href="\/categories\/개발\/">개발<\/a><\/p>/)
  assert.match(first, /<a href="\/tags\/node-js\/">#Node JS<\/a>/)
  assert.ok(folder.includes('<p class="post-dek">직접 쓴 설명입니다.</p>'))
  for (const page of [folder, read(prod, 'index.html'), read(prod, 'tags/자바스크립트/index.html')]) {
    assert.ok(page.includes(`href="/style.css?v=${sha8(join(opts.staticDir, 'style.css'))}"`))
    assert.ok(page.includes(`src="/app.js?v=${sha8(join(opts.staticDir, 'app.js'))}"`))
  }
  const tag = read(prod, 'tags/자바스크립트/index.html')
  assert.ok(tag.indexOf('/posts/folder/') < tag.indexOf('/posts/first/'), 'term pages list newest first')
})

test('a folder post publishes its files beside the page', () => {
  assert.deepEqual(readFileSync(join(prod, 'posts/folder/img/diagram.svg')),
    readFileSync(join(fixtures, '2026-02-01-folder/img/diagram.svg')))
  assert.match(read(prod, 'posts/folder/index.html'),
    /<figure><img src="img\/diagram.svg" alt="흐름도" loading="lazy" decoding="async" width="120" height="40"><figcaption>그림 1. 흐름<\/figcaption><\/figure>/)
})

test('404.html uses root-absolute links so it works at any depth', () => {
  const html = read(prod, '404.html')
  assert.match(html, /href="\/style\.css\?v=[0-9a-f]{8}"/)
  assert.match(html, /src="\/app\.js\?v=[0-9a-f]{8}"/)
  assert.ok(!/(?:href|src)="(?!\/|https:|#)/.test(html), 'no relative URLs')
})

test('sitemap and rss list the published URLs only', () => {
  const sitemap = read(prod, 'sitemap.xml')
  for (const path of ['/', '/posts/first/', '/posts/folder/', '/categories/', '/categories/개발/', '/tags/', '/tags/node-js/', '/tags/자바스크립트/']) {
    assert.ok(sitemap.includes(`<loc>${encoded(path)}</loc>`), path)
  }
  assert.ok(sitemap.includes('<lastmod>2026-02-03</lastmod>'), 'updated wins over date')
  const rss = read(prod, 'rss.xml')
  assert.ok(rss.includes(`<link>${site.url}/posts/folder/</link>`))
  assert.ok(rss.includes(`src=&quot;${site.url}/posts/folder/img/diagram.svg&quot;`), 'relative image made absolute')
  assert.equal(read(prod, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`)
  for (const feed of [sitemap, rss]) assert.ok(!/draft/.test(feed))
})

test('drafts: true publishes drafts and their terms', async () => {
  const out = tmp()
  assert.deepEqual(await build({ src: fixtures, out, drafts: true, ...opts }), { posts: 3, drafts: 1, categories: 2, tags: 3 })
  const files = listing(out)
  for (const f of ['posts/draft/index.html', 'categories/메모/index.html', 'tags/초안/index.html']) assert.ok(files.includes(f), f)
  assert.match(read(out, 'posts/folder/index.html'), /href="\/posts\/draft\/" rel="next"/)
})

test('two builds of the same input are byte-identical, and stale output is removed', async () => {
  const out = tmp()
  writeFileSync(join(out, 'stale.txt'), 'old')
  await build({ src: fixtures, out, ...opts })
  const files = listing(out)
  assert.deepEqual(files, listing(prod))
  for (const f of files) assert.ok(readFileSync(join(out, f)).equals(readFileSync(join(prod, f))), f)
})

test('NFD sources, names and files come out NFC; a BOM and junk files are ignored', async () => {
  const nfd = s => s.normalize('NFD')
  const src = posts({
    '2026-10-03-nfd/index.md': nfd('---\ntitle: 한글 제목\ncategory: 개발\ntags: [자바스크립트]\n---\n![그림](그림.svg)\n'),
    [nfd('2026-10-03-nfd/그림.svg')]: '<svg xmlns="http://www.w3.org/2000/svg"/>',
    '2026-10-03-nfd/.DS_Store': 'junk',
    '.DS_Store': 'junk',
    '2026-10-03-nfd.md~': 'editor backup',
    '2026-10-02-bom.md': '\uFEFF---\ntitle: BOM\n---\n본문\n',
  })
  const out = tmp()
  await build({ src, out, ...opts })
  const files = listing(out)
  for (const f of ['posts/nfd/그림.svg', 'posts/bom/index.html', 'categories/개발/index.html', 'tags/자바스크립트/index.html']) assert.ok(files.includes(f), f)
  assert.ok(files.every(f => f === f.normalize('NFC')), 'no NFD paths')
  assert.ok(!files.some(f => f.endsWith('.DS_Store')))
  const html = read(out, 'posts/nfd/index.html')
  assert.ok(html.includes('<h1 class="post-title" id="post-title">한글 제목</h1>'))
  assert.equal(html, html.normalize('NFC'))
})

test('names with dots: Node.js and Next.js keep their dots, .NET loses the leading one', async () => {
  const src = posts({ '2026-10-03-a.md': '---\ntitle: 글\ncategory: Next.js\ntags: [Node.js, .NET]\n---\n본문\n' })
  const out = tmp()
  await build({ src, out, ...opts })
  const files = listing(out)
  for (const f of ['categories/next.js/index.html', 'tags/node.js/index.html', 'tags/net/index.html']) assert.ok(files.includes(f), f)
  assert.ok(!files.some(f => f.split('/').some(part => part.startsWith('.'))), 'no hidden paths: the Pages artifact drops them')
  assert.match(read(out, 'tags/net/index.html'), /<h1 class="term-title"><span class="hash">#<\/span>\.NET<\/h1>/)
})

test('images get their pixel size; external, sized and unreadable images stay as written', async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"/>'
  const src = posts({
    '2026-10-03-a/index.md': [
      '---\ntitle: 글\n---', '![a](a.svg)', '![b](/img/b.svg)', '![c](https://example.com/c.png)',
      '<img src="a.svg" width="10" alt="d">', '![e](/favicon.svg)', '<!-- 나중에 넣을 그림: <img src="todo.png"> [x](/nope/) -->', '',
    ].join('\n\n'),
    '2026-10-03-a/a.svg': svg,
  })
  const out = tmp()
  await build({ src, out, ...opts, staticDir: statics({ 'img/b.svg': svg }) })
  const html = read(out, 'posts/a/index.html')
  assert.ok(html.includes('<img src="a.svg" alt="a" loading="lazy" decoding="async" width="64" height="32">'))
  assert.ok(html.includes('<img src="/img/b.svg" alt="b" loading="lazy" decoding="async" width="64" height="32">'))
  assert.ok(html.includes('<img src="https://example.com/c.png" alt="c" loading="lazy" decoding="async">'))
  assert.ok(html.includes('<img src="a.svg" width="10" alt="d">'))
  assert.ok(html.includes('<img src="/favicon.svg" alt="e" loading="lazy" decoding="async">'), 'a viewBox-only SVG has no fixed size')
})

test('static/ names come out NFC; static/ symlinks may not leave it', async () => {
  const src = posts({ '2026-10-03-a.md': '---\ntitle: 글\n---\n![공용](/img/그림.svg)\n' })
  const out = tmp()
  await build({ src, out, ...opts, staticDir: statics({ ['img/그림.svg'.normalize('NFD')]: '<svg xmlns="http://www.w3.org/2000/svg"/>' }) })
  assert.ok(listing(out).includes('img/그림.svg'))

  const staticDir = statics({})
  symlinkSync(fileURLToPath(import.meta.url), join(staticDir, 'notes.txt'))
  await assert.rejects(build({ src, out: tmp(), ...opts, staticDir }), e => e.message.startsWith(`${staticDir}: notes.txt is a symlink that points outside`))
})

test('a failed build leaves the previous output in place', async () => {
  const out = tmp()
  await build({ src: fixtures, out, ...opts })
  const before = listing(out)
  await assert.rejects(build({ src: posts({ '2026-10-03-a.md': '---\ntag: x\n---\n' }), out, ...opts }), /unknown field/)
  await assert.rejects(build({ src: posts({ '2026-10-03-a.md': '---\ntitle: 글\n---\n$\\frac{$\n' }), out, ...opts }), /math/)
  // the link check runs last, on the staged build in .temp/: dist/ must still be the previous one
  await assert.rejects(build({ src: posts({ '2026-10-03-a.md': '---\ntitle: 글\n---\n![x](nope.png)\n' }), out, ...opts }), /broken image/)
  assert.deepEqual(listing(out), before)
  assert.deepEqual(readdirSync(join(dirname(out), '.temp')).filter(n => n.startsWith(`${basename(out)}-`)), [], 'stage removed after a failure')
})

test('overlapping builds into one out never mix', async () => {
  const out = tmp()
  await Promise.all([build({ src: fixtures, out, ...opts, drafts: true }), build({ src: fixtures, out, ...opts })])
  assert.equal(existsSync(join(out, 'posts/draft/index.html')), read(out, 'index.html').includes('/posts/draft/'))
})

test('a published file may not take a path the build writes', async () => {
  const src = posts({ '2026-10-03-a/index.md': '---\ntitle: 글\n---\n본문\n', '2026-10-03-a/og.png': 'x' })
  await assert.rejects(build({ src, out: tmp(), ...opts }), /2026-10-03-a\/og\.png: posts\/a\/og\.png is written by the build/)
  const staticDir = statics({ 'robots.txt': 'User-agent: *\nDisallow: /\n' })
  await assert.rejects(build({ src: fixtures, out: tmp(), ...opts, staticDir }), /robots\.txt: robots\.txt is written by the build/)
})

test('tags written as one comma string are rejected', async () => {
  await assert.rejects(build({ src: posts({ '2026-10-03-a.md': '---\ntitle: 글\ntags: Node.js, ESM\n---\n본문\n' }), out: tmp(), ...opts }),
    /2026-10-03-a\.md: .*tags: "Node\.js, ESM" is one tag/)
})

test('links to a section of another post are checked', async () => {
  const other = '---\ntitle: 다른 글\n---\n## 있는 절\n'
  const link = target => `---\ntitle: 글\n---\n[링크](${target})\n`
  const src = name => posts({ '2026-10-01-other.md': other, '2026-10-03-a.md': link(name) })
  await build({ src: src('/posts/other/#있는-절'), out: tmp(), ...opts })
  await build({ src: src('/posts/other/#%EC%9E%88%EB%8A%94-%EC%A0%88'), out: tmp(), ...opts })
  await assert.rejects(build({ src: src('/posts/other/#없는-절'), out: tmp(), ...opts }), /broken link .*no element has this id/)
})

test("'<!--' in an alt text does not hide the links and ids after it", async () => {
  const a = '---\ntitle: 글\n---\n![<!-- 로 시작하는 주석](/favicon.svg)\n\n## 주석 처리 순서\n\n```mermaid\nflowchart LR\n  A --> B\n```\n'
  const b = '---\ntitle: 글\n---\n[앞 글의 절](/posts/a/#주석-처리-순서)\n'
  await build({ src: posts({ '2026-10-03-a.md': a, '2026-10-04-b.md': b }), out: tmp(), ...opts })
  await assert.rejects(build({ src: posts({ '2026-10-03-a.md': a + '\n[x](/posts/nope/)\n' }), out: tmp(), ...opts }),
    /broken link \/posts\/nope\/$/)
})

test('a missing posts folder is named in the error', async () => {
  const src = join(tmp(), 'posts')
  await assert.rejects(build({ src, out: tmp(), ...opts }), e => e.message === `${src}: folder not found`)
})

const ok = '---\ntitle: 글\n---\n본문입니다.\n'
const fm = lines => `---\ntitle: 글\n${lines}\n---\n본문입니다.\n`
const body = text => `---\ntitle: 글\n---\n${text}\n`
// [name, files, the post path the message must start with, message pattern]
const invalid = [
  ['upper-case file name', { '2026-10-03-Hello.md': ok }, '2026-10-03-Hello.md', /YYYY-MM-DD-slug/],
  ['stray file', { 'notes.txt': 'x' }, 'notes.txt', /YYYY-MM-DD-slug/],
  ['impossible date', { '2026-02-30-a.md': ok }, '2026-02-30-a.md', /date/],
  ['missing title', { '2026-10-03-a.md': '---\ntags: [a]\n---\n본문\n' }, '2026-10-03-a.md', /title/],
  ['blank title', { '2026-10-03-a.md': '---\ntitle: " "\n---\n' }, '2026-10-03-a.md', /title/],
  ['no front-matter', { '2026-10-03-a.md': '본문만 있습니다.\n' }, '2026-10-03-a.md', /title/],
  ['YAML error', { '2026-10-03-a.md': '---\ntitle: a: b\n---\n' }, '2026-10-03-a.md', /front-matter/],
  ['unknown field', { '2026-10-03-a.md': fm('tag: a') }, '2026-10-03-a.md', /front-matter: unknown field "tag"/],
  ['tags not strings', { '2026-10-03-a.md': fm('tags: [1]') }, '2026-10-03-a.md', /tags/],
  ['category not a string', { '2026-10-03-a.md': fm('category: [a, b]') }, '2026-10-03-a.md', /category/],
  ['description not a string', { '2026-10-03-a.md': fm('description: 3') }, '2026-10-03-a.md', /description/],
  ['updated before date', { '2026-10-03-a.md': fm('updated: 2026-10-01') }, '2026-10-03-a.md', /updated/],
  ['invalid updated', { '2026-10-03-a.md': fm('updated: 2026-13-01') }, '2026-10-03-a.md', /updated/],
  ['draft not boolean', { '2026-10-03-a.md': fm('draft: yes') }, '2026-10-03-a.md', /draft/],
  ['tag without a slug', { '2026-10-03-a.md': fm("tags: ['??']") }, '2026-10-03-a.md', /slug/],
  ['category of dots', { '2026-10-03-a.md': fm("category: '..'") }, '2026-10-03-a.md', /slug/],
  ['tag of a dot', { '2026-10-03-a.md': fm("tags: ['.']") }, '2026-10-03-a.md', /slug/],
  ['duplicate slug', { '2026-10-03-a.md': ok, '2026-10-04-a/index.md': ok }, '2026-10-04-a/index.md', /slug "a"/],
  ['tag slug collision', { '2026-10-03-a.md': fm('tags: [C#]'), '2026-10-04-b.md': fm('tags: [c]') }, '2026-10-03-a.md', /\/tags\/c\//],
  ['category slug collision', { '2026-10-03-a.md': fm('category: Dev'), '2026-10-04-b.md': fm('category: dev') }, '2026-10-03-a.md', /\/categories\/dev\//],
  ['math error', { '2026-10-03-a.md': body('$\\frac{$') }, '2026-10-03-a.md', /math/],
  ['folder without index.md', { '2026-10-03-a/a.png': 'x' }, '2026-10-03-a/index.md', /index\.md/],
  ['HTML file in a folder post', { '2026-10-03-a/index.md': ok, '2026-10-03-a/demo.html': '<p>' }, '2026-10-03-a/index.md', /demo\.html/],
  ['.HTM file in a folder post', { '2026-10-03-a/index.md': ok, '2026-10-03-a/demo.HTM': '<p>' }, '2026-10-03-a/index.md', /demo\.HTM: HTML files/],
  ['broken image', { '2026-10-03-a.md': body('![x](nope.png)') }, '2026-10-03-a.md', /broken image nope\.png$/],
  ['broken link', { '2026-10-03-a.md': body('[x](/posts/nope/)') }, '2026-10-03-a.md', /broken link \/posts\/nope\/$/],
  ['wrong case', { '2026-10-03-a.md': body('![x](/Favicon.svg)') }, '2026-10-03-a.md', /broken image \/Favicon\.svg$/],
  ['missing fragment', { '2026-10-03-a.md': body('## 있는 제목\n\n[x](#없는-제목)') }, '2026-10-03-a.md', /broken link #없는-제목/],
]

for (const [name, files, file, pattern] of invalid) {
  test(`fails with the post path: ${name}`, async () => {
    const src = posts(files)
    await assert.rejects(build({ src, out: tmp(), ...opts }), e => {
      assert.ok(e.message.startsWith(`${join(src, file)}: `), e.message)
      assert.match(e.message, pattern)
      return true
    })
  })
}

test('fails on a symlink that leaves the post folder, or leads nowhere', async () => {
  const src = posts({ '2026-10-03-a/index.md': ok })
  symlinkSync(fileURLToPath(import.meta.url), join(src, '2026-10-03-a/escape.txt'))
  await assert.rejects(build({ src, out: tmp(), ...opts }),
    e => e.message.startsWith(`${join(src, '2026-10-03-a/index.md')}: escape.txt is a symlink that points outside`))
  rmSync(join(src, '2026-10-03-a/escape.txt'))
  symlinkSync('does-not-exist.png', join(src, '2026-10-03-a/gone.png'))
  await assert.rejects(build({ src, out: tmp(), ...opts }),
    e => e.message === `${join(src, '2026-10-03-a/index.md')}: gone.png is a broken symlink`)
  rmSync(join(src, '2026-10-03-a/gone.png'))
  symlinkSync('../nowhere.md', join(src, '2026-10-04-b.md'))
  await assert.rejects(build({ src, out: tmp(), ...opts }), e => e.message === `${join(src, '2026-10-04-b.md')}: broken symlink`)
})

test('all broken links are reported at once, and a link to a draft says so', async () => {
  const src = posts({
    '2026-10-01-wip.md': '---\ntitle: 초안\ndraft: true\n---\n본문\n',
    '2026-10-02-a.md': '---\ntitle: 글\n---\n[초안](/posts/wip/) [없음](/posts/nope/) ![그림](x.png)\n',
  })
  await assert.rejects(build({ src, out: tmp(), ...opts }), e => {
    const lines = e.message.split('\n')
    assert.equal(lines.length, 3, e.message)
    assert.match(lines[0], /2026-10-02-a\.md: broken link \/posts\/wip\/ \(.*2026-10-01-wip\.md is a draft: publish it or remove the link\)/)
    assert.match(lines[1], /broken link \/posts\/nope\/$/)
    assert.match(lines[2], /broken image x\.png$/)
    return true
  })
})

test('math errors carry the line number in the post file', async () => {
  const src = posts({ '2026-10-03-a.md': '---\ntitle: 글\ntags: [a]\n---\n첫 문단\n\n$\\frac{$\n' })
  await assert.rejects(build({ src, out: tmp(), ...opts }), /2026-10-03-a\.md: math \(line 7\): KaTeX/)
})

test('footer copyright runs from the first post year to the newest', async () => {
  const post = '---\ntitle: 글\n---\n본문\n'
  const one = tmp(), two = tmp()
  await build({ src: posts({ '2026-03-01-a.md': post, '2026-05-01-b.md': post }), out: one, ...opts })
  assert.match(read(one, 'index.html'), /© 2026 /)
  await build({ src: posts({ '2024-12-31-a.md': post, '2026-05-01-b.md': post }), out: two, ...opts })
  assert.match(read(two, 'index.html'), /© 2024-2026 /)
})

test('updated on the publish date shows no 수정일; a later one does', async () => {
  const out = tmp()
  await build({ src: posts({
    '2026-10-03-same.md': '---\ntitle: 같은 날\nupdated: 2026-10-03\n---\n본문\n',
    '2026-10-03-later.md': '---\ntitle: 나중\nupdated: 2026-10-05\n---\n본문\n',
  }), out, ...opts })
  const same = read(out, 'posts/same/index.html'), later = read(out, 'posts/later/index.html')
  assert.ok(!same.includes('수정일'))
  assert.ok(same.includes('<meta property="article:modified_time" content="2026-10-03T00:00:00+09:00">'))
  assert.ok(later.includes('<dt>수정일</dt>'))
  assert.ok(later.includes('<meta property="article:modified_time" content="2026-10-05T00:00:00+09:00">'))
})
