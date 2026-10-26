/**
 * Prove that upstream source was not modified by this fork.
 *
 * The report claims the audit measures turndown as shipped. That is only true if
 * src/ is byte-identical to upstream, so the claim is checked instead of stated:
 * the src/ tree at the fork point is compared with the src/ tree at HEAD.
 *
 * The fork point is the parent of this repository's oldest own commit, found by
 * author rather than hard-coded, so the check keeps working as commits are added.
 */

import { spawnSync } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url)) + '/..'

function git (args) {
  const res = spawnSync('git', args, { encoding: 'utf8', cwd: root })
  if (res.status !== 0) {
    throw new Error('git ' + args.join(' ') + ' failed: ' + (res.stderr || '').trim())
  }
  return res.stdout.trim()
}

const authors = ['llinok111']

let ownCommits = ''
for (const author of authors) {
  const out = spawnSync('git', ['log', '--author=' + author, '--format=%H'], {
    encoding: 'utf8',
    cwd: root
  })
  if (out.status === 0) ownCommits += out.stdout.trim() + '\n'
}
const own = ownCommits.split('\n').map((s) => s.trim()).filter(Boolean)

if (!own.length) {
  console.log('no commits authored by this fork found; nothing to compare')
  process.exit(0)
}

// `git log` is newest first, so the last entry is the oldest commit by this fork.
const oldestOwn = own[own.length - 1]
const forkPoint = git(['rev-parse', oldestOwn + '^'])

console.log('oldest own commit : ' + oldestOwn.slice(0, 7))
console.log('fork point        : ' + forkPoint.slice(0, 7) + '  (' +
  git(['log', '-1', '--format=%s', forkPoint]).slice(0, 60) + ')')

const diff = spawnSync('git', ['diff', '--name-only', forkPoint, 'HEAD', '--', 'src/'], {
  encoding: 'utf8',
  cwd: root
})

if (diff.status !== 0) {
  console.error('could not diff src/: ' + (diff.stderr || '').trim())
  process.exit(1)
}

const changed = diff.stdout.split('\n').map((s) => s.trim()).filter(Boolean)
if (changed.length) {
  console.error('\nsrc/ was modified by this fork:')
  for (const f of changed) console.error('  ' + f)
  console.error('\nThe audit claims to measure turndown as shipped; restore these files.')
  process.exit(1)
}

const upstreamCommits = git(['log', '--oneline', '--', 'src/']).split('\n').filter(Boolean).length
console.log('src/ files changed by this fork : 0')
console.log('commits touching src/ (all upstream) : ' + upstreamCommits)
console.log('\nok: src/ is identical to upstream at the fork point')
