/**
 * DOM helpers shared by the inventory and comparison stages.
 *
 * The audit deliberately parses HTML with the *same* engine turndown uses
 * (@mixmark-io/domino) and with the same wrapper element turndown uses, so that
 * a difference found by the audit cannot be blamed on a parser mismatch between
 * the two sides of the comparison.
 */

import { parseDocument } from './env.mjs'

// turndown wraps input in this custom element so that stray elements such as a
// bare <td> are not silently relocated by the HTML parser (src/root-node.js).
export const ROOT_ID = 'turndown-root'

const ROOT_OPEN = '<x-turndown id="' + ROOT_ID + '">'
const ROOT_CLOSE = '</x-turndown>'

/**
 * Parse an HTML fragment into a detached DOM tree.
 *
 * The parser is chosen by environment (native DOMParser in a browser, domino in
 * Node) so that the audit always sees the HTML the way the surrounding platform
 * does.
 *
 * @param {string} html
 * @returns {Element} the wrapper element holding the fragment
 */
export function parseFragment (html) {
  const doc = parseDocument(ROOT_OPEN + String(html) + ROOT_CLOSE)
  return doc.getElementById(ROOT_ID)
}

/** Elements whose text is not rendered to a reader. */
const INVISIBLE = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'HEAD', 'TITLE', 'NOSCRIPT'])

/**
 * True when a node (or an ancestor) never contributes rendered text.
 * @param {Node} node
 */
export function isInvisible (node) {
  let cur = node
  while (cur && cur.nodeName) {
    if (INVISIBLE.has(cur.nodeName)) return true
    cur = cur.parentNode
  }
  return false
}

/** Tags that begin a new rendered line, so their text must not be glued to a neighbour. */
const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BODY', 'DD', 'DETAILS', 'DIALOG',
  'DIV', 'DL', 'DT', 'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HGROUP', 'HR', 'LI', 'MAIN',
  'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TBODY', 'TD',
  'TFOOT', 'TH', 'THEAD', 'TR', 'UL', 'CAPTION'
])

/**
 * Collapse whitespace the way a renderer would: runs of whitespace inside a
 * text run become a single space.
 * @param {string} text
 */
export function normaliseWhitespace (text) {
  return String(text).replace(/\s+/g, ' ')
}

/**
 * Tokenise a string into comparable units.
 *
 * Words stay whole so that "revenue" is one token; CJK characters are split
 * individually because they are not space-delimited and a whole-sentence token
 * would hide a single missing character. Punctuation becomes its own token so
 * that a dropped colon is visible.
 *
 * @param {string} text
 * @returns {string[]}
 */
export function tokenise (text) {
  const out = []
  const re = /[A-Za-z0-9_]+|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]|[^\s]/gu
  let m
  while ((m = re.exec(text)) !== null) out.push(m[0])
  return out
}

/**
 * Multiset difference: tokens present in `a` but not enough times in `b`.
 * @param {string[]} a
 * @param {string[]} b
 * @returns {{token: string, missing: number}[]}
 */
export function multisetDiff (a, b) {
  const pool = new Map()
  for (const t of b) pool.set(t, (pool.get(t) || 0) + 1)
  const missing = new Map()
  for (const t of a) {
    const n = pool.get(t) || 0
    if (n > 0) {
      pool.set(t, n - 1)
    } else {
      missing.set(t, (missing.get(t) || 0) + 1)
    }
  }
  return [...missing.entries()].map(([token, count]) => ({ token, missing: count }))
}

/** Attribute names that carry reader-facing meaning into Markdown. */
export const MEANINGFUL_ATTRIBUTES = new Set([
  'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'lang', 'datetime',
  'cite', 'start', 'value', 'abbr', 'scope', 'headers'
])

/** Attributes whose value is a URL and may legitimately be percent-encoded. */
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite'])

/**
 * Canonicalise a URL-ish value for comparison.
 *
 * A Markdown renderer is free to percent-encode a link destination; it must,
 * for a destination containing a space. Percent-encoding is a normalisation,
 * not a change of target, so both sides of a comparison are decoded first.
 * Without this every destination containing a space would look like a change.
 *
 * @param {string} value
 */
export function canonicaliseTarget (value) {
  const raw = String(value === null || value === undefined ? '' : value).trim()
  if (!raw) return ''
  try {
    return decodeURIComponent(raw)
  } catch (err) {
    // A lone '%' or an invalid sequence cannot be decoded; compare literally.
    return raw
  }
}

/**
 * Canonicalised form of one attribute, used for both URL targets and the rest.
 * @param {string} name
 * @param {string} value
 */
export function canonicalAttributeValue (name, value) {
  return URL_ATTRIBUTES.has(String(name).toLowerCase())
    ? canonicaliseTarget(value)
    : String(value).trim()
}

/** Tags tracked for drop/flatten detection. */
export const WATCHED_TAGS = new Set([
  'SUP', 'SUB', 'MARK', 'KBD', 'ABBR', 'INS', 'DEL', 'S', 'U',
  'DETAILS', 'SUMMARY', 'FIGURE', 'FIGCAPTION', 'DL', 'DT', 'DD',
  'IFRAME', 'VIDEO', 'AUDIO', 'CANVAS', 'OBJECT', 'EMBED', 'SVG',
  'TIME', 'METER', 'PROGRESS', 'DATA', 'BDI', 'BDO', 'RUBY', 'RT', 'RP',
  'PICTURE', 'SOURCE', 'TRACK', 'MAP', 'AREA', 'DIALOG', 'OUTPUT'
])

/**
 * Depth-first walk over the wrapper, skipping invisible subtrees.
 * @param {Element} root
 * @param {(node: Element) => void} visit
 */
export function eachElement (root, visit) {
  for (const child of Array.from(root.children)) {
    if (isInvisible(child)) continue
    visit(child)
    eachElement(child, visit)
  }
}

/**
 * Normalised visible text of a subtree.
 *
 * Text nodes are concatenated directly so that inline structure does not invent
 * whitespace: `E=mc<sup>2</sup>` must read as `E=mc2`, not `E=mc 2`. A space is
 * inserted only where a block-level element separates two runs, which is where
 * a renderer would break the line.
 */
export function visibleText (node) {
  const parts = []
  const walk = (n) => {
    for (const child of Array.from(n.childNodes)) {
      if (child.nodeType === 3) { // TEXT_NODE
        if (!isInvisible(child)) parts.push(child.nodeValue)
      } else if (child.nodeType === 1) {
        if (isInvisible(child)) continue
        const block = BLOCK_TAGS.has(child.nodeName)
        if (block) parts.push(' ')
        walk(child)
        if (block) parts.push(' ')
      }
    }
  }
  walk(node)
  return normaliseWhitespace(parts.join('')).trim()
}
