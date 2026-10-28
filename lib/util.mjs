// Small helpers shared by build, templates and feeds.

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

// Escape for HTML text and attribute values (also valid XML).
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ENTITIES[c])

// XML 1.0 forbids these even as character references (e.g. \x1b from pasted terminal output): the feeds and the
// share cards (SVG) remove them.
export const INVALID = /[\x00-\x08\x0B\x0C\x0E-\x1F\uFFFE\uFFFF]/g

// URL slug for a category or tag name. GitHub Pages paths are case-sensitive and NFD paths 404,
// so normalize hard; Hangul stays as-is (Pages serves Unicode directories fine). A leading '.' would make a
// hidden directory, which the Pages artifact leaves out ('.NET' -> 'net'), and '.'/'..' would escape dist/.
export function termSlug(name) {
  const slug = String(name).normalize('NFC').toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[/?#%&'"<>\\]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^[.-]+|-+$/g, '')
  if (!slug) throw new Error(`cannot make a URL slug from ${JSON.stringify(name)}`)
  return slug
}

// word-break: keep-all still lets Chrome break between Hangul and a bracket ("트리(LSM)" | "를"): such pairs are
// held together in a nowrap span (.nb). `hold` works on escaped HTML text, never on attribute values.
export const HOLD = /[)\]]?\p{Script=Hangul}[([]|[)\]]\p{Script=Hangul}/gu
export const hold = html => html.replace(HOLD, '<span class="nb">$&</span>')

// 'YYYY-MM-DD' -> Date at 00:00 KST. Throws on impossible dates like 2026-02-30.
export function kstDate(ymd) {
  const d = new Date(`${ymd}T00:00:00+09:00`)
  const ok = /^\d{4}-\d{2}-\d{2}$/.test(ymd) && !Number.isNaN(d.getTime())
    && new Date(d.getTime() + 9 * 3600e3).toISOString().slice(0, 10) === ymd
  if (!ok) throw new Error(`invalid date ${JSON.stringify(ymd)}`)
  return d
}
