# Delta — the mapping form asks for an object, not its parts

    src/features/admin/DxfLayersAdmin.jsx
    checkdxflayers.mjs
    HANDOVER.md

No migration.

## The form now

    1. Class      Gas / Water / Electric / Trench
    2. Geometry   Line / Point / Polygon
    3. Object     decided by the first two
    4. AutoCAD layer

**Electric + Line** lists every cable in the specs table by its full
description — "3c WAVE 95" — not a type box and a size box to combine
yourself.

**Gas + Line** and **Water + Line** list that utility's own pipe, as
"Main 180mm" / "Service 32mm".

**Any class + Point** lists the fittings that class actually has: water
gets meters, wash outs and valves; electric gets joints, substations,
link boxes and the rest.

Changing the class or geometry clears the object chosen under the old
one, because a cable is not a gas pipe.

## Gone from the form

Line type, size band and build status. They were the fields an object
is STORED in rather than the question — picking "Gas main 180mm" sets a
line type and a size between them.

The columns remain on the table, so any rule written before this still
works.

## Still there

External / Internal, on electric and meters. Customer, text layer, and
the free-text layer name for a layer they have not sent you yet.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
