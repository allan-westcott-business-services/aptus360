#!/usr/bin/env python3
"""Edit and Delete buttons should use the shared styles.

    <button className="btn edit sm">Edit</button>
    <button className="btn delete sm">Delete</button>

Every screen used to invent its own — a bordered ghost here, a bare × in
a box there — so the same action looked different on each page and a
destructive one did not always look destructive.

A × is allowed where it closes something; it is not a delete.

── Why this was rewritten ──

The first version passed on a codebase where eleven screens were still
wrong, which is worse than no check at all: it was run, it said yes, and
the screens stayed as they were.

Three holes, all the same mistake in different clothes — the pattern
being matched was narrower than the thing being looked for.

1. Attributes were matched with `[^>]*`, which stops at the first `>`.
   Every handler here is an arrow function, so the `=>` in
   `onClick={() => remove(r)}` ended the match and the button was never
   seen at all. That alone hid almost every button in the app.

2. Only `&times;` was recognised. The screens write `&#10005;` — the
   same character, a different spelling, which a literal comparison
   knows nothing about.

3. Only text sitting directly between the tags counted, so a label on
   its own line read as an empty button.

The rule is now the class rather than the label: `.row-edit` and
`.row-del` are the invented styles the shared ones replace, so their
presence anywhere is the fault, whatever the button happens to say. One
thing to look for instead of three, and it cannot be got round by
writing the label differently.

    python3 checkbuttons.py
"""
import re, glob, sys

# The ✕ characters, in every form this codebase writes them.
CROSS = {"&times;", "&#10005;", "&#215;", "\u00d7", "\u2715", "\u2716"}


def buttons(src):
    """Every <button> in a file, as (line, attrs, inner text).

    Parsed rather than matched. A regex cannot find the end of a JSX
    opening tag: `[^>]*` stops at the `>` inside `() =>`, and a lazy
    `.*?` runs on into the next tag and reports one button's class
    against another's label. Both were tried; both were wrong, and the
    second was wrong in a way that reads as forty spurious faults.

    So this walks the characters, tracking quote and brace depth, and
    takes the `>` that is actually outside both.
    """
    i = 0
    while True:
        i = src.find("<button", i)
        if i < 0:
            return
        j = i + 7
        depth = 0
        quote = None
        while j < len(src):
            c = src[j]
            if quote:
                if c == "\\":
                    j += 2
                    continue
                if c == quote:
                    quote = None
            elif c in "\"'`":
                quote = c
            elif c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
            elif c == ">" and depth == 0:
                break
            j += 1

        attrs = src[i + 7:j]
        self_closing = attrs.rstrip().endswith("/")
        end = src.find("</button>", j) if not self_closing else -1
        inner = src[j + 1:end] if end > 0 else ""
        yield src[:i].count("\n") + 1, attrs, inner.strip()
        i = j + 1


def class_of(attrs):
    m = re.search(r'className=(?:"([^"]*)"|\{([^}]*)\})', attrs)
    if not m:
        return ""
    return (m.group(1) or m.group(2) or "").strip()


bad = 0
files = 0

for path in sorted(glob.glob('src/**/*.jsx', recursive=True)):
    src = open(path).read()
    files += 1

    # ── The invented row styles, in the <style> block that defines them ──
    #
    # A component style tag is global CSS, so a copy left in one screen
    # quietly styles every other screen still using the class. Two files
    # were relying on exactly that — their delete buttons looked right
    # only while some other tab happened to be mounted.
    for i, line in enumerate(src.split('\n'), 1):
        for cls in ("row-edit", "row-del"):
            if re.match(rf'\s*\.{cls}[\s.:,{{]', line):
                print(f"  {path}:{i}  defines .{cls} \u2014 the shared styles already do this")
                bad += 1

    for line, attrs, inner in buttons(src):
        cls = class_of(attrs)

        # ── The invented row styles, on a button ──
        if re.search(r'\brow-(edit|del)\b', cls):
            print(f'  {path}:{line}  uses .{re.search(r"row-(edit|del)", cls).group(0)}'
                  f' \u2014 wants "btn edit sm" / "btn delete sm"')
            bad += 1
            continue

        # ── A bare × that removes something ──
        #
        # Except where the class follows the -x naming this codebase
        # already uses for dismissals — .fe-x, .gco-x, .dm-x, .bulk-x
        # all close or clear something rather than delete a record. A
        # chip in a list being built is the same gesture: nothing has
        # been saved yet, so taking one back off the list is not a
        # destructive act and a red pill in every chip would say it was.
        if inner in CROSS:
            if re.search(r'(remove|delete|detach|drop)', attrs, re.I) \
                    and not re.search(r'\b[\w-]+-x\b', cls):
                print(f"  {path}:{line}  a bare \u00d7 that removes something")
                bad += 1
            continue

        # ── The word, with the wrong class ──
        #
        # A row in a menu is not a button on a screen. The right-click
        # menu on the canvas has Edit and Delete rows, and dropping two
        # coloured pills into a list of plain text rows would look
        # broken rather than consistent — the menu has its own styles,
        # applied to every row in it, which is the same argument the
        # shared button styles make.
        #
        # A named exception rather than silence, so it can be argued
        # with: anything whose class says it is a menu row.
        if inner in ("Edit", "Delete", "Remove") and not re.search(r'-item\b|menu', cls):
            want = "edit" if inner == "Edit" else "delete"
            if f"btn {want}" not in cls:
                print(f'  {path}:{line}  {inner} uses "{cls}" not "btn {want} sm"')
                bad += 1

print(f"Edit and Delete buttons use the shared styles ({files} files)."
      if not bad else f"\n{bad} to change")
sys.exit(1 if bad else 0)
