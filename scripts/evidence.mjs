/**
 * Evidence: audited corpus with the outcome each document must produce.
 *
 * This file is executable documentation. Run it with
 *
 *   node scripts/evidence.mjs
 *
 * `expect: 'clean'` documents are well-formed HTML whose content Markdown can
 * represent, so an audit that reports anything about them is producing a false
 * positive. `expectFindings` documents contain a construct that is genuinely
 * damaged or unrepresentable, so an audit that reports nothing about them has a
 * blind spot. Both directions are checked, because a linter that only ever
 * reports nothing is as useless as one that reports everything.
 */

import { audit } from '../audit/index.mjs'
import gfm from 'turndown-plugin-gfm'

export const CASES = [
  // ---- must be silent: Markdown expresses all of this -------------------
  { name: 'headings', expect: 'clean', html: '<h1>A</h1><h2>B</h2><h3>C</h3>' },
  { name: 'inline emphasis', expect: 'clean', html: '<p>Hello <strong>bold</strong> and <em>italic</em> and <code>x</code>.</p>' },
  { name: 'emphasis nesting', expect: 'clean', html: '<p><strong><em>both</em></strong></p>' },
  { name: 'unordered list', expect: 'clean', html: '<ul><li>a</li><li>b</li></ul>' },
  { name: 'ordered list', expect: 'clean', html: '<ol><li>one</li><li>two</li></ol>' },
  { name: 'nested list', expect: 'clean', html: '<ul><li>a<ul><li>b</li></ul></li></ul>' },
  { name: 'blockquote', expect: 'clean', html: '<blockquote><p>quoted</p></blockquote>' },
  { name: 'code block without a declared language', expect: 'clean', html: '<pre><code>const x = 1</code></pre>' },
  { name: 'link', expect: 'clean', html: '<p><a href="https://example.com">example</a></p>' },
  { name: 'image', expect: 'clean', html: '<p><img src="a.png" alt="a picture"></p>' },
  { name: 'thematic break', expect: 'clean', html: '<p>a</p><hr><p>b</p>' },
  { name: 'simple table', expect: 'clean', html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' },
  { name: 'table alignment', expect: 'clean', html: '<table><thead><tr><th align="left">A</th><th align="right">B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>' },
  { name: 'table with link', expect: 'clean', html: '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><a href="https://x.test">x</a></td></tr></tbody></table>' },
  { name: 'table with image', expect: 'clean', html: '<table><thead><tr><th>A</th></tr></thead><tbody><tr><td><img src="x.png" alt="pic"></td></tr></tbody></table>' },
  { name: 'table with empty cell', expect: 'clean', html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td></td><td>2</td></tr></tbody></table>' },
  { name: 'CJK prose', expect: 'clean', html: '<p>这是一个中文段落，包含标点符号。</p>' },
  { name: 'html entities', expect: 'clean', html: '<p>5 &lt; 10 &amp;&amp; 3 &gt; 1</p>' },
  { name: 'inline code outside a table', expect: 'clean', html: '<p>Use <code>a|b</code> here</p>' },
  // turndown escapes leading Markdown-significant characters in text, so these
  // must NOT be reported. Verified by running the conversion, not assumed.
  { name: 'escaped list marker text', expect: 'clean', html: '<p>- not a list</p>' },
  { name: 'escaped heading marker text', expect: 'clean', html: '<p># not a heading</p>' },
  { name: 'escaped blockquote marker text', expect: 'clean', html: '<p>&gt; not a quote</p>' },
  { name: 'escaped emphasis marker text', expect: 'clean', html: '<p>* not emphasis *</p>' },

  // ---- must be reported: content is damaged or unrepresentable ----------
  {
    name: 'cell text containing a pipe',
    expectFindings: ['table-cell-content-changed'],
    html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>'
  },
  {
    name: 'inline code containing a pipe inside a table cell',
    expectFindings: ['table-cell-content-changed'],
    html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><code>a|b</code></td><td>2</td></tr></tbody></table>'
  },
  {
    name: 'colspan header',
    expectFindings: ['table-span-flattened'],
    html: '<table><thead><tr><th>Plan</th><th colspan="2">Limits</th></tr></thead><tbody><tr><td>Free</td><td>10</td><td>20</td></tr></tbody></table>'
  },
  {
    name: 'rowspan body',
    expectFindings: ['table-span-flattened'],
    html: '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td rowspan="2">r</td><td>1</td></tr><tr><td>2</td></tr></tbody></table>'
  },
  {
    name: 'superscript',
    expectFindings: ['element-flattened'],
    html: '<p>E=mc<sup>2</sup></p>'
  },
  {
    name: 'abbreviation expansion',
    expectFindings: ['element-flattened'],
    html: '<p><abbr title="HyperText Markup Language">HTML</abbr> is a language</p>'
  },
  {
    name: 'embedded frame',
    expectFindings: ['element-dropped'],
    html: '<iframe src="https://example.test" title="Dashboard"></iframe>'
  },
  {
    name: 'media player',
    expectFindings: ['element-dropped'],
    html: '<video src="a.mp4"></video>'
  },
  {
    name: 'definition list',
    expectFindings: ['element-flattened'],
    html: '<dl><dt>Term</dt><dd>Definition</dd></dl>'
  },
  {
    // The default codeBlockStyle is 'indented', and an indented block cannot
    // carry a language, so the language is silently dropped.
    name: 'fenced code language under the default style',
    expectFindings: ['code-block-degraded'],
    html: '<pre><code class="language-js">const x = 1</code></pre>'
  },
  {
    name: 'media element with no text of its own',
    expectFindings: ['element-dropped'],
    html: '<p>before</p><audio src="a.mp3"></audio><p>after</p>'
  },
  {
    name: 'text inside a table cell that splits the row',
    expectFindings: ['table-cell-content-changed'],
    html: '<table><thead><tr><th>Command</th><th>Meaning</th></tr></thead><tbody><tr><td>a|b</td><td>pipe</td></tr></tbody></table>'
  },
  {
    // A <pre> with no <code> child is emitted as ordinary content, so text that
    // looks like a setext underline turns into a heading the author never wrote.
    name: 'preformatted text that becomes a heading',
    expectFindings: ['markdown-injection'],
    html: '<p>intro</p><pre>Level One Heading\n=================</pre>'
  }
]

export function runEvidence () {
  const results = []
  for (const c of CASES) {
    const report = audit(c.html, { plugins: [gfm.gfm] })
    const codes = report.findings.map((f) => f.code)
    if (c.expect === 'clean') {
      const noisy = report.findings.filter((f) => f.severity !== 'low')
      results.push({
        name: c.name,
        expected: 'no medium/high findings',
        actual: noisy.length ? noisy.map((f) => f.code).join(', ') : 'none',
        pass: noisy.length === 0
      })
    } else {
      const missing = c.expectFindings.filter((code) => !codes.includes(code))
      results.push({
        name: c.name,
        expected: c.expectFindings.join(', '),
        actual: codes.length ? codes.join(', ') : 'none',
        pass: missing.length === 0
      })
    }
  }
  return results
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))
if (isMain) {
  const results = runEvidence()
  let failed = 0
  for (const r of results) {
    if (!r.pass) failed++
    console.log(
      (r.pass ? 'ok   ' : 'FAIL ') + r.name.padEnd(48) +
      '| expected: ' + r.expected.padEnd(30) +
      '| got: ' + r.actual
    )
  }
  console.log('\n' + (results.length - failed) + '/' + results.length + ' corpora behaved as specified')
  process.exit(failed ? 1 : 0)
}
