import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { Script } from 'node:vm'
import { indexPage, postPage, termsPage, termPage, notFoundPage } from '../lib/templates.mjs'

const site = {
  title: 'nulleekh',
  description: 'nulLeeKH의 공부 블로그입니다.',
  motto: '',
  url: 'https://nulleekh.github.io',
  lang: 'ko',
  author: 'nulleekh',
  github: 'https://github.com/nulLeeKH',
  studio: { name: 'BURGESS1977™', url: 'https://studio.nulleekh.com' },
  giscus: { repo: 'nulLeeKH/nulleekh.github.io', repoId: '', category: 'Announcements', categoryId: '' },
  assets: { css: '/style.css?v=abcd1234', js: '/app.js?v=ef567890' },
  year: '2025', // build: the year of the newest post
}
const withGiscus = { ...site, giscus: { ...site.giscus, repoId: 'R_kgDO1', categoryId: 'DIC_kwDO1' } }

const EVIL = '<script>alert(1)</script>'
const ESCAPED = '&lt;script&gt;alert(1)&lt;/script&gt;'
const term = (dir, name, slug) => ({ name, slug, url: `/${dir}/${slug}/`, posts: [] })
const dev = term('categories', '개발', '개발')
const evilCat = term('categories', `${EVIL}분류`, 'x-cat')
const js = term('tags', '자바스크립트', '자바스크립트')
const evilTag = term('tags', `${EVIL}꼬리`, 'x-tag')

const post = (slug, date, extra) => ({
  file: `posts/${date}-${slug}.md`, slug, url: `/posts/${slug}/`, title: `${slug} 제목`,
  description: `${slug} 본문입니다.`, date, tags: [], draft: false, // derived: the opening of the body
  html: `<p>${slug} 본문입니다. 이어지는 문장.</p>`, toc: [], text: `${slug} 본문입니다. 이어지는 문장.`, readingMinutes: 1, ...extra,
})
const newest = post('newest', '2026-10-03', {
  title: `제목 ${EVIL}`, category: evilCat, tags: [js, evilTag], updated: '2026-10-05', readingMinutes: 7,
  toc: [{ depth: 2, id: '설치-방법', text: '설치 방법' }, { depth: 3, id: '준비', text: '준비' }, { depth: 2, id: '마치며', text: '마치며' }],
})
const middle = post('middle', '2026-02-01', { category: dev, tags: [js] })
const oldest = post('oldest', '2025-06-02', { category: dev })
const posts = [newest, middle, oldest]
dev.posts.push(middle, oldest)
evilCat.posts.push(newest)
js.posts.push(newest, middle)
evilTag.posts.push(newest)
const categories = [dev, evilCat]
const tags = [js, evilTag]

const pages = {
  '/': indexPage(site, posts, categories, tags),
  '/posts/newest/': postPage(site, newest, { prev: middle }),
  '/categories/': termsPage(site, 'category', categories),
  '/tags/': termsPage(site, 'tag', tags),
  '/categories/개발/': termPage(site, 'category', dev),
  '/tags/자바스크립트/': termPage(site, 'tag', js),
  '/404.html': notFoundPage(site),
}
const count = (s, sub) => s.split(sub).length - 1
const jsonLd = html => JSON.parse(/<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1])

test('home page carries WebSite structured data for the site name', () => {
  const ld = jsonLd(pages['/'])
  assert.deepEqual([ld['@type'], ld.name, ld.url], ['WebSite', site.title, 'https://nulleekh.github.io/'])
  assert.equal(jsonLd(pages['/posts/newest/']).image, 'https://nulleekh.github.io/posts/newest/og.png')
})

test('search engine verification tags appear only for codes that are set', () => {
  const html = postPage({ ...site, verification: { google: 'g-<code>', naver: '' } }, middle, {})
  assert.ok(html.includes('<meta name="google-site-verification" content="g-&lt;code&gt;">'))
  assert.ok(!html.includes('naver-site-verification'))
  assert.ok(!pages['/'].includes('site-verification'))
})

test('every page is a full document with the fonts placeholder, canonical URL and root-absolute assets', () => {
  for (const [path, html] of Object.entries(pages)) {
    const canonical = `https://nulleekh.github.io${encodeURI(path)}`
    assert.match(html, /^<!doctype html>\n<html lang="ko">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n/, path)
    assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`), path)
    assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`), path)
    assert.ok(html.includes('<meta property="og:locale" content="ko_KR">'), path)
    const image = path.startsWith('/posts/') ? `${canonical}og.png` : 'https://nulleekh.github.io/og.png'
    assert.ok(html.includes(`<meta property="og:image" content="${image}">`), path)
    // the site card shows the site, not the page: its alt is the site name
    const alt = path === '/posts/newest/' ? '제목 &lt;script&gt;alert(1)&lt;/script&gt;' : 'nulleekh'
    assert.ok(html.includes(`<meta property="og:image:alt" content="${alt}">`), path)
    assert.ok(html.includes('<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">'), path)
    assert.ok(html.includes('<meta name="twitter:card" content="summary_large_image">'), path)
    assert.ok(html.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png">'), path)
    assert.ok(html.includes('<link rel="alternate" type="application/rss+xml" title="nulleekh" href="/rss.xml">'), path)
    assert.ok(html.includes('<link rel="icon" href="/favicon.svg" type="image/svg+xml">'), path)
    assert.ok(html.includes('<link rel="stylesheet" href="/style.css?v=abcd1234">'), path)
    assert.ok(html.includes('<script src="/app.js?v=ef567890" defer></script>'), path)
    assert.match(html, /<script>[^<]*classList\.add\('js'\)[^<]*localStorage\.getItem\('theme'\)[^<]*<\/script>/, path)
    assert.ok(!html.includes('OFL'), path) // the license ships next to the font files, not in the footer
    assert.ok(html.includes('© 2025 nulleekh · Built by <a href="https://studio.nulleekh.com" target="_blank" rel="noopener">BURGESS1977™</a>'), path)
    assert.ok(html.trimEnd().endsWith('</html>'), path)
  }
})

test('every interpolated title, category and tag name is escaped', () => {
  for (const [path, html] of Object.entries(pages)) assert.ok(!html.includes('<script>alert'), path)
  const p = pages['/posts/newest/']
  assert.ok(p.includes(`<title>제목 ${ESCAPED} · nulleekh</title>`))
  assert.ok(p.includes(`<h1 class="post-title" id="post-title">제목 ${ESCAPED}</h1>`))
  assert.ok(p.includes(`<meta property="article:tag" content="${ESCAPED}꼬리">`))
  assert.ok(pages['/'].includes(`${ESCAPED}분류`))
  assert.ok(pages['/tags/'].includes(`${ESCAPED}꼬리`))
})

test('post page: category kicker, dates, tags, nested ToC and article meta', () => {
  const p = pages['/posts/newest/']
  assert.ok(p.includes(`<p class="kicker"><a href="/categories/x-cat/">${ESCAPED}분류</a></p>`))
  assert.ok(p.includes('<time datetime="2026-10-03">2026년 10월 3일</time>'))
  assert.ok(p.includes('<time datetime="2026-10-05">2026년 10월 5일</time>'))
  assert.ok(p.includes('<dd>약 7분</dd>'))
  assert.ok(p.includes('<li><a href="/tags/자바스크립트/">#자바스크립트</a></li>'))
  assert.ok(p.includes('<li><a href="#설치-방법">설치 방법</a><ol><li><a href="#준비">준비</a></li></ol></li><li><a href="#마치며">마치며</a></li>'))
  assert.ok(p.includes('<div class="prose">\n<p>newest 본문입니다. 이어지는 문장.</p>\n</div>'))
  assert.ok(p.includes('<meta property="og:type" content="article">'))
  assert.ok(p.includes('<meta property="article:published_time" content="2026-10-03T00:00:00+09:00">'))
  assert.ok(p.includes('<meta property="article:modified_time" content="2026-10-05T00:00:00+09:00">'))
  assert.ok(p.includes('<meta name="giscus:backlink" content="https://nulleekh.github.io/posts/newest/">'))
  assert.ok(p.includes('<div class="progress-top" aria-hidden="true"></div>'))

  // h3s before the first h2 stay top-level siblings (unnumbered via .toc-h3), not nested under the first one
  const h3s = postPage(site, { ...oldest, toc: ['준비', '설치', '실행'].map(t => ({ depth: 3, id: t, text: t })).concat({ depth: 2, id: '정리', text: '정리' }) }, {})
  assert.ok(h3s.includes('<ol class="toc-list"><li class="toc-h3"><a href="#준비">준비</a></li><li class="toc-h3"><a href="#설치">설치</a></li><li class="toc-h3"><a href="#실행">실행</a></li><li><a href="#정리">정리</a></li></ol>'))

  const plain = postPage(site, oldest, {})
  assert.ok(!plain.includes('class="toc"'), 'no ToC without headings')
  assert.ok(!plain.includes('수정일'), 'no updated row without updated')
  assert.ok(!plain.includes('<dt>태그</dt>'), 'no tag row without tags')
  assert.ok(!postPage(site, { ...oldest, category: undefined }, {}).includes('class="kicker"'))
})

test('post page: dek only when the description is not just the opening of the body', () => {
  assert.ok(!pages['/posts/newest/'].includes('post-dek'), 'derived description is not repeated above the body')
  const own = postPage(site, { ...oldest, description: '직접 쓴 요약' }, {})
  assert.ok(own.includes('<p class="post-dek">직접 쓴 요약</p>'))
  const cut = postPage(site, { ...oldest, text: '가'.repeat(300), description: `${'가'.repeat(159)}…` }, {})
  assert.ok(!cut.includes('post-dek'))
})

test('post page: a body without prose still gets a description', () => {
  const html = postPage(site, { ...oldest, description: '', text: '' }, {})
  assert.ok(html.includes('<meta name="description" content="oldest 제목">'))
  assert.ok(html.includes('<meta property="og:description" content="oldest 제목">'))
  assert.equal(jsonLd(html).description, 'oldest 제목')
  assert.ok(!html.includes('post-dek'))
})

test('drafts carry a badge wherever they are listed', () => {
  const draft = { ...middle, draft: true }
  const badge = '<span class="draft-badge">초안</span>'
  assert.ok(postPage(site, draft, {}).includes(`<p class="kicker"><a href="/categories/개발/">개발</a> ${badge}</p>`))
  assert.ok(postPage(site, { ...draft, category: undefined }, {}).includes(`<p class="kicker">${badge}</p>`))
  assert.ok(indexPage(site, [newest, draft], [], []).includes(`<a href="/posts/middle/">middle 제목</a> ${badge}</h4>`))
  assert.ok(termsPage(site, 'category', [{ ...dev, posts: [draft] }]).includes(`middle 제목</a> ${badge}</h3>`))
  for (const html of Object.values(pages)) assert.ok(!html.includes('draft-badge'))
})

test('post page: previous (older) and next (newer) links, or their empty states', () => {
  const both = postPage(site, middle, { prev: oldest, next: newest })
  assert.ok(both.includes('<a class="pn" href="/posts/oldest/" rel="prev">'))
  assert.ok(both.includes('<span class="pn-title">oldest 제목</span>'))
  assert.ok(both.includes('<a class="pn" href="/posts/newest/" rel="next">'))
  assert.ok(both.includes(`<span class="pn-title">제목 ${ESCAPED}</span>`))
  const none = postPage(site, middle, {})
  assert.ok(none.includes('가장 오래된 글입니다'))
  assert.ok(none.includes('가장 최근 글입니다'))
  assert.ok(!none.includes('rel="prev"') && !none.includes('rel="next"'))
})

test('post page: giscus comments only when both ids are set', () => {
  assert.ok(!pages['/posts/newest/'].includes('id="giscus"'))
  assert.ok(!pages['/posts/newest/'].includes('class="comments"'))
  const half = { ...site, giscus: { ...site.giscus, repoId: 'R_kgDO1' } }
  assert.ok(!postPage(half, newest, {}).includes('id="giscus"'))
  const html = postPage(withGiscus, newest, {})
  assert.ok(html.includes('<section class="comments" aria-labelledby="comments-label"><h2 id="comments-label">댓글</h2>'))
  assert.ok(html.includes('<div id="giscus" data-repo="nulLeeKH/nulleekh.github.io" data-repo-id="R_kgDO1" data-category="Announcements" data-category-id="DIC_kwDO1" data-term="posts/newest/"></div>'))
  assert.ok(html.includes('<noscript>댓글을 보려면 JavaScript가 필요합니다.</noscript></section>'))
})

test('post page: JSON-LD parses and cannot close its script element', () => {
  const html = pages['/posts/newest/']
  const raw = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)[1]
  assert.ok(!raw.includes('<'))
  const ld = jsonLd(html)
  assert.equal(ld['@type'], 'BlogPosting')
  assert.equal(ld.headline, newest.title)
  assert.equal(ld.datePublished, '2026-10-03T00:00:00+09:00')
  assert.equal(ld.dateModified, '2026-10-05T00:00:00+09:00')
  assert.equal(ld.mainEntityOfPage, 'https://nulleekh.github.io/posts/newest/')
  assert.deepEqual(ld.author, { '@type': 'Person', name: 'nulleekh', url: 'https://github.com/nulLeeKH' })
  assert.deepEqual(ld.keywords, ['자바스크립트', `${EVIL}꼬리`])
  assert.equal(jsonLd(postPage(site, oldest, {})).dateModified, '2025-06-02T00:00:00+09:00')
})

test('home: category and tag links with counts, year archive with category and tags', () => {
  const html = pages['/']
  assert.ok(html.includes('<title>nulleekh</title>'))
  assert.ok(html.includes('<meta property="og:type" content="website">'))
  assert.ok(html.includes('<p class="masthead-meta">글 3편 · 카테고리 2개 · 태그 2개</p>'))
  assert.ok(html.includes('<h1 class="sr-only" id="site-title">nulleekh</h1>') && html.includes('<p class="masthead-line"></p>'), 'the header already shows the name: the masthead is the motto (none yet)')
  assert.ok(html.includes('<a href="https://github.com/nulLeeKH" target="_blank" rel="me noopener">GitHub</a>'), 'external links open a new tab')
  assert.ok(html.includes('<a class="chip" href="/categories/개발/">개발 <span class="chip-count">2<span class="sr-only">편</span></span></a>'))
  assert.ok(html.includes('<a class="chip" href="/tags/자바스크립트/">#자바스크립트 <span class="chip-count">2<span class="sr-only">편</span></span></a>'))
  assert.ok(html.indexOf('categories-label') < html.indexOf('tags-label'))
  assert.ok(html.includes('<h3 class="year-num" id="y-2026">2026 <span class="year-count">2편</span></h3>'))
  assert.ok(html.includes('<h3 class="year-num" id="y-2025">2025 <span class="year-count">1편</span></h3>'))
  assert.ok(html.indexOf('y-2026') < html.indexOf('y-2025'))
  assert.ok(html.includes('<time class="entry-date" datetime="2026-02-01">02.01</time>'))
  assert.ok(html.includes('<a class="entry-cat" href="/categories/개발/">개발</a><ul class="tags" aria-label="태그"><li><a href="/tags/자바스크립트/">#자바스크립트</a></li></ul>'))
  assert.equal(count(html, 'class="entry"'), 3)

  const empty = indexPage(site, [], [], [])
  assert.ok(empty.includes('아직 글이 없습니다.'))
  assert.ok(!empty.includes('id="archive"'))
})

test('terms pages list every term with its post count', () => {
  const tagIndex = pages['/tags/']
  assert.ok(tagIndex.includes('<title>태그 · nulleekh</title>'))
  assert.ok(tagIndex.includes('<li><a href="/tags/" aria-current="page">태그</a></li>'))
  assert.ok(tagIndex.includes('<li><a href="/tags/자바스크립트/"><span class="idx-name"><span class="idx-hash">#</span>자바스크립트</span><span class="idx-dots" aria-hidden="true"></span><span class="idx-count">2<span class="sr-only">편</span></span></a></li>'))
  assert.ok(tagIndex.indexOf('/tags/자바스크립트/') < tagIndex.indexOf('/tags/x-tag/'), 'keeps the given order')
  assert.ok(tagIndex.includes('태그 2개, 글 2편'))

  const catIndex = pages['/categories/']
  assert.ok(catIndex.includes('<li><a href="/categories/" aria-current="page">카테고리</a></li>'))
  assert.ok(catIndex.includes('<h2 class="term-name" id="c-개발"><a href="/categories/개발/">개발</a> <span class="term-count">2편</span></h2>'))
  assert.ok(catIndex.includes('<time class="entry-date" datetime="2025-06-02">2025.06.02</time><h3 class="entry-title"><a href="/posts/oldest/">oldest 제목</a></h3>'))
  assert.ok(catIndex.indexOf('/posts/middle/') < catIndex.indexOf('/posts/oldest/'), 'newest first')
  assert.ok(catIndex.includes('카테고리 2개, 글 3편'))

  assert.ok(termsPage(site, 'tag', []).includes('아직 태그가 없습니다.'))
})

test('term pages: breadcrumbs, count and posts grouped by year', () => {
  const cat = pages['/categories/개발/']
  assert.ok(cat.includes('<title>개발 · nulleekh</title>'))
  assert.ok(cat.includes('<li><a href="/categories/" aria-current="true">카테고리</a></li>'))
  assert.ok(cat.includes('<ol class="crumbs"><li><a href="/">홈</a></li><li><a href="/categories/">카테고리</a></li><li aria-current="page">개발</li></ol>'))
  assert.ok(cat.includes('<h1 class="term-title">개발</h1>'))
  assert.ok(cat.includes('<p class="term-meta">글 2편 · 2025년 6월부터 · 최신순</p>'))
  assert.ok(cat.includes('<h2 class="year-num" id="y-2026">2026 <span class="year-count">1편</span></h2>'))
  assert.ok(cat.includes('<h3 class="entry-title"><a href="/posts/oldest/">oldest 제목</a></h3>'))

  assert.ok(!cat.includes('class="entry-cat"'), 'a category page does not repeat its own name on every row')

  const tag = pages['/tags/자바스크립트/']
  assert.ok(tag.includes('<title>#자바스크립트 · nulleekh</title>'))
  assert.ok(tag.includes('<a class="entry-cat" href="/categories/개발/">개발</a>'))
  assert.ok(tag.includes('<h1 class="term-title"><span class="hash">#</span>자바스크립트</h1>'))
  assert.equal(count(tag, 'class="entry"'), 2)
})

test('404 page: same layout, not indexed, links back', () => {
  const html = pages['/404.html']
  assert.ok(html.includes('<meta name="robots" content="noindex">'))
  assert.ok(html.includes('<h1 class="page-title">페이지를 찾을 수 없습니다</h1>'))
  assert.ok(html.includes('<a class="chip" href="/">홈</a>'))
  assert.ok(html.includes('<header class="site-header">') && html.includes('<footer class="site-footer">'))
})

test('static/app.js parses as a classic script', () => {
  assert.doesNotThrow(() => new Script(readFileSync(new URL('../static/app.js', import.meta.url), 'utf8')))
})

test('visible titles hold Hangul to brackets, attributes stay plain', () => {
  const html = postPage(site, post('lsm', '2026-01-01', { title: 'B트리(LSM)를 쓴다' }), {})
  assert.ok(html.includes('<h1 class="post-title" id="post-title">B트<span class="nb">리(</span>LSM<span class="nb">)를</span> 쓴다</h1>'))
  assert.ok(html.includes('<meta property="og:title" content="B트리(LSM)를 쓴다">'))
})
