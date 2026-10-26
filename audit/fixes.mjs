/**
 * Fix strategies.
 *
 * A finding without a remedy is only half a tool. Each strategy here is
 * *verified before it is reported*: the HTML is re-converted with the strategy
 * applied, the result is audited again, and the strategy is only reported as
 * effective if the targeted finding actually disappears without introducing a
 * new medium/high finding. An unverified suggestion is never emitted.
 *
 * Strategies build a new conversion configuration; they never mutate the
 * service the caller passed in, and nothing here changes turndown's source.
 */

import { audit } from './index.mjs'
import { parseFragment } from './dom.mjs'
import { compareInventories } from './compare.mjs'
import { markdownToHtml, loadTurndown } from './roundtrip.mjs'

/** Escape `|` inside table cells so a cell's own text cannot split its row. */
export const escapeTablePipes = {
  id: 'escape-table-pipes',
  appliesTo: ['table-cell-content-changed'],
  description: 'escape `|` inside table cell text so a cell cannot split its row',
  configure (service) {
    service.addRule('auditEscapeTablePipes', {
      filter: ['th', 'td'],
      replacement (content, node) {
        const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node)
        const prefix = index === 0 ? '| ' : ' '
        return prefix + content.replace(/\|/g, '\\|') + ' |'
      }
    })
  }
}

/** Treat a <pre> with no <code> child as a code block instead of losing it. */
export const preWithoutCode = {
  id: 'pre-without-code-is-a-code-block',
  appliesTo: ['preformatted-collapsed'],
  description: 'treat a <pre> that has no <code> child as a code block',
  configure (service) {
    service.addRule('auditPreWithoutCode', {
      filter (node) {
        return node.nodeName === 'PRE' && !node.querySelector('code')
      },
      replacement (content, node) {
        const text = node.textContent.replace(/\n$/, '')
        return '\n\n```\n' + text + '\n```\n\n'
      }
    })
  }
}

/** Emit fenced code blocks so a declared language survives. */
export const fencedCode = {
  id: 'code-block-style-fenced',
  appliesTo: ['code-block-degraded'],
  description: 'use fenced code blocks (codeBlockStyle: "fenced") so a declared language is preserved',
  options: { codeBlockStyle: 'fenced' }
}

/** Keep tags that Markdown cannot express as raw HTML. */
export function keepTags (tags) {
  return {
    id: 'keep-' + tags.join('-'),
    appliesTo: ['element-dropped', 'element-flattened', 'attribute-dropped'],
    description: 'preserve <' + tags.join('>, <') + '> as raw HTML with keep()',
    configure (service) {
      service.keep(tags)
    }
  }
}

/** All built-in strategies, in the order they are tried. */
export const STRATEGIES = [
  escapeTablePipes,
  preWithoutCode,
  fencedCode,
  keepTags(['sup', 'sub', 'mark', 'kbd', 'abbr', 'ins', 'del']),
  keepTags(['iframe', 'video', 'audio', 'canvas', 'object', 'embed']),
  keepTags(['dl', 'dt', 'dd', 'details', 'summary', 'figure', 'figcaption'])
]

function serviceFor (TurndownService, plugins, strategy) {
  const service = new TurndownService(strategy.options || {})
  for (const plugin of plugins || []) service.use(plugin)
  if (strategy.configure) strategy.configure(service)
  return service
}

/**
 * Verify one strategy against one document.
 *
 * @param {string} html
 * @param {object} strategy
 * @param {{plugins?: Function[], TurndownService?: Function}} [context]
 * @returns {object} verification record
 */
export function verifyStrategy (html, strategy, context = {}) {
  const plugins = context.plugins || []
  const TurndownService = context.TurndownService || loadTurndown()
  const baseline = audit(html, { plugins })

  const targeted = baseline.findings.filter((f) => strategy.appliesTo.includes(f.code))
  if (!targeted.length) {
    return {
      id: strategy.id,
      description: strategy.description,
      applied: false,
      reason: 'the baseline has no finding this strategy targets',
      before: baseline.counts,
      after: baseline.counts
    }
  }

  const markdown = serviceFor(TurndownService, plugins, strategy).turndown(html)

  // Re-audit the variant output through the same comparison the main audit uses,
  // so "did it help" is measured, not asserted.
  const after = compareInventories(parseFragment(html), parseFragment(markdownToHtml(markdown)))
  const counts = { high: 0, medium: 0, low: 0, total: after.findings.length }
  for (const f of after.findings) counts[f.severity]++

  const beforeNotable = baseline.counts.high + baseline.counts.medium
  const afterNotable = counts.high + counts.medium

  const resolved = strategy.appliesTo.filter(
    (code) => baseline.findings.some((f) => f.code === code) &&
      !after.findings.some((f) => f.code === code)
  )
  const surviving = strategy.appliesTo.filter(
    (code) => after.findings.some((f) => f.code === code)
  )
  const baselineCodes = new Set(baseline.findings.map((f) => f.code))
  const newFindings = [...new Set(
    after.findings.map((f) => f.code).filter((c) => !baselineCodes.has(c))
  )]

  return {
    id: strategy.id,
    description: strategy.description,
    applied: resolved.length > 0 && afterNotable < beforeNotable && newFindings.length === 0,
    resolved,
    surviving,
    newFindings,
    before: baseline.counts,
    after: counts,
    markdown
  }
}

/**
 * Verify every strategy that targets any finding present in the document, and
 * return only the ones that measurably helped.
 *
 * @param {string} html
 * @param {{plugins?: Function[], TurndownService?: Function, strategies?: object[]}} [context]
 */
export function suggestFixes (html, context = {}) {
  const plugins = context.plugins || []
  const strategies = context.strategies || STRATEGIES
  const baseline = audit(html, { plugins })
  const present = new Set(baseline.findings.map((f) => f.code))

  const relevant = strategies.filter((s) => s.appliesTo.some((c) => present.has(c)))
  const verified = relevant.map((s) => verifyStrategy(html, s, { ...context, plugins }))

  return {
    baseline,
    verified,
    effective: verified.filter((v) => v.applied),
    ineffective: verified.filter((v) => !v.applied)
  }
}
