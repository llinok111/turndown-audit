#!/usr/bin/env node
/**
 * turndown-audit CLI.
 *
 * Exit codes are the contract CI depends on:
 *   0  clean          no medium/high findings
 *   1  findings       medium/high findings present
 *   2  usage error    bad arguments, unreadable input
 *   3  internal error the audit itself failed
 */

import { readFileSync, existsSync } from 'node:fs'
import { audit } from '../audit/index.mjs'
import { SEVERITY_LABEL } from '../audit/taxonomy.mjs'

const USAGE = `turndown-audit — report what an HTML to Markdown conversion loses

Usage
  turndown-audit [options] <file.html | ->  [more files...]

Options
  --keep <tag,tag,...>   preserve these tags as raw HTML (turndown keep())
  --json                 machine-readable report on stdout
  --statistics           include source/output inventories in the JSON report
  --quiet                only print findings, suppress the summary
  -h, --help             show this message

Exit codes
  0 clean · 1 findings · 2 usage error · 3 internal error
`

function parseArgs (argv) {
  const opts = { keepTags: [], files: [], json: false, statistics: false, quiet: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') { opts.help = true; continue }
    if (a === '--json') { opts.json = true; continue }
    if (a === '--statistics') { opts.statistics = true; continue }
    if (a === '--quiet') { opts.quiet = true; continue }
    if (a === '--keep') {
      const v = argv[++i]
      if (!v) throw new UsageError('--keep requires a comma-separated list of tags')
      opts.keepTags.push(...v.split(',').map((s) => s.trim()).filter(Boolean))
      continue
    }
    if (a.startsWith('-') && a !== '-') throw new UsageError('unknown option: ' + a)
    opts.files.push(a)
  }
  return opts
}

class UsageError extends Error {}

function readInput (file) {
  if (file === '-') return readFileSync(0, 'utf8')
  if (!existsSync(file)) throw new UsageError('no such file: ' + file)
  return readFileSync(file, 'utf8')
}

function printHuman (name, report, opts) {
  const lines = []
  if (!opts.quiet) {
    lines.push('')
    lines.push(name)
  }
  for (const f of report.findings) {
    lines.push(`  ${SEVERITY_LABEL[f.severity]}  ${f.message}  [${f.code}]`)
    if (f.evidence) {
      const ev = JSON.stringify(f.evidence)
      lines.push(`        evidence: ${ev.length > 240 ? ev.slice(0, 240) + '…' : ev}`)
    }
    if (f.inherent) {
      lines.push('        note: no Markdown/GFM syntax expresses this; use keep() for this tag')
    } else {
      lines.push(`        see: ${f.docs}`)
    }
  }
  if (!opts.quiet) {
    const c = report.counts
    lines.push(`  ${c.total === 0 ? 'no findings' : `${c.total} finding(s): ${c.high} high, ${c.medium} medium, ${c.low} low`}`)
  }
  return lines.join('\n')
}

function main (argv) {
  let opts
  try {
    opts = parseArgs(argv)
  } catch (err) {
    process.stderr.write('turndown-audit: ' + err.message + '\n\n' + USAGE)
    return 2
  }

  if (opts.help) { process.stdout.write(USAGE); return 0 }
  if (!opts.files.length) {
    process.stderr.write('turndown-audit: no input given\n\n' + USAGE)
    return 2
  }

  let exitCode = 0
  const jsonReports = []

  for (const file of opts.files) {
    let html
    try {
      html = readInput(file)
    } catch (err) {
      process.stderr.write('turndown-audit: ' + err.message + '\n')
      return 2
    }

    let report
    try {
      report = audit(html, {
        keepTags: opts.keepTags,
        statistics: opts.statistics
      })
    } catch (err) {
      process.stderr.write('turndown-audit: audit failed for ' + file + ': ' + err.message + '\n')
      return 3
    }

    if (report.counts.high > 0 || report.counts.medium > 0) exitCode = 1

    if (opts.json) {
      jsonReports.push({
        file,
        markdown: report.markdown,
        rerendered: report.rerendered,
        findings: report.findings,
        counts: report.counts,
        clean: report.clean,
        ...(opts.statistics ? { inventories: report.inventories } : {})
      })
    } else {
      process.stdout.write(printHuman(file, report, opts) + '\n')
    }
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify(jsonReports.length === 1 ? jsonReports[0] : jsonReports, null, 2) + '\n')
  }

  return exitCode
}

process.exit(main(process.argv.slice(2)))
