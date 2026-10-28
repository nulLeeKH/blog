// Page templates (the "텍스트 문서" design: one column, plain links): each function returns a whole HTML document.
// Every link and asset is root-absolute so 404.html works at any depth.
import { esc, hold } from './util.mjs'

const title = s => hold(esc(s)) // visible title text only, not attributes

const KINDS = {
  category: { label: '카테고리', path: '/categories/', hash: '' },
  tag: { label: '태그', path: '/tags/', hash: '#' },
}
// Before first paint: honor a saved theme choice and tell CSS that JS runs.
const THEME = "document.documentElement.classList.add('js');try{const t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}"
const ICONS = '<svg class="i-moon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>'
  + '<svg class="i-sun" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>'

const abs = (site, path) => encodeURI(site.url + path) // same form as sitemap <loc>
const iso = ymd => `${ymd}T00:00:00+09:00`
const longDate = ymd => {
  const [y, m, d] = ymd.split('-')
  return `${y}년 ${+m}월 ${+d}일`
}
const time = (ymd, text, cls = '') => `<time${cls && ` class="${cls}"`} datetime="${esc(ymd)}">${esc(text)}</time>`
const termLabel = (kind, name) => KINDS[kind].hash + esc(name)
const termCount = n => `${n}<span class="sr-only">편</span>`
const lines = (...parts) => parts.filter(Boolean).join('\n') // optional parts leave no blank lines
// Drafts only reach the dev server and --drafts builds; the badge tells what a deploy would leave out.
const badge = post => post.draft ? ' <span class="draft-badge">초안</span>' : ''

// Search Console / Naver Search Advisor ownership meta tags, for the codes that are set.
const verification = site => Object.entries({ google: 'google-site-verification', naver: 'naver-site-verification' })
  .filter(([key]) => site.verification?.[key])
  .map(([key, name]) => `<meta name="${name}" content="${esc(site.verification[key])}">\n`).join('')

// image: the share card (lib/og.mjs draws /og.png for the site and <post url>og.png per post).
function page(site, { path, title, description, type = 'website', image = '/og.png', current = {}, head = '', main, progress = false }) {
  const url = esc(abs(site, path))
  const nav = (href, label, state) => `<li><a href="${href}"${state ? ` aria-current="${state}"` : ''}>${label}</a></li>`
  return `<!doctype html>
<html lang="${esc(site.lang)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script>${THEME}</script>
<title>${esc(path === '/' ? site.title : `${title} · ${site.title}`)}</title>
<meta name="description" content="${esc(description)}">
<meta name="author" content="${esc(site.author)}">
${verification(site)}<link rel="canonical" href="${url}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#faf9f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#171717" media="(prefers-color-scheme: dark)">
<meta property="og:type" content="${type}">
<meta property="og:site_name" content="${esc(site.title)}">
<meta property="og:locale" content="ko_KR">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${url}">
<meta property="og:image" content="${esc(abs(site, image))}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${esc(image === '/og.png' ? site.title : title)}">
<meta name="twitter:card" content="summary_large_image">
${head}<link rel="alternate" type="application/rss+xml" title="${esc(site.title)}" href="/rss.xml">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="${esc(site.assets.css)}">
<script src="${esc(site.assets.js)}" defer></script>
</head>
<body>
${progress ? '<div class="progress-top" aria-hidden="true"></div>\n' : ''}<a class="skip" href="#main">본문으로 건너뛰기</a>
<header class="site-header">
  <div class="wrap header-inner">
    <a class="brand" href="/">${esc(site.title)}</a>
    <nav aria-label="주 메뉴">
      <ul class="nav">
        ${nav('/categories/', '카테고리', current.category)}
        ${nav('/tags/', '태그', current.tag)}
        <li><a href="/rss.xml">RSS</a></li>
        <li><button class="theme-toggle" type="button" aria-pressed="false" title="다크 모드 전환"><span class="sr-only">다크 모드</span>${ICONS}</button></li>
      </ul>
    </nav>
  </div>
</header>
<main id="main" class="wrap">
${main}
</main>
<footer class="site-footer">
  <div class="wrap footer-inner">
    <p>© ${esc(site.year)} ${esc(site.author)} · Built by <a href="${esc(site.studio.url)}" target="_blank" rel="noopener">${esc(site.studio.name)}</a></p>
    <ul class="footer-links">
      <li><a href="/rss.xml">RSS</a></li>
      <li><a href="${esc(site.github)}" target="_blank" rel="me noopener">GitHub</a></li>
    </ul>
  </div>
</footer>
</body>
</html>
`
}

const tagList = tags => tags.length
  ? `<ul class="tags" aria-label="태그">${tags.map(t => `<li><a href="${esc(t.url)}">#${esc(t.name)}</a></li>`).join('')}</ul>`
  : ''

// showCategory is off on a category's own page, where every row would repeat its name.
function entry(post, level, showCategory) {
  const cat = showCategory && post.category ? `<a class="entry-cat" href="${esc(post.category.url)}">${esc(post.category.name)}</a>` : ''
  const meta = cat + tagList(post.tags)
  return `<li class="entry">
  ${time(post.date, post.date.slice(5).replace('-', '.'), 'entry-date')}
  <div>
${lines(
    `    <h${level} class="entry-title"><a href="${esc(post.url)}">${title(post.title)}</a>${badge(post)}</h${level}>`,
    post.description && `    <p class="entry-desc">${esc(post.description)}</p>`,
    meta && `    <div class="entry-meta">${meta}</div>`,
  )}
  </div>
</li>`
}

// posts are newest first, so the groups come out newest year first.
const years = (posts, level, showCategory = true) => [...Map.groupBy(posts, p => p.date.slice(0, 4))].map(([year, list]) => `<section class="year" aria-labelledby="y-${year}">
  <h${level} class="year-num" id="y-${year}">${year} <span class="year-count">${list.length}편</span></h${level}>
  <ol class="entries">
${list.map(p => entry(p, level + 1, showCategory)).join('\n')}
  </ol>
</section>`).join('\n')

function chips(id, label, kind, terms) {
  if (!terms.length) return ''
  const chip = t => `<li><a class="chip" href="${esc(t.url)}">${termLabel(kind, t.name)} <span class="chip-count">${termCount(t.posts.length)}</span></a></li>`
  return `<section class="home-section" aria-labelledby="${id}">
  <h2 class="label" id="${id}">${label}</h2>
  <ul class="chips">${terms.map(chip).join('')}</ul>
</section>`
}

export function indexPage(site, posts, categories, tags) {
  const stats = [`글 ${posts.length}편`, categories.length && `카테고리 ${categories.length}개`, tags.length && `태그 ${tags.length}개`].filter(Boolean)
  const masthead = `<section class="home-section" aria-labelledby="site-title">
  <h1 class="sr-only" id="site-title">${esc(site.title)}</h1>
  <div>
    <p class="masthead-line">${esc(site.motto)}</p>
    <p class="masthead-meta">${posts.length ? stats.join(' · ') : '아직 글이 없습니다.'}</p>
  </div>
</section>`
  // WebSite structured data on the home page is where Google takes the site name shown in results.
  const ld = { '@context': 'https://schema.org', '@type': 'WebSite', name: site.title, url: `${site.url}/`, description: site.description, inLanguage: site.lang }
  const head = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>\n`
  if (!posts.length) return page(site, { path: '/', title: site.title, description: site.description, head, main: masthead })

  const archive = `<section id="archive" aria-labelledby="archive-title">
  <div class="archive-head">
    <h2 class="label" id="archive-title">전체 글</h2>
    <p class="archive-sub">${posts.length}편 · 최신순</p>
  </div>
${years(posts, 3)}
</section>`
  return page(site, {
    path: '/', title: site.title, description: site.description, head,
    main: [masthead, chips('categories-label', '카테고리', 'category', categories), chips('tags-label', '태그', 'tag', tags), archive].filter(Boolean).join('\n'),
  })
}

// h2 entries with their h3s nested; h3s before the first h2 stay at the top level, unnumbered like in the body.
function toc(items) {
  if (!items.length) return ''
  const groups = []
  for (const h of items) {
    if (h.depth === 2 || !groups.some(g => g.h.depth === 2)) groups.push({ h, kids: [] })
    else groups.at(-1).kids.push(h)
  }
  const link = h => `<a href="#${esc(h.id)}">${title(h.text)}</a>`
  const list = groups.map(({ h, kids }) => `<li${h.depth === 3 ? ' class="toc-h3"' : ''}>${link(h)}${kids.length ? `<ol>${kids.map(k => `<li>${link(k)}</li>`).join('')}</ol>` : ''}</li>`).join('')
  return `<aside class="toc-box">
  <nav class="toc" aria-labelledby="toc-label">
    <details open>
      <summary><span id="toc-label">목차</span><span class="toc-pct" aria-hidden="true">0%</span></summary>
      <ol class="toc-list">${list}</ol>
    </details>
  </nav>
</aside>`
}

function pn(post, rel, label, empty) {
  if (!post) return `<div class="pn pn--empty"><span class="pn-label">${label}</span><span class="pn-title">${empty}</span></div>`
  return `<a class="pn" href="${esc(post.url)}" rel="${rel}"><span class="pn-label">${label}</span><span class="pn-title">${title(post.title)}</span></a>`
}

export function postPage(site, post, { prev, next }) {
  const url = abs(site, post.url)
  const description = post.description || post.title // a post of only code, math or diagrams has no prose to quote
  const modified = post.updated ?? post.date
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description,
    datePublished: iso(post.date),
    dateModified: iso(modified),
    author: { '@type': 'Person', name: site.author, url: site.github },
    mainEntityOfPage: url,
    image: abs(site, `${post.url}og.png`),
    inLanguage: site.lang,
    ...post.category && { articleSection: post.category.name },
    ...post.tags.length && { keywords: post.tags.map(t => t.name) },
  }
  const head = `<meta property="article:published_time" content="${iso(post.date)}">
<meta property="article:modified_time" content="${iso(modified)}">
${post.category ? `<meta property="article:section" content="${esc(post.category.name)}">\n` : ''}${post.tags.map(t => `<meta property="article:tag" content="${esc(t.name)}">\n`).join('')}<meta name="giscus:backlink" content="${esc(url)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>
`
  // A description derived from the body would repeat the first paragraph right above it.
  const dek = !post.text.startsWith(post.description.replace(/\s*(…|\.\.\.)$/, ''))
  const meta = [
    `<div><dt>게시일</dt><dd>${time(post.date, longDate(post.date))}</dd></div>`,
    post.updated && `<div><dt>수정일</dt><dd>${time(post.updated, longDate(post.updated))}</dd></div>`,
    `<div><dt>읽는 시간</dt><dd>약 ${post.readingMinutes}분</dd></div>`,
    post.tags.length && `<div><dt>태그</dt><dd>${tagList(post.tags)}</dd></div>`,
  ].filter(Boolean)
  const { repo, repoId, category, categoryId } = site.giscus
  const comments = repoId && categoryId ? `<section class="comments" aria-labelledby="comments-label"><h2 id="comments-label">댓글</h2>
  <div id="giscus" data-repo="${esc(repo)}" data-repo-id="${esc(repoId)}" data-category="${esc(category)}" data-category-id="${esc(categoryId)}" data-term="posts/${esc(post.slug)}/"></div>
  <noscript>댓글을 보려면 JavaScript가 필요합니다.</noscript></section>` : ''
  const main = `<article class="post" aria-labelledby="post-title">
<header class="post-head">
${lines(
    (post.category || post.draft) && `  <p class="kicker">${post.category ? `<a href="${esc(post.category.url)}">${esc(post.category.name)}</a>${badge(post)}` : badge(post).trim()}</p>`,
    `  <h1 class="post-title" id="post-title">${title(post.title)}</h1>`,
    dek && `  <p class="post-dek">${esc(post.description)}</p>`,
  )}
  <dl class="post-meta">
    ${meta.join('\n    ')}
  </dl>
</header>
${toc(post.toc)}
<div class="prose">
${post.html}
</div>
</article>
<div class="post-after">
<nav class="post-nav" aria-label="이전 글과 다음 글">
  ${pn(prev, 'prev', '<span aria-hidden="true">←</span> 이전 글', '가장 오래된 글입니다')}
  ${pn(next, 'next', '다음 글 <span aria-hidden="true">→</span>', '가장 최근 글입니다')}
</nav>
${comments}
</div>`
  return page(site, { path: post.url, title: post.title, description, type: 'article', image: `${post.url}og.png`, head, main, progress: true })
}

function categoryGroup(term) {
  const id = `c-${esc(term.slug)}`
  return `<section class="term-group" aria-labelledby="${id}">
  <h2 class="term-name" id="${id}"><a href="${esc(term.url)}">${esc(term.name)}</a> <span class="term-count">${term.posts.length}편</span></h2>
  <ol class="entries entries--full">
${term.posts.map(p => `<li class="entry">${time(p.date, p.date.replaceAll('-', '.'), 'entry-date')}<h3 class="entry-title"><a href="${esc(p.url)}">${title(p.title)}</a>${badge(p)}</h3></li>`).join('\n')}
  </ol>
</section>`
}

function tagIndex(terms) {
  const item = t => `<li><a href="${esc(t.url)}"><span class="idx-name"><span class="idx-hash">#</span>${esc(t.name)}</span><span class="idx-dots" aria-hidden="true"></span><span class="idx-count">${termCount(t.posts.length)}</span></a></li>`
  return `<section class="term-index" aria-labelledby="index-title">
  <h2 class="label" id="index-title">모든 태그</h2>
  <ul class="index-list">
${terms.map(item).join('\n')}
  </ul>
</section>`
}

// /categories/ lists each category with its posts (one category per post keeps it short); /tags/ is an index.
export function termsPage(site, kind, terms) {
  const { label, path } = KINDS[kind]
  const total = new Set(terms.flatMap(t => t.posts)).size
  const main = `<header class="page-head">
  <p class="label">색인</p>
  <div>
    <h1 class="page-title">${label}</h1>
    <p class="page-dek">${terms.length ? `${label} ${terms.length}개, 글 ${total}편` : `아직 ${label}가 없습니다.`}</p>
  </div>
</header>
${!terms.length ? '' : kind === 'category' ? terms.map(categoryGroup).join('\n') : tagIndex(terms)}`
  const description = `${site.title}의 ${label} 색인`
  return page(site, { path, title: label, description, current: { [kind]: 'page' }, main })
}

export function termPage(site, kind, term) {
  const { label, path } = KINDS[kind]
  const [y, m] = term.posts.at(-1).date.split('-')
  const main = `<header class="page-head">
  <p class="label">${label}</p>
  <div>
    <nav aria-label="현재 위치"><ol class="crumbs"><li><a href="/">홈</a></li><li><a href="${path}">${label}</a></li><li aria-current="page">${termLabel(kind, term.name)}</li></ol></nav>
    <h1 class="term-title">${kind === 'tag' ? '<span class="hash">#</span>' : ''}${esc(term.name)}</h1>
    <p class="term-meta">글 ${term.posts.length}편 · ${y}년 ${+m}월부터 · 최신순</p>
  </div>
</header>
<div class="term-posts">
${years(term.posts, 2, kind !== 'category')}
</div>`
  const description = `${term.name} ${label}의 글 ${term.posts.length}편`
  return page(site, { path: term.url, title: KINDS[kind].hash + term.name, description, current: { [kind]: 'true' }, main })
}

export function notFoundPage(site) {
  const main = `<header class="page-head">
  <p class="label">404</p>
  <div>
    <h1 class="page-title">페이지를 찾을 수 없습니다</h1>
    <p class="page-dek">주소가 바뀌었거나 글이 내려갔을 수 있습니다. 아래에서 다시 찾아보세요.</p>
    <ul class="chips nf-links"><li><a class="chip" href="/">홈</a></li><li><a class="chip" href="/categories/">카테고리</a></li><li><a class="chip" href="/tags/">태그</a></li></ul>
  </div>
</header>`
  return page(site, {
    path: '/404.html', title: '페이지를 찾을 수 없습니다', description: '요청한 페이지가 없습니다.',
    head: '<meta name="robots" content="noindex">\n', main,
  })
}
