/**
 * Round-trip driver: HTML -> Markdown -> HTML.
 *
 * The second leg uses the CommonMark + GFM reference toolchain
 * (remark-parse + remark-gfm + remark-rehype + rehype-stringify), not turndown
 * itself. Auditing turndown's output with turndown's own parser would make the
 * audit blind to any misreading turndown's parser shares with its writer; using
 * an independent reader means a difference is a genuine interoperability fact.
 *
 * Raw HTML that a `keep` rule preserved survives the second leg because the
 * renderer is configured to pass it through, so a preserved element is expected
 * to reappear and is therefore not reported as lost.
 */

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { nodeRequire } from './env.mjs'

/**
 * The turndown constructor the audit converts with.
 *
 * It is settable so that a bundle (the browser demo) can supply the class
 * directly instead of resolving it through `require`, which does not exist in a
 * browser. The default resolution order keeps Node behaviour unchanged.
 * @type {Function|null}
 */
let injectedTurndown = null

/**
 * Provide the turndown constructor explicitly.
 * @param {Function|null} ctor pass null to fall back to the default resolution
 */
export function useTurndown (ctor) {
  injectedTurndown = ctor
}

/** The built turndown bundle. Falls back to the package entry. */
export function loadTurndown () {
  if (injectedTurndown) return injectedTurndown
  const require = nodeRequire()
  const candidates = ['../lib/turndown.cjs.js', 'turndown']
  const errors = []
  for (const id of candidates) {
    try {
      return require(id)
    } catch (err) {
      errors.push(id + ': ' + err.message)
    }
  }
  throw new Error(
    'turndown-audit could not load turndown. Run `npm run build` first, ' +
    'or pass the constructor to useTurndown().\n' + errors.join('\n')
  )
}

const renderer = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeStringify, { allowDangerousHtml: true })

/**
 * Render Markdown back to HTML with an independent CommonMark+GFM toolchain.
 * @param {string} markdown
 * @returns {string}
 */
export function markdownToHtml (markdown) {
  return String(renderer.processSync(markdown))
}

/**
 * Create a turndown service preconfigured for the audit.
 *
 * The audit adds no conversion rules of its own: it must observe the library as
 * a user would. `keepTags` and any plugin are applied exactly the way the
 * README documents them, so the measured behaviour is the shipped behaviour.
 *
 * @param {{ keepTags?: string[], plugins?: Function[], options?: object }} config
 */
export function createService (config = {}) {
  const TurndownService = loadTurndown()
  const service = new TurndownService(config.options || {})
  for (const plugin of config.plugins || []) service.use(plugin)
  if (config.keepTags && config.keepTags.length) service.keep(config.keepTags)
  return service
}

/**
 * Convert HTML to Markdown and render that Markdown back to HTML.
 * @param {string} html
 * @param {object} config see createService()
 * @returns {{markdown: string, rerendered: string}}
 */
export function roundTrip (html, config = {}) {
  const service = createService(config)
  const markdown = service.turndown(html)
  return { markdown, rerendered: markdownToHtml(markdown) }
}
