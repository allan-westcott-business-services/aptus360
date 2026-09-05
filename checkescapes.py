#!/usr/bin/env python3
"""Unicode escapes in plain JSX attributes, which are not interpreted.

    <MenuItem label="Find\\u2026" />        renders literally: Find\\u2026
    <MenuItem label={`Find\\u2026`} />      renders: Find…

A JSX attribute written with quotes is a literal string — JavaScript's
escape processing does not apply. Inside braces it is an expression and
does. The two look almost identical in a diff, and the mistake reaches
the screen rather than the build.

    python3 checkescapes.py
"""
import re, glob, sys


def strip_comments(src):
    """Block and line comments blanked, newlines kept so line numbers hold.

    Every one of this repo's files carries long explanatory comments and
    they are full of em dashes written as escapes, quite correctly — a
    comment is not rendered. Scanning them was the reason the JSX-text
    rule had to be narrow enough to miss the real thing.
    """
    out = []
    i, n = 0, len(src)
    while i < n:
        if src.startswith("/*", i):
            j = src.find("*/", i + 2)
            j = n if j < 0 else j + 2
            out.append("".join(c if c == "\n" else " " for c in src[i:j]))
            i = j
        elif src.startswith("//", i):
            j = src.find("\n", i)
            j = n if j < 0 else j
            out.append(" " * (j - i))
            i = j
        else:
            out.append(src[i])
            i += 1
    return "".join(out)


bad = 0
for path in sorted(glob.glob("src/**/*.jsx", recursive=True)):
    raw = open(path).read()
    src = strip_comments(raw)

    # -- A backtick inside a CSS comment ends the stylesheet --
    #
    #    These files hold their styles in a template literal, so a
    #    comment written in `code style` inside one terminates the
    #    string. The build then fails somewhere else entirely, on the
    #    next line that happens not to be valid JavaScript, a long way
    #    from the line that caused it.
    #
    #    Read from the RAW text, because strip_comments removes the very
    #    comments this is looking inside.
    for cm in re.finditer(r"/\*.*?\*/", raw, re.S):
        if "`" not in cm.group(0):
            continue
        # Inside a template literal: an odd number of backticks before it.
        if raw[:cm.start()].count("`") % 2 == 0:
            continue
        line = raw[:cm.start()].count("\n") + 1
        print(f"  {path}:{line}  backtick in a comment inside a template "
              "literal - it ends the string")
        bad += 1

    for i, line in enumerate(src.split("\n"), 1):
        # attribute="..." containing a backslash-u, not inside braces
        for m in re.finditer(r'\b(\w+)="([^"]*\\u[0-9a-fA-F]{4}[^"]*)"', line):
            print(f"  {path}:{i}  {m.group(1)}=\"…{m.group(2)[:40]}…\"")
            print("      escape in a quoted attribute — use the character, or braces")
            bad += 1

    # >text between tags<, which is literal for the same reason.
    #
    # Across the whole file rather than line by line. JSX text is wrapped
    # like prose, so the opening tag, the text and the closing tag are
    # usually on three separate lines:
    #
    #     <option value="">
    #       Not set \u2014 the build picks the nearest POC
    #     </option>
    #
    # A per-line rule cannot see that, and did not: it shipped to a
    # customer-facing dropdown and was found on screen, which is the one
    # place this check exists to prevent it being found.
    #
    # Two narrowings, both learned from false positives on the first run:
    #
    #   - the `>` must end a TAG, so it may not be preceded by `=`, `!`,
    #     `<` or `-`. Without this, the `>` of an arrow function opened a
    #     span that ran through an expression and matched an escape
    #     sitting quite legitimately inside a JS string;
    #   - the span may not contain a quote. JSX prose does not, and an
    #     expression almost always does — `?? \"\\u2014\"` and the like.
    #
    # Seven of the first ten hits were that shape. A check whose output
    # includes hits nobody intends to act on teaches everyone to skim it,
    # which is the slower way of not having a check at all.
    for m in re.finditer(r'(?<![=!<>-])>([^<>{}\'\"`]*\\u[0-9a-fA-F]{4}[^<>{}\'\"`]*)<', src, re.S):
        line_no = src.count("\n", 0, m.start()) + 1
        text = " ".join(m.group(1).split())
        print(f"  {path}:{line_no}  >…{text[:50]}…<")
        print("      escape in JSX text — use the character, or braces")
        bad += 1

print("No uninterpreted escapes in JSX attributes." if not bad
      else f"\n{bad} to fix")
sys.exit(1 if bad else 0)
