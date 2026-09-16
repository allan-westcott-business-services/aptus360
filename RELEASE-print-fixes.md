# Print to Scale — three fixes: basemap register, visible set, labels

Six files, no migrations, no schema change. Copy the tree over
`aptus360/` — the paths match, nothing is deleted. Supersedes both
earlier print zips from this session; every file here carries all
three changes, so applying it over either is fine.

    src/features/gis/printPdf.js
    src/features/gis/printVector.js
    src/features/gis/GISCanvasPage.jsx
    checkprintpdf.mjs
    HANDOVER.md

## Fault 130 — the basemap printed turned from the drawing

The screen (pdf.js) corrects a page's /Rotate and CropBox; the print
(pdf-lib) corrected neither. `printPdf.js` now embeds against the
CropBox and turns the placed form by the page's own rotation. Six
registration cases measured against pdf.js itself; reverting fails
five.

## Fault 131 — the print showed everything; the screen did not

Hidden layers printed, and an isolated circuit printed the whole
estate. `savePdfSheets`, `printPdfSheets` and the `PrintModal` prop
now all read the canvas's `visible` set. Isolating one circuit and
printing now issues that circuit's plan, costed for the circuit alone.

## Fault 132 — the print labelled by rules of its own

"Water Meter 19" printed down every street — text the screen never
shows, because the canvas excludes meters, span nodes and feeder
points from generic labels and puts the rest behind the master Labels
layer and the per-kind switches. `pageDrawList` now applies the same
exclusions and asks `labelShown` in labelKinds.js — the module the
screen asks — with the canvas's live switch state carried through
`pdfOptions`. What prints is what the screen was writing when Print
was clicked: turn Labels or a kind switch off before printing and the
sheet obeys.

## Suite state

Full suite before and after: the same 18 pre-existing failures already
on the handover's books — nothing new fails, `checkprintpdf` passes
with all new cases (registration, visible-set wiring, label parity),
and the build is clean. Reverting each fix fails its own cases.
