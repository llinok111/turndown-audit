/**
 * Environment helpers shared by the audit modules.
 *
 * The audit runs both in Node (CLI, tests) and in a browser bundle (the demo
 * page). Two things differ between the two and are isolated here:
 *
 *   - `require` exists only in Node, so it is obtained lazily and only when a
 *     Node-only code path is actually taken. A browser bundle never calls it,
 *     so bundlers can resolve the import to a stub instead of pulling in Node
 *     built-ins.
 *   - HTML parsing is available natively in a browser. Using the platform parser
 *     there keeps the behaviour identical to the browser's own HTML handling and
 *     removes the need for a polyfill in the bundle.
 */

import { createRequire } from 'node:module'

/** Lazily created Node require, so browser bundles never construct one. */
let cachedRequire = null

/**
 * Obtain a `require` function for the current module.
 * @returns {(id: string) => any}
 */
export function nodeRequire () {
  if (typeof process === 'undefined' || !process.versions || !process.versions.node) {
    throw new Error(
      'this code path needs Node; in a browser, supply the value explicitly ' +
      '(see useTurndown in audit/roundtrip.mjs)'
    )
  }
  if (!cachedRequire) cachedRequire = createRequire(import.meta.url)
  return cachedRequire
}

/** True when a platform HTML parser is available (browser / worker). */
export function hasNativeParser () {
  return typeof DOMParser !== 'undefined'
}

/**
 * Parse an HTML string into a Document with the parser appropriate to the
 * environment.
 * @param {string} html
 * @returns {Document}
 */
export function parseDocument (html) {
  if (hasNativeParser()) {
    return new DOMParser().parseFromString(html, 'text/html')
  }
  const domino = nodeRequire()('@mixmark-io/domino')
  return domino.createDocument(html, true)
}
