# Delta — a moved label is saved

Three files, this request only:

    src/features/gis/GISCanvasPage.jsx   the fix
    checklabelmove.mjs                   new check
    HANDOVER.md                          fault 140

No migration.

⚠ Assumes the full session set is applied — this GISCanvasPage.jsx
imports washOuts.js, lineLabel.js and dxf.js. If those are not in the
repo yet, use aptus360-full-session.zip instead.

## The bug

The move handler had two `d.mode === "label"` branches. The first
applies the offset and returns, so the second — which set
`d.moved = true` — was unreachable. The release handler starts with
`if (!d.moved) { select the line; return; }`, so every label drag
released as a CLICK: the line was selected and nothing was written.

The label moved on screen because that is local state. The database
was never told, so a refresh put every label back.

## The fix

The flag is set in the live branch, past the same DRAG_PX threshold a
pan uses — so a click with a shake still reads as a click and does not
put a row through the database — and the dead branch is removed.

This covers every draggable label: cable and pipe tags, the extra ones
placed by hand, and the span node pressure, levels and cut-out offsets.

## Suite state

145 of 163 pass, the same 18 pre-existing failures. Build clean.
Removing the flag fails the check.
