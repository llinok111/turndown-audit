# Delivery report — turndown-audit

Everything in this report was measured in this repository. Commands are given so
each number can be reproduced. Where something was not verified, it is listed
under *Not done / not verified* rather than implied by omission.

---

## 1. Upstream project and licence

| | |
|---|---|
| Project | **turndown** — convert HTML into Markdown |
| Repository | https://github.com/mixmark-io/turndown |
| Commit this fork starts from | `aa84dfa` — "Merge pull request #537 from mixmark-io/dependabot/npm_and_yarn/browserslist-4.28.8", 2026-09-03 |
| Version | 7.2.4 |
| Stars / open issues at selection time | 11 490 ★ / 154 open |
| Licence | **MIT** (`LICENSE`, "Copyright (c) 2017 Dom Christie") |
| Source size | 997 lines across 8 files in `src/` |
| Test suite | 324 assertions (314 + 10), all passing on the untouched tree |

Licence permits source reuse and redistribution. This project is a fork that keeps
the upstream commit history: the fork point is the commit above, and the complete
upstream history precedes it. `NOTICE.md` records the attribution and the licence
of every dependency this fork adds.

## 2. Why this project, and why the alternatives were rejected

Three candidates were cloned and exercised. The decision was made on measured
behaviour, not on popularity.

| Candidate | Licence | Evidence gathered | Verdict |
|---|---|---|---|
| **mixmark-io/turndown** | MIT | Source has **zero** occurrences of loss/fidelity/round-trip detection: `grep -rniE "loss\|lossy\|fidelity\|roundtrip\|warn" src/` returns nothing, and `README.md` never mentions a limitation of this kind. Silent losses reproduced on the real library (sections 3 and 4). | **Selected** |
| kpdecker/jsdiff | BSD-3-Clause | The concerns its own issue tracker raises (`maxEditLength`, `timeout`, quadratic cost on dissimilar inputs) are already implemented: `src/diff/base.ts` and `README.md` lines 221–223 document both abort mechanisms. A second gap, three-way merge (#181), needs a design this project could not validate. Its build additionally requires `yarn`, which is absent here, so even a baseline could not be reproduced without changing the project's tooling. | Rejected: the stated gaps were already closed, the remainder unverifiable |
| eemeli/yaml | ISC | Round-trip preservation, the obvious gap, **already exists**: `keepSourceTokens` in `src/options.ts` plus the library's documented comment and formatting preservation. | Rejected: no gap to fill |

Note what the selection rule produced: the chosen project is not the one with the
fewest stars, and the two rejected projects are not worse libraries — they are
libraries whose capability gaps, when actually checked, were already addressed.

## 3. What turndown does not do (measured, not assumed)

Each row below was produced by running the library, not by reading its README.

| Input | Output | Loss |
|---|---|---|
| `<p>E=mc<sup>2</sup></p>` | `E=mc2` | the superscript is gone |
| `<video src="a.mp4"></video>` | `""` | the element disappears entirely |
| `<iframe src="…" title="Dashboard"></iframe>` | `""` | the element disappears entirely |
| `<p><abbr title="HyperText Markup Language">HTML</abbr></p>` | `HTML` | the expansion is gone |
| `<dl><dt>T</dt><dd>D</dd></dl>` | `T\n\nD` | the definition list becomes loose text |
| `<pre>  indented\n    deeper</pre>` | `  indented\n    deeper` | neither code-block rule matches, so the indentation is not protected |
| `<pre><code class="language-js">…</code></pre>` | `    …` | the declared language is dropped under the default `codeBlockStyle` |
| 2-column table, cell text `a|b` | `| x | a|b |` → renders as **three** cells, second cell reads `a` | cell text is pushed into another column |
| header `<th colspan="2">` | a 2-column header in a 3-column table | the grid no longer matches the body |

The `colspan` and pipe cases are also acknowledged upstream and remain open: issue
#416 *"Do not support table convert"*, issue #380 *"`<p>` inside a table row `<tr>`
leads to rendering error"*, and PR #31 *"Improved support of TABLE"* — open since
2021-04-21, unmerged, with `rowspan support` unchecked in its own description.

Because PR #31 already covers *changing* table output, this project deliberately
does **not** change any conversion rule. It measures instead. That keeps the two
efforts independent rather than duplicating a patch that has not been accepted.

## 4. What was built

`audit/` — 1 521 lines of new source (measured with `wc -l`), plus `bin/`, tests,
scripts and a demo page.

```
audit/taxonomy.mjs   133  the finding vocabulary, severity, and whether a loss is inherent
audit/dom.mjs        196  environment-aware parsing, text extraction, tokenisation
audit/env.mjs         53  Node/browser differences isolated in one place
audit/inventory.mjs  196  semantic inventory of a document (text, elements, tables, attributes)
audit/roundtrip.mjs  101  HTML -> Markdown -> HTML, and turndown injection
audit/compare.mjs    415  source inventory vs re-rendered inventory -> findings
audit/fixes.mjs      174  remedy strategies, each verified before it is reported
audit/index.mjs      106  public API
bin/turndown-audit.mjs 147 CLI with a documented exit-code contract
```

The design decisions that matter:

1. **The comparison is HTML against HTML.** The produced Markdown is rendered back
   with an independent CommonMark + GFM toolchain (`remark-parse` +
   `remark-gfm` + `remark-rehype` + `rehype-stringify`), and both the original and
   the re-rendered document are reduced to the same inventory. Converter style
   choices (setext vs atx headings, `*` vs `-` bullets) therefore cannot appear as
   findings — only semantic change can.

2. **An independent reader, not turndown's own.** Auditing turndown's output with
   turndown's own parser would hide any misreading the two share. The reader used
   here is a different implementation, so a difference is an interoperability fact.

3. **`inherent` is a first-class field.** `colspan` has no GFM syntax; that finding
   is reported with `inherent: true` and is never offered a "fix". Reporting an
   unfixable loss as fixable would be the worst failure mode for a tool whose
   remedy claims are its value.

4. **Remedies are verified, not asserted.** `suggestFixes()` applies a strategy,
   re-runs the audit, and reports it only if the finding count actually fell and no
   new medium/high finding appeared.

5. **A finding must be judgeable.** Every finding carries its evidence — the
   differing cell text, the missing tokens, the row/column counts — so a reader can
   disagree with it.

## 5. Code changes to upstream

`src/` is unmodified. Verified:

```console
$ git diff --stat HEAD -- src/
(empty)
```

Everything added is outside upstream's source tree:

| Path | Change |
|---|---|
| `audit/`, `bin/` | new audit layer and CLI |
| `test/audit/` | 3 new test files, 40 assertions |
| `scripts/` | evidence, corpus, triage, review, test-runner and browser-verification scripts |
| `demo/` | browser demo page and its bundle |
| `config/rollup.config.demo.mjs` | build config for the demo bundle |
| `package.json` | `bin` entry, `files` additions, `test:audit` / `test:all` / `evidence` scripts, 6 dependencies |
| `README.md` | audit documentation prepended; upstream docs kept below it |
| `LICENSE` | second copyright line added; upstream terms unchanged |
| `NOTICE.md`, `.gitattributes`, `.gitignore` | new |

## 6. Test commands and real results

```console
$ npm test                     # upstream suite, unchanged
# tests 10 / # pass 10
# tests 314 / # pass 314

$ npm run test:audit            # audit, fixes, CLI
# tests 40 / # pass 40 / # fail 0

$ npm run evidence              # declared-expectation corpora
36/36 corpora behaved as specified
```

`npm run evidence` checks both directions: 22 documents whose content Markdown can
represent must produce **no** medium/high finding (false-positive guard), and 14 documents
documents with a genuinely damaged construct must produce the declared finding
(blind-spot guard).

Real corpora (`node scripts/corpus.mjs <dir>`):

| Corpus | Documents | No findings | With losses | Findings |
|---|---|---|---|---|
| three.js API docs, English | 220 | 130 | 90 | 65 `text-loss`, 28 `element-dropped` |
| three.js API docs, Chinese | 217 | 128 | 89 | 64 `text-loss`, 28 `element-dropped` |
| three.js API docs, `en/math` | 26 | 8 | 18 | 18 `text-loss` |
| vite playground pages | 33 | 33 | 0 | — |
| **Total** | **496** | **299** | **197** | |

Every `text-loss` on the three.js corpora was triaged by hand
(`node scripts/triage-text-loss.mjs`): 81 distinct missing tokens, 80 of them the
same root cause — an identifier containing `_` inside a URL, where turndown escapes
the underscore and the GFM autolink literal keeps the backslash in the rendered
text. Cross-checked against a second, independent renderer (`markdown-it` with
`linkify`), which behaves the same way, so it is an interoperability fact rather
than one implementation's quirk. The remaining token was checked separately and
resolved by the same cause.

The vite corpus is the false-positive control: 33 pages of hand-written HTML with
no findings at all.

Browser verification (`python scripts/verify_demo.py` then
`node scripts/verify-screenshots.mjs`):

```
21/21 browser checks passed
all screenshot checks passed
```

The browser run drives the real UI: it asserts that the sample reports the six
expected finding codes, that editing the input to a clean document clears the
findings, that reset restores them, that each listed fix shows a measured
before → after delta, that a 420 px viewport has no horizontal overflow, and that
a focused control has a visible outline. The screenshots are then decoded and
measured (unique colours, luminance distribution) so "the page painted" is
checked rather than assumed. Demo colour pairs were computed against WCAG AA; the
lowest is 5.75:1.

The same 21 assertions were then run against the deployment
(`--url https://llinok111.github.io/turndown-audit/`) and passed, which shows the
published page is the one that was verified rather than merely a 200 response.

CI, on the pushed commit — every job passed:

```
success  node 18 on ubuntu-latest      success  node 18 on windows-latest
success  node 20 on ubuntu-latest      success  node 20 on windows-latest
success  node 22 on ubuntu-latest      success  node 22 on windows-latest
success  demo bundle is reproducible
success  src/ matches upstream
```

Two consequences worth stating plainly:

- The `engines.node >=18` claim is now backed by runs on Node 18, not only by the
  Node 22 used during development. Whether that mattered here is not asserted —
  the point is that the check now exists.
- `src/ matches upstream` compares the `src/` tree before and after this fork's
  commits, so the central claim of the report fails the build if it ever stops
  being true.

Upstream's own `Test` workflow (`node 18/20/21`, `npm ci` + `npm test`) also
passed on both pushes, unmodified — evidence that the fork did not break the
project's existing CI.

Timing, measured on this machine (Node 22, Windows; median of 5 runs over 20
documents): **14.2 ms per document**, ≈ 10.9 MB/s. The individual runs were
11.4 / 12.9 / 14.2 / 16.4 / 16.8 ms — a 1.5× spread, which is why the median is
reported and not a single run. **No speed comparison against upstream turndown is
claimed**: the audit does strictly more work, and a defensible comparison would
need a controlled machine.

## 7. Defects this project found in itself

Listed because they are the reason several design choices exist.

1. **A cell whose text contains `|` leaves the column count unchanged.** GFM
   re-parses the row and clips the text, so a shape-only comparison is blind to it.
   Found by probing the failure case; fixed by comparing cell *text* per position.
2. **`E=mc<sup>2</sup>` looked like lost text.** The text extractor joined child
   text nodes with a space, inventing `E=mc 2`. Fixed by inserting a separator only
   at block boundaries.
3. **A surviving `<pre>` masked the loss of a different one.** Global element counts
   were compared, and a normal code block regenerates a `<pre>` on re-render.
   **Caught by the browser run**, not by the Node tests — the sample page happened
   to contain both kinds of block. Fixed by matching blocks on their text, and a
   regression test now covers the masking case.
4. **Percent-encoded URLs looked like changed targets.** Every destination
   containing a space was reported. Fixed by canonicalising URL attributes before
   comparison; this removed the only finding on the 33-page control corpus.
5. **A single joined attribute signature per element** made an *added* attribute
   (a renderer adding `alt=""`) look like every other attribute had been dropped.
   Fixed by comparing attributes individually.
6. **`node --test <dir>` fails on Windows** in this Node version (the directory is
   treated as a module path), and a shell glob inside an npm script is expanded on
   POSIX but not by `cmd.exe`. Fixed with `scripts/run-tests.mjs`, which enumerates
   the test files and passes explicit paths.
7. **Two declared expectations were wrong, not the code.** `- not a list` and
   `# not a heading` are correctly escaped by turndown, so the audit staying silent
   is right. The evidence file now records them as must-be-silent cases, and the
   commit history shows the correction.
8. **The licence stopped being recognised as MIT.** Adding explanatory paragraphs
   between the copyright line and the permission text broke the template match, and
   GitHub reported the repository licence as `NOASSERTION`. Found by reading the API
   response after the first push rather than assuming the file was fine. Fixed by
   restoring the verbatim template with both copyright lines and moving the
   explanation into `NOTICE.md`.
9. **The archive shipped build output.** The first ZIP contained `lib/` and `dist/`,
   because they exist on disk after `npm install`. Including them would let a stale
   bundle stand in for a build that no longer works, so the packager now excludes
   them and the documented `npm install` step regenerates them.

## 8. Differences from upstream

| | upstream turndown | turndown-audit |
|---|---|---|
| Purpose | convert HTML to Markdown | report what the conversion lost |
| Conversion rules | 15 CommonMark rules | **unchanged** |
| `src/` | — | byte-identical to upstream |
| Round-trip check | none | HTML → Markdown → HTML with an independent renderer |
| Loss detection | none (`grep` finds nothing) | 13 finding codes with severity and evidence |
| Remedies | documented options only | strategies applied and re-measured before being offered |
| CLI | none (`bin` field absent) | `turndown-audit` with a 4-value exit-code contract |
| Dependencies | `@mixmark-io/domino` | the same, plus the CommonMark/GFM pipeline |
| Tests | 324 assertions | 324 upstream (unchanged) + 40 new + 36 evidence corpora + 21 browser checks |

## 9. Not done / not verified

- **No performance comparison against upstream** (see section 6).
- **The audit judges the CommonMark + GFM rendering.** A consumer using a different
  dialect would need the findings re-measured against that renderer; the demo and
  the CLI both state which toolchain they use.
- **`text-loss` reports the token, not the culprit element.** When several
  constructs could be responsible, the finding names the text that changed and
  shows the source context instead of guessing at the element.
- **The `markdown-injection` detector has a narrow trigger.** It fires when a
  `<pre>` without a `<code>` child holds text that reads as a setext underline,
  which then becomes a heading in the re-rendered output — a declared corpus case
  covers it. Turndown escapes leading Markdown markers in ordinary text, so the
  other constructions tried here do **not** trigger it, and it did not fire on any
  of the 496 corpus documents. Read it as a real but rarely-reached check.
- **No coverage measurement** is reported; the suites report assertions passing,
  not line coverage.
- The demo bundle is ~736 KB because it inlines the CommonMark pipeline. It makes no
  network requests, but it is heavy for a documentation page.
- **No GitHub release or tag was created.** The repository and the ZIP are the
  deliverables; nothing upstream was offered a patch.

## 10. Delivery artefacts

| Artefact | Location |
|---|---|
| Repository (public) | https://github.com/llinok111/turndown-audit |
| Live demo | https://llinok111.github.io/turndown-audit/ |
| Full source (fork with upstream history) | `turndown-audit/` in this workspace |
| Downloadable ZIP | `turndown-audit-0.1.0.zip` |
| Licence | `LICENSE` (MIT, both copyright lines, verbatim template) |
| Attribution and fork point | `NOTICE.md` |
| Install / run / API / limitations | `README.md` |
| This report | `REPORT.md` |

To reproduce from the ZIP:

```console
unzip turndown-audit-0.1.0.zip && cd turndown-audit-0.1.0
npm install          # or npm ci; builds lib/ through the upstream prepare script
npm run test:audit   # 40 assertions
npm run evidence     # 36 corpora
npm test             # upstream suite, unchanged
```

The archive keeps `.git`, so the fork point and the "src/ is untouched" claim can
be checked directly:

```console
git log --oneline -- src/        # only upstream commits
node scripts/check-src-untouched.mjs
```

Delivered archive: 158 entries, 5.02 MB. Its SHA-256 is published next to the
archive as `turndown-audit-0.1.0.zip.sha256` in the standard `sha256sum` format:

```console
sha256sum -c turndown-audit-0.1.0.zip.sha256
```

The digest is deliberately not written into this file. The archive contains this
report, so a hard-coded digest would be stale the moment the archive was rebuilt;
a sidecar file cannot become self-contradictory.
