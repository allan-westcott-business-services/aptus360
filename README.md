# Bulk edit across classes, without selecting — 26 Aug 2026

**This is the logic layer, tested. The panel is not built — see
"What is left" before applying.**

| File | Change |
|------|--------|
| `src/features/gis/bulkEdit.js` | `Build_Status` field; `fieldsForMany`, `membersOfMany`, `planBulkEditMany` |
| `checkbulkedit.mjs` | Eight assertions |

Additive only. `classOf`, `membersOf`, `fieldsFor`, `planBulkEdit` and
`buildPatch` are unchanged, so nothing that uses them today behaves
differently.

---

## Build status was not editable in bulk at all

`fieldsFor` offered line type, surface, site, cable and size — and no
status. So the commonest bulk change on a drawing was the one thing this
could not do.

It is now offered on every class, which also makes it the field a mixed
selection can share.

## Only the fields they share

`fieldsForMany(classes)` returns the intersection:

    trench alone        Build_Status, Line_Type, Surface_Type, Site
    cable alone         Build_Status, Line_Type, VD_Cable_Size_ID
    cable + joint       Build_Status
    trench+cable+joint  Build_Status

A field survives only where every class agrees on its `kind` AND its
`usage`. A mains cable field and a service cable field share a key and a
kind but point at different catalogues — merged, the form would offer
service cables for a mains run. They are dropped instead of guessed at.

## Status is validated per feature, not per edit

Statuses are not universal: a main runs through more stages than a
service, and a point through fewer than either. Writing `aslaid` onto a
joint that has no such stage would put a value on the drawing nothing
else can read back.

`planBulkEditMany` refuses it for THAT feature and returns the refusals
in `skipped`, so setting a hundred trenches As Laid is not blocked by
one joint that cannot be — and the caller can say which were left.

Members are deduplicated across overlapping classes: a feature written
twice in one save is a race against itself. Features already holding the
value are not rewritten, so the undo entry lists only what moved. Other
attributes are untouched.

---

## What is left: the panel

`bulkEdit.js` and `BulkEdit.jsx` are NOT WIRED IN. `BulkEdit.jsx` is
imported by nothing; the panel in use is the older `BulkEditor.jsx`,
which works from the canvas selection. So this drop changes nothing on
screen until a panel calls it.

Worth knowing before deciding how to spend the next hour on it: this is
the second unwired module found this week — `serviceFor` was the first,
and its 2 m default tolerance was wrong for every caller because it had
never had one.

To finish:

1. **The class picker.** `bulkDeleteCategories()` in `bulkDelete.js`
   already builds exactly this list — "All Electric objects", "All
   service cables", "All joints", with counts, cascading parents and
   zero-count entries disabled. `BulkDelete.jsx` renders it. Reuse both
   rather than writing a second picker; a drawing where the two panels
   name things differently is worse than one panel.
2. **Map the chosen categories to classes** and call `fieldsForMany`.
3. **A `status` control** — the union of `statusesFor` across the chosen
   classes, since planBulkEditMany refuses per feature anyway.
4. **Report `skipped`** after applying: "18 changed, 2 left — a joint
   has no As-Laid stage."
5. Wire it to the menu beside Bulk Delete, and to `withUndo`.

Step 3 is the one to think about: offering the union means some options
will be refused for some features, which is why the refusal is reported
rather than silent. Offering only the intersection would hide stages
most of the selection can take.

---

## Verification

`node checkbulkedit.mjs` — eight assertions covering the field
intersection, the usage mismatch, deduplication, per-feature status
refusal and its reporting, no-op skipping, and that other attributes are
left alone.

All six existing checks still pass.
