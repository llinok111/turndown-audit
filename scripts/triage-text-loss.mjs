/**
 * Triage: print every text-loss finding from a corpus with the surrounding
 * source context, so each one can be judged by hand. A text-loss finding is
 * only trustworthy if a human can confirm it; this script exists to make that
 * confirmation cheap.
 *
 *   node scripts/triage-text-loss.mjs <dir> [maxPerFile]
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

const dir = process.argv[2]
if (!dir) {
  console.error('usage: node scripts/triage-text-loss.mjs <dir>')
  process.exit(2)
}

const files = collect(dir)
const seen = new Map()

for (const file of files) {
  const html = readFileSync(file, 'utf8')
  const report = audit(html, { plugins: [gfm.gfm] })
  for (const f of report.findings) {
    if (f.code !== 'text-loss') continue
    for (const t of f.evidence.missingTokens) {
      const token = t.token
      if (!seen.has(token)) {
        // Locate the token in the source to show why it was lost.
        const idx = html.indexOf(token)
        const context = idx >= 0
          ? html.slice(Math.max(0, idx - 90), idx + token.length + 40).replace(/\s+/g, ' ')
          : '(not found verbatim; entity-encoded?)'
        seen.set(token, { file, context })
      }
    }
  }
}

console.log('distinct missing tokens across the corpus:', seen.size)
function classify (token, context) {
  // A URL whose path contains an underscore: turndown escapes the underscore and
  // the GFM autolink literal keeps the backslash.
  if (/https?:\/\//.test(context) && token.includes('_')) return 'escaped underscore inside a URL'
  if (/\[link:/.test(context)) return 'three.js [link:...] macro'
  if (/^[A-Za-z]+_[A-Za-z]+$/.test(token)) return 'identifier with underscore'
  return 'other'
}
const groups = new Map()
for (const [token, info] of seen) {
  const kind = classify(token, info.context)
  const g = groups.get(kind) || []
  g.push({ token, ...info })
  groups.set(kind, g)
}
for (const [kind, items] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  console.log('\n[' + kind + '] ' + items.length + ' token(s)')
  for (const it of items.slice(0, 6)) {
    console.log('  token: ' + JSON.stringify(it.token))
    console.log('  ctx  : ' + it.context.slice(0, 150))
  }
  if (items.length > 6) console.log('  … and ' + (items.length - 6) + ' more')
}
