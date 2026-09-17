# Delta — CAD Layer Names: three questions

    src/lib/adminTables.js                 the form
    src/features/admin/DxfLayersAdmin.jsx  stops copying colour/linetype
    checkdxflayers.mjs
    HANDOVER.md

No migration.

## The form now asks

    Layer name
    Class      water / gas / electric / trench / lighting / annotation
    Geometry   Line / Point / Polygon
    Active

Colour (ACI), Linetype, Sort Order and Notes are gone.

## What linetype was for

A layer in a DXF can carry its own appearance — colour and a dash
pattern (CONTINUOUS, HIDDEN, DASHED). That only matters if OUR file is
meant to define how the layer looks.

It is not. Your CAD team import into a drawing that already has these
layers, and the receiving template's colours and linetypes win. So
those fields would have been a hundred values typed and never read.

The geometry still arrives BYLAYER, so it takes whatever their template
says the layer looks like — which is the behaviour you want.

## Note

The columns remain on the table, unused. Dropping them would be tidier
but would discard anything already typed in; say the word if you would
rather they went.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
