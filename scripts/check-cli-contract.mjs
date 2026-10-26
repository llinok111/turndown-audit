/**
 * CLI exit-code contract check, used by CI.
 *
 * The exit codes are what a pipeline branches on, so they are asserted from the
 * outside rather than trusted. Working files are created inside the repository
 * and removed afterwards, which keeps the check identical on Linux and Windows
 * where a path like /tmp/... means different things.
 */

import { spawnSync } from 'node:child_process'
import { writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const cli = join(root, 'bin', 'turndown-audit.mjs')

const cases = [
  {
    name: 'clean document exits 0',
    args: ['ci-clean.html'],
    write: ['ci-clean.html', '<h1>Title</h1><p>Hello <strong>world</strong>.</p>'],
    expect: 0
  },
  {
    name: 'document with a loss exits 1',
    args: ['ci-lossy.html'],
    write: ['ci-lossy.html', '<iframe src="https://example.test"></iframe>'],
    expect: 1
  },
  {
    name: 'unknown flag exits 2',
    args: ['--nope', 'ci-clean.html'],
    write: ['ci-clean.html', '<p>x</p>'],
    expect: 2
  },
  {
    name: 'missing file exits 2',
    args: ['ci-not-here.html'],
    expect: 2
  }
]

const written = new Set()
let failures = 0

for (const c of cases) {
  if (c.write) {
    writeFileSync(join(root, c.write[0]), c.write[1])
    written.add(c.write[0])
  }
  const res = spawnSync(process.execPath, [cli, ...c.args], { encoding: 'utf8', cwd: root })
  const actual = res.status
  const ok = actual === c.expect
  if (!ok) failures++
  console.log(
    (ok ? 'ok   ' : 'FAIL ') + c.name +
    '  | expected exit ' + c.expect + ', got ' + actual
  )
  if (!ok) console.log('       stdout:', res.stdout.trim().split('\n').slice(0, 4).join(' / '))
}

for (const f of written) {
  try { rmSync(join(root, f)) } catch (err) { /* already gone */ }
}

console.log('\n' + (failures ? failures + ' exit-code check(s) failed' : 'exit-code contract holds'))
process.exit(failures ? 1 : 0)
