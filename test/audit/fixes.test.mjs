/**
 * Fix verification: the value of the audit depends on its remedies being real,
 * so every strategy is checked here against the claim it makes. A strategy that
 * says it resolves a finding must actually resolve it, and must not introduce a
 * new medium/high finding elsewhere.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { audit } from '../../audit/index.mjs'
import {
  suggestFixes, verifyStrategy, escapeTablePipes, preWithoutCode, fencedCode, keepTags
} from '../../audit/fixes.mjs'
import gfm from 'turndown-plugin-gfm'

const PLUGINS = [gfm.gfm]

test('escaping pipes removes the pipe finding and changes no other outcome', () => {
  const html = '<table><thead><tr><th>A</th><th>B</th></tr></thead>' +
    '<tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>'
  const result = verifyStrategy(html, escapeTablePipes, { plugins: PLUGINS })
  assert.equal(result.applied, true)
  assert.deepEqual(result.resolved, ['table-cell-content-changed'])
  assert.deepEqual(result.newFindings, [])
  assert.equal(result.after.high, 0)
  // The escape must appear in the emitted Markdown.
  assert.ok(result.markdown.includes('a\\|b'), 'expected an escaped pipe, got: ' + result.markdown)
})

test('the pre-without-code rule removes the collapse finding', () => {
  const html = '<pre>  indented\n    deeper</pre>'
  const result = verifyStrategy(html, preWithoutCode, { plugins: PLUGINS })
  assert.equal(result.applied, true)
  assert.deepEqual(result.resolved, ['preformatted-collapsed'])
  assert.ok(result.markdown.includes('```'), 'expected a fenced block')
})

test('fenced code style restores a declared language', () => {
  const html = '<pre><code class="language-js">const x = 1</code></pre>'
  const result = verifyStrategy(html, fencedCode, { plugins: PLUGINS })
  assert.equal(result.applied, true)
  assert.deepEqual(result.resolved, ['code-block-degraded'])
  assert.ok(result.markdown.includes('```js'))
})

test('keeping an inline semantic element resolves its flattening', () => {
  const html = '<p>E=mc<sup>2</sup></p>'
  const result = verifyStrategy(html, keepTags(['sup']), { plugins: PLUGINS })
  assert.equal(result.applied, true)
  assert.deepEqual(result.resolved, ['element-flattened'])
  assert.ok(result.markdown.includes('<sup>2</sup>'))
})

test('keeping media resolves an element that would otherwise vanish', () => {
  const html = '<iframe src="https://x.test"></iframe>'
  const result = verifyStrategy(html, keepTags(['iframe']), { plugins: PLUGINS })
  assert.equal(result.applied, true)
  assert.deepEqual(result.resolved, ['element-dropped'])
  assert.ok(result.markdown.includes('<iframe'))
})

test('a strategy that targets nothing present is reported as inapplicable, not as a fix', () => {
  const result = verifyStrategy('<p>plain</p>', escapeTablePipes, { plugins: PLUGINS })
  assert.equal(result.applied, false)
  assert.equal(result.reason, 'the baseline has no finding this strategy targets')
})

test('a strategy that cannot help keeps its finding and is not reported as effective', () => {
  // colspan has no GFM syntax, so no keep() strategy can resolve it
  const html = '<table><thead><tr><th colspan="2">H</th></tr></thead>' +
    '<tbody><tr><td>1</td><td>2</td></tr></tbody></table>'
  const result = verifyStrategy(html, keepTags(['sup']), { plugins: PLUGINS })
  assert.equal(result.applied, false)
})

test('suggestFixes separates effective from ineffective strategies', () => {
  const html = '<p>E=mc<sup>2</sup></p><iframe src="https://x.test"></iframe>'
  const { effective, ineffective, baseline } = suggestFixes(html, { plugins: PLUGINS })
  assert.ok(baseline.findings.length > 0)
  assert.ok(effective.length >= 1, 'expected at least one effective strategy')
  const ids = effective.map((e) => e.id)
  assert.ok(ids.includes('keep-sup-sub-mark-kbd-abbr-ins-del'),
    'expected the sup keep strategy to be effective: ' + ids.join(','))
  assert.ok(ids.includes('keep-iframe-video-audio-canvas-object-embed'))
  // Strategies that address neither finding are excluded entirely, not listed as failures.
  assert.ok(!ineffective.some((i) => i.id === 'escape-table-pipes'))
})

test('suggestFixes never reports a strategy the baseline did not need', () => {
  const { verified } = suggestFixes('<p>plain text</p>', { plugins: PLUGINS })
  assert.deepEqual(verified, [])
})

test('verified strategies never increase the number of notable findings', () => {
  const docs = [
    '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>a|b</td></tr></tbody></table>',
    '<pre>  indented</pre>',
    '<pre><code class="language-js">x</code></pre>',
    '<p>E=mc<sup>2</sup></p>',
    '<dl><dt>T</dt><dd>D</dd></dl>'
  ]
  for (const html of docs) {
    const { effective } = suggestFixes(html, { plugins: PLUGINS })
    for (const e of effective) {
      assert.ok(e.after.high + e.after.medium < e.before.high + e.before.medium,
        'strategy ' + e.id + ' did not reduce findings on ' + html)
    }
  }
})
