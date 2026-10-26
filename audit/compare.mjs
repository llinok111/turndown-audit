/**
 * Comparison engine: source inventory vs re-rendered inventory -> findings.
 *
 * Guiding rule: never report a finding that a Markdown renderer would not
 * actually change. Every finding below is derived from a difference measured on
 * the *rendered* document, so it holds for any reader that implements
 * CommonMark + GFM, not only for the toolchain used here.
 */

import { buildInventory } from './inventory.mjs'
import { parseFragment, multisetDiff, WATCHED_TAGS, canonicaliseTarget } from './dom.mjs'
import { describe, SEVERITY_ORDER } from './taxonomy.mjs'

/** Cap on how many representative tokens/offsets a single finding carries. */
const MAX_SAMPLES = 8

function finding (code, message, extra = {}) {
  const spec = describe(code)
  return {
    code,
    severity: spec.severity,
    kind: spec.kind,
    inherent: !!spec.inherent,
    title: spec.title,
    detail: spec.detail,
    docs: spec.docs,
    message,
    ...extra
  }
}

function sample (list, n = MAX_SAMPLES) {
  return list.slice(0, n)
}

/**
 * Text loss: tokens rendered in the source but not in the re-rendered output.
 * Only tokens of length >= 2, or CJK characters, are considered, so that a
 * dropped bracket from a differently-escaped construct is not mistaken for lost
 * content.
 */
function compareText (src, out) {
  const meaningful = (t) => t.length > 1 || /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/u.test(t)
  const missing = multisetDiff(src.tokens, out.tokens).filter((m) => meaningful(m.token))
  if (!missing.length) return []
  const shown = sample(missing)
  const rendered = shown.map((m) => '`' + m.token + '`' + (m.missing > 1 ? '×' + m.missing : '')).join(', ')
  return [finding(
    'text-loss',
    `${missing.length} rendered text token(s) from the source are absent from the converted output: ${rendered}`,
    { evidence: { missingTokens: shown, totalMissing: missing.length } }
  )]
}

/**
 * Elements that carry content but have no Markdown syntax.
 *
 * Three outcomes are distinguished, because they need different fixes:
 *   dropped   — the element is gone and nothing stands in for it (an iframe, a
 *               player, an embedded document). Keeping the HTML is the only
 *               faithful option.
 *   lost text — the element is gone and its visible text went with it.
 *   flattened — the text survived but the element that gave it meaning did not.
 */
function compareWatchedElements (src, out) {
  const findings = []
  for (const tag of WATCHED_TAGS) {
    const before = src.tagCounts[tag] || 0
    const after = out.tagCounts[tag] || 0
    if (before === 0 || after >= before) continue

    const delta = before - after
    const srcText = src.elements.filter((e) => e.tag === tag && e.hasText).map((e) => e.text)
    const outText = out.elements.filter((e) => e.tag === tag).map((e) => e.text)

    // No text anywhere in this element: its whole meaning was the element.
    if (srcText.length === 0) {
      findings.push(finding(
        'element-dropped',
        `${delta} <${tag.toLowerCase()}> element(s) removed with no textual substitute`,
        { evidence: { tag, missing: delta } }
      ))
      continue
    }

    const textSurvived = srcText.every((t) =>
      t.split(/\s+/).filter(Boolean).every((w) => out.text.includes(w)))

    if (!textSurvived) {
      findings.push(finding(
        'element-dropped',
        `${delta} <${tag.toLowerCase()}> element(s) removed along with their visible text`,
        { evidence: { tag, missing: delta, textSample: sample(srcText).join(' | ') } }
      ))
    } else {
      findings.push(finding(
        'element-flattened',
        `${delta} <${tag.toLowerCase()}> element(s) reduced to plain text`,
        { evidence: { tag, missing: delta, examples: sample(outText).slice(0, 3) } }
      ))
    }
  }
  return findings
}

/**
 * Cell content: a GFM table row is delimited by `|`, so a cell whose own text
 * contains an unescaped `|` is re-parsed as two cells and the text after the
 * pipe is pushed into the next column or clipped. The row keeps the same number
 * of cells, so a shape-only comparison cannot see this; comparing cell text per
 * position can.
 */
function compareCellContent (a, b, index) {
  if (a.hasSpan) return []
  const out = []
  const rows = Math.min(a.cellTexts.length, b.cellTexts.length)
  for (let r = 0; r < rows; r++) {
    const srcCells = a.cellTexts[r]
    const outCells = b.cellTexts[r]
    for (let c = 0; c < srcCells.length; c++) {
      const want = srcCells[c]
      const got = outCells[c]
      if (want === undefined || got === undefined) continue
      if (want === got) continue
      // Ignore pure whitespace differences: renderers normalise them freely.
      if (want.replace(/\s+/g, ' ').trim() === got.replace(/\s+/g, ' ').trim()) continue
      out.push({ row: r, column: c, source: want, output: got })
    }
  }
  if (!out.length) return []
  const first = out[0]
  return [finding(
    'table-cell-content-changed',
    `table #${index + 1} row ${first.row + 1} column ${first.column + 1} reads ${JSON.stringify(first.output)} in the output but was ${JSON.stringify(first.source)} in the source`,
    { evidence: { table: index + 1, cells: sample(out, 4) } }
  )]
}

/**
 * Table shape: the emitted table must have the same row count and the same
 * number of cells per row as the source, unless the source itself used merged
 * cells (which GFM cannot express).
 */
function compareTables (src, out) {
  const findings = []
  const n = Math.max(src.tables.length, out.tables.length)
  for (let i = 0; i < n; i++) {
    const a = src.tables[i]
    const b = out.tables[i]
    if (!a) continue
    if (!b) {
      findings.push(finding(
        'table-shape-changed',
        `table #${i + 1} is no longer a table after conversion`,
        { evidence: { table: i + 1, sourceRows: a.rowCount } }
      ))
      continue
    }
    if (a.hasSpan) {
      findings.push(finding(
        'table-span-flattened',
        `table #${i + 1} uses merged cells; GFM tables cannot express colspan/rowspan`,
        {
          evidence: {
            table: i + 1,
            sourceGridWidths: a.gridWidths,
            outputCellCounts: b.cellCounts
          }
        }
      ))
      // Still check that the cell *count* did not grow, which would indicate
      // cell content splitting a row (the pipe hazard). Compare against the
      // source grid width, since merged cells legitimately reduce cell count.
      const grown = b.cellCounts.length && b.cellCounts.some((c, idx) =>
        c > (a.cellCounts[idx] === undefined ? a.cellCounts[0] : a.cellCounts[idx]))
      if (grown) {
        findings.push(finding(
          'table-shape-changed',
          `table #${i + 1} gained cells in some row, so a cell's content is being parsed as extra columns`,
          { evidence: { table: i + 1, sourceCellCounts: a.cellCounts, outputCellCounts: b.cellCounts } }
        ))
      }
      continue
    }

    const rowsDiffer = a.rowCount !== b.rowCount
    const cellsDiffer = a.cellCounts.length !== b.cellCounts.length ||
      a.cellCounts.some((c, idx) => b.cellCounts[idx] !== c)

    if (rowsDiffer || cellsDiffer) {
      findings.push(finding(
        'table-shape-changed',
        `table #${i + 1} column count changed between source and output`,
        {
          evidence: {
            table: i + 1,
            sourceRows: a.rowCount,
            outputRows: b.rowCount,
            sourceCellCounts: a.cellCounts,
            outputCellCounts: b.cellCounts
          }
        }
      ))
    }

    findings.push(...compareCellContent(a, b, i))
  }
  return findings
}

/**
 * Literal text that turned into Markdown structure: the source had no heading /
 * list / blockquote there, but the output does.
 */
function compareInjectedStructure (src, out) {
  const findings = []
  const checks = [
    ['H1', 'heading'], ['H2', 'heading'], ['H3', 'heading'], ['H4', 'heading'],
    ['H5', 'heading'], ['H6', 'heading'], ['BLOCKQUOTE', 'blockquote'], ['HR', 'thematic break']
  ]
  for (const [tag, label] of checks) {
    const before = src.tagCounts[tag] || 0
    const after = out.tagCounts[tag] || 0
    if (after > before) {
      findings.push(finding(
        'markdown-injection',
        `output contains ${after - before} more ${label} element(s) than the source, so literal text was read as Markdown syntax`,
        { evidence: { construct: tag, source: before, output: after } }
      ))
    }
  }
  const srcListItems = (src.tagCounts.LI || 0)
  const outListItems = (out.tagCounts.LI || 0)
  if (outListItems > srcListItems) {
    findings.push(finding(
      'markdown-injection',
      `output contains ${outListItems - srcListItems} more list item(s) than the source, so literal text was read as Markdown syntax`,
      { evidence: { construct: 'LI', source: srcListItems, output: outListItems } }
    ))
  }
  return findings
}

/**
 * Alt text and link destinations: a changed target is a functional break, so it
 * is reported even though the visible text may be identical.
 */
function compareTargets (src, out) {
  const findings = []
  const sameImage = (a, b) =>
    canonicaliseTarget(a.src) === canonicaliseTarget(b.src) && a.alt === b.alt
  const changedImages = out.images.filter((x) => !src.images.some((s) => sameImage(s, x)))
  if (changedImages.length) {
    findings.push(finding(
      'image-target-changed',
      `${changedImages.length} image(s) in the output have a different src or alt than the source`,
      { evidence: { examples: sample(changedImages).map((c) => c.src) } }
    ))
  }

  const srcHrefs = new Set(src.links.map((x) => canonicaliseTarget(x.href)))
  const droppedLinks = [...srcHrefs].filter(
    (h) => !out.links.some((l) => canonicaliseTarget(l.href) === h))
  if (droppedLinks.length) {
    findings.push(finding(
      'image-target-changed',
      `${droppedLinks.length} link destination(s) from the source are absent from the output`,
      { evidence: { examples: sample(droppedLinks) } }
    ))
  }
  return findings
}

/** Heading depth and list outline. */
function compareOutline (src, out) {
  const findings = []
  const a = src.headings.map((h) => h.level).join(',')
  const b = out.headings.map((h) => h.level).join(',')
  if (a !== b) {
    findings.push(finding(
      'heading-level-changed',
      `heading depth sequence changed (source [${a || 'none'}] vs output [${b || 'none'}])`,
      { evidence: { source: src.headings.map((h) => h.level), output: out.headings.map((h) => h.level) } }
    ))
  }
  const sig = (l) => l.map((x) => (x.ordered ? 'ol' : 'ul') + ':' + x.items + ':' + x.maxDepth).join('|')
  if (sig(src.lists) !== sig(out.lists)) {
    findings.push(finding(
      'list-structure-changed',
      'list outline changed between source and output',
      { evidence: { source: sig(src.lists), output: sig(out.lists) } }
    ))
  }
  return findings
}

/**
 * Meaningful attributes: report only attributes whose element still exists, so
 * that an element-level drop is not reported twice. Attributes are compared one
 * by one, so a renderer adding an attribute (`alt=""` on an image that had no
 * alt) does not make the element's other attributes look lost.
 */
function compareAttributes (src, out) {
  const key = (a) => a.tag + ' ' + a.name + '=' + a.value
  const srcKeys = src.attributes.map(key)
  const outKeys = out.attributes.map(key)
  const survivingTags = new Set(out.attributes.map((a) => a.tag))
  const missing = multisetDiff(srcKeys, outKeys)
    .filter((m) => survivingTags.has(m.token.split(' ')[0]))
  if (!missing.length) return []
  return [finding(
    'attribute-dropped',
    `${missing.length} meaningful attribute(s) present in the source are absent from the output`,
    { evidence: { examples: sample(missing).map((m) => m.token) } }
  )]
}

/**
 * Code blocks: the language a fenced block declares is part of the document (it
 * drives highlighting and copy). An indented block cannot carry one, so
 * converting `codeBlockStyle: 'indented'` silently drops every declared
 * language.
 */
function compareCodeBlocks (src, out) {
  const findings = []
  const srcLangs = src.codeBlocks.map((b) => b.language).filter(Boolean)
  if (srcLangs.length === 0) return findings
  const outLangs = out.codeBlocks.map((b) => b.language).filter(Boolean)
  const missing = multisetDiff(srcLangs, outLangs)
  if (missing.length) {
    findings.push(finding(
      'code-block-degraded',
      `${missing.length} code block language(s) declared in the source are absent from the output`,
      {
        evidence: {
          examples: sample(missing).map((m) => m.token),
          hint: 'an indented code block cannot carry a language; use codeBlockStyle: "fenced"'
        }
      }
    ))
  }
  return findings
}

/**
 * Preformatted blocks whose formatting was lost.
 *
 * turndown's code-block rules both require the <pre> to have a <code> first
 * child. A <pre> without one matches neither rule, so its text is emitted as
 * ordinary content: indentation is stripped, blank lines collapse, and the text
 * can then be re-read as Markdown structure.
 *
 * Blocks are matched individually by their collapsed text rather than by
 * comparing how many <pre> elements survived overall. A count comparison is
 * wrong: the re-rendered Markdown can contain a <pre> that came from an indented
 * code block elsewhere, which would mask the loss of the original block.
 */
function comparePreformatted (src, out) {
  const findings = []
  const risky = src.codeBlocks.filter(
    (b) => !b.hasCodeChild && (b.hasLeadingIndent || b.hasBlankLine)
  )
  if (!risky.length) return findings

  const collapse = (s) => String(s).replace(/\s+/g, ' ').trim()
  const outputBlocks = out.codeBlocks.map((b) => collapse(b.rawText))

  const lost = risky.filter((b) => {
    const want = collapse(b.rawText)
    if (!want) return false
    return !outputBlocks.some((got) => got === want)
  })
  if (!lost.length) return findings

  findings.push(finding(
    'preformatted-collapsed',
    `${lost.length} preformatted block(s) have no <code> child, so neither code-block rule applies: indentation and blank lines were not preserved`,
    {
      evidence: {
        affected: lost.length,
        reason: 'both code-block rules require the <pre> element to have a <code> first child',
        examples: sample(lost).map((b) => collapse(b.rawText).slice(0, 80)),
        hint: 'wrap the content in <code>, or add a custom rule for PRE without a CODE child'
      }
    }
  ))
  return findings
}

/**
 * Run every comparator.
 * @param {Element} srcRoot
 * @param {Element} outRoot
 */
export function compareInventories (srcRoot, outRoot) {
  const src = buildInventory(srcRoot)
  const out = buildInventory(outRoot)

  const findings = [
    ...compareText(src, out),
    ...compareWatchedElements(src, out),
    ...compareTables(src, out),
    ...compareCodeBlocks(src, out),
    ...comparePreformatted(src, out),
    ...compareInjectedStructure(src, out),
    ...compareTargets(src, out),
    ...compareOutline(src, out),
    ...compareAttributes(src, out)
  ]

  findings.sort((x, y) => SEVERITY_ORDER[y.severity] - SEVERITY_ORDER[x.severity])
  return { findings, source: src, output: out }
}

export { parseFragment }
