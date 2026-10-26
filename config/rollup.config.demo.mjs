import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import replace from '@rollup/plugin-replace'

/**
 * `node:module` is imported by audit/roundtrip.mjs for its Node code path only.
 * The browser never executes that path (the demo calls useTurndown()), so the
 * import is resolved to a stub that fails loudly if it is ever reached.
 */
const stubNodeModule = {
  name: 'stub-node-module',
  resolveId (id) {
    return id === 'node:module' ? id : null
  },
  load (id) {
    if (id !== 'node:module') return null
    return 'export function createRequire () { ' +
      'throw new Error("createRequire is not available in the browser; ' +
      'call useTurndown() instead") }'
  }
}

export default {
  input: 'demo/main.mjs',
  output: {
    file: 'demo/turndown-audit.bundle.js',
    format: 'iife',
    name: 'TurndownAuditDemo'
  },
  plugins: [
    stubNodeModule,
    replace({
      preventAssignment: true,
      'process.browser': JSON.stringify(true),
      'process.env.NODE_ENV': JSON.stringify('production')
    }),
    resolve({ browser: true, preferBuiltins: false }),
    commonjs()
  ]
}
