// Progressive enhancements: theme toggle, ToC scroll-spy and reading progress, code copy buttons,
// giscus comments and mermaid diagrams. Every page reads fine without this file.
(() => {
  const root = document.documentElement
  const systemDark = matchMedia('(prefers-color-scheme: dark)')
  const isDark = () => (root.dataset.theme ?? (systemDark.matches ? 'dark' : 'light')) === 'dark'

  // ---- giscus: built at load from the container's data-*, theme kept in sync afterwards
  const GISCUS = 'https://giscus.app'
  // 'light' reads as white cards on the ivory paper; 'transparent_dark' lets the ink page show through
  // where 'dark' would paint GitHub's blue-black #0d1117 boxes.
  const giscusTheme = () => isDark() ? 'transparent_dark' : 'light'
  const syncGiscus = () => document.querySelector('iframe.giscus-frame')?.contentWindow
    .postMessage({ giscus: { setConfig: { theme: giscusTheme() } } }, GISCUS)
  // The comments container itself, not a raw-HTML element in the post that happens to use the id.
  const box = document.querySelector('.comments > div#giscus')
  if (box) {
    // Messages posted before the widget is ready are dropped: resend once it first talks to us.
    addEventListener('message', function once(e) {
      if (e.origin !== GISCUS) return
      removeEventListener('message', once)
      syncGiscus()
    })
    const d = box.dataset
    const script = document.createElement('script')
    const attrs = {
      src: `${GISCUS}/client.js`, 'data-repo': d.repo, 'data-repo-id': d.repoId, 'data-category': d.category,
      'data-category-id': d.categoryId, 'data-mapping': 'specific', 'data-term': d.term, 'data-strict': '1',
      'data-reactions-enabled': '1', 'data-emit-metadata': '0', 'data-input-position': 'bottom',
      'data-theme': giscusTheme(), 'data-lang': 'ko', 'data-loading': 'lazy', crossorigin: 'anonymous', async: '',
    }
    for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v)
    box.classList.add('giscus') // client.js mounts its iframe into the first .giscus element
    document.body.append(script)
  }

  // ---- mermaid: rendered in the browser, redrawn from the saved source when the theme changes
  const MERMAID = 'https://cdn.jsdelivr.net/npm/mermaid@12.1.0/dist/mermaid.esm.min.mjs'
  const diagrams = [...document.querySelectorAll('pre.mermaid')]
  let mermaid
  let drawing = Promise.resolve()
  const markFailed = () => {
    for (const pre of diagrams) {
      const failed = !pre.querySelector('svg')
      if (failed && pre.dataset.src) pre.textContent = pre.dataset.src // mermaid empties a node it cannot draw
      pre.classList.toggle('mermaid-error', failed)
    }
  }
  const draw = async () => {
    // A drawn diagram is taller or shorter than its source: keep a #fragment target where the reader landed,
    // unless they (or the browser's scroll anchoring) moved meanwhile.
    const target = document.querySelector(':target')
    const top = target?.getBoundingClientRect().top, y = scrollY
    mermaid.initialize({
      startOnLoad: false, securityLevel: 'strict', theme: isDark() ? 'dark' : 'neutral',
      fontFamily: "'D2Coding', ui-monospace, monospace",
      // The root size; themeVariables.fontSize sizes flowchart and class labels, fontSize the sequence ones.
      // The dark theme's edge label background (#585858 under #ccc), note text, gitGraph main label and mindmap root,
      // and the gantt crit fill in both themes are below 4.5:1: site colors instead.
      fontSize: 13, themeVariables: { fontSize: '13px', ...(isDark()
        ? { edgeLabelBackground: '#4a443b', noteTextColor: '#ebe5d9', critBkgColor: '#a40e26', git0: '#a39b8c', gitBranchLabel0: '#1c1a17', cScale0: '#a39b8c', cScaleLabel0: '#1c1a17' }
        : { critBkgColor: '#cf222e' }) },
      suppressErrorRendering: true, // no bomb graphic appended to <body> for a broken diagram
      deterministicIds: true, // default ids are Date.now(): two diagrams drawn in one millisecond would collide
    })
    for (const pre of diagrams) {
      pre.dataset.src ??= pre.textContent
      pre.textContent = pre.dataset.src
      pre.removeAttribute('data-processed')
    }
    await mermaid.run({ nodes: diagrams, suppressErrors: true })
    // The drawing's own width: it keeps that size and scrolls inside the block (style.css).
    for (const svg of document.querySelectorAll('pre.mermaid > svg')) {
      svg.style.setProperty('--w', `${svg.viewBox.baseVal?.width ?? 0}px`)
    }
    if (target && scrollY === y) scrollBy({ top: target.getBoundingClientRect().top - top, behavior: 'instant' })
    markFailed()
  }
  // Serialized so a quick double toggle cannot interleave two renders.
  const redraw = () => {
    if (mermaid) drawing = drawing.then(draw).catch(markFailed)
  }
  if (diagrams.length) {
    for (const pre of diagrams) pre.dataset.note = '다이어그램을 그리지 못해 원문을 그대로 보여 줍니다.'
    document.fonts.ready // labels are measured in D2Coding
      .then(() => import(MERMAID))
      .then(m => {
        mermaid = m.default
        redraw()
      })
      .catch(markFailed)
  }

  // ---- theme: system setting by default; the button stores an explicit choice
  const toggle = document.querySelector('.theme-toggle')
  const browserColors = document.querySelectorAll('meta[name="theme-color"]')
  let dark = isDark()
  const themeChanged = () => {
    toggle?.setAttribute('aria-pressed', String(isDark()))
    // Their media queries describe the system setting only; the browser bar should match a manual choice too.
    const paper = getComputedStyle(root).getPropertyValue('--paper').trim()
    for (const meta of browserColors) meta.content = paper
    if (isDark() === dark) return
    dark = isDark()
    syncGiscus()
    redraw()
  }
  toggle?.addEventListener('click', () => {
    root.dataset.theme = isDark() ? 'light' : 'dark'
    try {
      localStorage.setItem('theme', root.dataset.theme)
    } catch {
      // storage blocked: the choice lasts for this page view only
    }
    themeChanged()
  })
  systemDark.addEventListener('change', themeChanged)
  themeChanged()

  // ---- copy buttons
  const blocks = [...document.querySelectorAll('.code > pre.shiki')]
  if (blocks.length) {
    const live = document.createElement('p')
    live.className = 'sr-only'
    live.setAttribute('aria-live', 'polite')
    document.body.append(live)
    for (const pre of blocks) {
      const block = pre.parentElement
      const head = block.querySelector(':scope > .code-head')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'copy'
      btn.textContent = '복사'
      btn.setAttribute('aria-label', [...head?.children ?? []].map(c => c.textContent).concat('코드 복사').join(' '))
      ;(head ?? block).append(btn)
      btn.addEventListener('click', async () => {
        // Copy the code as it is after the change: removed lines only make sense inside a diff.
        const keep = line => block.dataset.lang === 'diff' || !line.matches('.diff.remove')
        const text = [...pre.querySelectorAll('.line')].filter(keep).map(l => l.textContent).join('\n')
        let ok = true
        try {
          await navigator.clipboard.writeText(text)
        } catch {
          ok = false
        }
        btn.textContent = ok ? '복사됨' : '실패'
        btn.toggleAttribute('data-done', ok)
        live.textContent = ok ? '코드를 클립보드에 복사했습니다.' : '코드를 복사하지 못했습니다.'
        clearTimeout(btn.reset)
        btn.reset = setTimeout(() => {
          btn.textContent = '복사'
          btn.removeAttribute('data-done')
        }, 1800)
      })
    }
  }

  // ---- post: ToC scroll-spy and reading progress (the % in the ToC and the top bar)
  const prose = document.querySelector('.post .prose')
  if (!prose) return
  const toc = document.querySelector('.toc')
  const links = toc ? [...toc.querySelectorAll('a[href^="#"]')] : []
  const heads = links.map(a => prose.querySelector(`#${CSS.escape(decodeURIComponent(a.hash.slice(1)))}`))
  // The body numbers only .prose > h2: a ## inside <details>, an alert or a list gets no number in the ToC either.
  heads.forEach((h, i) => {
    if (h?.tagName === 'H2' && h.parentElement !== prose) links[i].parentElement.classList.add('toc-plain')
  })
  const pct = toc?.querySelector('.toc-pct')
  let queued = false
  const update = () => {
    queued = false
    const line = innerHeight * 0.3
    let current = -1
    heads.forEach((h, i) => {
      if (h && h.getBoundingClientRect().top <= line) current = i
    })
    links.forEach((a, i) => {
      if (i === current) a.setAttribute('aria-current', 'location')
      else a.removeAttribute('aria-current')
    })
    const r = prose.getBoundingClientRect()
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)))
    root.style.setProperty('--progress', p.toFixed(4))
    if (pct) pct.textContent = `${Math.round(p * 100)}%`
  }
  const queue = () => {
    if (queued) return
    queued = true
    requestAnimationFrame(update)
  }
  addEventListener('scroll', queue, { passive: true })
  addEventListener('resize', queue)
  update()
})()
