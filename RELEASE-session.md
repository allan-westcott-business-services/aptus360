# Session change set — print parity (x4), water build type, style inspector

Eleven files, no migrations, no schema change. Copy the tree over
`aptus360/` — paths match, nothing deleted. Supersedes every earlier
zip from this session.

    src/features/gis/printPdf.js          (130: basemap rotation/CropBox)
    src/features/gis/printVector.js       (132, 133: labels + operator standard)
    src/features/gis/GISCanvasPage.jsx    (131–134: visible set, label/standard
                                           options, newMainTypeFor, planned status)
    src/features/gis/FeatureEditor.jsx    (134: line type stated, not offered)
    src/features/gis/buildStatus.js       (134: newMainTypeFor)
    src/lib/gisStyle.js                   (cascadeOf + explainStyle)
    src/features/admin/GisStylesAdmin.jsx (cascade inspector panel)
    checkprintpdf.mjs
    checkstyleinspector.mjs               (new)
    checkbuildmaintype.mjs                (new)
    HANDOVER.md                           (faults 130–134)

## Fault 134 — Build Water Network laid the incumbent's pipe

The root of the "water main style" reports. The build's loose
`/main/i` find took the first type in Sort_Order, which on water is
`water_main_existing` — so generated mains drew in the incumbent's
grey and defaulted to status `existing`. `newMainTypeFor` in
buildStatus.js now answers "the type our build lays a new main as"
for all five call sites, and the water build writes
`Build_Status: "planned"` explicitly. Gas passed only by sort-order
luck and is held by the same predicate and check.

**Existing drawings need one action:** re-run Build Water Network on
any project whose water mains were generated before this — the
rebuild replaces Generated runs, and they will come back as
`water_main`, planned, in your green-dashed style.

Line editors now STATE a line's type read-only instead of offering to
change it (bulk edit already had); the draw-time picker remains.

## Faults 130–133 — print parity (unchanged from earlier zips)

Basemap rotation/CropBox honoured; only the visible set prints;
labels obey the screen's switches; the operator standard travels to
the sheet.

## Cascade inspector (new, in Admin › GIS Styles)

"Why does it look like that?" — describe an object as drawn and see
every matching rule in stacking order, what each sets, which value
survives, and the resolved result, via the same resolveStyle the
canvas uses. A mistyped key shows as "no rule matches".

## Suite state

140 of 158 pass — the two new checks pass and the 18 failures are the
same pre-existing list as this session's baseline. Build clean.
Reverting each fix fails its own cases.
