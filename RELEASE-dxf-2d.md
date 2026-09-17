# Delta — DXF: 2D geometry, BYLAYER properties, and real labels

    src/features/gis/dxf.js         2D flags, BYLAYER, mains/service tags
    src/features/gis/lineLabel.js   unchanged, included because dxf.js needs it
    checkdxf.mjs
    HANDOVER.md

No migration. Stands alone.

## Three fixes

**2D, not 3D.** The polyline carried flag 8 and its vertices flag 32 —
the 3D POLYLINE flags. Both are 0 now: a plain 2D polyline at elevation
zero.

**BYLAYER.** Every entity states colour 256 and linetype BYLAYER
explicitly, so moving an object to one of your layers takes that
layer's properties. A 3D polyline would not take a linetype properly
either, so the two faults were related.

**Mains and service tags now export.** The export wrote only `Label`,
so a main arrived as "W1" or as nothing. It now writes the same tag the
screen and the printed sheet show — size and length on water and gas,
way and circuit on electric — composed by the same module all three
read.

Each row of a tag is its own TEXT entity, because DXF TEXT holds one
line, and the tag sits half way ALONG the run rather than at a middle
vertex.

## Worth checking on re-export

- LIST on a line says POLYLINE, colour BYLAYER, linetype BYLAYER
- pipes and cables carry their size and length as text
- labels sit on the -TEXT layers, so they can be frozen separately

## Suite state

148 of 166 pass, the same 18 pre-existing failures. Build clean.
