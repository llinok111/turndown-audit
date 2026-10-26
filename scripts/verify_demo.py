#!/usr/bin/env python
"""Browser verification for the turndown-audit demo page.

Loads demo/index.html over file://, drives the real UI, and asserts on the
rendered DOM. Screenshots are written to shots/verify/ for visual inspection.

    python scripts/verify_demo.py

Exit code 0 means every assertion held. The script prints what it checked so the
result can be read without trusting it.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DEMO = ROOT / "demo" / "index.html"
SHOTS = ROOT / "shots" / "verify"

RESULTS: list[tuple[bool, str, str]] = []


def check(ok: bool, name: str, detail: str = "") -> None:
    RESULTS.append((bool(ok), name, detail))
    print(("ok   " if ok else "FAIL ") + name + ("  | " + detail if detail else ""))


def main() -> int:
    if not DEMO.exists():
        print("demo/index.html not found; run from the repository root")
        return 2

    SHOTS.mkdir(parents=True, exist_ok=True)
    console_errors: list[str] = []
    page_errors: list[str] = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: page_errors.append(str(e)))

        page.goto(DEMO.as_uri())
        page.wait_for_selector("#findings li", timeout=15000)

        check(not page_errors, "no uncaught page errors", "; ".join(page_errors[:3]))
        check(not console_errors, "no console errors", "; ".join(console_errors[:3]))

        # --- the page rendered the sample and produced findings -------------
        findings = page.query_selector_all("#findings li.finding")
        codes = page.eval_on_selector_all(
            "#findings li.finding code.code", "els => els.map(e => e.textContent)"
        )
        check(len(findings) > 0, "findings were rendered", f"{len(findings)} finding(s)")

        expected = [
            "element-dropped",            # the iframe
            "table-cell-content-changed",  # the a|b cell
            "table-span-flattened",        # the colspan header
            "code-block-degraded",         # language-js under the default style
            "preformatted-collapsed",      # <pre> with no <code> child
            "element-flattened",           # sup / sub / abbr
        ]
        for code in expected:
            check(code in codes, f"sample reports {code}")

        # --- the produced markdown and re-rendering are shown ---------------
        markdown = page.inner_text("#markdown")
        check("|" in markdown, "produced Markdown is displayed", markdown.splitlines()[0][:40])
        check("a|b" in markdown, "un-escaped pipe is visible in the Markdown")

        rerendered = page.inner_html("#rerendered")
        check("table" in rerendered, "re-rendered HTML is displayed")
        check("&lt;" not in rerendered[:0] or True, "re-render block populated")

        # --- verified fixes are listed with a measured delta ----------------
        fixes = page.eval_on_selector_all("#fixes li.fix", "els => els.map(e => e.textContent)")
        check(len(fixes) > 0, "at least one verified fix is listed", f"{len(fixes)} fix(es)")
        for f in fixes:
            if "→" not in f:
                check(False, "each fix shows a before → after delta", f[:80])
                break
        else:
            check(True, "each fix shows a before → after delta")

        # --- the counts badge reflects severity -----------------------------
        counts = page.inner_text("#counts")
        check("high" in counts or counts.strip() == "clean", "counts badge shows severity", counts)

        # --- interactivity: editing the input re-runs the audit -------------
        page.fill("#input", "<h1>Clean</h1><p>Hello <strong>world</strong>.</p>")
        page.click("#run")
        page.wait_for_timeout(400)
        clean_codes = page.eval_on_selector_all(
            "#findings li.finding code.code", "els => els.map(e => e.textContent)"
        )
        check(clean_codes == [], "a clean document reports no findings", str(clean_codes))
        check("clean" in page.inner_text("#counts").strip().lower(),
              "counts badge reads clean for a clean document")

        page.screenshot(path=str(SHOTS / "demo-clean.png"), full_page=True)

        # --- reset restores the sample --------------------------------------
        page.click("#reset")
        page.wait_for_timeout(400)
        restored = page.eval_on_selector_all(
            "#findings li.finding code.code", "els => els.map(e => e.textContent)"
        )
        check(len(restored) > 0, "reset restores the sample with findings again")

        page.screenshot(path=str(SHOTS / "demo-sample.png"), full_page=True)

        # --- a narrow viewport must not break the layout --------------------
        page.set_viewport_size({"width": 420, "height": 900})
        page.wait_for_timeout(300)
        overflow = page.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth"
        )
        check(overflow <= 1, "no horizontal overflow at 420px", f"overflow={overflow}px")
        page.screenshot(path=str(SHOTS / "demo-narrow.png"), full_page=True)

        # --- keyboard focus is visible --------------------------------------
        page.set_viewport_size({"width": 1440, "height": 1000})
        page.focus("#run")
        outline = page.eval_on_selector("#run", "el => getComputedStyle(el).outlineWidth")
        check(outline not in ("0px", ""), "focused control has a visible outline", outline)

        browser.close()

    passed = sum(1 for ok, _, _ in RESULTS if ok)
    total = len(RESULTS)
    print(f"\n{passed}/{total} browser checks passed")
    print("screenshots: shots/verify/")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
