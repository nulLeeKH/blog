// Dev server: serves dist/ the way GitHub Pages does, rebuilds (drafts included) on every change
// and open pages reload when they see a new build number. Node built-ins only.
// A full rebuild per change; go incremental only if builds get slow.
import { spawn } from 'node:child_process'
import { existsSync, watch } from 'node:fs'
import { readFile, stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import { basename, extname, join, resolve, sep } from 'node:path'

const PORT = Number(process.env.PORT) || 8080
const ROOT = resolve('dist')
const TEXT = 'text/plain; charset=utf-8'
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': TEXT,
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.pdf': 'application/pdf',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}
// Short polls, not SSE: a held-open stream per tab hits the browser's 6-connections-per-host cap.
let version = 0 // successful builds so far
// Served while dist/ has no 404.html (the first build is still running or failed); it reloads once a build succeeds.
const MISSING = '<!doctype html><meta charset="utf-8"><title>404</title><p>Not Found. 아직 빌드된 사이트가 없습니다. 빌드가 실패했다면 터미널에 이유가 있습니다.</p>'

const send = (res, status, type, body, headers) =>
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', ...headers }).end(body)

function withReload(html) {
  const poll = `<script>setInterval(() => fetch("/__version").then(r => r.text()).then(v => v !== "${version}" && location.reload(), () => {}), 1000)</script>`
  const i = html.lastIndexOf('</body>')
  return i < 0 ? html + poll : html.slice(0, i) + poll + html.slice(i)
}

function sendFile(res, status, name, body) {
  const ext = extname(name).toLowerCase()
  send(res, status, TYPES[ext] ?? 'application/octet-stream', ext === '.html' ? withReload(String(body)) : body)
}

async function serve(req, res) {
  const raw = req.url.split('?')[0]
  const path = raw.replace(/^\/+/, '/') // '//x/' in a Location header would send the browser to host x
  if (path === '/__version') return send(res, 200, TEXT, String(version))
  let target
  try {
    target = join(ROOT, decodeURIComponent(path))
  } catch {
    return send(res, 400, TEXT, 'Bad Request')
  }
  if (!target.startsWith(ROOT + sep)) return send(res, 403, TEXT, 'Forbidden')
  const info = await stat(target).catch(() => null)
  if (info?.isDirectory() && !path.endsWith('/')) {
    return send(res, 301, TEXT, 'Moved Permanently', { location: path + '/' + req.url.slice(raw.length) })
  }
  const file = info?.isDirectory() ? join(target, 'index.html') : target
  const body = await readFile(file).catch(() => null)
  if (body) return sendFile(res, 200, file, body)
  sendFile(res, 404, '404.html', await readFile(join(ROOT, '404.html')).catch(() => MISSING))
}

let child = null
let queued = false

// One build at a time; changes during a build queue exactly one follow-up.
// A fresh process per build so edits under lib/ take effect.
function rebuild() {
  if (child) {
    queued = true
    return
  }
  child = spawn(process.execPath, ['build.mjs', '--drafts'], { stdio: 'inherit' })
  child.on('exit', code => {
    child = null
    if (code === 0) version++
    else console.error('build failed; still serving. Fix the error above and save again.')
    if (queued) {
      queued = false
      rebuild()
    }
  })
}

let timer
function schedule() {
  clearTimeout(timer) // editors fire several events per save
  timer = setTimeout(rebuild, 100)
}

// Editor swap/backup files (.x.swp, #x#, x~) and .DS_Store are not content.
const isJunk = name => name && /^[.#]|~$/.test(basename(name))
for (const dir of ['posts', 'static', 'brand', 'lib'].filter(d => existsSync(d))) {
  watch(dir, { recursive: true }, (_, name) => {
    if (!isJunk(name)) schedule()
  })
}
// build.mjs is watched through its directory: a file watcher goes deaf after an editor's save-by-rename.
watch('.', (_, name) => {
  if (name === 'build.mjs') schedule()
})

const stop = () => {
  child?.kill()
  process.exit(0)
}
process.on('SIGINT', stop).on('SIGTERM', stop)

createServer((req, res) => serve(req, res).catch(err => {
  console.error(err)
  res.destroy()
}))
  .on('error', err => {
    console.error(err.code === 'EADDRINUSE' ? `port ${PORT} is in use; set PORT to another port` : err)
    process.exit(1)
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`serving dist/ at http://127.0.0.1:${PORT}/ (drafts included)`)
    rebuild()
  })
