# Delta — the section dialogue paints its own box

    src/features/gis/GISCanvasPage.jsx   the dialogue
    src/features/gis/njug.js             (surface mapping, as before)
    src/features/gis/trenchSection.js    (layout fixes, as before)
    checksectionmark.mjs
    HANDOVER.md

No migration. Carries the two previous deltas' fixes.

## Why the bottom looked transparent

The dialogue used `.sch` — the schematic dialogue's class — and that
CSS is injected by SchematicModal.jsx when THAT component renders. With
the schematic unmounted the rules do not exist, so the panel had no
background at all. The drawing looked boxed only because its own SVG
paints a white rectangle; everything below it sat straight on the map.

It now carries its own box: background, radius, shadow, and a scrolling
body.

The general point, noted in the handover: a class defined inside
another component's injected stylesheet is not a shared class.
Borrowing one couples two components that have no reason to be mounted
together, and nothing shows the fault until somebody opens one without
the other.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
Removing the panel background fails the check.
