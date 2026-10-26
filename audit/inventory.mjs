/**
 * Structural inventory of an HTML document.
 *
 * The audit never compares Markdown strings directly: converter style choices
 * (setext vs atx headings, `*` vs `-` bullets, indented vs fenced code) are not
 * losses. Instead both the source HTML and the *re-rendered* Markdown are
 * reduced to this inventory, and only differences between the two inventories
 * become findings. Anything the converter is free to choose disappears in the
 * reduction; only semantic change survives.
 */

import {
  eachElement, visibleText, tokenise, MEANINGFUL_ATTRIBUTES, canonicalAttributeValue, isInvisible
} from './dom.mjs'

/**
 * One entry per meaningful attribute.
 *
 * Attributes are recorded individually rather than as one joined signature per
 * element. A joined signature makes an *added* attribute (a renderer adding
 * `alt=""` to an image that had none) change the whole string, which would make
 * the element's other attributes look like they had disappeared.
 */
function attributeEntries (el) {
  const entries = []
  for (const name of Array.from(el.attributes || [])) {
    const lower = name.name.toLowerCase()
    if (!MEANINGFUL_ATTRIBUTES.has(lower)) continue
    entries.push({
      tag: el.nodeName,
      name: lower,
      value: canonicalAttributeValue(lower, name.value)
    })
  }
  return entries
}

/** Grid width a table row occupies, honouring colspan. */
function rowGridWidth (tr) {
  let width = 0
  for (const cell of Array.from(tr.children)) {
    if (cell.nodeName !== 'TD' && cell.nodeName !== 'TH') continue
    const span = parseInt(cell.getAttribute('colspan') || '1', 10)
    width += Number.isFinite(span) && span > 0 ? span : 1
  }
  return width
}

function hasSpan (table) {
  let found = false
  eachElement(table, (el) => {
    if (el.nodeName !== 'TD' && el.nodeName !== 'TH') return
    const c = parseInt(el.getAttribute('colspan') || '1', 10)
    const r = parseInt(el.getAttribute('rowspan') || '1', 10)
    if (c > 1 || r > 1) found = true
  })
  return found
}

function describeTable (table) {
  const rows = Array.from(table.querySelectorAll('tr')).filter(
    (tr) => Array.from(tr.children).some((c) => c.nodeName === 'TD' || c.nodeName === 'TH')
  )
  const cellsOf = (tr) =>
    Array.from(tr.children).filter((c) => c.nodeName === 'TD' || c.nodeName === 'TH')

  const cellCounts = rows.map((tr) => cellsOf(tr).length)
  const gridWidths = rows.map(rowGridWidth)
  const cellTexts = rows.map((tr) => cellsOf(tr).map((c) => visibleText(c)))
  const cellSpans = rows.map((tr) => cellsOf(tr).map((c) => ({
    col: parseInt(c.getAttribute('colspan') || '1', 10) || 1,
    row: parseInt(c.getAttribute('rowspan') || '1', 10) || 1
  })))
  const headerRow = rows[0]
  return {
    rowCount: rows.length,
    cellCounts,
    gridWidths,
    cellTexts,
    cellSpans,
    hasSpan: hasSpan(table),
    headerCellCount: cellCounts.length ? cellCounts[0] : 0,
    headerGridWidth: gridWidths.length ? gridWidths[0] : 0,
    hasHeaderCells: headerRow
      ? Array.from(headerRow.children).some((c) => c.nodeName === 'TH')
      : false
  }
}

/**
 * Build an inventory from the wrapper element produced by parseFragment().
 * @param {Element} root
 */
export function buildInventory (root) {
  const inv = {
    text: '',
    tokens: [],
    tagCounts: Object.create(null),
    attributes: [],
    headings: [],
    tables: [],
    lists: [],
    links: [],
    images: [],
    codeBlocks: [],
    elements: []
  }

  inv.text = visibleText(root)
  inv.tokens = tokenise(inv.text)

  eachElement(root, (el) => {
    const tag = el.nodeName
    inv.tagCounts[tag] = (inv.tagCounts[tag] || 0) + 1

    inv.attributes.push(...attributeEntries(el))

    if (/^H[1-6]$/.test(tag)) {
      inv.headings.push({ level: Number(tag[1]), text: '' }) // text filled below
    }
    if (tag === 'A') {
      const href = el.getAttribute('href')
      if (href !== null) inv.links.push({ href: href.trim(), text: '' })
    }
    if (tag === 'IMG') {
      inv.images.push({
        src: (el.getAttribute('src') || '').trim(),
        alt: (el.getAttribute('alt') || '').trim()
      })
    }
    if (tag === 'PRE') {
      const code = el.querySelector('code')
      const cls = code ? (code.getAttribute('class') || '') : (el.getAttribute('class') || '')
      const m = /language-([\w-]+)/.exec(cls)
      // The raw text, before the whitespace collapse turndown applies, so that
      // a lost indentation is measurable.
      inv.codeBlocks.push({
        language: m ? m[1] : '',
        hasCodeChild: !!code,
        rawText: el.textContent,
        hasLeadingIndent: /^[ \t]/.test(el.textContent),
        hasBlankLine: /\n[ \t]*\n/.test(el.textContent)
      })
    }
    inv.elements.push({
      tag,
      text: visibleText(el),
      hasText: visibleText(el).length > 0
    })
  })

  // Second pass: text-bearing details need their own subtree text.
  let hi = 0; let li = 0
  eachElement(root, (el) => {
    if (/^H[1-6]$/.test(el.nodeName)) {
      inv.headings[hi++].text = visibleText(el)
    }
    if (el.nodeName === 'A' && el.getAttribute('href') !== null) {
      inv.links[li++].text = visibleText(el)
    }
  })

  // Tables are collected at top level only (a nested table is reported as part
  // of its parent cell's text, which keeps the shape comparison unambiguous).
  const tables = Array.from(root.querySelectorAll('table'))
  inv.tables = tables
    .filter((t) => !t.parentElement.closest('table'))
    .map(describeTable)

  // List outline: item counts and nesting depth per list.
  eachElement(root, (el) => {
    if (el.nodeName !== 'UL' && el.nodeName !== 'OL') return
    if (el.parentElement && el.parentElement.closest('ul,ol')) return
    let items = 0
    let maxDepth = 0
    const walk = (list, depth) => {
      maxDepth = Math.max(maxDepth, depth)
      for (const child of Array.from(list.children)) {
        if (child.nodeName !== 'LI') continue
        items++
        for (const sub of Array.from(child.children)) {
          if (sub.nodeName === 'UL' || sub.nodeName === 'OL') walk(sub, depth + 1)
        }
      }
    }
    walk(el, 1)
    inv.lists.push({ ordered: el.nodeName === 'OL', items, maxDepth })
  })

  return inv
}

/** Count of elements carrying a given tag. */
export function countTag (inv, tag) {
  return inv.tagCounts[tag] || 0
}
