# Bulk editor: transparent panel fixed, build status added — 26 Aug 2026

| File | Change |
|------|--------|
| `src/styles.css` | `.fe`, `.fe-head` moved in from FeatureEditor |
| `src/features/gis/FeatureEditor.jsx` | Those two rules removed |
| `src/features/gis/BulkEditor.jsx` | Build status, on any selection |
| `src/features/gis/bulkEdit.js` | Multi-class logic (from the earlier drop) |
| `checkbulkedit.mjs` | Nine assertions |

---

## The transparent panel

Not a rendering fault — a missing stylesheet.

`.fe` is the white background, width and shadow. It was defined inside
FeatureEditor's own `<style>` block, injected only while THAT modal is
mounted. The bulk editor uses the same class, so opening it without the
feature editor gave a panel with no background at all and the drawing
showing through.

The comment beside `.fe-backdrop` in styles.css already describes this
exact fault being fixed for `.fe-foot`, `.fe-spacer` and `.fe-x` — the
bill of materials had lost its footer the same way. `.fe` and `.fe-head`
were missed at the time. They now sit beside the others.

## Build status in bulk

"Mixed or non-line features — only the name can be set in bulk" was the
whole answer for a mixed selection. Build status is the one field EVERY
feature carries, which makes it the only thing a mixed selection CAN be
offered — and it is exactly what a mixed selection is usually for:
setting a status across the service trenches, the cables and the joints
at once.

**The options are the union across the selection, not the
intersection.** A main runs through more stages than a service, and
offering only what they all share would hide Live from a selection that
is mostly mains.

**A feature that cannot hold the chosen stage is skipped, and the panel
says so before you apply**: "9 of 12 — 3 have no such stage and will be
left as they are." Counted beforehand rather than reported afterwards,
because "Apply to 12" that quietly writes 9 is the kind of silent
shortfall that has bitten repeatedly on this drawing.

Options are deduplicated by key in first-met order, so the sequence
still reads planned, as-laid, live.

---

## What is still left

This is the "extend BulkEditor" half — it works from the canvas
selection, so a mixed selection now offers status where before it
offered only the name.

**Selecting without selecting is not done.** To finish that:

1. Reuse `bulkDeleteCategories()` from `bulkDelete.js` for the picker —
   it already builds "All service cables", "All joints" and the rest,
   with counts and zero entries disabled. `BulkDelete.jsx` renders it.
2. Feed the chosen categories into `fieldsForMany` / `planBulkEditMany`
   in `bulkEdit.js`, which are tested and waiting.
3. Add a mode switch on this panel: work from the selection, or from
   named kinds.

The logic layer is done and proven; what remains is the picker and
wiring it to this panel.

---

## Verification

`node checkbulkedit.mjs` — nine assertions. The new one checks that
BulkEditor offers a status, that it no longer claims a mixed selection
can only set the name, that it validates per feature before writing, and
that `.fe` is in the shared stylesheet and gone from FeatureEditor's
block.

All six other checks still pass. Both edited components compile under
esbuild.
