// Start a post from templates/: `pnpm new <slug> [--folder]` creates posts/YYYY-MM-DD-<slug>.md
// (or the folder form) dated today in KST, as a draft. templates/ is outside posts/, so the build never sees it.
import { cpSync, readdirSync } from 'node:fs'

const [slug, flag, ...rest] = process.argv.slice(2)
if (!/^[a-z0-9][a-z0-9-]*$/.test(slug ?? '') || (flag && flag !== '--folder') || rest.length) {
  console.error('usage: pnpm new <slug> [--folder]   (slug: lowercase a-z, 0-9 and -)')
  process.exit(2)
}
const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)
const target = `posts/${today}-${slug}${flag ? '' : '.md'}`
// The build rejects two posts with one slug (any date, file or folder): catch it now instead.
const taken = readdirSync('posts').find(name => name.replace(/\.md$/, '').slice(11) === slug && /^\d{4}-\d{2}-\d{2}-/.test(name))
if (taken) {
  console.error(`slug "${slug}" is already used by posts/${taken}`)
  process.exit(1)
}
cpSync(`templates/0000-00-00-title${flag ? '' : '.md'}`, target, { recursive: true })
console.log(`created ${target} (draft: true; edit the front-matter, then remove draft to publish)`)
