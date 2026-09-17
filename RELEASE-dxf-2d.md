# Delta — DXF exports 2D geometry, and entities follow their layer

    src/features/gis/dxf.js   the fix
    checkdxf.mjs              three new cases
    HANDOVER.md

No migration. This delta stands alone — dxf.js has no dependency on the
CAD Layers work, though it is compatible with it.

## Why the objects were 3D

The polyline carried flag 8, and each vertex flag 32. Those are the 3D
POLYLINE flags. Both are now 0: a plain 2D polyline at elevation zero,
which is what a plan drawing is made of.

That alone explains a good part of the second problem — a 3D polyline
will not take a linetype properly, so moving one to a layer never made
it look like that layer.

## Why properties were not inherited

Every entity now states colour 256 (BYLAYER) and linetype BYLAYER
explicitly. Absent, both should default to BYLAYER; "should" is doing a
lot of work across the programs a DXF passes through, and an entity
carrying its own colour is exactly what stops it taking a layer's.

## Please re-export and ask your CAD team to check

- the lines are 2D polylines (LIST on one should say POLYLINE, not
  3DPOLYLINE)
- colour and linetype both report BYLAYER
- moving an object to one of their layers now takes that layer's
  colour and linetype

If anything still holds its own properties, LIST on that object and
send me what it says.

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
