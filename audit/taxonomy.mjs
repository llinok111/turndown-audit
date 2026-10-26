/**
 * Finding taxonomy for turndown-audit.
 *
 * Every code carries:
 *  - severity : 'high' | 'medium' | 'low'
 *  - kind     : 'loss'   — content or structure present in the source HTML is
 *                         absent from the Markdown (or its re-rendered form)
 *               'hazard' — the Markdown is parseable but ambiguous/broken in a
 *                         way that changes rendering
 *  - inherent : true when the Markdown family (CommonMark + GFM tables) has no
 *               syntax for the construct, so the loss cannot be repaired by a
 *               converter option. Such findings are reported, never "fixed".
 *
 * `docs` points at the authority used to decide whether a construct is
 * representable. Keeping this explicit is what separates a measured audit from
 * a heuristic guess.
 */

export const FINDINGS = {
  'text-loss': {
    severity: 'high',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Visible text disappeared',
    detail: 'Text that is rendered in the source HTML is missing from the converted Markdown, so the conversion silently deleted content.'
  },
  'element-dropped': {
    severity: 'high',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Element dropped with no textual substitute',
    detail: 'An element that carries content (media, embedded documents, form controls) was removed entirely. Markdown has no syntax for it, so the only faithful option is to keep the original HTML for that node.'
  },
  'element-flattened': {
    severity: 'medium',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Semantic element flattened to plain text',
    detail: 'The text survived but the element that gave it meaning did not, so readers and downstream tools lose the distinction.'
  },
  'table-shape-changed': {
    severity: 'high',
    kind: 'hazard',
    inherent: false,
    docs: 'https://github.github.com/gfm/#tables-extension-',
    title: 'Table shape changed',
    detail: 'A row in the emitted table does not have the same number of cells as the header row. A GFM table with ragged rows renders with the extra cell text pushed into the wrong column, or dropped.'
  },
  'table-cell-content-changed': {
    severity: 'high',
    kind: 'hazard',
    inherent: false,
    docs: 'https://github.github.com/gfm/#tables-extension-',
    title: 'Table cell content changed',
    detail: 'A cell reads differently after conversion. The usual cause is an unescaped `|` inside the cell: GFM splits the row on that character, so text after it moves into another column or is clipped.'
  },
  'table-span-flattened': {
    severity: 'medium',
    kind: 'loss',
    inherent: true,
    docs: 'https://github.github.com/gfm/#tables-extension-',
    title: 'Merged cells cannot be represented',
    detail: 'GFM tables have no colspan/rowspan syntax. The merged cell is repeated or dropped, changing the reading order of the header. Keeping the original HTML for this table is the only faithful conversion.'
  },
  'attribute-dropped': {
    severity: 'medium',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Meaningful attribute dropped',
    detail: 'The attribute carries information a reader needs (an abbreviation expansion, a time value, a language tag). Markdown inline syntax has nowhere to put it.'
  },
  'markdown-injection': {
    severity: 'high',
    kind: 'hazard',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Source text became Markdown syntax',
    detail: 'Text that was literal in the source HTML is interpreted as Markdown structure after conversion, so the document gains structure the author never wrote.'
  },
  'heading-level-changed': {
    severity: 'low',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Heading level changed',
    detail: 'The heading survives but at a different depth, which breaks table-of-contents generation and anchor links.'
  },
  'list-structure-changed': {
    severity: 'medium',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'List structure changed',
    detail: 'Item count or nesting depth differs from the source, so the document outline no longer matches what the author wrote.'
  },
  'code-block-degraded': {
    severity: 'medium',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Code block degraded',
    detail: 'A fenced code block lost its language, or a code block was emitted as indented text, which changes how it is highlighted and copied.'
  },
  'preformatted-collapsed': {
    severity: 'high',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Preformatted text lost its formatting',
    detail: 'Both of turndown\'s code-block rules require the <pre> element to have a <code> first child. A <pre> without one matches neither rule, so its text is emitted as ordinary content: indentation is stripped, blank lines collapse, and the text can be re-read as Markdown structure.'
  },
  'image-target-changed': {
    severity: 'high',
    kind: 'loss',
    inherent: false,
    docs: 'https://spec.commonmark.org/0.31.2/',
    title: 'Image or link target changed',
    detail: 'The destination URL or alt text in the output differs from the source, so the link points somewhere else or loses its accessible name.'
  }
}

export const SEVERITY_ORDER = { high: 3, medium: 2, low: 1 }
export const SEVERITY_LABEL = { high: 'high', medium: 'med ', low: 'low ' }

export function describe (code) {
  const spec = FINDINGS[code]
  if (!spec) throw new Error('unknown finding code: ' + code)
  return spec
}
