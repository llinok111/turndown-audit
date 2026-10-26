/**
 * Real-world false-positive review.
 *
 * Synthetic corpora prove the detectors fire. They do not prove the audit is
 * quiet on documents that are actually fine. This script audits every HTML file
 * it is given and prints the findings grouped by code, so the rate can be
 * inspected by hand rather than asserted.
 *
 *   node scripts/review.mjs <file-or-dir> [...]
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { audit } from '../audit/index.mjs'
import gfm from 'turndown-plugin-gfm'

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
  console.error('usage: node scripts/review.mjs <file-or-dir> [...]')
  process.exit(2)
}

const files = targets.flatMap((t) => collect(t))
if (!files.length) {
  console.error('no .html files found in the given paths')
  process.exit(2)
}

const byCode = new Map()
let cleanDocs = 0
let failingDocs = 0
const perDoc = []

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  let report
  try {
    report = audit(html, { plugins: [gfm.gfm] })
  } catch (err) {
    perDoc.push({ file, error: err.message })
    continue
  }
  const notable = report.findings.filter((f) => f.severity !== 'low')
  if (notable.length) {
    failingDocs++
    perDoc.push({ file, codes: notable.map((f) => f.code) })
    for (const f of notable) {
      const entry = byCode.get(f.code) || { code: f.code, severity: f.severity, count: 0, files: [] }
      entry.count++
      if (entry.files.length < 5) entry.files.push(file)
      byCode.set(f.code, entry)
    }
  } else {
    cleanDocs++
  }
}

console.log(`audited ${files.length} file(s): ${cleanDocs} clean, ${failingDocs} with medium/high findings\n`)
const rows = [...byCode.values()].sort((a, b) => b.count - a.count)
for (const r of rows) {
  console.log(`  ${r.severity.padEnd(7)} ${String(r.count).padStart(4)}  ${r.code}`)
  for (const f of r.files) console.log(`             ${f}`)
}
if (!rows.length) console.log('  (no findings)')
