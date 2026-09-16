# Delta — no label beside the wash out symbol

Only what changed since the last zip. Copy over the top of it.

    src/features/gis/GISCanvasPage.jsx  point-label gate excludes washout
    src/features/gis/printVector.js     same exclusion on the sheet
    checkwashouts.mjs                   one new case
    HANDOVER.md                         note against fault 137

No migration.

The generic point-label pass wrote `Label` beside every point, so a
disc already reading WO carried a black "WO 8" next to it. Now excluded
by role in both renderers, beside meters, span nodes and feeder points
which are left out for the same kind of reason.

The Label itself is kept — it names the fitting in the editor, in a
schedule and in the bill. Service valves keep their "SV 10" on purpose:
that is how one is referred to on site, and the symbol only draws "SV".

## Suite state

142 of 160 pass, the same 18 pre-existing failures. Build clean.
