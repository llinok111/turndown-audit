/**
 * Audit behaviour: each finding must fire on the construct it names, and must
 * stay silent on documents whose content Markdown can represent.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audit } from '../../audit/index.mjs'
import gfm from 'turndown-plugin-gfm'

const withGfm = (html) => audit(html, { plugins: [gfm.gfm] })
const codes = (report) => report.findings.map((f) => f.code)

test('a document Markdown can express produces no medium/high finding', () => {
  const html = '<h1>Title</h1><p>Hello <strong>world</strong>.</p>' +
    '<ul><li>a</li><li>b</li></ul>' +
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
  const report = withGfm(html)
  const notable = report.findings.filter((f) => f.severity !== 'low')
  assert.deepEqual(notable, [], 'expected a clean audit, got: ' + JSON.stringify(notable.map((f) => f.code)))
  assert.equal(report.clean, true)
})

test('a cell containing a pipe is reported as changed content', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>'
  const report = withGfm(html)
  assert.ok(codes(report).includes('table-cell-content-changed'))
  const finding = report.findings.find((f) => f.code === 'table-cell-content-changed')
  assert.equal(finding.severity, 'high')
  assert.equal(finding.evidence.cells[0].source, 'a|b')
  assert.equal(finding.evidence.cells[0].output, 'a')
})

test('inline code containing a pipe inside a table cell is reported', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td><code>a|b</code></td><td>2</td></tr></tbody></table>'
  assert.ok(codes(withGfm(html)).includes('table-cell-content-changed'))
})

test('merged cells are reported as inherently unrepresentable', () => {
  const html = '<table><thead><tr><th>Plan</th><th colspan="2">Limits</th></tr></thead>' +
    '<tbody><tr><td>Free</td><td>10</td><td>20</td></tr></tbody></table>'
  const report = withGfm(html)
  const finding = report.findings.find((f) => f.code === 'table-span-flattened')
  assert.ok(finding, 'expected table-span-flattened')
  assert.equal(finding.inherent, true, 'GFM has no colspan syntax, so this is inherent')
})

test('rowspan is reported as an unrepresentable span', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td rowspan="2">r</td><td>1</td></tr><tr><td>2</td></tr></tbody></table>'
  assert.ok(codes(withGfm(html)).includes('table-span-flattened'))
})

test('a semantic element flattened to text is reported', () => {
  const report = withGfm('<p>E=mc<sup>2</sup></p>')
  const finding = report.findings.find((f) => f.code === 'element-flattened')
  assert.ok(finding)
  assert.equal(finding.evidence.tag, 'SUP')
})

test('an element removed with no substitute is reported as dropped', () => {
  const report = withGfm('<iframe src="https://example.test" title="Dashboard"></iframe>')
  const finding = report.findings.find((f) => f.code === 'element-dropped')
  assert.ok(finding, 'expected element-dropped')
  assert.equal(finding.evidence.tag, 'IFRAME')
  assert.equal(finding.severity, 'high')
})

test('a code block language dropped by the default indented style is reported', () => {
  const report = withGfm('<pre><code class="language-js">const x = 1</code></pre>')
  assert.ok(codes(report).includes('code-block-degraded'))
  assert.equal(report.markdown, '    const x = 1')
})

test('a <pre> with no <code> child is reported as collapsed', () => {
  const report = withGfm('<pre>  indented\n    deeper</pre>')
  const finding = report.findings.find((f) => f.code === 'preformatted-collapsed')
  assert.ok(finding, 'expected preformatted-collapsed')
  assert.equal(finding.severity, 'high')
})

test('a <pre> with a <code> child is not reported as collapsed', () => {
  const report = withGfm('<pre><code>  indented</code></pre>')
  assert.ok(!codes(report).includes('preformatted-collapsed'))
})

test('a surviving <pre> elsewhere does not mask the loss of a different one', () => {
  // A normal code block becomes an indented block, which the re-render turns
  // back into a <pre><code>. Comparing global <pre> counts therefore sees
  // "a pre survived" and stays silent about the block that was actually lost.
  // Matching blocks by their text sees the loss.
  const html = '<pre><code class="language-js">const x = 1</code></pre>' +
    '<pre>  preformatted\n      without a code child</pre>'
  const report = withGfm(html)
  assert.ok(report.rerendered.includes('<pre'), 'precondition: the re-render contains a pre element')
  assert.ok(codes(report).includes('preformatted-collapsed'),
    'expected the original block to be reported despite the surviving pre; got ' + codes(report))
})

test('turndown escapes leading Markdown markers, so no injection is reported', () => {
  for (const html of ['<p>- not a list</p>', '<p># not a heading</p>', '<p>* not emphasis *</p>']) {
    const report = withGfm(html)
    assert.ok(!codes(report).includes('markdown-injection'), 'false injection for ' + html)
  }
})

test('an image whose alt text survives is not reported as changed', () => {
  const report = withGfm('<p><img src="a.png" alt="a picture"></p>')
  assert.ok(!codes(report).includes('image-target-changed'))
})

test('the report always exposes the produced markdown and its re-rendering', () => {
  const report = withGfm('<h1>Hi</h1>')
  assert.equal(typeof report.markdown, 'string')
  assert.equal(typeof report.rerendered, 'string')
  assert.ok(report.rerendered.includes('<h1>'))
})

test('auditStatistics are omitted unless asked for', () => {
  const plain = audit('<p>x</p>')
  assert.equal(plain.inventories, undefined)
  const detailed = audit('<p>x</p>', { statistics: true })
  assert.ok(detailed.inventories)
  assert.ok(Array.isArray(detailed.inventories.source.tokens))
})

test('a non-string input is rejected with a clear error', () => {
  assert.throws(() => audit(null), /expects an HTML string/)
  assert.throws(() => audit(42), /expects an HTML string/)
})

test('findings are ordered worst severity first', () => {
  const html = '<p>E=mc<sup>2</sup></p>' +
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>'
  const sev = withGfm(html).findings.map((f) => f.severity)
  const order = { high: 3, medium: 2, low: 1 }
  for (let i = 1; i < sev.length; i++) {
    assert.ok(order[sev[i - 1]] >= order[sev[i]], 'severity order broken: ' + sev.join(','))
  }
})

test('auditing twice yields identical findings (no shared mutable state)', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>'
  const first = withGfm(html)
  const second = withGfm(html)
  assert.deepEqual(codes(first), codes(second))
  assert.equal(first.markdown, second.markdown)
})
