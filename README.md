# Bulk editor layout — the rest of the missing stylesheet, 26 Aug 2026

Supersedes `aptus360-bulk-editor-20260826.zip`. Same files, plus the
three rules that drop fixed only half of.

| File | Change |
|------|--------|
| `src/styles.css` | `.fe-body`, `.fe-sub` moved in; `.fe-tip` defined |
| `src/features/gis/FeatureEditor.jsx` | Those two removed from its block |
| `src/features/gis/BulkEditor.jsx` | Status field uses this panel's own classes |
| `src/features/gis/bulkEdit.js` | Multi-class logic, unchanged from the last drop |
| `checkbulkedit.mjs` | Nine assertions, the last one now checking the whole set |

---

## Why it still looked wrong

Moving `.fe` fixed the transparency and stopped there. The cramped
layout was three more rules in the same position:

**`.fe-body`** supplies `padding: 14px 18px` and `gap: 11px` — the
space around the fields and BETWEEN them. Without it every label sat
directly on the control above it and the whole panel ran edge to edge.
That is what the screenshot shows.

**`.fe-sub`** styles the "Electric Service · 10.7 m total" line under the
title.

**`.fe-tip`** — the "Mixed or non-line features" aside — was defined
NOWHERE, in any file. It had drawn as plain body text since it was
written, so a note about what the selection cannot do read as an
instruction. Now styled as an aside.

All three had the same cause as `.fe`: defined inside FeatureEditor's
own `<style>` block, injected only while THAT modal is mounted, and read
by a panel that never mounts it.

## And two of mine

The status field used `className="fe-in"` on its select and `be-note`
for its hint. `fe-in` exists in no stylesheet at all — I took it from
FeatureEditor's markup without checking. Every other field in this panel
uses a bare `<select>` and `<p className="hint">`, which is what it uses
now.

## The check now looks at the set

Fixing `.fe` and leaving `.fe-body` is exactly what happened the first
time, so the assertion no longer names one rule. It checks that all
seven shared classes are in the shared sheet and gone from
FeatureEditor's block, and separately that BulkEditor draws with no
`fe-` class that is undefined everywhere — which is what would have
caught both `fe-in` and `fe-tip`.

Verified by renaming `.fe-body` in the stylesheet on purpose: the check
failed with both faults named.

---

## Still to do

Selecting without selecting. The logic in `bulkEdit.js`
(`fieldsForMany`, `membersOfMany`, `planBulkEditMany`) is tested and
waiting; what is left is the category picker — reuse
`bulkDeleteCategories()` from `bulkDelete.js` — and a mode switch on
this panel between "the selection" and "named kinds".
