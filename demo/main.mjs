/**
 * Browser entry for the demo page.
 *
 * The bundle supplies turndown directly instead of resolving it through
 * require(), so the same audit code runs in the browser and in Node.
 */

import TurndownService from '../lib/turndown.cjs.js'
import { gfm } from 'turndown-plugin-gfm'
import { audit, useTurndown } from '../audit/index.mjs'
import { suggestFixes } from '../audit/fixes.mjs'

useTurndown(TurndownService)

const PLUGINS = [gfm]

const SAMPLE = `<h1>Release notes</h1>
<p>Version 2.0 ships <abbr title="Application Programming Interface">API</abbr> changes.</p>
<table>
  <thead><tr><th>Plan</th><th colspan="2">Limits</th></tr></thead>
  <tbody><tr><td>Free</td><td>10 req/s</td><td>20 burst</td></tr></tbody>
</table>
<table>
  <thead><tr><th>Command</th><th>Meaning</th></tr></thead>
  <tbody><tr><td>a|b</td><td>pipe in a cell</td></tr></tbody>
</table>
<pre><code class="language-js">const x = 1</code></pre>
<pre>  preformatted
      without a code child</pre>
<p>Water is H<sub>2</sub>O and E=mc<sup>2</sup>.</p>
<iframe src="https://example.test/embed" title="Live demo"></iframe>`

const $ = (id) => document.getElementById(id)

function render (html) {
  const report = audit(html, { plugins: PLUGINS })
  const { effective } = suggestFixes(html, { plugins: PLUGINS })

  $('markdown').textContent = report.markdown
  $('rerendered').innerHTML = report.rerendered

  const list = $('findings')
  list.innerHTML = ''
  if (!report.findings.length) {
    list.innerHTML = '<li class="none">No findings: this conversion kept everything.</li>'
  }
  for (const f of report.findings) {
    const li = document.createElement('li')
    li.className = 'finding sev-' + f.severity
    const head = document.createElement('div')
    head.className = 'finding-head'
    head.innerHTML = '<span class="sev">' + f.severity + '</span>' +
      '<code class="code">' + f.code + '</code>' +
      (f.inherent ? '<span class="tag">no Markdown syntax</span>' : '')
    const msg = document.createElement('p')
    msg.className = 'finding-msg'
    msg.textContent = f.message
    li.appendChild(head)
    li.appendChild(msg)
    if (f.evidence) {
      const ev = document.createElement('pre')
      ev.className = 'evidence'
      ev.textContent = JSON.stringify(f.evidence, null, 2)
      li.appendChild(ev)
    }
    list.appendChild(li)
  }

  const fixes = $('fixes')
  fixes.innerHTML = ''
  if (!effective.length) {
    fixes.innerHTML = '<li class="none">No verified fix applies to this document.</li>'
  }
  for (const f of effective) {
    const li = document.createElement('li')
    li.className = 'fix'
    li.innerHTML = '<code>' + f.id + '</code> — ' + f.description +
      '<span class="delta">' + f.before.high + 'h/' + f.before.medium + 'm → ' +
      f.after.high + 'h/' + f.after.medium + 'm</span>'
    fixes.appendChild(li)
  }

  $('counts').textContent = report.counts.total === 0
    ? 'clean'
    : report.counts.high + ' high, ' + report.counts.medium + ' medium, ' + report.counts.low + ' low'
}

$('input').value = SAMPLE
$('run').addEventListener('click', () => render($('input').value))
$('reset').addEventListener('click', () => {
  $('input').value = SAMPLE
  render(SAMPLE)
})
render(SAMPLE)
