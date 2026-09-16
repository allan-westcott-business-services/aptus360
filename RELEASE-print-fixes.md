# Print to Scale — two fixes: basemap in register, and only what is shown

Five files, no migrations, no schema change. Copy the tree over
`aptus360/` — the paths match, nothing is deleted. This supersedes the
earlier `aptus360-print-rotation.zip` if it has not been applied yet;
if it has, applying this over it is fine — the printPdf.js and
HANDOVER.md here carry both changes.

    src/features/gis/printPdf.js
    src/features/gis/GISCanvasPage.jsx
    checkprintpdf.mjs
    HANDOVER.md

## Fault 130 — the basemap printed turned from the drawing

A PDF page can differ from its own content stream by a /Rotate
attribute and a CropBox offset. The screen (pdf.js) corrects both, so
the calibration and traced features live in the displayed page's
space; the print (pdf-lib) corrected neither. `printPdf.js` now embeds
against the CropBox and turns the placed form by the page's own
rotation. Six new registration cases in `checkprintpdf.mjs`, measured
against pdf.js itself; reverting the fix fails five.

## Fault 131 — the print showed everything; the screen did not

Hidden layers printed, and an isolated circuit printed the whole
estate. The canvas draws its `visible` memo — hidden keys, circuit and
way isolates, the lighting view, the live-trench filter — and the
print handlers were handed the raw `features`.

`savePdfSheets`, `printPdfSheets` and the `PrintModal` prop now all
read `visible`. The modal matters too: sheets costed over hidden
geometry frame and price paper for lines that will not be on it. A
consequence worth knowing on site: **isolating one circuit and
printing now issues that circuit's plan** — the estate stays off the
paper, and the sheet count is costed for the circuit alone.
`withAssumedMeters` runs on the filtered set, so hiding electric also
synthesises no board flats.

The check slices `GISCanvasPage.jsx` to the two print handlers before
matching, because `withAssumedMeters` has other callers that rightly
read the raw drawing; the previous file-wide regex would have matched
one of those and passed while the print read the wrong set.

## Suite state

Full suite before and after: the same 18 pre-existing failures already
on the handover's books — nothing new fails, `checkprintpdf` passes
with all new cases, and the build is clean. Reverting either fix fails
its cases (five and three respectively).
