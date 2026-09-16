# Session change set — wash outs, print parity (130–135), water build type (134)

Fifteen files. **One migration, and it is required.** Copy the tree
over `aptus360/` — paths match, nothing deleted. Supersedes every
earlier zip from this session.

    supabase/migrations/0213_washout_role.sql   ← RUN THIS FIRST
    src/features/gis/washOuts.js          new: where a wash out goes
    src/features/gis/lineLabel.js         new: line label composition
    src/features/gis/printPdf.js          paths primitive, centred text
    src/features/gis/printVector.js       symbols, sizes, labels, glyphs
    src/features/gis/GISCanvasPage.jsx    131–136
    src/features/gis/FeatureEditor.jsx    134
    src/features/gis/buildStatus.js       134
    src/features/gis/joints.js            135
    src/lib/gisStyle.js                   symbols, SYMBOL_TEXT, cascade
    src/features/admin/GisStylesAdmin.jsx wash out role, inspector
    checkprintpdf.mjs  checkstyleinspector.mjs
    checkbuildmaintype.mjs  checkwashouts.mjs
    HANDOVER.md

## Wash outs (new)

Build Water Network now places one at every dead END of the main —
not at junctions, and not at the POC, which is an end by geometry and
the one place water comes in. A size change mid-street is two runs
meeting, not an end, and gets none. Generated ones are replaced on
each rebuild; one placed by hand is left alone.

Drawn as a filled disc with WO inside. The colour is deliberately
unset on the style, so it follows the water layer and always matches
the main it terminates.

**Size and visibility:** Admin › GIS Styles → role "Wash out". The
migration seeds it at 9 px; Symbol size, Scale symbol and the Min/Max
scale rules all apply. Letters scale with the disc and are dropped
when it is too small to hold them.

**Migration 0213 is required** — `Feature_Role` carries a CHECK
constraint, so without it the build cannot save a wash out at all. It
replaces the constraint with the full current role list (including
primary, ringsub and openpoint from 0211) plus washout.

## Print parity (130–135) and the water build type (134)

Basemap rotation; only the visible set prints; labels obey the screen's
switches and hand-placed positions; the operator standard travels to
the sheet; symbols and their sizes come from the style cascade; and
Build Water Network lays `water_main` planned rather than the
incumbent's `water_main_existing`.

**Still needed on existing drawings:** re-run Build Water Network —
it fixes the main's type and places the wash outs in one pass.

## Suite state

141 of 159 pass: the same 18 pre-existing failures as this session's
baseline, with checkwashouts added and passing. Build clean.

Note: `checkboundarystyle` fails at baseline because primary, ringsub
and openpoint are drawn by the canvas but missing from the GIS Styles
role list — a one-line fix in GisStylesAdmin.jsx that I have left
alone as out of scope. Say the word and I'll close it.
