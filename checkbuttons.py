#!/usr/bin/env python3
"""Edit and Delete buttons should use the shared styles.

    <button className="btn edit sm">Edit</button>
    <button className="btn delete sm">Delete</button>

Every screen used to invent its own — a bordered ghost here, a bare × in
a box there — so the same action looked different on each page and a
destructive one did not always look destructive.

A × is allowed where it closes something; it is not a delete.

    python3 checkbuttons.py
"""
import re, glob, sys

bad = 0
for path in sorted(glob.glob('src/features/**/*.jsx', recursive=True)):
    src = open(path).read()
    # Buttons whose only content is a multiplication sign, where the
    # handler says they remove something.
    #
    # These have no word to match on, so the first version of this check
    # walked straight past them — and a bare × is the very thing the
    # shared styles exist to replace.
    for m in re.finditer(r'<button([^>]*)>\s*&times;\s*</button>', src, re.S):
        attrs = m.group(1)
        if not re.search(r'(remove|delete|detach)', attrs, re.I):
            continue
        line = src[:m.start()].count("\n") + 1
        print(f"  {path}:{line}  a bare \u00d7 that removes something")
        bad += 1

    for m in re.finditer(
            r'<button([^>]*)>\s*(Edit|Delete|Remove)\s*</button>', src, re.S):
        attrs = m.group(1)
        word = m.group(2)
        cls = re.search(r'className="([^"]*)"', attrs)
        cls = cls.group(1) if cls else ""
        want = "edit" if word == "Edit" else "delete"
        if f"btn {want}" in cls or f"{want} " in cls.replace("btn ", ""):
            continue
        line = src[:m.start()].count("\n") + 1
        print(f"  {path}:{line}  {word} uses \"{cls}\" not \"btn {want}\"")
        bad += 1

print("Edit and Delete buttons use the shared styles."
      if not bad else f"\n{bad} to change")
sys.exit(1 if bad else 0)
