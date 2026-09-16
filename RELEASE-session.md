# Session change set — print parity (130–135), water build type (134), style inspector

Thirteen files, no migrations, no schema change. Copy the tree over
`aptus360/` — paths match, nothing deleted. Supersedes every earlier
zip from this session.

    src/features/gis/printPdf.js          130, 135 (paths primitive)
    src/features/gis/printVector.js       132, 133, 135 (symbols, sizes, labels)
    src/features/gis/GISCanvasPage.jsx    131–135
    src/features/gis/FeatureEditor.jsx    134 (line type stated, not offered)
    src/features/gis/buildStatus.js       134 (newMainTypeFor)
    src/features/gis/joints.js            135 (jointAngle, symbolSpin)
    src/features/gis/lineLabel.js         135 (new: lineTag, lineLabelText)
    src/lib/gisStyle.js                   cascadeOf + explainStyle
    src/features/admin/GisStylesAdmin.jsx cascade inspector
    checkprintpdf.mjs  checkstyleinspector.mjs  checkbuildmaintype.mjs
    HANDOVER.md

## Fault 135 — symbols, sizes, line labels, label placements

**Symbols.** The print kept its own role→shape table, so the cascade
chose a point's symbol on screen and a hard-coded map chose it on
paper — service valves, absent from that map, printed as filled discs.
The print now records the same `symbolPath` the canvas draws with.

**Sizes.** `appearance`'s `Min_Symbol_Px`/`Max_Symbol_Px` clamps are
screen pixels; applying them to a millimetre figure turned an 8 px
floor into 8 mm. Meters printed a centimetre wide; they now print
1.7 mm.

**Line labels.** Mains and services are labelled with size and length,
obeying the screen's Mains/Service switches (default off).

**Placements.** Labels moved by hand on the canvas — stored in
`Attributes.Labels` as points and offsets in metres — now print where
they were put, legacy `Label_At`/`Label_Offset` included. The PDF's
own text is flat vector art and not draggable in a viewer; move on the
canvas, then reprint.

Known limits, in the handover: catalogue-spelled cable names and gas
flow stay canvas-only; the bespoke oriented fittings (tee, reducer,
HD cut-out, boards, link box, primary, ring sub, open point) still
print as their style symbol rather than their drawn picture.

## Faults 130–134 (unchanged)

Basemap rotation/CropBox; only the visible set prints; labels obey the
screen's switches; the operator standard travels to the sheet; and
Build Water Network lays `water_main` planned rather than the
incumbent's `water_main_existing`.

**Still needed on existing drawings:** re-run Build Water Network on
any project whose water mains were generated before fault 134's fix.

## Suite state

140 of 158 pass — the same 18 pre-existing failures as this session's
baseline. Build clean. Each fix fails its own cases when reverted.
