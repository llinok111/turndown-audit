# NOTICE

turndown-audit is a derivative work of **turndown**.

## Upstream

| | |
|---|---|
| Project | turndown |
| Repository | https://github.com/mixmark-io/turndown |
| Version this fork starts from | 7.2.4 |
| Upstream commit | `aa84dfa` (Merge pull request #537 from mixmark-io/dependabot/npm_and_yarn/browserslist-4.28.8) |
| Licence | MIT |
| Copyright | Copyright (c) 2017 Dom Christie |

The full upstream history is preserved in this repository: the fork point is the
commit above, and every commit before it belongs to the upstream project.

## What this fork adds

Everything under `audit/`, `bin/`, `scripts/`, `test/audit/`, `demo/`, and the
`config/rollup.config.demo.mjs` build configuration is new work contributed by
this fork. Upstream source under `src/` is **unmodified**; the audit layer reads
turndown through its public API only.

The audit layer is licensed under the same MIT terms as upstream. See `LICENSE`.

## Third-party runtime dependencies added by this fork

All are permissively licensed and used as dependencies; none of their source is
modified or copied into this repository.

| Package | Licence | Used for |
|---|---|---|
| `unified` | MIT | processing pipeline for the round trip |
| `remark-parse` | MIT | CommonMark parsing of the produced Markdown |
| `remark-gfm` | MIT | GFM table parsing |
| `remark-rehype` | MIT | mdast to hast |
| `rehype-stringify` | MIT | hast to HTML |
| `turndown-plugin-gfm` | MIT | GFM rules for turndown in tests and demos |
| `@mixmark-io/domino` | BSD-2-Clause | HTML parsing in Node (an upstream dependency) |

## Behavioural note

The audit reports differences between an HTML document and its
Markdown round trip. Some of those differences are properties of the Markdown
family rather than defects of turndown; such findings are marked
`inherent: true` in the report and are never presented as fixable. See the
findings table in `README.md`.
