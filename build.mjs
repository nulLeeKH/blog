// Build entry point: posts/ -> dist/. CLI: node build.mjs [--drafts]
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { basename, dirname, join, relative, sep } from 'node:path'
import { parseFrontMatter, render } from './lib/markdown.mjs'
import { indexPage, postPage, termsPage, termPage, notFoundPage } from './lib/templates.mjs'
import { rss, sitemap, robots } from './lib/feeds.mjs'
import { shareImages } from './lib/og.mjs'
import { imageSize } from './lib/images.mjs'
import { kstDate, termSlug } from './lib/util.mjs'

export const site = {
  title: 'nulLeeKH',
  description: 'nulLeeKH의 공부 블로그입니다.', // meta descriptions, RSS and share cards
  motto: '', // the one line on the home page; empty for now, so only the cursor blinks where it will go
  url: 'https://blog.nulleekh.com', // no trailing slash; custom domain of the nulLeeKH/blog Pages site
  lang: 'ko',
  author: 'nulLeeKH',
  github: 'https://github.com/nulLeeKH',
  studio: { name: 'BURGESS1977™', url: 'https://studio.nulleekh.com' }, // footer credit: Built by …
  // Comments live in a separate public repo so the blog repo can stay private and free of discussion traffic.
  // The comments section appears once both ids are filled in (giscus.app shows them for the repo).
  giscus: { repo: 'nulLeeKH/blog-comments', repoId: 'R_kgDOU5kOrA', category: 'Announcements', categoryId: 'DIC_kwDOU5kOrM4DJ1bu' },
  // Search engine ownership codes (the content="…" value only); empty ones emit no tag.
  verification: { google: '', naver: '' },
}

const NAME = /^(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)$/
const FIELDS = ['title', 'description', 'category', 'tags', 'updated', 'draft']
const isJunk = name => /^[.#]|~$/.test(name) // .DS_Store, editor swap and backup files (same rule as dev.mjs)
const sha8 = data => createHash('sha256').update(data).digest('hex').slice(0, 8)
const cmp = (a, b) => a < b ? -1 : a > b ? 1 : 0
const wrap = (file, e) => new Error(`${file}: ${e.message}`, { cause: e })

function isDate(ymd) {
  try {
    return Boolean(kstDate(ymd))
  } catch {
    return false
  }
}

function check(ok, message) {
  if (!ok) throw new Error(`front-matter: ${message}`)
}

export async function build({ src = 'posts', out = 'dist', staticDir = 'static', brandDir = 'brand', drafts = false } = {}) {
  const all = readPosts(src)
  const posts = all.filter(p => drafts || !p.draft)
    .sort((a, b) => cmp(b.date, a.date) || cmp(a.slug, b.slug))
  const categories = new Map(), tags = new Map()
  for (const post of posts) {
    post.category &&= term(categories, 'categories', post, post.category)
    post.tags = post.tags.map(name => term(tags, 'tags', post, name))
  }
  for (const post of posts) {
    try {
      Object.assign(post, await render(post.body, { firstLine: post.firstLine }))
    } catch (e) {
      throw wrap(post.file, e)
    }
    post.description ||= summary(post.text)
    post.readingMinutes = Math.max(1, Math.ceil(post.text.length / 500))
  }
  // Files published as they are: dist path -> source file.
  const files = new Map([...filesIn(staticDir, staticDir), ...posts.flatMap(postFiles)])
  for (const post of posts) sizeImages(post, files)

  // Content hashes in the asset URLs, so a changed stylesheet or script is never served stale from a cache.
  const assets = {
    css: `/style.css?v=${sha8(readFileSync(join(staticDir, 'style.css')))}`,
    js: `/app.js?v=${sha8(readFileSync(join(staticDir, 'app.js')))}`,
  }
  // Footer copyright years, first post to newest ("2026" or "2026-2028"): from the content, not the clock, so the
  // same input builds the same bytes. No posts yet: the current KST year.
  const [newest, oldest] = [posts[0], posts.at(-1)].map(p => p?.date.slice(0, 4))
  const year = !newest ? new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 4) : oldest === newest ? newest : `${oldest}-${newest}`
  const s = { ...site, assets, year }
  // Build into .temp/<out>-XXXXXX/ and swap it in only after share images and the link check pass: any failure leaves the
  // last good build (and the dev server's preview) in place. One stage per build, so overlapping builds (the dev
  // server's and `pnpm build`) never write into each other's.
  const temp = join(dirname(out), '.temp')
  mkdirSync(temp, { recursive: true })
  const stage = mkdtempSync(join(temp, `${basename(out)}-`))
  try {
    // Paths the build writes itself; the share images and the font license are written after the copy below.
    const generated = new Set(['og.png', 'apple-touch-icon.png', ...posts.map(p => `posts/${p.slug}/og.png`)])
    const write = (path, data) => {
      const rel = path.endsWith('/') ? `${path}index.html` : path
      generated.add(rel.slice(1))
      const file = join(stage, rel)
      mkdirSync(dirname(file), { recursive: true })
      writeFileSync(file, data)
    }
    const categoryList = sorted(categories), tagList = sorted(tags)
    write('/', indexPage(s, posts, categoryList, tagList))
    posts.forEach((post, i) => write(post.url, postPage(s, post, { prev: posts[i + 1], next: posts[i - 1] })))
    write('/categories/', termsPage(s, 'category', categoryList))
    for (const c of categoryList) write(c.url, termPage(s, 'category', c))
    write('/tags/', termsPage(s, 'tag', tagList))
    for (const t of tagList) write(t.url, termPage(s, 'tag', t))
    write('/404.html', notFoundPage(s))
    write('/rss.xml', rss(s, posts))
    write('/sitemap.xml', sitemap(s, posts, categoryList, tagList))
    write('/robots.txt', robots(s))
    for (const [path, from] of files) {
      if (generated.has(path)) throw new Error(`${relative('.', from)}: ${path} is written by the build; rename the file`)
      mkdirSync(dirname(join(stage, path)), { recursive: true })
      copyFileSync(from, join(stage, path))
    }
    await shareImages(stage, { site: s, posts, staticDir, brandDir, fontDir: join(staticDir, 'fonts') })
    checkLinks(stage, posts, all.filter(p => !posts.includes(p))) // last, so links to any published file resolve
    // Another build (the dev server's, or `pnpm build` in a second terminal) can swap in between rm and
    // rename: retry, so the build that finishes last wins.
    for (let i = 0; ; i++) {
      rmSync(out, { recursive: true, force: true })
      try {
        renameSync(stage, out)
        break
      } catch (e) {
        if (!['ENOTEMPTY', 'EEXIST'].includes(e.code) || i === 4) throw e
      }
    }
  } catch (e) {
    rmSync(stage, { recursive: true, force: true })
    throw e
  }
  return { posts: posts.length, drafts: all.filter(p => p.draft).length, categories: categories.size, tags: tags.size }
}

// posts/YYYY-MM-DD-slug.md or posts/YYYY-MM-DD-slug/index.md, validated before anything is rendered.
function readPosts(src) {
  if (!existsSync(src)) throw new Error(`${src}: folder not found`)
  const posts = [], bySlug = new Map()
  for (const name of readdirSync(src).sort()) {
    if (isJunk(name)) continue
    const path = join(src, name)
    if (!existsSync(path)) throw new Error(`${path}: broken symlink`)
    const folder = statSync(path).isDirectory()
    const m = folder ? NAME.exec(name) : name.endsWith('.md') && NAME.exec(name.slice(0, -3))
    if (!m) throw new Error(`${path}: name must be YYYY-MM-DD-slug${folder ? '/index.md' : '.md'} (slug: a-z, 0-9, -)`)
    const file = folder ? join(path, 'index.md') : path
    let post
    try {
      post = readPost(file, m[1], m[2], folder && path)
    } catch (e) {
      throw wrap(file, e)
    }
    const other = bySlug.get(post.slug)
    if (other) throw new Error(`${file}: slug "${post.slug}" is already used by ${other.file}`)
    bySlug.set(post.slug, post)
    posts.push(post)
  }
  return posts
}

function readPost(file, date, slug, folder) {
  if (!isDate(date)) throw new Error(`invalid date ${date} in the name`)
  if (!existsSync(file)) throw new Error('not found (a post folder needs an index.md)')
  const text = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').normalize('NFC')
  const { meta, body } = parseFrontMatter(text)
  const firstLine = text.slice(0, text.length - body.length).split('\n').length // body's first line in the file
  const unknown = Object.keys(meta).find(k => !FIELDS.includes(k))
  check(!unknown, `unknown field "${unknown}" (allowed: ${FIELDS.join(', ')}; the date comes from the file name)`)
  // An empty `key:` is YAML null: treat it as not given.
  const { title, description, category, tags = [], updated, draft = false } = Object.fromEntries(Object.entries(meta).filter(([, v]) => v !== null))
  check(typeof title === 'string' && title.trim(), 'title is required (a non-empty string)')
  check(description === undefined || typeof description === 'string', 'description must be a string')
  check(category === undefined || typeof category === 'string', 'category must be a single string')
  check(typeof tags !== 'string' || !tags.includes(','), `tags: ${JSON.stringify(tags)} is one tag; write several as a list: [${tags}]`)
  const names = typeof tags === 'string' ? [tags] : tags
  check(Array.isArray(names) && names.every(t => typeof t === 'string'), 'tags must be a string or a list of strings')
  check(updated === undefined || isDate(updated) && updated >= date, `updated must be a YYYY-MM-DD date on or after ${date}`)
  check(typeof draft === 'boolean', 'draft must be true or false')
  const post = {
    // updated on the publish date says nothing new: no 수정일 row, and every modified date falls back to the date
    file, slug, url: `/posts/${slug}/`, title: title.trim(), description: description?.trim(), date, updated: updated === date ? undefined : updated,
    category: category?.trim() || undefined, tags: [...new Set(names.map(t => t.trim()))], draft, body, firstLine, folder,
  }
  ;[post.category, ...post.tags].forEach(name => name !== undefined && termSlug(name)) // unusable names fail here, with the file name
  return post
}

// One { name, slug, url, posts } per slug. 'C#' and 'c' would share /tags/c/, so two spellings fail.
function term(terms, dir, post, name) {
  const slug = termSlug(name)
  const t = terms.get(slug) ?? terms.set(slug, { name, slug, url: `/${dir}/${slug}/`, posts: [] }).get(slug)
  if (t.name !== name) throw new Error(`${post.file}: "${name}" and "${t.name}" (${t.posts[0].file}) would share ${t.url}; use one spelling`)
  t.posts.push(post)
  return t
}

const sorted = terms => [...terms.values()].sort((a, b) => b.posts.length - a.posts.length || a.name.localeCompare(b.name, 'ko'))

// Description fallback: the opening of the body, cut on a code point boundary.
function summary(text) {
  const chars = [...text]
  return chars.length > 160 ? `${chars.slice(0, 160).join('').trimEnd()}…` : text
}

// Files under dir as [NFC path relative to dir, real path], junk left out; errors start with `owner`. Symlinks are
// followed but must stay inside dir: one pointing elsewhere would publish whatever it points at.
function filesIn(dir, owner, skip = () => false) {
  const root = realpathSync(dir), list = []
  for (const rel of readdirSync(dir, { recursive: true }).sort()) {
    if (rel.split(sep).some(isJunk) || skip(rel)) continue
    const path = join(dir, rel)
    if (!existsSync(path)) throw new Error(`${owner}: ${rel} is a broken symlink`)
    const real = realpathSync(path)
    if (!real.startsWith(root + sep)) throw new Error(`${owner}: ${rel} is a symlink that points outside ${dir}`)
    if (statSync(real).isFile()) list.push([rel.normalize('NFC'), real])
  }
  return list
}

// Every non-.md file of a folder post is published next to its page, so `![](diagram.png)` works in an
// editor preview and on the site alike.
function postFiles(post) {
  if (!post.folder) return []
  return filesIn(post.folder, post.file, rel => rel.endsWith('.md')).map(([rel, from]) => {
    // An extra page would be published without the site's layout, fonts and checks.
    if (/\.html?$/i.test(rel)) throw new Error(`${post.file}: ${rel}: HTML files can't be post assets`)
    return [`posts/${post.slug}/${rel}`, from]
  })
}

// Start tags with quoted or unquoted attributes, as in lib/feeds.mjs. Escaped text never starts with a raw '<'.
const TAG = /<[a-z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/gi
const ATTR = /\s+([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
const ENTITY = /&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const COMMENT = /<!--[\s\S]*?-->/g
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i
const unescape = s => s.replace(ENTITY, (m, hex, dec, name) => {
  if (name) return NAMED[name.toLowerCase()]
  const cp = parseInt(hex ?? dec, hex ? 16 : 10)
  return cp <= 0x10ffff ? String.fromCodePoint(cp) : m
})

const attrsOf = tag => [...tag.matchAll(ATTR)].map(([, name, d, s, u]) => [name.toLowerCase(), unescape(d ?? s ?? u ?? '')])

// Attributes of every start tag; HTML comments (a commented-out <img> in a draft) are not markup.
// One left-to-right scan: a '<!--' inside a quoted attribute value (an alt text) is part of its tag, not a comment.
const MARKUP = new RegExp(`${COMMENT.source}|${TAG.source}`, 'gi')
function* attributes(html) {
  for (const [tag] of html.matchAll(MARKUP)) {
    if (tag.startsWith('<!--')) continue
    const tagName = /^<([^\s/>]+)/.exec(tag)[1].toLowerCase()
    for (const [name, value] of attrsOf(tag)) yield { tagName, name, value }
  }
}

function decode(s) {
  try {
    return decodeURIComponent(s)
  } catch {
    return undefined
  }
}

// The dist path a post's local href/src points at, decoded; undefined when it can't be decoded.
function target(value, post) {
  const url = URL.parse(value, site.url + post.url)
  return url ? decode(url.pathname.slice(1)) : undefined
}

// width/height read from the file reserve each image's box before it loads; without them lazy images push
// the text down as a reader scrolls or follows a ToC link. An <img> that states a size keeps it.
function sizeImages(post, files) {
  post.html = post.html.replace(TAG, tag => {
    if (!/^<img\s/i.test(tag)) return tag
    const attrs = new Map(attrsOf(tag))
    const src = attrs.get('src')
    if (attrs.has('width') || attrs.has('height') || !src || EXTERNAL.test(src)) return tag
    const from = files.get(target(src, post))
    const size = from && imageSize(readFileSync(from))
    return size ? tag.replace(/\s*\/?>$/, end => ` width="${size.width}" height="${size.height}"${end}`) : tag
  })
}

// Fail the build on a post href/src that would 404 on Pages (exact case, like Pages) or a #fragment with no target.
// Every broken reference is reported at once (renaming a slug can break several posts), and a link to a draft
// left out of this build says so.
function checkLinks(out, posts, unpublished) {
  const files = new Set(readdirSync(out, { recursive: true, withFileTypes: true })
    .filter(d => d.isFile()).map(d => relative(out, join(d.parentPath, d.name))))
  // Element ids of every post page, so /posts/other/#section is checked too, not only same-page #section.
  const idsOf = new Map(posts.map(post => {
    const file = join(post.url.slice(1), 'index.html'), ids = new Set()
    for (const a of attributes(readFileSync(join(out, file), 'utf8'))) {
      if (a.name === 'id' || a.name === 'name' && a.tagName === 'a') ids.add(a.value)
    }
    return [file, ids]
  }))
  // Footnote ids keep their %-escapes as text while heading ids are raw Unicode: try both, like a browser.
  const hasId = (ids, id) => !id || id.toLowerCase() === 'top' || ids.has(id) || ids.has(decode(id))
  const errors = []
  const draftOf = path => unpublished.find(p => path === p.url.slice(1) || path.startsWith(p.url.slice(1)))
  for (const post of posts) {
    const own = idsOf.get(join(post.url.slice(1), 'index.html'))
    for (const { name, value } of attributes(post.html)) {
      if ((name !== 'href' && name !== 'src') || EXTERNAL.test(value)) continue
      const broken = `${post.file}: broken ${name === 'src' ? 'image' : 'link'} ${decode(value) ?? value}`
      const hash = value.includes('#') ? value.slice(value.indexOf('#') + 1) : ''
      if (value.startsWith('#')) {
        if (!hasId(own, hash)) errors.push(`${broken} (no element has this id)`)
        continue
      }
      const path = target(value, post)
      if (path === undefined) {
        errors.push(broken)
        continue
      }
      const file = path === '' || path.endsWith('/') ? `${path}index.html` : files.has(path) ? path : `${path}/index.html`
      const draft = !files.has(file) && draftOf(path)
      if (draft) errors.push(`${broken} (${draft.file} is a draft: publish it or remove the link)`)
      else if (!files.has(file)) errors.push(broken)
      else if (idsOf.has(file) && !hasId(idsOf.get(file), hash)) errors.push(`${broken} (no element has this id)`)
    }
  }
  if (errors.length) throw new Error(errors.join('\n'))
}

// Run as a script, not imported. Not import.meta.main: that is Node 24.2+ and engines allow 24.0. realpath because
// import.meta.filename is resolved through symlinks and argv[1] is not.
if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  const args = process.argv.slice(2)
  if (args.some(a => a !== '--drafts')) {
    console.error('usage: node build.mjs [--drafts]')
    process.exit(2)
  }
  const drafts = args.includes('--drafts')
  const start = performance.now()
  try {
    const r = await build({ drafts })
    const ms = Math.round(performance.now() - start)
    console.log(`built ${r.posts} posts (${r.drafts} drafts ${drafts ? 'included' : 'skipped'}), ${r.categories} categories, ${r.tags} tags in ${ms}ms`)
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
