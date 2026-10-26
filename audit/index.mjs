/**
 * turndown-audit public API.
 *
 * Usage:
 *   import { audit } from 'turndown-audit'
 *   const report = audit('<table>...</table>')
 *
 * The audit never mutates the document it is given, and it never changes what
 * turndown emits: it converts, renders the result back with an independent
 * CommonMark+GFM implementation, and reports the difference.
 */

import { parseFragment } from './dom.mjs'
import { roundTrip } from './roundtrip.mjs'
import { compareInventories } from './compare.mjs'
import { SEVERITY_ORDER } from './taxonomy.mjs'

export { markdownToHtml, createService, loadTurndown, useTurndown } from './roundtrip.mjs'
export { FINDINGS, describe } from './taxonomy.mjs'
// Fix strategies live in ./fixes.mjs and are imported from there directly, so
// that the module graph stays acyclic (fixes.mjs depends on this one).

/**
 * @typedef {object} AuditOptions
 * @property {string[]} [keepTags]  tags to preserve as raw HTML (turndown's keep())
 * @property {Function[]} [plugins] turndown plugins to install (e.g. gfm)
 * @property {object} [turndownOptions] options passed to the TurndownService
 */

/**
 * @typedef {object} AuditReport
 * @property {string} markdown   the Markdown turndown produced
 * @property {string} rerendered the Markdown rendered back to HTML independently
 * @property {object[]} findings ordered by severity, worst first
 * @property {object} counts     { high, medium, low, total }
 * @property {boolean} clean     true when no findings of medium or high severity
 * @property {object} [inventories] source/output inventories when statistic:true
 */

/**
 * Audit one HTML document.
 *
 * @param {string} html
 * @param {AuditOptions & {statistics?: boolean}} [options]
 * @returns {AuditReport}
 */
export function audit (html, options = {}) {
  if (typeof html !== 'string') {
    throw new TypeError('audit() expects an HTML string, received ' + typeof html)
  }

  const { markdown, rerendered } = roundTrip(html, {
    keepTags: options.keepTags,
    plugins: options.plugins,
    options: options.turndownOptions
  })

  const srcRoot = parseFragment(html)
  const outRoot = parseFragment(rerendered)
  const { findings, source, output } = compareInventories(srcRoot, outRoot)

  const counts = { high: 0, medium: 0, low: 0, total: findings.length }
  for (const f of findings) counts[f.severity] = (counts[f.severity] || 0) + 1

  const report = {
    markdown,
    rerendered,
    findings,
    counts,
    clean: counts.high === 0 && counts.medium === 0
  }
  if (options.statistics) report.inventories = { source, output }
  return report
}

/**
 * Audit many documents and aggregate the findings by code.
 * @param {Array<{name: string, html: string}>} documents
 * @param {AuditOptions} [options]
 */
export function auditAll (documents, options = {}) {
  const perDocument = documents.map((doc) => ({
    name: doc.name,
    report: audit(doc.html, options)
  }))
  const byCode = new Map()
  for (const { report } of perDocument) {
    for (const f of report.findings) {
      const entry = byCode.get(f.code) || { code: f.code, severity: f.severity, documents: 0, occurrences: 0 }
      entry.documents += 1
      entry.occurrences += 1
      byCode.set(f.code, entry)
    }
  }
  const summary = [...byCode.values()].sort(
    (a, b) => SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] || b.documents - a.documents
  )
  return {
    documents: perDocument,
    summary,
    counts: {
      documents: documents.length,
      withFindings: perDocument.filter((d) => d.report.findings.length).length
    }
  }
}
