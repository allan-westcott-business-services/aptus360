# Print to Scale — four fixes: basemap register, visible set, labels, operator standard

Six files, no migrations, no schema change. Copy the tree over
`aptus360/` — the paths match, nothing is deleted. Supersedes every
earlier print zip from this session; each file carries all four
changes.

    src/features/gis/printPdf.js
    src/features/gis/printVector.js
    src/features/gis/GISCanvasPage.jsx
    checkprintpdf.mjs
    HANDOVER.md

## Fault 130 — basemap printed turned from the drawing
Embeds against the CropBox and applies the page's own /Rotate, as the
screen does. Six registration cases measured against pdf.js.

## Fault 131 — the print showed everything; the screen did not
The handlers and PrintModal read the canvas's `visible` set. Hidden
layers stay off the paper; isolating one circuit prints that circuit.

## Fault 132 — the print labelled by rules of its own
The label pass applies the screen's role exclusions and the
labelKinds switches, with the canvas's live state carried through.

## Fault 133 — org-scoped styles fell off the sheet
The print resolved styles with no operator standard, so every
operator-scoped rule (the strongest claim in the cascade) silently
fell away and the sheet showed base styles under a drawing being
worked to an operator's. `pdfOptions` now carries the canvas's
`standard`, and the sheet resolves under it. Note: this means sheets
printed with a standard selected will now show that operator's
styling — which is the correct drawing to hand to that operator, and
a visible change from before.

## Suite state
Same 18 pre-existing failures before and after; nothing new fails;
`checkprintpdf` passes all cases; build clean. Reverting each fix
fails its own cases.
