/**
 * Evidence: the audit run over a real documentation corpus.
 *
 * Synthetic cases prove the detectors work. This script proves the audit is
 * usable on documents nobody wrote for it, and prints the numbers so the claim
 * can be checked rather than trusted.
 *
 *   node scripts/corpus.mjs <dir> [...]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, basename } from 'node:path'
import { audit } from '../audit/index.mjs'
import { suggestFixes } from '../audit/fixes.mjs'
import gfm from 'turndown-plugin-gfm'

const PLUGINS = [gfm.gfm]

function collect (target, out = []) {
  const st = statSync(target)
  if (st.isFile()) {
    if (extname(target).toLowerCase() === '.html') out.push(target)
    return out
  }
  for (const entry of readdirSync(target)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue
    collect(join(target, entry), out)
  }
  return out
}

const targets = process.argv.slice(2)
if (!targets.length) {
  console.error('usage: node scripts/corpus.mjs <dir-or-file> [...]')
  process.exit(2)
}

const files = targets.flatMap((t) => collect(t))
if (!files.length) {
  console.error('no .html files found')
  process.exit(2)
}

let clean = 0
let withFindings = 0
let totalHigh = 0
let totalMedium = 0
const byCode = new Map()
const resolvable = []
const inherentOnly = []

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const report = audit(html, { plugins: PLUGINS })
  const notable = report.findings.filter((f) => f.severity !== 'low')

  if (!notable.length) { clean++; continue }
  withFindings++
  totalHigh += report.counts.high
  totalMedium += report.counts.medium

  for (const f of notable) {
    const e = byCode.get(f.code) || { code: f.code, severity: f.severity, count: 0, inherent: f.inherent }
    e.count++
    byCode.set(f.code, e)
  }

  const inherent = notable.every((f) => f.inherent)
  if (inherent) inherentOnly.push(basename(file))

  const { effective } = suggestFixes(html, { plugins: PLUGINS })
  if (effective.length) {
    resolvable.push({
      file: basename(file),
      strategies: effective.map((s) => s.id),
      before: effective[0].before,
      best: effective.reduce((acc, s) =>
        (s.after.high + s.after.medium) < (acc.after.high + acc.after.medium) ? s : acc)
    })
  }
}

console.log('corpus:', files.length, 'file(s)')
console.log('  clean                        :', clean)
console.log('  with medium/high findings    :', withFindings)
console.log('  findings                     :', totalHigh, 'high,', totalMedium, 'medium')
console.log()
console.log('by code:')
for (const e of [...byCode.values()].sort((a, b) => b.count - a.count)) {
  console.log('  ' + e.severity.padEnd(7) + String(e.count).padStart(4) + '  ' + e.code +
    (e.inherent ? '  (inherent: no Markdown syntax)' : ''))
}
console.log()
console.log('documents whose findings are all inherent (not fixable by config):', inherentOnly.length)

console.log('\ndocuments where a verified strategy reduces the findings:')
for (const r of resolvable.slice(0, 12)) {
  const b = r.best
  console.log('  ' + r.file.padEnd(34) +
    ' ' + b.before.high + 'h/' + b.before.medium + 'm → ' + b.after.high + 'h/' + b.after.medium + 'm' +
    '  via ' + r.strategies.join(', '))
}
if (resolvable.length > 12) console.log('  … and ' + (resolvable.length - 12) + ' more')
