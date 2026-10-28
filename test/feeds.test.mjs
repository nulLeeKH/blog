import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { rss, sitemap, robots } from '../lib/feeds.mjs'

const site = {
  title: 'nulleekh',
  description: 'nulLeeKH의 공부 블로그입니다.',
  url: 'https://nulleekh.github.io',
  lang: 'ko',
}

const term = (kind, name, slug = name) => ({ name, slug, url: `/${kind}/${slug}/` })

const post = (slug, date, extra = {}) => ({
  slug, url: `/posts/${slug}/`, title: `글 ${slug}`, description: '요약', date,
  html: '<p>본문</p>', tags: [], category: undefined, ...extra,
})

const dev = term('categories', '개발')
const js = term('tags', '자바스크립트')
const blog = term('tags', 'Blog', 'blog')

const posts = [
  post('newer', '2026-10-03', {
    title: 'A & B <C>', category: dev, tags: [js, blog],
    html: [
      '<p><a href="/tags/blog/">태그</a> <img src="diagram.png" alt="A > B" loading="lazy">',
      '<a href="../older/">이전</a> <a href="#user-content-fn-1">1</a> <a href="https://example.com/x?a=1&#x26;b=2">외부</a>',
      `<a href='/img/a.png'>raw</a> <a href="mailto:me@example.com">메일</a> <img data-src="keep.png"></p>`,
      '<p><code>&#x3C;img src="code.png"></code></p>',
      '<h2 id="소제목">소제목<a class="anchor" href="#소제목" aria-label="이 제목으로 연결되는 링크">#</a></h2>',
      '<pre><code>a &#x3C; b &#x26;&#x26; "]]>" \x1b[31m</code></pre>',
    ].join(''),
  }),
  post('older', '2026-10-01', { updated: '2026-10-05', category: dev, tags: [js] }),
]
const categories = [{ ...dev, posts }]
const tags = [{ ...js, posts }, { ...blog, posts: [posts[0]] }]

const hasXmllint = !spawnSync('xmllint', ['--version']).error
const xmllint = (args, xml) => {
  const r = spawnSync('xmllint', [...args, '-'], { input: xml, encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return r.stdout
}
const description = xml => xml.match(/<item>[\s\S]*?<description>([\s\S]*?)<\/description>/)[1]

test('rss channel', () => {
  const out = rss(site, posts)
  assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">'))
  assert.match(out, /<title>nulleekh<\/title>\n<link>https:\/\/nulleekh\.github\.io\/<\/link>/)
  assert.match(out, /<description>nulLeeKH의 공부 블로그입니다\.<\/description>/)
  assert.match(out, /<language>ko<\/language>/)
  assert.match(out, /<lastBuildDate>Sun, 04 Oct 2026 15:00:00 GMT<\/lastBuildDate>/, 'newest change is the 10-05 update')
  assert.match(out, /<atom:link href="https:\/\/nulleekh\.github\.io\/rss\.xml" rel="self" type="application\/rss\+xml"\/>/)
})

test('rss item fields', () => {
  const out = rss(site, posts)
  const item = out.match(/<item>[\s\S]*?<\/item>/)[0]
  assert.match(item, /<title>A &amp; B &lt;C&gt;<\/title>/)
  assert.match(item, /<link>https:\/\/nulleekh\.github\.io\/posts\/newer\/<\/link>/)
  assert.match(item, /<guid isPermaLink="true">https:\/\/nulleekh\.github\.io\/posts\/newer\/<\/guid>/)
  assert.match(item, /<pubDate>Fri, 02 Oct 2026 15:00:00 GMT<\/pubDate>/)
  assert.match(item, /<category>개발<\/category>\n<category>자바스크립트<\/category>\n<category>Blog<\/category>\n<description>/)
})

test('rss description is escaped full html with absolute urls', () => {
  const d = description(rss(site, posts))
  assert.ok(!d.includes('<'), 'no raw markup inside description')
  assert.ok(d.includes('&lt;p&gt;'))
  assert.ok(d.includes('href=&quot;https://nulleekh.github.io/tags/blog/&quot;'), 'root-relative href')
  assert.ok(d.includes('src=&quot;https://nulleekh.github.io/posts/newer/diagram.png&quot;'), 'relative src resolves against post url')
  assert.ok(d.includes('alt=&quot;A &gt; B&quot;'), '> inside an attribute does not end the tag')
  assert.ok(d.includes('href=&quot;https://nulleekh.github.io/posts/older/&quot;'), 'dot-segment href')
  assert.ok(d.includes('href=&quot;https://nulleekh.github.io/posts/newer/#user-content-fn-1&quot;'), 'fragment href')
  assert.ok(d.includes('href=&quot;https://example.com/x?a=1&amp;#x26;b=2&quot;'), 'external url untouched')
  assert.ok(d.includes('href=&quot;https://nulleekh.github.io/img/a.png&quot;'), 'single-quoted raw attribute')
  assert.ok(d.includes('href=&quot;mailto:me@example.com&quot;'))
  assert.ok(d.includes('data-src=&quot;keep.png&quot;'), 'only href/src attributes')
  assert.ok(d.includes('&amp;#x3C;img src=&quot;code.png&quot;&gt;'), 'text that looks like an attribute is not a url')
  assert.ok(d.includes('&lt;h2 id=&quot;소제목&quot;&gt;소제목&lt;/h2&gt;'), 'heading permalinks are page UI, not content')
  assert.ok(d.includes(']]&gt;'))
  assert.ok(!d.includes('\x1b'))
})

test('rss resolves srcset candidates and poster too', () => {
  const html = '<picture><source srcset="dark.svg 1x, /og.png 2x, https://cdn.example.com/w_1,h_2/a.png 3x, data:image/png;base64,AA,BB"></picture>'
    + `<img srcset='b.png'><video src="v.mp4" poster="p.png"></video>`
  const d = description(rss(site, [post('pic', '2026-10-03', { html })]))
  assert.ok(d.includes('srcset=&quot;https://nulleekh.github.io/posts/pic/dark.svg 1x, https://nulleekh.github.io/og.png 2x, '
    + 'https://cdn.example.com/w_1,h_2/a.png 3x, data:image/png;base64,AA,BB&quot;'), d)
  assert.ok(d.includes('srcset=&quot;https://nulleekh.github.io/posts/pic/b.png&quot;'), 'single-quoted, no descriptor')
  assert.ok(d.includes('poster=&quot;https://nulleekh.github.io/posts/pic/p.png&quot;'))
})

test('rss keeps the newest 20 items in order', () => {
  const many = Array.from({ length: 25 }, (_, i) => post(`p${i}`, `2026-01-${String(25 - i).padStart(2, '0')}`))
  const out = rss(site, many)
  const links = [...out.matchAll(/<item>\n<title>[^<]*<\/title>\n<link>([^<]*)<\/link>/g)].map(m => m[1])
  assert.equal(links.length, 20)
  assert.equal(links[0], 'https://nulleekh.github.io/posts/p0/')
  assert.equal(links[19], 'https://nulleekh.github.io/posts/p19/')
  assert.match(out, /<lastBuildDate>Sat, 24 Jan 2026 15:00:00 GMT<\/lastBuildDate>/)
})

test('rss strips XML-invalid characters from every field', () => {
  const out = rss({ ...site, title: 'a\x00b' }, [post('x', '2026-10-03', { title: 'x\x1by￾', html: '<p>\x0b</p>' })])
  assert.ok(!/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/.test(out))
  assert.match(out, /<title>ab<\/title>/)
  assert.match(out, /<title>xy<\/title>/)
})

test('sitemap lists every page with encoded urls and lastmod', () => {
  const out = sitemap(site, posts, categories, tags)
  assert.ok(out.startsWith('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'))
  const urls = [...out.matchAll(/<url><loc>([^<]*)<\/loc>(?:<lastmod>([^<]*)<\/lastmod>)?<\/url>/g)].map(m => [m[1], m[2]])
  assert.deepEqual(urls, [
    ['https://nulleekh.github.io/', '2026-10-05'],
    ['https://nulleekh.github.io/categories/', '2026-10-05'],
    ['https://nulleekh.github.io/categories/%EA%B0%9C%EB%B0%9C/', '2026-10-05'],
    ['https://nulleekh.github.io/tags/', '2026-10-05'],
    ['https://nulleekh.github.io/tags/%EC%9E%90%EB%B0%94%EC%8A%A4%ED%81%AC%EB%A6%BD%ED%8A%B8/', '2026-10-05'],
    ['https://nulleekh.github.io/tags/blog/', '2026-10-03'],
    ['https://nulleekh.github.io/posts/newer/', '2026-10-03'],
    ['https://nulleekh.github.io/posts/older/', '2026-10-05'],
  ])
})

test('robots points at the sitemap', () => {
  assert.equal(robots(site), 'User-agent: *\nAllow: /\nSitemap: https://nulleekh.github.io/sitemap.xml\n')
})

test('empty inputs produce minimal documents', () => {
  const feed = rss(site, [])
  assert.ok(!feed.includes('<item>'))
  assert.ok(!feed.includes('<lastBuildDate>'))
  assert.match(feed, /<\/channel>\n<\/rss>\n$/)
  assert.equal(sitemap(site, [], [], []), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    '<url><loc>https://nulleekh.github.io/</loc></url>',
    '<url><loc>https://nulleekh.github.io/categories/</loc></url>',
    '<url><loc>https://nulleekh.github.io/tags/</loc></url>',
    '</urlset>',
    '',
  ].join('\n'))
})

test('output is well-formed XML', { skip: !hasXmllint && 'xmllint not installed' }, () => {
  for (const xml of [rss(site, posts), rss(site, []), sitemap(site, posts, categories, tags), sitemap(site, [], [], [])]) {
    xmllint(['--noout'], xml)
  }
  const html = xmllint(['--xpath', 'string(//item[1]/description)'], rss(site, posts))
  assert.ok(html.startsWith('<p><a href="https://nulleekh.github.io/tags/blog/">'), 'description decodes back to html')
})
