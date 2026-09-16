# Delta — section marks: visible again, and drawn correctly

    supabase/migrations/0215_annotation_layer.sql  ← RUN THIS
    src/features/gis/sectionMarks.js   the corrected mark
    src/features/gis/GISCanvasPage.jsx layer + placement
    src/features/gis/FeatureEditor.jsx Show Cross-section button
    checksectionmark.mjs
    HANDOVER.md

Needs 0214 first if you have not run it.

## Why the symbol disappeared

I created marks on the `trench` layer, and the layer is one of the keys
the drawing hides by — so switching the trench off switched off every
section mark. And Print to Scale switches the trench off deliberately,
so a mark vanished from exactly the sheet it was drawn for.

A section mark is a note ABOUT the dig, not part of it. Migration 0215
adds an `annotation` layer, moves any marks already placed onto it, and
new ones are created there. It has its own entry in the Layers panel,
so you can turn marks off without touching the trench.

## The symbol itself

Now what you sketched: a straight line square to the trench, with a
small triangle at each END, both pointing ALONG the trench in the
direction the section is viewed.

The previous version pointed the two heads back along the bar at each
other — an arrow saying "this width" rather than a mark saying "viewed
this way". The direction matters: the same cut seen from the far side
is its mirror image.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
