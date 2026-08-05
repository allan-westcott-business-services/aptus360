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

bad = 0
for path in sorted(glob.glob("src/**/*.jsx", recursive=True)):
    for i, line in enumerate(open(path), 1):
        # attribute="..." containing a backslash-u, not inside braces
        for m in re.finditer(r'\b(\w+)="([^"]*\\u[0-9a-fA-F]{4}[^"]*)"', line):
            print(f"  {path}:{i}  {m.group(1)}=\"…{m.group(2)[:40]}…\"")
            print("      escape in a quoted attribute — use the character, or braces")
            bad += 1

        # >text between tags<, which is literal for the same reason. Found
        # after the attribute check so a line with both is reported once
        # per fault rather than once per line.
        for m in re.finditer(r'>([^<>{}]*\\u[0-9a-fA-F]{4}[^<>{}]*)<', line):
            print(f"  {path}:{i}  >…{m.group(1).strip()[:40]}…<")
            print("      escape in JSX text — use the character, or braces")
            bad += 1

print("No uninterpreted escapes in JSX attributes." if not bad
      else f"\n{bad} to fix")
sys.exit(1 if bad else 0)
