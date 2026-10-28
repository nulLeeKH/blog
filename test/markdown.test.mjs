import test from 'node:test'
import assert from 'node:assert/strict'
import GithubSlugger from 'github-slugger'
import { parseFrontMatter, render } from '../lib/markdown.mjs'

const html = async md => (await render(md)).html
const count = (s, re) => s.match(re)?.length ?? 0
const fence = (info, code) => `\`\`\`${info}\n${code}\n\`\`\`\n`
const SHIKI_PRE = 'class="shiki shiki-themes github-light-default github-dark-default'
const lineTexts = out => out.split(/(?=<span class="line[ "])/).slice(1).map(s => s.replace(/<[^>]+>/g, '').replace(/\n$/, ''))

test('parseFrontMatter: flow and block lists, date stays a string', () => {
  const { meta, body } = parseFrontMatter('---\ntitle: "첫 글: 시작"\ndate: 2026-10-03\ntags: [blog, 자바스크립트]\n---\n본문\n')
  assert.deepEqual(meta, { title: '첫 글: 시작', date: '2026-10-03', tags: ['blog', '자바스크립트'] })
  assert.equal(body, '본문\n')
  assert.deepEqual(parseFrontMatter('---\ntags:\n  - a\n  - b\n---\nx').meta.tags, ['a', 'b'])
})

test('parseFrontMatter: CRLF, empty block, missing block', () => {
  assert.deepEqual(parseFrontMatter('---\r\ntitle: x\r\n---\r\nbody'), { meta: { title: 'x' }, body: 'body' })
  assert.deepEqual(parseFrontMatter('---\n---\nbody'), { meta: {}, body: 'body' })
  const src = '# 제목\n\n---\n\n본문\n'
  assert.deepEqual(parseFrontMatter(src), { meta: {}, body: src })
})

test('parseFrontMatter: invalid YAML or a non-mapping throws', () => {
  assert.throws(() => parseFrontMatter('---\ntitle: [unclosed\n---\n'), /^Error: front-matter: /)
  assert.throws(() => parseFrontMatter('---\ntitle: a\ntitle: b\n---\n'), /front-matter: .*unique.* at line 3,/)
  assert.throws(() => parseFrontMatter('---\na: 1\ntitle: Vue: 기초\n---\n'), /at line 3,/) // line numbers match the post file
  assert.throws(() => parseFrontMatter('---\n- a\n- b\n---\n'), /front-matter: must be a YAML mapping/)
  assert.throws(() => parseFrontMatter('---\njust text\n---\n'), /mapping/)
  for (const src of ['---\ntitle: x\n본문', '---\ntitle: x\n--\n본문', '---\ntitle: x\n----\n본문', '  ---\ntitle: x\n---\n본문',
    '\n---\ntitle: x\n---\n본문', '\r\n---\r\ntitle: x\r\n---\r\n본문']) {
    assert.throws(() => parseFrontMatter(src), /front-matter: must start and end with a line of just ---/, src)
  }
})

test('headings: GitHub-compatible ids, duplicates, anchors', async () => {
  // ids verified against github.com rendering
  const cases = [
    ['API 설계 (v2.0)', 'api-설계-v20'], [`'quotes' "double" \`code\``, 'quotes-double-code'],
    ['☕ 커피 & 차', '-커피--차'], ['Ünïcödé Ångström', 'ünïcödé-ångström'], ['foo_bar-baz', 'foo_bar-baz'],
    ['**굵게** _기울임_ 링크[^1]', '굵게-기울임-링크1'], ['[링크 텍스트](https://example.com) 헤딩', '링크-텍스트-헤딩'],
    ['설치 방법', '설치-방법'], ['설치 방법-1', '설치-방법-1'], ['설치 방법', '설치-방법-2'],
    ['1. 숫자로 시작', '1-숫자로-시작'], ['한자漢字・カタカナ', '한자漢字カタカナ'], ['C# / .NET 8', 'c--net-8'],
    ['Hello&nbsp;World &amp; 엔티티', 'helloworld--엔티티'], ['`npm` 으로 설치 🚀', 'npm-으로-설치-'],
    ['<span>raw</span> 태그', 'raw-태그'],
  ]
  const out = await html(cases.map(([h]) => `## ${h}`).join('\n') + '\n\n[^1]: x\n')
  assert.deepEqual([...out.matchAll(/<h2 id="([^"]*)"/g)].map(m => m[1]), cases.map(c => c[1]))
  assert.match(out, /<h2 id="설치-방법">설치 방법<a class="anchor" href="#설치-방법" aria-label="이 제목으로 연결되는 링크">#<\/a><\/h2>/)
})

test('headings: a heading that slugs to nothing still gets a usable id', async () => {
  const ids = [...(await html('## 🚀\n\n## ?\n\n## 🎉\n')).matchAll(/<h2 id="([^"]*)">/g)].map(m => m[1])
  assert.deepEqual(ids, ['section', '-1', '-2'])
})

test('headings: ids the post page already uses are never reused', async () => {
  const out = await html('## main\n\n## giscus\n\n## Footnote label\n\n## post-title\n\n본문[^1]\n\n[^1]: x\n')
  assert.deepEqual([...out.matchAll(/<h2 id="([^"]*)"/g)].map(m => m[1]), ['main-1', 'giscus-1', 'footnote-label-1', 'post-title-1'])
  assert.equal(count(out, /id="footnote-label"/g), 1)
})

test('headings: h1/h5/h6 get an id but no anchor; h4 gets an anchor', async () => {
  const out = await html('# 하나\n\n#### 넷\n\n##### 다섯\n\n###### 여섯\n')
  assert.match(out, /<h1 id="하나">하나<\/h1>/)
  assert.match(out, /<h4 id="넷">넷<a class="anchor" href="#넷" aria-label="이 제목으로 연결되는 링크">#<\/a><\/h4>/)
  assert.match(out, /<h5 id="다섯">다섯<\/h5>/)
  assert.match(out, /<h6 id="여섯">여섯<\/h6>/)
})

test('headings: NFC text gives an NFC id, one slugger per document', async () => {
  const md = '## 한글 제목\n'
  const { toc } = await render(md)
  assert.equal(toc[0].id, '한글-제목')
  assert.equal(toc[0].id, toc[0].id.normalize('NFC'))
  assert.deepEqual((await render(md)).toc, toc) // a second render must not continue with -1
})

test('toc: h2 and h3 only, plain text', async () => {
  const { toc } = await render('# 제목\n\n## 설치 방법\n\n### `npm` **설치**\n\n#### 깊이 4\n\n## 설치 방법\n\n## 복잡도 $O(n \\log n)$\n\n[^1]: 각주\n\n본문[^1]\n')
  assert.deepEqual(toc, [
    { depth: 2, id: '설치-방법', text: '설치 방법' },
    { depth: 3, id: 'npm-설치', text: 'npm 설치' },
    { depth: 2, id: '설치-방법-1', text: '설치 방법' },
    { depth: 2, id: new GithubSlugger().slug('복잡도 O(n \\log n)'), text: '복잡도 O(n \\log n)' },
  ])
})

test('toc: a footnote number stays in the id but not in the label', async () => {
  const { toc } = await render('## 실험 결과[^1]\n\n본문\n\n### 측정 방법[^note]\n\n[^1]: 2026년 기준.\n[^note]: 메모.\n')
  assert.deepEqual(toc, [{ depth: 2, id: '실험-결과1', text: '실험 결과' }, { depth: 3, id: '측정-방법2', text: '측정 방법' }])
})

test('alerts: five types with English titles and octicons', async () => {
  const types = ['note', 'tip', 'important', 'warning', 'caution']
  const out = await html(types.map(t => `> [!${t.toUpperCase()}]\n> ${t} 내용\n`).join('\n') + '\n> [!note]\n> 소문자\n')
  for (const t of types) {
    const title = t[0].toUpperCase() + t.slice(1)
    assert.match(out, new RegExp(`<div class="markdown-alert markdown-alert-${t}">\\n<p class="markdown-alert-title"><svg class="octicon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M[^"]+"/></svg>${title}</p>\\n<p>${t} 내용</p>\\n</div>`))
  }
  assert.equal(count(out, /class="markdown-alert /g), 6)
  assert.equal(new Set(out.match(/<path d="[^"]+"/g)).size, 5, 'each type has its own icon')
})

test('alerts: GitHub edge cases stay plain blockquotes', async () => {
  for (const md of ['> [!NOTE] same line\n> 내용\n', '> [!WARNING]\n', '- 목록\n\n  > [!NOTE]\n  > 중첩\n', '> [!UNKNOWN]\n> 내용\n']) {
    const out = await html(md)
    assert.match(out, /<blockquote>/, md)
    assert.doesNotMatch(out, /markdown-alert/, md)
  }
})

test('alerts: CRLF line endings', async () => {
  const out = await html('> [!NOTE]\r\n> 내용\r\n')
  assert.match(out, /<div class="markdown-alert markdown-alert-note">/)
  assert.doesNotMatch(out, /\[!NOTE\]/)
})

test('alerts: content may follow on the marker line break or span several blocks', async () => {
  const out = await html('> [!TIP]\n> 첫 문단\n>\n> 둘째 문단\n')
  assert.match(out, /Tip<\/p>\n<p>첫 문단<\/p>\n<p>둘째 문단<\/p>/)
})

test('footnotes: Korean label and back-reference labels', async () => {
  const out = await html('본문[^1] 그리고[^메모].\n\n[^1]: 첫째.\n[^메모]: 둘째.\n')
  assert.match(out, /<section data-footnotes class="footnotes"><h2 class="sr-only" id="footnote-label">각주<\/h2>/)
  assert.match(out, /aria-label="1번 각주 본문으로"/)
  const again = await html('첫째[^a], 둘째[^a].\n\n[^a]: 같은 각주\n')
  assert.match(again, /href="#user-content-fnref-a-2" data-footnote-backref="" aria-label="1번 각주 본문으로 \(2번째\)"/)
  assert.doesNotMatch(out, /id="footnote-label">각주<a/, 'footnote label gets no anchor')
  assert.deepEqual((await render('본문[^1]\n\n[^1]: x\n')).toc, [])
})

test('raw HTML passes through with the GFM tagfilter', async () => {
  const out = await html('<script>alert(1)</script>\n\n<kbd>Ctrl</kbd> <iframe src="x"></iframe>\n\n<details><summary>더 보기</summary>\n\n내용\n\n</details>\n')
  assert.match(out, /&lt;script>alert\(1\)&lt;\/script>/)
  assert.match(out, /&lt;iframe src="x">&lt;\/iframe>/)
  assert.match(out, /<kbd>Ctrl<\/kbd>/)
  assert.match(out, /<details><summary>더 보기<\/summary>/)
  assert.doesNotMatch(out, /<script|<iframe/)
  // a bare tag ending the block (an html node's value has no final newline) would swallow the rest of the page
  const bare = await html('앞\n\n<iframe\n\n뒤\n')
  assert.match(bare, /&lt;iframe/)
  assert.match(bare, /<p>뒤<\/p>/)
  assert.doesNotMatch(bare, /<iframe/)
})

test('GFM: task list, table alignment, strikethrough, autolinks', async () => {
  const out = await html('- [ ] 할 일\n- [x] 완료\n\n| 이름 | 값 |\n|:-:|--:|\n| a | 1 |\n\n~~취소~~ www.example.com https://example.com\n')
  assert.match(out, /<li class="task-list-item"><input type="checkbox" disabled> 할 일<\/li>/)
  assert.match(out, /<input type="checkbox" checked disabled> 완료/)
  assert.match(out, /<th align="center">이름<\/th>/)
  assert.match(out, /<td align="right">1<\/td>/)
  assert.match(out, /<del>취소<\/del>/)
  assert.match(out, /<a href="http:\/\/www.example.com" target="_blank" rel="noopener">www.example.com<\/a>/)
  assert.match(out, /<a href="https:\/\/example.com" target="_blank" rel="noopener">https:\/\/example.com<\/a>/)
})

test('images: a lone image becomes a figure, inline images stay inline, all lazy', async () => {
  assert.equal(await html('![그림 설명](diagram.png "빌드 흐름")\n'),
    '<figure><img src="diagram.png" alt="그림 설명" loading="lazy" decoding="async"><figcaption>빌드 흐름</figcaption></figure>')
  assert.equal(await html('![그림](a.png)\n'), '<figure><img src="a.png" alt="그림" loading="lazy" decoding="async"></figure>')
  assert.equal(await html('![a][r]\n\n[r]: /img/a.png "참조"\n'),
    '<figure><img src="/img/a.png" alt="a" loading="lazy" decoding="async"><figcaption>참조</figcaption></figure>')
  assert.equal(await html('글 ![아이콘](i.svg "툴팁") 사이\n'),
    '<p>글 <img src="i.svg" alt="아이콘" title="툴팁" loading="lazy" decoding="async"> 사이</p>')
  assert.match(await html('![a](a.png) ![b](b.png)\n'), /^<p><img src="a.png" alt="a" loading="lazy" decoding="async"> <img/)
  assert.match(await html('[![배지](b.svg)](https://example.com)\n'), /^<p><a href="https:\/\/example.com" target="_blank" rel="noopener"><img src="b.svg" alt="배지" loading="lazy" decoding="async"><\/a><\/p>$/)
})

test('inline code: only long code (> 30 columns, Hangul counts 2) may wrap', async () => {
  assert.match(await html('`npm run build`'), /<code>npm run build<\/code>/)
  assert.match(await html(`\`${'a'.repeat(30)}\``), /<code>a+<\/code>/)
  assert.match(await html(`\`${'가'.repeat(16)}\``), /<code class="code-wrap">/)
  assert.match(await html(`\`${'a'.repeat(31)}\``), /<code class="code-wrap">/)
  assert.match(await html('`a\nb`'), /<code>a b<\/code>/)
})

test('code: title, {ranges}, showLineNumbers, startLineNumber', async () => {
  const out = await html(fence('ts title="src/lib/x.ts" {2} showLineNumbers startLineNumber=10', 'const a = 1\nconst b = 2\nconst c = 3'))
  assert.ok(out.startsWith(`<div class="code" data-lang="ts"><div class="code-head"><span class="code-title">src/lib/x.ts</span> <span class="code-lang">ts</span></div><pre ${SHIKI_PRE} line-numbers" style="--shiki-light:`), out)
  assert.match(out, /--shiki-dark:[^;"]+;--shiki-light-bg:[^;"]+;--shiki-dark-bg:[^;"]+;--ln:9" tabindex="0"><code><span class="lines"><span class="line">/)
  const lines = [...out.matchAll(/<span class="(line(?: [^"]*)?)">/g)].map(m => m[1])
  assert.deepEqual(lines, ['line', 'line highlighted', 'line'])
  assert.doesNotMatch(out, /highlighted-word/, '"/" inside the title is not a /word/')
  assert.ok(out.endsWith('</span></code></pre></div>'))
})

test('code: ranges and line numbers are opt-in', async () => {
  const out = await html(fence('js {1,3-4}', 'a\nb\nc\nd\ne'))
  assert.deepEqual([...out.matchAll(/<span class="(line(?: [^"]*)?)">/g)].map(m => m[1]), ['line highlighted', 'line', 'line highlighted', 'line highlighted', 'line'])
  assert.doesNotMatch(out, /line-numbers|--ln/)
  assert.doesNotMatch(await html(fence('js startLineNumber=5', 'a')), /line-numbers|--ln/)
})

test('code: /word/ meta highlights every occurrence', async () => {
  const out = await html(fence('js /foo/', 'foo(1)\nbar(foo)'))
  assert.equal(count(out, /class="[^"]*highlighted-word/g), 2)
  assert.doesNotMatch(await html(fence('sh /npm/', 'npm')), /class="line highlighted-word"/, 'a word alone on its line boxes the word, not the line')
})

test('code: comment notations ++ -- highlight focus word', async () => {
  const src = ['add() // [!code ++]', 'remove() // [!code --]', 'mark() // [!code highlight]', 'look() // [!code focus]', '// [!code word:needle]', 'needle(needle)'].join('\n')
  const out = await html(fence('ts', src))
  assert.doesNotMatch(out, /\[!code/)
  assert.match(out, /<span class="line diff add">/)
  assert.match(out, /<span class="line diff remove">/)
  assert.match(out, /<span class="line highlighted">/)
  assert.match(out, /<span class="line focused">/)
  assert.equal(count(out, /highlighted-word/g), 2)
  assert.match(out, /<pre class="shiki [^"]*has-diff[^"]*has-focused/)
  assert.equal(lineTexts(out)[0], 'add()') // the space before the removed comment goes too
})

test('code: other trailing spaces stay (Markdown hard break, whitespace-only diff)', async () => {
  assert.deepEqual(lineTexts(await html(fence('md', 'a  \nb'))), ['a  ', 'b'])
  assert.deepEqual(lineTexts(await html(fence('diff', '-x \n+x'))), ['-x ', '+x'])
  assert.deepEqual(lineTexts(await html(fence('bash', 'npm i # [!code ++]'))), ['npm i'])
})

test('code: ```diff colors whole lines, headers excluded', async () => {
  const out = await html(fence('diff', '--- a/x.js\n+++ b/x.js\n@@ -1 +1 @@\n-const x = 1\n+const x = 2\n same'))
  assert.match(out, /^<div class="code" data-lang="diff"><div class="code-head"><span class="code-lang">diff<\/span><\/div>/)
  assert.equal(count(out, /line diff remove/g), 1)
  assert.equal(count(out, /line diff add/g), 1)
})

test('code: language label as written (lowercased), shiki aliases work', async () => {
  for (const lang of ['bash', 'sh', 'js', 'py', 'json', 'yaml', 'html', 'css', 'rust', 'go', 'c++']) {
    const out = await html(fence(lang, 'x'))
    assert.ok(out.startsWith(`<div class="code" data-lang="${lang}"><div class="code-head"><span class="code-lang">${lang}</span></div><pre ${SHIKI_PRE}`), lang)
  }
  assert.match(await html(fence('JSON', '{"a": 1}')), /^<div class="code" data-lang="json">/)
  const colors = (await html(fence('ts', 'const x: number = 1'))).match(/--shiki-light:#\w+/g)
  assert.ok(new Set(colors).size > 2, 'tokens are colored')
})

test('code: unknown, plain or missing language renders bare text without throwing', async () => {
  const bare = `<div class="code code--bare"><pre ${SHIKI_PRE}"`
  for (const md of [fence('foobar', 'x'), fence('', 'x'), fence('text', 'x'), fence('txt', 'x'), fence('constructor', 'x'), fence('ts{1}', 'x'), '    indented()\n    code\n']) {
    const out = await html(md)
    assert.ok(out.startsWith(bare), md)
    assert.doesNotMatch(out, /data-lang|code-head/, md)
  }
  assert.ok((await html(fence('foobar title="x.foo"', 'x'))).startsWith(`<div class="code"><div class="code-head"><span class="code-title">x.foo</span></div><pre ${SHIKI_PRE}"`))
  assert.ok((await html(fence('title="no-lang.txt"', 'x'))).startsWith(`<div class="code code--bare">`), 'meta without a language is a language name, not a title')
})

test('code: HTML inside code is escaped', async () => {
  for (const md of [fence('ts', 'const s = "<b>x</b> & <script>"'), fence('', '<b>x</b>'), '    <b>x</b>\n']) {
    const out = await html(md)
    assert.doesNotMatch(out, /<b>|<script>/, md)
    assert.match(out, /&#x3C;b>/, md)
  }
  assert.match(await html(fence('ts title="a<b>.ts"', 'x')), /<span class="code-title">a&#x3C;b>.ts<\/span>/)
})

test('code: concurrent renders share one highlighter', async () => {
  const outs = await Promise.all(['python', 'ruby', 'java', 'kotlin'].map(l => html(fence(l, 'x = 1'))))
  outs.forEach(o => assert.match(o, /^<div class="code" data-lang="\w+">/))
})

test('mermaid: source kept escaped for the client, not highlighted', async () => {
  const out = await html(fence('mermaid', 'graph LR\n  A["<b>a</b>"] --> B'))
  assert.equal(out, '<div class="mermaid-block"><pre class="mermaid">graph LR\n  A["&#x3C;b>a&#x3C;/b>"] --> B</pre></div>')
})

test('math: inline, $$ display, ```math, errors', async () => {
  const inline = await html('면적은 $x^2$ 이다.\n')
  assert.match(inline, /^<p>면적은 <span class="katex"><math xmlns="http:\/\/www.w3.org\/1998\/Math\/MathML"><semantics>/)
  assert.match(inline, /<annotation encoding="application\/x-tex">x\^2<\/annotation><\/semantics><\/math><\/span> 이다.<\/p>$/)
  assert.doesNotMatch(inline, /display="block"/)
  // the word right after inline math stays on its line (<math> is atomic, so keep-all does not hold it)
  assert.match(await html('$n$개를 넣는다.\n'), /^<p><span class="math-word"><span class="katex">.*<\/span>개를<\/span> 넣는다.<\/p>$/s)
  const display = await html('$$\n\\frac{a}{b}\n$$\n')
  assert.match(display, /^<div class="math-display"><span class="katex"><math xmlns="[^"]+" display="block">/)
  assert.match(display, /<mfrac>/)
  assert.match(await html(fence('math', '\\begin{aligned} a &= b \\\\ c &= d \\end{aligned}')), /^<div class="math-display"><span class="katex"><math [^>]*display="block">.*<mtable/s)
  // $$…$$ alone on one line is display math, as on GitHub; with text around it, it stays inline
  for (const md of ['$$E=mc^2$$\n', '앞 문단\n\n$$ E=mc^2 $$\n\n뒤 문단\n', '- $$E=mc^2$$\n']) {
    assert.match(await html(md), /<div class="math-display"><span class="katex"><math [^>]*display="block">/, md)
  }
  assert.doesNotMatch(await html('$$a$$ 다음 글\n'), /math-display|display="block"/)
  assert.doesNotMatch(await html('$a$\n'), /math-display|display="block"/)
  assert.match(await html('`$x$` 와 \\$5\n'), /<code>\$x\$<\/code> 와 \$5/)
  await assert.rejects(render('$\\frac{$\n'), /^Error: math \(line 1\): /)
  await assert.rejects(render('$$\n\\begin{x}\n$$\n'), /math \(line 1\): /)
  await assert.rejects(render(fence('math', '\\frac{')), /math \(line 1\): /)
  // firstLine: where the body starts in the file, so the number points into the post file
  await assert.rejects(render('문단\n\n$\\frac{$\n', { firstLine: 6 }), /math \(line 8\): /)
})

test('math: thin space around operator names like TeX (MathML Core adds none)', async () => {
  const thin = '<mspace width="0.1667em"></mspace><mi>log</mi><mo rspace="0.1667em">\u2061</mo>'
  assert.ok((await html('$O(n \\log n)$')).includes(thin))
  assert.ok((await html('$\\sin x$')).includes('<mi>sin</mi><mo rspace="0.1667em">\u2061</mo>'))
  assert.ok((await html('$\\log(n)$')).includes('<mi>log</mi><mo>\u2061</mo><mo stretchy="false">(</mo>')) // Op then Open: no space
  // scripted names: KaTeX wraps them in msub/msup/munder, so the spaces go outside the wrapper
  assert.ok((await html('$n \\log_2 n$')).includes('<mi>n</mi><mspace width="0.1667em"></mspace><msub><mrow><mi>log</mi>'))
  assert.ok((await html('$n \\log_2 n$')).includes('</msub><mspace width="0.1667em"></mspace><mi>n</mi>'))
  assert.ok((await html('$\\sin^2 x$')).includes('</msup><mspace width="0.1667em"></mspace><mi>x</mi>'))
  assert.ok((await html('$$\n\\lim_{n \\to \\infty} a_n\n$$')).includes('</munder><mspace width="0.1667em"></mspace><msub>'))
  assert.doesNotMatch(await html('$\\log_2(n)$'), /mspace/)
})

test('math: trust is off', async () => {
  assert.doesNotMatch(await html('$\\href{javascript:alert(1)}{x}$\n'), /href=/)
})

test('text: prose only, whitespace collapsed', async () => {
  const md = [
    '# 제목', '', '본문[^1] 입니다 `inline` 코드와 $x^2$ 수식.  ', '여러   줄', '',
    '> [!NOTE]', '> 알림 내용', '', fence('js', 'const hidden = 1'), fence('mermaid', 'graph LR\n  A --> B'),
    '$$', 'y = 1', '$$', '', '    indented hidden', '', '![그림](a.png "캡션")', '', '| 칸 | 칸2 |', '|--|--|', '| a | b |', '',
    '## 소제목 <span>raw</span>', '', '[^1]: 각주 내용', '',
  ].join('\n')
  assert.equal((await render(md)).text, '제목 본문 입니다 inline 코드와 수식. 여러 줄 알림 내용 캡션 칸 칸2 a b 소제목 raw')
})

test('render result shape', async () => {
  const r = await render('')
  assert.deepEqual(r, { html: '', toc: [], text: '' })
})

test('Hangul next to a bracket is held together, outside code only', async () => {
  const out = await html('B트리(LSM)를 쓴다. `트리(LSM)를`\n\n## 트리(LSM)를 고르기\n')
  assert.match(out, /B트<span class="nb">리\(<\/span>LSM<span class="nb">\)를<\/span> 쓴다/)
  assert.match(out, /<code>트리\(LSM\)를<\/code>/)
  assert.match(out, /<h2 id="트리lsm를-고르기">/) // the id still comes from the plain text
})

test('math: the text right before inline math joins its span', async () => {
  assert.match(await html('확률($p$)는'), /<span class="math-word">확률\(<span class="katex">.*<\/span>\)는<\/span>/)
  assert.match(await html('값 $x$ 이다'), /값 <span class="katex">/) // a space before: nothing to hold
})

test('links leaving the site open in a new tab; in-page and relative links do not', async () => {
  const { html } = await render('[a](https://example.com) [b](/posts/x/) [c](#top) <https://auto.example>')
  assert.ok(html.includes('<a href="https://example.com" target="_blank" rel="noopener">a</a>'))
  assert.ok(html.includes('<a href="https://auto.example" target="_blank" rel="noopener">https://auto.example</a>'))
  assert.ok(html.includes('<a href="/posts/x/">b</a>') && html.includes('<a href="#top">c</a>'))
})
