#!/usr/bin/env python3
"""Statements that can never run.

The recurring fault this catches: a block of code sitting after an
unconditional `return` in the same braces. It compiles, it reads
correctly, and it does nothing — so the behaviour somebody just wrote
never happens and the behaviour above it happens instead.

It has bitten this codebase more than once. The most recent was a drop
handler where an old five-argument call to commitMove was left in place
above the new one, so the new call, the weekend prompt and the resize
were all unreachable; the symptom was a bar that snapped back and a
message reading "shortened by NaN days".

Neither the build nor checkdefs.py sees it. Rollup is happy — the code
is valid and reachable as far as the module graph is concerned — and
checkdefs only asks whether names exist.

── What it looks for ──

Inside a braced block, a line that is exactly `return;` or `return X;`
at some indentation, followed by another statement at the *same*
indentation before the block closes. A `return` at the end of a block is
fine, and so is one inside a nested `if` that is indented further.

── What it deliberately does not do ──

No parsing. This is a line reader with a brace counter, so it is fooled
by a `return` inside a template literal or a comment. Those are false
positives, and a false positive here costs ten seconds of reading; the
fault it catches costs an afternoon. `break`, `continue` and `throw` are
not covered, since a `return` in the middle of a block is the shape that
has actually gone wrong here.
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
LOOK_IN = ["src", "netlify"]
SKIP = {"node_modules", "dist", ".git"}

RETURN = re.compile(r"^(\s*)return\b[^;{]*;\s*$")
BLANK_OR_COMMENT = re.compile(r"^\s*(//|/\*|\*|$)")
CLOSER = re.compile(r"^\s*[}\)\]]")


def files():
    for base in LOOK_IN:
        d = ROOT / base
        if not d.exists():
            continue
        for p in sorted(d.rglob("*")):
            if any(part in SKIP for part in p.parts):
                continue
            if p.suffix in (".js", ".jsx"):
                yield p


def check(path):
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
    out = []

    for i, line in enumerate(lines):
        m = RETURN.match(line)
        if not m:
            continue
        indent = len(m.group(1))

        # What comes next at the same indentation, ignoring blanks,
        # comments and the closing brace that ends the block.
        for j in range(i + 1, len(lines)):
            nxt = lines[j]
            if BLANK_OR_COMMENT.match(nxt):
                continue
            nxt_indent = len(nxt) - len(nxt.lstrip())
            if nxt_indent < indent:
                break            # block ended above us — fine
            if CLOSER.match(nxt):
                break            # the block closes — fine
            if nxt_indent == indent:
                # A chained `else`/`catch`/`finally` on its own line is
                # part of the statement above, not dead code.
                if re.match(r"^\s*(else|catch|finally)\b", nxt):
                    break
                out.append((i + 1, line.strip(), j + 1, nxt.strip()))
            break
    return out


def main():
    found = []
    for p in files():
        for hit in check(p):
            found.append((p.relative_to(ROOT), *hit))

    if not found:
        print("No unreachable statements found.")
        return 0

    print(f"{len(found)} possible unreachable statement(s):\n")
    for rel, ln, ret, nln, nxt in found:
        print(f"  {rel}:{nln}")
        print(f"      after  line {ln}: {ret[:70]}")
        print(f"      never runs:      {nxt[:70]}\n")
    return 1


if __name__ == "__main__":
    sys.exit(main())
