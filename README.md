# turndown-audit

[![CI](https://github.com/llinok111/turndown-audit/actions/workflows/ci.yml/badge.svg)](https://github.com/llinok111/turndown-audit/actions/workflows/ci.yml)

An audit layer for [turndown](https://github.com/mixmark-io/turndown): it converts
HTML to Markdown, renders the result **back** with an independent CommonMark + GFM
implementation, and reports what the round trip actually lost.

turndown is a good converter with no way to tell you when it silently drops
something. This fork adds that: a measured, per-construct report of what a
conversion destroys, with a remedy that is verified before it is offered.

Try it on your own HTML: **https://llinok111.github.io/turndown-audit/**

```console
$ npx turndown-audit page.html

page.html
  high  1 rendered text token(s) from the source are absent from the converted output: `OES_texture_float`  [text-loss]
        evidence: {"missingTokens":[{"token":"OES_texture_float","missing":1}],"totalMissing":1}
        see: https://spec.commonmark.org/0.31.2/
  med   1 <iframe> element(s) reduced to plain text  [element-flattened]
        evidence: {"tag":"IFRAME","missing":1,"examples":[]}
        note: no Markdown/GFM syntax expresses this; use keep() for this tag
  2 finding(s): 1 high, 1 medium, 0 low
$ echo $?
1
```

## Why this exists

`grep -rniE "loss|lossy|fidelity|roundtrip" src/` in upstream turndown returns
nothing. The library cannot tell you that `<sup>2</sup>` became `2`, that a
`colspan` disappeared, or that the text after a `|` inside a table cell was
dropped. Those losses are real and measured in this repository — `REPORT.md` has
the numbers and the corpus they came from.

The audit does **not** change how turndown converts. `src/` is byte-identical to
upstream and every change lives in `audit/`, `bin/`, `scripts/` and `demo/`. That
is what makes the measurements meaningful: they describe the library as shipped.

## Install

```console
npm install
```

`npm install` builds `lib/` through the upstream `prepare` script, which the audit
reads at runtime.

## Use

### Command line

```console
npx turndown-audit <file.html | ->  [more files...]

  --keep <tag,tag,...>   preserve these tags as raw HTML (turndown keep())
  --json                 machine-readable report on stdout
  --statistics           include the source/output inventories in the JSON report
  --quiet                only print findings, suppress the summary
  -h, --help             show the message above
```

Exit codes are the CI contract:

| Code | Meaning |
|---|---|
| 0 | clean — no medium or high findings |
| 1 | findings present |
| 2 | usage error (bad flag, unreadable file) |
| 3 | the audit itself failed |

### Library

```js
import { audit } from 'turndown-audit/audit/index.mjs'
import { gfm } from 'turndown-plugin-gfm'
import { suggestFixes } from 'turndown-audit/audit/fixes.mjs'

const report = audit(html, { plugins: [gfm] })

report.markdown    // what turndown produced
report.rerendered  // that Markdown, rendered back to HTML independently
report.findings    // ordered worst first
report.counts      // { high, medium, low, total }
report.clean       // true when nothing medium/high was found

// Remedies that were applied and re-measured, not guesses:
const { effective } = suggestFixes(html, { plugins: [gfm] })
// effective[i].before / .after  → finding counts before and after the fix
// effective[i].markdown        → the output with the fix applied
```

### Demo

`demo/index.html` runs the same audit code in the browser. Open the file
directly — it makes no network requests. Rebuild it with:

```console
npx rollup -c config/rollup.config.demo.mjs
```

## What it checks

Every finding comes from a difference measured on the *rendered* document, so it
holds for any reader that implements CommonMark + GFM, not only for the one used
here. `inherent: true` marks a construct the Markdown family cannot express;
those are reported but never presented as fixable.

| Code | Severity | What it means |
|---|---|---|
| `text-loss` | high | Rendered text from the source is absent from the output |
| `element-dropped` | high | A content-bearing element was removed with nothing in its place |
| `element-flattened` | medium | The text survived but the element that gave it meaning did not |
| `table-cell-content-changed` | high | A cell reads differently — typically an unescaped `\|` splitting the row |
| `table-shape-changed` | high | Row or column count changed, so cells sit in the wrong columns |
| `table-span-flattened` | medium | `colspan`/`rowspan` — no GFM syntax exists *(inherent)* |
| `preformatted-collapsed` | high | A `<pre>` with no `<code>` child matched neither code-block rule, so indentation and blank lines were lost |
| `code-block-degraded` | medium | A declared code language was dropped (an indented block cannot carry one) |
| `attribute-dropped` | medium | A meaningful attribute (`title`, `datetime`, `lang`, …) disappeared |
| `image-target-changed` | high | An image `src`/`alt` or a link destination differs (percent-encoding is normalised away first) |
| `markdown-injection` | high | Literal text was read as Markdown structure after conversion |
| `heading-level-changed` | low | Heading depth sequence changed |
| `list-structure-changed` | medium | List item count or nesting depth changed |

## Verified fixes

`suggestFixes()` tries the strategies below against a document, applies each one,
re-runs the audit, and reports only those that measurably reduced the findings
without introducing a new one.

| Strategy | Addresses |
|---|---|
| `escape-table-pipes` | `table-cell-content-changed` |
| `pre-without-code-is-a-code-block` | `preformatted-collapsed` |
| `code-block-style-fenced` | `code-block-degraded` |
| `keep-…` (sup, sub, mark, kbd, abbr, ins, del) | `element-flattened`, `attribute-dropped` |
| `keep-…` (iframe, video, audio, canvas, object, embed) | `element-dropped` |
| `keep-…` (dl, dt, dd, details, summary, figure, figcaption) | `element-flattened` |

A finding with no effective strategy stays a finding. Nothing is reported as
fixed on the strength of a claim.

## Tests and evidence

```console
npm run test:audit        # audit, fixes and CLI assertions
npm run evidence          # corpora whose expected outcome is declared in advance
npm test                  # upstream turndown suite, unchanged
node scripts/corpus.mjs <dir>           # audit a real corpus
node scripts/review.mjs <dir>           # findings grouped by code
node scripts/triage-text-loss.mjs <dir> # every missing token with its source context
```

`scripts/verify_demo.py` drives the demo in a real browser and writes screenshots
to `shots/verify/`; `scripts/verify-screenshots.mjs` then decodes those PNGs and
measures them, so "it rendered" is checked rather than assumed.

## Known limitations

- The audit judges the Markdown that a CommonMark + GFM renderer produces. A
  consumer with a different dialect (CommonMark without GFM, MultiMarkdown, a
  wiki syntax) may read the output differently; the findings would need
  re-measuring against that renderer.
- `text-loss` compares token multisets. It reports *that* text is missing and
  shows the tokens; it does not attempt to name the element that dropped it when
  several constructs could be responsible.
- The browser demo bundles the CommonMark pipeline, so `demo/turndown-audit.bundle.js`
  is larger than the library itself.
- Performance is not a claim in this project. No throughput comparison against
  upstream is made, because a meaningful one needs a controlled machine and is not
  what the audit is for.

## Licence

MIT, the same terms as upstream. `LICENSE` carries both copyright lines;
`NOTICE.md` records the fork point, what was added, and the licence of each added
dependency.

---

# turndown (upstream documentation)

The rest of this file is the upstream turndown documentation, kept so that this
fork documents the library it audits. It is unchanged apart from this notice.

## Project Updates
* `to-markdown` has been renamed to Turndown. See the [migration guide](https://github.com/domchristie/to-markdown/wiki/Migrating-from-to-markdown-to-Turndown) for details.
* Turndown repository has changed its URL to https://github.com/mixmark-io/turndown.

## Installation

npm:

```
npm install turndown
```

Browser:

```html
<script src="https://unpkg.com/turndown/dist/turndown.js"></script>
```

For usage with RequireJS, UMD versions are located in `lib/turndown.umd.js` (for Node.js) and `lib/turndown.browser.umd.js` for browser usage. These files are generated when the npm package is published. To generate them manually, clone this repo and run `npm run build`.

## Usage

```js
// For Node.js
var TurndownService = require('turndown')

var turndownService = new TurndownService()
var markdown = turndownService.turndown('<h1>Hello world!</h1>')
```

Turndown also accepts DOM nodes as input (either element nodes, document nodes,  or document fragment nodes):

```js
var markdown = turndownService.turndown(document.getElementById('content'))
```

## Options

Options can be passed in to the constructor on instantiation. For example:

```js
var turndownService = new TurndownService({ option: 'value' })
```

| Option                | Valid values  | Default |
| :-------------------- | :------------ | :------ |
| `headingStyle`        | `setext` or `atx` | `setext`  |
| `hr`                  | Any [Thematic break](http://spec.commonmark.org/0.27/#thematic-breaks) | `* * *` |
| `bulletListMarker`    | `-`, `+`, or `*` | `*` |
| `codeBlockStyle`      | `indented` or `fenced` | `indented` |
| `fence`               | ` ``` ` or `~~~` | ` ``` ` |
| `emDelimiter`         | `_` or `*` | `_` |
| `strongDelimiter`     | `**` or `__` | `**` |
| `linkStyle`           | `inlined` or `referenced` | `inlined` |
| `linkReferenceStyle`  | `full`, `collapsed`, or `shortcut` | `full` |
| `preformattedCode`    | `false` or [`true`](https://github.com/lucthev/collapse-whitespace/issues/16) | `false` |

### Advanced Options

| Option                | Valid values  | Default |
| :-------------------- | :------------ | :------ |
| `blankReplacement`    | rule replacement function | See **Special Rules** below |
| `keepReplacement`     | rule replacement function | See **Special Rules** below |
| `defaultReplacement`  | rule replacement function | See **Special Rules** below |

## Methods

### `addRule(key, rule)`

The `key` parameter is a unique name for the rule for easy reference. Example:

```js
turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: function (content) {
    return '~' + content + '~'
  }
})
```

`addRule` returns the `TurndownService` instance for chaining.

See **Extending with Rules** below.

### `keep(filter)`

Determines which elements are to be kept and rendered as HTML. By default, Turndown does not keep any elements. The filter parameter works like a rule filter (see section on filters belows). Example:

```js
turndownService.keep(['del', 'ins'])
turndownService.turndown('<p>Hello <del>world</del><ins>World</ins></p>') // 'Hello <del>world</del><ins>World</ins>'
```

This will render `<del>` and `<ins>` elements as HTML when converted.

`keep` can be called multiple times, with the newly added keep filters taking precedence over older ones. Keep filters will be overridden by the standard CommonMark rules and any added rules. To keep elements that are normally handled by those rules, add a rule with the desired behaviour.

`keep` returns the `TurndownService` instance for chaining.

### `remove(filter)`

Determines which elements are to be removed altogether i.e. converted to an empty string. By default, Turndown does not remove any elements. The filter parameter works like a rule filter (see section on filters belows). Example:

```js
turndownService.remove('del')
turndownService.turndown('<p>Hello <del>world</del><ins>World</ins></p>') // 'Hello World'
```

This will remove `<del>` elements (and contents).

`remove` can be called multiple times, with the newly added remove filters taking precedence over older ones. Remove filters will be overridden by the keep filters,  standard CommonMark rules, and any added rules. To remove elements that are normally handled by those rules, add a rule with the desired behaviour.

`remove` returns the `TurndownService` instance for chaining.

### `use(plugin|array)`

Use a plugin, or an array of plugins. Example:

```js
import TurndownService from 'turndown'
import { gfm } from '@joplin/turndown-plugin-gfm'

const turndownService = new TurndownService()
turndownService.use(gfm)
```

### `turndown(input)`

Converts an HTML string or DOM node to Markdown.

## Extending with Rules

Turndown can be extended by adding **rules**. A rule is a plain JavaScript object with `filter` and `replacement` properties. Rules may also have a `filter` property in the form of a function; this is useful for more complex filters.

```js
turndownService.addRule('strikethrough', {
  filter: ['del', 's', 'strike'],
  replacement: function (content) {
    return '~' + content + '~'
  }
})
```

## Plugins

Plugins are functions that add rules:

```js
function myPlugin (turndownService) {
  turndownService.addRule(...)
}
turndownService.use(myPlugin)
```

See the [plugins section](https://github.com/mixmark-io/turndown#plugins) in the
upstream repository for community plugins, including
`turndown-plugin-gfm` which adds GFM tables, strikethrough, task list items and
highlighted code blocks.

## Escaping Markdown Characters

Turndown uses backslashes to escape Markdown characters in text and attribute values. It is not an exhaustive escape routine, but it aims to escape characters that would otherwise change the meaning of the output.

## Escaping and the audit

Because turndown escapes text, some audit findings are about how an escape and a
renderer interact rather than about a missing character. `text-loss` reports the
token that changed and shows the source context, so the cause can be judged from
the output rather than assumed.

## License

MIT
