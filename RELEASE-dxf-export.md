# Delta — Export to AutoCAD (DXF)

Only what changed since the last zip. Copy over the top of it.

    src/features/gis/dxf.js             new: the DXF writer
    src/features/gis/GISCanvasPage.jsx  menu item + exporter
    checkdxf.mjs                        new check
    HANDOVER.md

No migration.

## Using it

Beside Print to Scale: **Export to AutoCAD (DXF)**. It writes what is
SHOWN — hidden layers and circuit isolates are respected, as with the
print.

- **R12 (AC1009)**, which everything reads, not just AutoCAD.
- **One metre = one drawing unit**, with $INSUNITS set to metres so a
  millimetre drawing scales it on insert instead of landing it 1000x
  too small.
- **Layers** from the drawing's own names: WATER-MAIN, WATER-SERVICE,
  TRENCH, WATER-WASHOUT. Labels go on a matching -TEXT layer, so the
  annotation can be frozen and the geometry kept.
- **Colours** carried as ACI indexes, nearest match to your styles.

## Two things to know before you send one out

**Position.** The drawing grid is local, so the export lands at
arbitrary coordinates unless a real origin is supplied. The writer
takes an `origin` offset — if your projects have a known easting and
northing for the drawing origin, tell me where it is stored and I will
wire it to the menu so exports land on the national grid.

**Symbols are POINT entities with their label, not blocks.** A block
library means agreeing symbol names with the receiving CAD team. Worth
doing once you know who the recipient is.

Import FROM AutoCAD is a separate and harder job — say the word if it
becomes a requirement.

## Suite state

143 of 161 pass, the same 18 pre-existing failures. Build clean.
Reverting SEQEND or flipping y fails the check.
