/**
 * Test runner for the audit suite.
 *
 * `node --test <dir>` is not portable: some Node versions treat a bare
 * directory argument as a module path and fail with MODULE_NOT_FOUND, and a
 * shell glob in an npm script is expanded by the shell on POSIX but passed
 * through literally by cmd.exe on Windows. Enumerating the files here and
 * passing explicit paths avoids both, so the same command works on every
 * supported platform and Node version.
 */

import { readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const testDir = join(here, '..', 'test', 'audit')

const files = readdirSync(testDir)
  .filter((f) => f.endsWith('.test.mjs'))
  .sort()
  .map((f) => join(testDir, f))

if (!files.length) {
  console.error('no test files found in ' + testDir)
  process.exit(1)
}

const result = spawnSync(process.execPath, ['--test', ...files], {
  stdio: 'inherit'
})

process.exit(result.status === null ? 1 : result.status)
