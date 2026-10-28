// Share images drawn as SVG and rasterized with resvg at build time: an Open Graph card (1200×630) for the site
// and one per post with its title, plus the iOS home-screen icon. D2Coding is monospaced (Latin half an em,
// Hangul a full em), so text is measured and wrapped exactly here instead of by a browser.
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Resvg } from '@resvg/resvg-js'
import subsetFont from 'subset-font'
import { esc, INVALID } from './util.mjs'

const W = 1200, H = 630, PAD = 96
const COLOR = { paper: '#faf9f5', ink: '#171717', ink2: '#3d3d3d', muted: '#5e5e5e', rule: '#171717', accent: '#171717' }
const FONT = `font-family="D2Coding"`

// CJK and Hangul take a full em, and so do D2Coding's full-width symbols (circled and parenthesized letters and
// digits, ʼ ː 〈 〉). Glyphs the font lacks may count wide: overestimating only wraps a line early.
const wide = c => c >= '\u2E80' || (c >= '\u1100' && c <= '\u115F') || /[\u02BC\u02D0\u2329\u232A\u2460-\u24FF\u2776-\u2793]/.test(c)
const width = (text, size) => [...text].reduce((w, c) => w + (wide(c) ? 1 : 0.5), 0) * size

// Greedy wrap at spaces (Korean keeps words whole, like word-break: keep-all); a word wider than a line is cut
// by characters. Past maxLines the last line ends with '…'.
export function wrap(text, size, max, maxLines) {
  const lines = []
  let line = ''
  for (const word of text.trim().split(/\s+/)) {
    const joined = line ? `${line} ${word}` : word
    if (width(joined, size) <= max) { line = joined; continue }
    if (line) lines.push(line)
    line = word
    while (width(line, size) > max) {
      const chars = [...line]
      let n = 1
      while (width(chars.slice(0, n + 1).join(''), size) <= max) n++
      lines.push(chars.slice(0, n).join(''))
      line = chars.slice(n).join('')
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  let last = [...lines[maxLines - 1]]
  while (width(`${last.join('').trimEnd()}…`, size) > max) last.pop()
  return [...lines.slice(0, maxLines - 1), `${last.join('').trimEnd()}…`]
}

// Same line count as wrap() at `max`, but each line as even as possible (like text-wrap: balance). Overflow is
// told by the line count, not a trailing '…': a title may end with one of its own.
export function balance(text, size, max, maxLines) {
  const lines = wrap(text, size, max, Infinity)
  if (lines.length > maxLines) return wrap(text, size, max, maxLines)
  let best = lines
  // Never narrower than the widest word that fits, so balancing cuts no word that wrap() kept whole.
  const floor = Math.max(size / 2, ...text.trim().split(/\s+/).map(word => width(word, size)).filter(w => w <= max))
  for (let w = max - size / 2; lines.length > 1 && w >= floor; w -= size / 2) {
    const tighter = wrap(text, size, w, Infinity)
    if (tighter.length > lines.length) break
    best = tighter
  }
  return best
}

// The favicon drawn at (x, y) in a box of `size`, as a whole document so its own viewBox and namespaces apply.
const icon = (svg, x, y, size) =>
  `<image x="${x}" y="${y}" width="${size}" height="${size}" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/>`

const NO_FONTS = { font: { loadSystemFonts: false } } // the icons have no text: skip scanning the host's fonts

// An icon source, parsed up front: resvg silently skips an <image> it cannot read, and its own errors name no file.
function iconFile(file) {
  try {
    const svg = readFileSync(file, 'utf8')
    new Resvg(svg, NO_FONTS)
    return svg
  } catch (e) {
    throw new Error(`${file}: ${e.message}`, { cause: e })
  }
}

const text = (x, y, size, fill, body, extra = '') =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" fill="${fill}"${extra}>${body}</text>`
const brand = site => esc(site.title)

const card = body => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${COLOR.paper}"/>
${body}
</svg>`

function siteCard(site, favicon) {
  const x = PAD + 208 + 72
  const dek = balance(site.description, 28, W - x - PAD, 2)
  return card([
    icon(favicon, PAD, 150, 208),
    text(x, 238, 92, COLOR.ink, brand(site), ' font-weight="700"'),
    ...dek.map((line, i) => text(x, 302 + i * 45, 28, COLOR.ink2, esc(line))),
    `<rect x="${PAD}" y="${H - 202}" width="${W - 2 * PAD}" height="2" fill="${COLOR.rule}"/>`,
    text(PAD, H - 150, 26, COLOR.muted, esc(new URL(site.url).host)),
  ].join('\n'))
}

// The largest title size that fits in three lines with no word cut; the smallest one truncates. Emoji are left
// out: D2Coding has none and resvg reads no system fonts, so they would be drawn as blanks.
export function titleLines(title) {
  title = title.replace(/\p{RGI_Emoji}/gv, ' ')
  for (const size of [68, 60, 52]) {
    // a word cut at this size that the smallest size keeps whole counts as overflow too
    const cut = title.trim().split(/\s+/).some(word => width(word, size) > W - 2 * PAD && width(word, 52) <= W - 2 * PAD)
    if (size === 52 || (!cut && wrap(title, size, W - 2 * PAD, Infinity).length <= 3)) return { size, lines: balance(title, size, W - 2 * PAD, 3) }
  }
}

function postCard(site, post, favicon) {
  const { size, lines } = titleLines(post.title)
  const date = post.date.replaceAll('-', '.'), host = new URL(site.url).host
  // A long category ends with '…' so the row stops one em short of the address on the right.
  const name = post.category && wrap(post.category.name, 28, W - 2 * PAD - width(` · ${date}${host}`, 28) - 28, 1)[0]
  const meta = name ? `<tspan fill="${COLOR.accent}" font-weight="700">${esc(name)}</tspan> · ${date}` : date
  return card([
    icon(favicon, PAD, PAD, 64),
    text(PAD + 88, PAD + 44, 34, COLOR.ink, brand(site), ' font-weight="700"'),
    // centered between the brand row and the rule; 0.8em is roughly the baseline below a line's top
    ...lines.map((line, i) => text(PAD, Math.round(325 - (size + (lines.length - 1) * size * 1.25) / 2 + size * 0.8 + i * size * 1.25),
      size, COLOR.ink, esc(line), ' font-weight="700"')),
    `<rect x="${PAD}" y="${H - 140}" width="${W - 2 * PAD}" height="2" fill="${COLOR.rule}"/>`,
    text(PAD, H - 85, 28, COLOR.muted, meta),
    text(W - PAD, H - 85, 28, COLOR.muted, esc(host), ' text-anchor="end"'),
  ].join('\n'))
}

// Writes out/og.png, out/apple-touch-icon.png and out/posts/<slug>/og.png.
export async function shareImages(out, { site, posts, staticDir, brandDir, fontDir }) {
  const favicon = iconFile(join(staticDir, 'favicon.svg'))
  const cards = [['og.png', siteCard(site, favicon)], ...posts.map(p => [`posts/${p.slug}/og.png`, postCard(site, p, favicon)])]

  // resvg reads TrueType files only: subset D2Coding to the characters on the cards. esc() turns ' into &#39;, so
  // the markup never holds it.
  const chars = [...new Set(cards.map(([, svg]) => svg).join('') + "'…·.")].join('')
  const dir = mkdtempSync(join(tmpdir(), 'og-fonts-'))
  try {
    const fontFiles = []
    for (const style of ['Regular', 'Bold']) {
      const file = join(dir, `${style}.ttf`)
      writeFileSync(file, await subsetFont(readFileSync(join(fontDir, `D2Coding-${style}.woff2`)), chars, { targetFormat: 'truetype' }))
      fontFiles.push(file)
    }
    const font = { fontFiles, loadSystemFonts: false, defaultFontFamily: 'D2Coding' }
    // Control characters (pasted terminal output) are not XML: resvg would fail on them.
    for (const [path, svg] of cards) writeFileSync(join(out, path), new Resvg(svg.replace(INVALID, ''), { font }).render().asPng())
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  const touch = iconFile(join(brandDir, 'apple-touch-icon.svg'))
  writeFileSync(join(out, 'apple-touch-icon.png'), new Resvg(touch, { ...NO_FONTS, fitTo: { mode: 'width', value: 180 } }).render().asPng())
}
