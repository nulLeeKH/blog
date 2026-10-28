// rss.xml, sitemap.xml and robots.txt.
import { esc, INVALID, kstDate } from './util.mjs'

const xml = s => esc(String(s ?? '').replace(INVALID, ''))

const abs = (site, path) => encodeURI(site.url + path)
const lastmod = p => p.updated || p.date
const newest = ps => ps.map(lastmod).sort().at(-1)

// A whole start tag with quoted/unquoted attributes, so '>' inside a value doesn't end it.
// Escaped text (code samples like `<img src="x">`) never starts with a raw '<', so it is left alone.
const TAG = /<[a-z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/gi
const ATTR = /(\s+)([^\s"'>/=]+)(?:(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g
// Heading permalinks (lib/markdown.mjs): a feed reader would show a bare '#' after every heading.
const ANCHOR = /<a class="anchor"[^>]*>#<\/a>/g

// One srcset candidate: the URL runs to the next space (it may hold commas; trailing ones end it), then its
// descriptors run to the next comma.
const CANDIDATE = /([\s,]*)(\S*?)(,+(?=\s|$)|(?=\s|$)[^,]*)/g

// Feed readers have no base URL: resolve relative href/src/poster/srcset against the post's own URL.
function absolutize(html, base) {
  const resolve = v => /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : URL.parse(v, base)?.href ?? v
  return html.replace(TAG, tag => tag.replace(ATTR, (m, sp, name, eq, d, s, u) => {
    const value = d ?? s ?? u
    if (!eq) return m
    if (/^srcset$/i.test(name)) {
      const list = value.replace(CANDIDATE, (_, gap, url, rest) => gap + (url && resolve(url)) + rest)
      return `${sp}${name}${eq}"${list.replaceAll('"', '&quot;')}"`
    }
    if (!/^(?:href|src|poster)$/i.test(name)) return m
    const url = resolve(value)
    return url === value ? m : `${sp}${name}${eq}"${url}"`
  }))
}

function item(site, post) {
  const link = xml(abs(site, post.url))
  const categories = new Set([post.category?.name, ...post.tags.map(t => t.name)].filter(Boolean))
  return [
    '<item>',
    `<title>${xml(post.title)}</title>`,
    `<link>${link}</link>`,
    `<guid isPermaLink="true">${link}</guid>`,
    `<pubDate>${kstDate(post.date).toUTCString()}</pubDate>`,
    ...[...categories].map(c => `<category>${xml(c)}</category>`),
    `<description>${xml(absolutize(post.html.replace(ANCHOR, ''), site.url + post.url))}</description>`,
    '</item>',
  ].join('\n')
}

// posts: newest first (build sorts them).
export function rss(site, posts) {
  const built = newest(posts)
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '<channel>',
    `<title>${xml(site.title)}</title>`,
    `<link>${xml(abs(site, '/'))}</link>`,
    `<description>${xml(site.description)}</description>`,
    `<language>${xml(site.lang)}</language>`,
    ...built ? [`<lastBuildDate>${kstDate(built).toUTCString()}</lastBuildDate>`] : [],
    `<atom:link href="${xml(abs(site, '/rss.xml'))}" rel="self" type="application/rss+xml"/>`,
    ...posts.slice(0, 20).map(p => item(site, p)),
    '</channel>',
    '</rss>',
    '',
  ].join('\n')
}

export function sitemap(site, posts, categories, tags) {
  const listing = (path, terms) => [path, newest(terms.flatMap(t => t.posts))]
  const urls = [
    ['/', newest(posts)],
    listing('/categories/', categories),
    ...categories.map(c => listing(c.url, [c])),
    listing('/tags/', tags),
    ...tags.map(t => listing(t.url, [t])),
    ...posts.map(p => [p.url, lastmod(p)]),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(([path, date]) => `<url><loc>${xml(abs(site, path))}</loc>${date ? `<lastmod>${date}</lastmod>` : ''}</url>`),
    '</urlset>',
    '',
  ].join('\n')
}

export const robots = site => `User-agent: *\nAllow: /\nSitemap: ${site.url}/sitemap.xml\n`
