# Delta — "s.has is not a function" when showing a section

    src/features/gis/GISCanvasPage.jsx   the fix
    checksectionmark.mjs                 an end-to-end case
    HANDOVER.md

No migration.

## The bug

`contentsOf` takes Sets for its service-type options. I built a second
copy of them inside the section code and made them arrays, so `.has`
was not a function.

The canvas already had `serviceTypeSets` — built correctly, four lines
from working code, with a comment warning that two copies of this
answer are exactly how things come apart. The section now reads that
memo instead of building its own.

## Why the checks missed it

Every case on this feature tested a piece — the shape, the snapping,
the depths, the escaping — and all of them passed while the join
between the pieces was broken. There is now a case that runs the real
path: a trench with a main and a cable in it, through contentsOf, into
a section, out as SVG. Reverting the fix makes it fail with your exact
message.

A static check cannot see a wrong argument type. Only running it can.

## Suite state

146 of 164 pass, the same 18 pre-existing failures. Build clean.
