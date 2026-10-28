// Markdown -> HTML with the mdast/hast utilities directly (no unified): CommonMark + GFM, GitHub alerts,
// GFM tagfilter, github-slugger ids, Shiki code blocks, KaTeX math, mermaid blocks, image figures.
import { parse as parseYaml } from 'yaml'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { gfm } from 'micromark-extension-gfm'
import { gfmFromMarkdown } from 'mdast-util-gfm'
import { math } from 'micromark-extension-math'
import { mathFromMarkdown } from 'mdast-util-math'
import { toHast } from 'mdast-util-to-hast'
import { toHtml } from 'hast-util-to-html'
import GithubSlugger from 'github-slugger'
import katex from 'katex'
import { HOLD } from './util.mjs'
import { createHighlighter, bundledLanguages } from 'shiki'
import {
  transformerMetaHighlight, transformerMetaWordHighlight, transformerNotationDiff,
  transformerNotationFocus, transformerNotationHighlight, transformerNotationWordHighlight,
} from '@shikijs/transformers'

const FRONT_MATTER = /^---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/
const ALERT = /^\[!(note|tip|important|warning|caution)\][ \t]*(?:\r?\n|$)/i
const TAGFILTER = /<(\/?)(iframe|noembed|noframes|plaintext|script|style|title|textarea|xmp)(?=[\t\n\f\r />]|$)/gi // GFM 6.11; an html node's value has no final newline
const TITLE = /\btitle="([^"]*)"/
const THEMES = { light: 'github-light-default', dark: 'github-dark-default' }
const KATEX = { output: 'mathml', throwOnError: true, strict: 'ignore', trust: false }
const PROSE_SKIP = new Set(['code', 'mermaid-block', 'math-display', 'anchor', 'markdown-alert-title'])
// Ids the post page already has (lib/templates.mjs and the footnote section): headings get "main-1" instead,
// so their anchors and ToC links don't jump to the page element.
const PAGE_IDS = ['main', 'post-title', 'toc-label', 'comments-label', 'giscus', 'footnote-label']

// GitHub octicons: info, light-bulb, report, alert, stop
const OCTICONS = {
  note: 'M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
  tip: 'M8 1.5c-2.363 0-4 1.69-4 3.75 0 .984.424 1.625.984 2.304l.214.253c.223.264.47.556.673.848.284.411.537.896.621 1.49a.75.75 0 0 1-1.484.211c-.04-.282-.163-.547-.37-.847a8.456 8.456 0 0 0-.542-.68c-.084-.1-.173-.205-.268-.32C3.201 7.75 2.5 6.766 2.5 5.25 2.5 2.31 4.863 0 8 0s5.5 2.31 5.5 5.25c0 1.516-.701 2.5-1.328 3.259-.095.115-.184.22-.268.319-.207.245-.383.453-.541.681-.208.3-.33.565-.37.847a.751.751 0 0 1-1.485-.212c.084-.593.337-1.078.621-1.489.203-.292.45-.584.673-.848.075-.088.147-.173.213-.253.561-.679.985-1.32.985-2.304 0-2.06-1.637-3.75-4-3.75ZM5.75 12h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM6 15.25a.75.75 0 0 1 .75-.75h2.5a.75.75 0 0 1 0 1.5h-2.5a.75.75 0 0 1-.75-.75Z',
  important: 'M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v9.5A1.75 1.75 0 0 1 14.25 13H8.06l-2.573 2.573A1.458 1.458 0 0 1 3 14.543V13H1.75A1.75 1.75 0 0 1 0 11.25Zm1.75-.25a.25.25 0 0 0-.25.25v9.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h6.5a.25.25 0 0 0 .25-.25v-9.5a.25.25 0 0 0-.25-.25Zm7 2.25v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 9a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  warning: 'M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z',
  caution: 'M4.47.22A.749.749 0 0 1 5 0h6c.199 0 .389.079.53.22l4.25 4.25c.141.14.22.331.22.53v6a.749.749 0 0 1-.22.53l-4.25 4.25A.749.749 0 0 1 11 16H5a.749.749 0 0 1-.53-.22L.22 11.53A.749.749 0 0 1 0 11V5c0-.199.079-.389.22-.53Zm.84 1.28L1.5 5.31v5.38l3.81 3.81h5.38l3.81-3.81V5.31L10.69 1.5ZM8 4a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0v-3.5A.75.75 0 0 1 8 4Zm0 8a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z',
}

const walk = (n, f) => { f(n); n.children?.forEach(c => walk(c, f)) }
const el = (tagName, properties, children) => ({ type: 'element', tagName, properties, children })
const txt = value => ({ type: 'text', value })
// Heading text as GitHub sees it: raw HTML tags count as nothing, inline math as its TeX source.
const plain = n => n.type === 'raw' ? n.data?.tex ?? '' : n.value ?? (n.children ?? []).map(plain).join('')
// ToC label: the heading text without footnote numbers ("결과[^1]" would read "결과1").
const label = n => n.properties?.dataFootnoteRef ? '' : n.type === 'raw' ? n.data?.tex ?? '' : n.value ?? (n.children ?? []).map(label).join('')

export function parseFrontMatter(src) {
  const m = FRONT_MATTER.exec(src)
  // A post always has front-matter: an unclosed, indented or blank-line-led block would otherwise fail later as "title is required".
  if (!m && /^\s*---/.test(src)) throw new Error('front-matter: must start and end with a line of just ---')
  if (!m) return { meta: {}, body: src }
  let meta
  try {
    // a blank line stands in for the opening ---, so YAML's 'at line N' is the line in the post file
    meta = parseYaml(`\n${m[1] ?? ''}`) ?? {}
  } catch (e) {
    throw new Error(`front-matter: ${e.message}`, { cause: e })
  }
  if (typeof meta !== 'object' || Array.isArray(meta)) throw new Error('front-matter: must be a YAML mapping')
  return { meta, body: src.slice(m[0].length) }
}

// firstLine: the file line where body starts (after the front-matter), so math errors point into the file.
export async function render(body, { firstLine = 1 } = {}) {
  const lineOf = node => firstLine - 1 + (node.position?.start.line ?? 1)
  const mdast = fromMarkdown(body, { extensions: [gfm(), math()], mdastExtensions: [gfmFromMarkdown(), mathFromMarkdown()] })
  alerts(mdast)
  oneLineMath(mdast, body)
  mathLeads(mdast)
  const shiki = await highlighterFor(mdast)
  const hast = toHast(mdast, {
    allowDangerousHtml: true,
    footnoteLabel: '각주',
    footnoteBackLabel: (i, n) => `${i + 1}번 각주 본문으로${n > 1 ? ` (${n}번째)` : ''}`,
    handlers: {
      code: (state, node) => codeBlock(shiki, node, lineOf(node)),
      inlineCode: (state, node) => inlineCode(node.value),
      math: (state, node) => mathBlock(node.value, lineOf(node)),
      inlineMath: (state, node, parent) => {
        const math = { type: 'raw', value: tex(node.value, false, lineOf(node)), data: { tex: node.value } }
        // <math> is an atomic inline: keep-all cannot hold it to the word after it ("$n$개"), so wrap the two.
        const next = parent?.children[parent.children.indexOf(node) + 1]
        const word = next?.type === 'text' && /^\S+/.exec(next.value)?.[0]
        const lead = node.data?.lead // the text right before it, moved here by mathLeads()
        if (!word && !lead) return math
        if (word) next.value = next.value.slice(word.length)
        return el('span', { className: ['math-word'] }, [lead && txt(lead), math, word && txt(word)].filter(Boolean))
      },
    },
  })
  const slugger = new GithubSlugger(), toc = []
  PAGE_IDS.forEach(id => slugger.slug(id))
  walk(hast, n => {
    if (n.type === 'raw') n.value = n.value.replace(TAGFILTER, '&lt;$1$2')
    if (n.type !== 'element') return
    if (n.tagName === 'img') Object.assign(n.properties, { loading: 'lazy', decoding: 'async' })
    else if (n.tagName === 'p') figure(n)
    // Links that leave the site open in a new tab (an absolute link to this blog's own URL counts as one too).
    else if (n.tagName === 'a' && /^https?:\/\//i.test(n.properties.href ?? '')) Object.assign(n.properties, { target: '_blank', rel: ['noopener'] })
    else if (/^h[1-6]$/.test(n.tagName) && !n.properties.id) heading(n, slugger, toc) // footnote label h2 already has an id
  })
  holdBrackets(hast)
  return { html: toHtml(hast, { allowDangerousHtml: true }), toc, text: prose(hast).replace(/\s+/g, ' ').trim() }
}

// The run of non-space text right before inline math ("($p$)", "확률$p$") would otherwise stay at the end of a
// line while the atomic <math> wraps: the inlineMath handler puts it in the same nowrap span.
function mathLeads(root) {
  walk(root, n => n.children?.forEach((c, i) => {
    const prev = n.children[i - 1]
    const lead = c.type === 'inlineMath' && prev?.type === 'text' && /\S+$/.exec(prev.value)?.[0]
    if (!lead) return
    prev.value = prev.value.slice(0, -lead.length)
    c.data = { ...c.data, lead }
  }))
}

// Hangul next to a bracket goes into span.nb (see HOLD in lib/util.mjs); code, diagrams and math spans are skipped.
function holdBrackets(n) {
  const cls = n.properties?.className ?? []
  if (n.tagName === 'code' || n.tagName === 'pre' || cls.includes('mermaid-block') || cls.includes('math-word')) return // math-word is nowrap already
  n.children = n.children?.flatMap(c => {
    if (c.type !== 'text') {
      holdBrackets(c)
      return [c]
    }
    const parts = []
    let at = 0
    for (const m of c.value.matchAll(HOLD)) {
      if (m.index > at) parts.push(txt(c.value.slice(at, m.index)))
      parts.push(el('span', { className: ['nb'] }, [txt(m[0])]))
      at = m.index + m[0].length
    }
    if (!parts.length) return [c]
    if (at < c.value.length) parts.push(txt(c.value.slice(at)))
    return parts
  })
}

// GitHub alerts: top-level blockquote whose first line is exactly [!TYPE] and that has content after it.
function alerts(root) {
  for (const bq of root.children) {
    const p = bq.type === 'blockquote' && bq.children[0]
    const t = p?.type === 'paragraph' && p.children[0]
    const m = t?.type === 'text' && ALERT.exec(t.value)
    if (!m) continue
    const rest = t.value.slice(m[0].length), next = p.children[1]
    if (!rest && !next && bq.children.length === 1) continue // empty alert renders as a plain blockquote on GitHub
    if (rest) t.value = rest; else p.children.splice(0, next?.type === 'break' ? 2 : 1)
    if (!p.children.length) bq.children.shift()
    const type = m[1].toLowerCase()
    const icon = `<svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="${OCTICONS[type]}"/></svg>`
    bq.data = { hName: 'div', hProperties: { className: ['markdown-alert', `markdown-alert-${type}`] } }
    bq.children.unshift({ type: 'paragraph', data: { hProperties: { className: ['markdown-alert-title'] } },
      children: [{ type: 'html', value: icon }, { type: 'text', value: type[0].toUpperCase() + type.slice(1) }] })
  }
}

// `$$x$$` alone in a paragraph is display math on GitHub; micromark makes a math block only when each $$
// fence has a line of its own.
function oneLineMath(root, src) {
  walk(root, n => {
    const m = n.type === 'paragraph' && n.children.length === 1 && n.children[0]
    if (m?.type !== 'inlineMath' || !src.startsWith('$$', m.position.start.offset)) return
    n.type = 'math'
    n.value = m.value
    delete n.children
  })
}

let highlighter // one per process, created on first use; grammars are loaded as posts need them

async function highlighterFor(mdast) {
  const langs = new Set()
  walk(mdast, n => { if (n.type === 'code') langs.add(shikiLang(n)) })
  langs.delete(undefined)
  const h = await (highlighter ??= createHighlighter({ themes: Object.values(THEMES), langs: [] }))
  await h.loadLanguage(...langs)
  return h
}

// Bundled Shiki id or alias; undefined for missing, plain or unknown languages (rendered as text).
function shikiLang(node) {
  const lang = node.lang?.toLowerCase()
  return lang !== 'mermaid' && Object.hasOwn(bundledLanguages, lang) ? lang : undefined
}

// What the stock transformers lack: the .lines wrapper, line numbers, ```diff line colors.
const blog = {
  name: 'blog',
  pre(node) {
    // a wrapper sized to the widest line lets line backgrounds span the whole scroll width
    this.code.children = [el('span', { class: 'lines' }, this.code.children)]
    const raw = this.options.meta.__raw
    if (!/\bshowLineNumbers\b/.test(raw)) return
    this.addClassToHast(node, 'line-numbers')
    const start = /\bstartLineNumber=(\d+)/.exec(raw)?.[1]
    if (start) node.properties.style += `;--ln:${start - 1}`
  },
  line(node, i) { // ```diff colors whole lines like // [!code ++]; ---/+++ file headers stay plain
    const s = this.tokens[i - 1].map(t => t.content).join('')
    if (s.includes('[!code ')) (node.data ??= {}).notation = true // for notation-space below
    if (this.options.lang !== 'diff') return
    if (/^\+(?!\+\+ )/.test(s)) this.addClassToHast(node, ['diff', 'add'])
    else if (/^-(?!-- )/.test(s)) this.addClassToHast(node, ['diff', 'remove'])
  },
}

const SHIKI = {
  themes: THEMES,
  defaultColor: false, // only --shiki-light/--shiki-dark; the stylesheet picks one per theme
  transformers: [
    blog, transformerMetaHighlight(), transformerMetaWordHighlight(),
    // a /word/ that fills a whole line would otherwise put its class (and box) on the full-width .line
    { name: 'word-wrap', preprocess(code, options) { for (const d of options.decorations ?? []) d.alwaysWrap = true } },
    transformerNotationDiff(),
    transformerNotationHighlight(), transformerNotationWordHighlight(), transformerNotationFocus(),
    { // after the notation transformers: drop only the space left before a removed // [!code ...], not other trailing spaces
      name: 'notation-space',
      code(code) {
        for (const line of code.children) {
          if (!line.data?.notation) continue
          const texts = []
          walk(line, n => { if (n.type === 'text') texts.push(n) })
          for (const t of texts.reverse()) if ((t.value = t.value.trimEnd())) break
        }
      },
    },
  ],
}

// Fence meta: title="a.ts" {2,4-6} /word/ showLineNumbers startLineNumber=10. The title is cut out before
// Shiki sees the rest, else "/" in a path reads as /word/ and "{1}" in a name as a line range.
function codeBlock(shiki, node, line) {
  const fenceLang = node.lang?.toLowerCase()
  if (fenceLang === 'mermaid') {
    return el('div', { className: ['mermaid-block'] }, [el('pre', { className: ['mermaid'] }, [txt(node.value)])])
  }
  if (fenceLang === 'math') return mathBlock(node.value, line)
  const lang = shikiLang(node), meta = node.meta ?? ''
  const title = TITLE.exec(meta)?.[1]
  const { children: [pre] } = shiki.codeToHast(node.value, { ...SHIKI, lang: lang ?? 'text', meta: { __raw: meta.replace(TITLE, '') } })
  const head = [
    title && el('span', { className: ['code-title'] }, [txt(title)]),
    lang && el('span', { className: ['code-lang'] }, [txt(lang)]),
  ].filter(Boolean).flatMap((s, i) => i ? [txt(' '), s] : [s]) // a space, so feed readers (no site CSS) don't show "file.tsts"
  if (!head.length) return el('div', { className: ['code', 'code--bare'] }, [pre])
  return el('div', { className: ['code'], dataLang: lang }, [el('div', { className: ['code-head'] }, head), pre])
}

// Inline code chips never split across lines (Chrome would break `--` after the first '-'), except long ones
// that might not fit a 375px phone line even in a heading or blockquote: those get class "code-wrap". Wide (CJK) characters take two columns.
function inlineCode(value) {
  const text = value.replace(/\r?\n|\r/g, ' ')
  const columns = [...text].reduce((n, c) => n + (c >= '⺀' ? 2 : 1), 0)
  return el('code', columns > 30 ? { className: ['code-wrap'] } : {}, [txt(text)])
}

// TeX puts a thin space around operator names (\log, \sin, \operatorname) next to ordinary atoms. KaTeX's MathML
// leaves that to the renderer, and MathML Core (Chrome, Safari) adds none, so "n \log n" reads "nlogn".
const OP_BEFORE = /(<\/(?:mi|mn|msub|msup|msubsup|mfrac|msqrt|mroot)>|<mo stretchy="false">[)\]]<\/mo>)((?:<(?:msub|msup|msubsup|munder|mover|munderover)><mrow>)?<mi(?: mathvariant="normal")?>[^<]{2,}<\/mi><mo>\u2061<\/mo>)/g
const OP_AFTER = /(<mi(?: mathvariant="normal")?>[^<]{2,}<\/mi>)<mo>\u2061<\/mo>(?=<(?:mi|mn|msub|msup|msubsup|mfrac|msqrt|mroot)[ >])/g
// \log_2, \sin^2, \lim_{n\to\infty}: KaTeX wraps the name in a script element, so the space goes after its close tag.
// Limit: a script holding the same element again (\log_{a_i}) gets no space after; a regex can't balance tags.
const OP_SCRIPT_AFTER = /(<(msub|msup|msubsup|munder|mover|munderover)><mrow><mi(?: mathvariant="normal")?>[^<]{2,}<\/mi><mo>\u2061<\/mo><\/mrow>(?:(?!<\/?\2>).)*<\/\2>)(?=<(?:mi|mn|msub|msup|msubsup|mfrac|msqrt|mroot)[ >])/g
const opSpacing = mathml => mathml
  .replace(OP_BEFORE, '$1<mspace width="0.1667em"></mspace>$2')
  .replace(OP_AFTER, '$1<mo rspace="0.1667em">\u2061</mo>')
  .replace(OP_SCRIPT_AFTER, '$1<mspace width="0.1667em"></mspace>')

function tex(value, displayMode, line) {
  try {
    return opSpacing(katex.renderToString(value, { ...KATEX, displayMode }))
  } catch (e) {
    throw new Error(`math${line ? ` (line ${line})` : ''}: ${e.message}`, { cause: e })
  }
}

const mathBlock = (value, line) => el('div', { className: ['math-display'] }, [{ type: 'raw', value: tex(value, true, line) }])

// A paragraph holding nothing but one image becomes a figure; the image title is its caption.
function figure(p) {
  const kids = p.children.filter(c => c.type !== 'text' || c.value.trim())
  const img = kids.length === 1 && kids[0].tagName === 'img' && kids[0]
  if (!img) return
  const { title } = img.properties
  delete img.properties.title // the caption already says it; a tooltip would repeat it
  p.tagName = 'figure'
  p.children = title ? [img, el('figcaption', {}, [txt(title)])] : [img]
}

function heading(h, slugger, toc) {
  const text = plain(h), shown = label(h), depth = +h.tagName[1] // before the # anchor is added
  const id = slugger.slug(text) || slugger.slug('section') // "## 🚀" slugs to '', and id="" links nowhere
  h.properties.id = id
  if (depth >= 2 && depth <= 4) {
    h.children.push(el('a', { className: ['anchor'], href: `#${id}`, ariaLabel: '이 제목으로 연결되는 링크' }, [txt('#')]))
  }
  if (depth === 2 || depth === 3) toc.push({ depth, id, text: shown.replace(/\s+/g, ' ').trim() })
}

// Reader-visible prose for descriptions and reading time: no code blocks, diagrams, math, footnotes or UI labels.
function prose(n) {
  if (n.type === 'text') return n.value
  if (n.type !== 'element' && n.type !== 'root') return ''
  const p = n.properties ?? {}
  if (p.dataFootnotes || p.dataFootnoteRef || p.className?.some(c => PROSE_SKIP.has(c))) return ''
  return n.children.map(prose).join('')
}
