# Session change set — print parity (130–135), water build type (134), style inspector

Thirteen files, no migrations, no schema change. Copy the tree over
`aptus360/` — paths match, nothing deleted. Supersedes every earlier
zip from this session.

    src/features/gis/printPdf.js          130, 135 (paths primitive)
    src/features/gis/printVector.js       132, 133, 135 (symbols, line labels)
    src/features/gis/GISCanvasPage.jsx    131–135
    src/features/gis/FeatureEditor.jsx    134 (line type stated, not offered)
    src/features/gis/buildStatus.js       134 (newMainTypeFor)
    src/features/gis/joints.js            135 (jointAngle, symbolSpin)
    src/features/gis/lineLabel.js         135 (new: lineTag, lineLabelText)
    src/lib/gisStyle.js                   cascadeOf + explainStyle
    src/features/admin/GisStylesAdmin.jsx cascade inspector
    checkprintpdf.mjs  checkstyleinspector.mjs  checkbuildmaintype.mjs
    HANDOVER.md

## Fault 135 — symbols and labels on the printed sheet

**Symbols.** The print kept its own role→shape table, so the style
cascade chose a point's symbol on screen and a hard-coded map chose it
on paper — service valves, absent from that map, printed as filled
discs. The print now records the same `symbolPath` the canvas draws
with and renders it as a new `paths` primitive, so a meter styled as a
square prints a square and a DNO's hexagons print as hexagons. Service
valves print their bar, square to the pipe, a metre of ground wide.
Joint rotation moved into `joints.js` so both renderers turn a symbol
the same way.

**Line labels.** The sheet skipped every line. Mains and services are
now labelled at the midpoint of the run, with size and length where
the feature carries them, obeying the screen's Mains/Service label
switches — which default off, so a sheet carries them only when the
screen does.

Known limits, documented in the handover: catalogue-spelled cable
names and gas flow (Q) stay canvas-only; the bespoke oriented fittings
(tee, reducer, HD cut-out, boards, link box, primary, ring sub, open
point) still print as their style symbol rather than their drawn
picture.

## Faults 130–134 (unchanged from the previous zip)

Basemap rotation/CropBox; only the visible set prints; labels obey the
screen's switches; the operator standard travels to the sheet; and
Build Water Network lays `water_main` planned rather than the
incumbent's `water_main_existing`.

**Still needed on existing drawings:** re-run Build Water Network on
any project whose water mains were generated before fault 134's fix.

## Suite state

140 of 158 pass — the same 18 pre-existing failures as this session's
baseline, unchanged in kind. Build clean. Reverting the print work
fails 16 cases in checkprintpdf.
