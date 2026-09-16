# Print to Scale — basemap in register with the drawing

Three files, no migrations, no schema change. Copy the tree over
`aptus360/` — the paths match, nothing is deleted.

    src/features/gis/printPdf.js
    checkprintpdf.mjs
    HANDOVER.md

## The fault

Print to Scale produced sheets with the basemap turned (usually a
quarter turn) from the features traced over it.

A PDF page can differ from its own content stream in two ways a viewer
silently corrects: a `/Rotate` attribute — routine on landscape scans
and OS extracts — and a CropBox offset from the MediaBox. The screen
(pdf.js) applies both, so the calibration and every traced feature live
in the *displayed* page's space. The print (pdf-lib's `embedPdf`)
applied neither: the embedded form was the raw content stream,
unrotated and MediaBox-bounded. Any basemap whose page carries
`/Rotate 90` printed its underlay a quarter turn out.

## The fix

`printPdf.js` embeds against the page's CropBox and turns the placed
form by the page's own rotation, standing it on the corner that puts
its displayed top-left at the georeferenced origin. Sheets whose
basemap carries no rotation and no crop print byte-for-byte the same
placement as before.

## The check

`checkprintpdf.mjs` gains six registration cases: all four rotations,
an offset CropBox, and the two combined. The mark's on-screen position
is asked of pdf.js itself (`convertToViewportPoint`) — the engine the
canvas uses — not recomputed with the print's arithmetic, so the check
cannot inherit the fix's mistake. Reverting the fix fails five of the
six.

Recorded as recurring fault 130 in HANDOVER.md.

## Suite state

Full suite before and after this change: the same 18 pre-existing
failures (missing migrations 0163/0198, HV-ring styles not in GIS
Styles, and others already on the books) — nothing new fails, and
`checkprintpdf` passes with the new cases.
