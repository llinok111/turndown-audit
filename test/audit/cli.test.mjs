/**
 * CLI contract: the exit codes are what CI branches on, so they are tested
 * directly rather than assumed. Each case spawns the real binary.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const CLI = join(here, '..', '..', 'bin', 'turndown-audit.mjs')

function run (args, input) {
  return spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf8',
    timeout: 60000
  })
}

function withTempFile (contents) {
  const dir = mkdtempSync(join(tmpdir(), 'turndown-audit-'))
  const file = join(dir, 'input.html')
  writeFileSync(file, contents, 'utf8')
  return { file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('--help exits 0 and documents the exit codes', () => {
  const r = run(['--help'])
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Exit codes/)
})

test('no input exits 2 with usage on stderr', () => {
  const r = run([])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no input given/)
})

test('an unknown option exits 2', () => {
  const r = run(['--nope', '-'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /unknown option/)
})

test('a missing file exits 2', () => {
  const r = run(['definitely-not-here.html'])
  assert.equal(r.status, 2)
  assert.match(r.stderr, /no such file/)
})

test('a clean document exits 0', () => {
  const { file, cleanup } = withTempFile('<h1>T</h1><p>Hello <strong>world</strong>.</p>')
  try {
    const r = run([file])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /no findings/)
  } finally { cleanup() }
})

test('a document with a real loss exits 1', () => {
  const { file, cleanup } = withTempFile('<iframe src="https://x.test"></iframe>')
  try {
    const r = run([file])
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /element-dropped/)
  } finally { cleanup() }
})

test('reading from stdin with "-" works', () => {
  const r = run(['-'], '<p>E=mc<sup>2</sup></p>')
  assert.equal(r.status, 1)
  assert.match(r.stdout, /element-flattened/)
})

test('--json emits one parseable report for a single file', () => {
  const { file, cleanup } = withTempFile('<iframe src="https://x.test"></iframe>')
  try {
    const r = run(['--json', file])
    assert.equal(r.status, 1)
    const parsed = JSON.parse(r.stdout)
    assert.equal(parsed.clean, false)
    assert.ok(Array.isArray(parsed.findings))
    assert.equal(typeof parsed.markdown, 'string')
    assert.equal(typeof parsed.rerendered, 'string')
  } finally { cleanup() }
})

test('--json --statistics includes the inventories', () => {
  const { file, cleanup } = withTempFile('<p>hi</p>')
  try {
    const parsed = JSON.parse(run(['--json', '--statistics', file]).stdout)
    assert.ok(parsed.inventories.source)
    assert.ok(parsed.inventories.output)
  } finally { cleanup() }
})

test('--keep preserves a tag that would otherwise be flattened', () => {
  const { file, cleanup } = withTempFile('<p>E=mc<sup>2</sup></p>')
  try {
    const before = run([file])
    assert.equal(before.status, 1)
    const after = run(['--keep', 'sup', file])
    assert.equal(after.status, 0, after.stdout + after.stderr)
  } finally { cleanup() }
})

test('--quiet suppresses the summary line', () => {
  const { file, cleanup } = withTempFile('<iframe src="https://x.test"></iframe>')
  try {
    const r = run(['--quiet', file])
    assert.ok(!/finding\(s\):/.test(r.stdout))
    assert.match(r.stdout, /element-dropped/)
  } finally { cleanup() }
})

test('multiple files produce a JSON array', () => {
  const a = withTempFile('<p>clean</p>')
  const b = withTempFile('<iframe src="https://x.test"></iframe>')
  try {
    const parsed = JSON.parse(run(['--json', a.file, b.file]).stdout)
    assert.ok(Array.isArray(parsed))
    assert.equal(parsed.length, 2)
  } finally { a.cleanup(); b.cleanup() }
})
