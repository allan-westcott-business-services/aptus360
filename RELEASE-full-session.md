# FULL session change set — apply all of this

**This supersedes and replaces every delta zip from this session.** The
Netlify failure was a delivery mistake of mine: the last delta shipped
`GISCanvasPage.jsx`, which imports `snapToMain`, without
`washOuts.js`, which defines it — that file was in the previous delta.
Deltas only work if every one is applied in order, and I removed the
earlier zip when I posted the newer one. Apply this whole tree and the
build resolves.

Every file below is changed from your last commit (f8d8c7b). Copy the
tree over `aptus360/`; paths match, nothing is deleted.

## Source (13)

    src/features/gis/GISCanvasPage.jsx
    src/features/gis/printPdf.js
    src/features/gis/printVector.js
    src/features/gis/FeatureEditor.jsx
    src/features/gis/buildStatus.js
    src/features/gis/bulkDelete.js
    src/features/gis/joints.js
    src/features/gis/waterNetwork.js
    src/features/gis/washOuts.js        ← NEW (the missing file)
    src/features/gis/lineLabel.js       ← NEW
    src/features/gis/dxf.js             ← NEW
    src/features/admin/GisStylesAdmin.jsx
    src/lib/gisStyle.js

## Migration (1)

    supabase/migrations/0213_washout_role.sql   (already run on your DB)

## Checks and notes (7)

    checkprintpdf.mjs  checkstyleinspector.mjs  checkbuildmaintype.mjs
    checkwashouts.mjs  checkmaintotrenchend.mjs  checkdxf.mjs
    HANDOVER.md

## Verify before pushing

    npm run build          # must succeed — this is what Netlify runs
    npm test               # expect 143 of 161, the same 18 pre-existing failures

## What is in it

Faults 130–135 (print parity: basemap rotation, visible set, labels,
operator standard, symbols, symbol sizes, label placements), 136 (wash
outs), 137 (main laid to the end of the trench), 138 (DXF export), the
water build laying `water_main` planned rather than the incumbent's
type, the line-type pickers withdrawn from the editors, and the cascade
inspector in GIS Styles.

**After deploying, re-run Build Water Network** on existing drawings.
