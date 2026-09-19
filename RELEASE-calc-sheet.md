# Delta — the Aptus Calc Sheet

    src/features/gis/submitSheet.js        new — the sheet's layout and arithmetic
    src/features/gis/calcSheetRows.js      new — the drawing, as sections of main
    src/features/gis/AptusCalcSheet.jsx    new — the panel
    src/features/gis/voltDrop.js           two terms it did not have
    src/features/gis/GISCanvasPage.jsx     the Electric menu item, and the save
    checkvdsubmit.mjs                      new — against the submission workbook
    checkcalcsheet.mjs                     new — against the drawing
    fixtures/drawing-16-calc-sheet.json    new — project 16, cut to what it reads
    HANDOVER.md                            fault 154

No migration. Everything it reads is already on the drawing; the two
things it writes are attributes on a line, and `Attributes` is jsonb.

## GIS Canvas › Electric › Aptus Calc Sheet

The submission sheet, on the drawing. Laid out to match the SUBMIT
worksheet of `2210_050 Aptus New Vd Calc Sheet` column for column —
section, length, cable type, cross section, distributed, terminal,
total domestic on section, block load, phase current, loop impedance,
volt drop — with the totals row, the mains-plus-service impedance, the
total volt drop and the prospective short circuit current beneath it.

One row per leg of main, walked out from the point of connection.
Nodes are named off the drawing's own feeder points, with the leg's
name in brackets after them, so a row can be tied to the canvas.

**Editable**, because it is worked on rather than read: the ADMD, the
small group diversity allowance, the substation voltage and the POC's
own share at the top; the block load and the tick box per section. The
figures underneath move as they are changed.

Block loads and exclusions are saved onto the leg they belong to
(`Block_kVA`, `Calc_Exclude`), so the sheet somebody opens next is the
sheet that was submitted. Only the changed attributes are written, not
the whole `Attributes` object — a save cannot overwrite what the build
wrote while the panel was open.

## Two things the calculation did not have

`blockKva` and `groupKva`, added to `legVoltDrop`, both defaulting to
zero. The spreadsheet adds a per-section block load and a flat 8 kVA
small group allowance to every section carrying customers; this app
had neither, and on the Fox Covert scheme that made it read **4.09%
where the sheet reads 4.67%** — under by 0.58 points, always in the
direction that makes a design look further from the limit than it is.
The gap decomposed exactly into those two terms, section by section,
which is how they were found.

Nothing existing moves. A caller that sets neither gets the numbers it
got before, and `checkvdsubmit` pins that, so the day somebody makes
them default-on it fails rather than quietly revising every scheme
already submitted.

## A route, not a sum

The spreadsheet's tick box is how it says which customer the volt drop
is *to*: its five ticked sections form one unbroken path from the point
of connection, and the three unticked ones are the other branches.

The panel picks a route — the worst one by default, any other from the
dropdown — and totals that. It warns when what is ticked is not one
unbroken path, because the total then is a sum of legs rather than the
drop to anywhere.

This was wrong in the first cut: every leg was ticked and all nine
totalled, which on project 16 printed 3.897% against the worst route's
2.937%. Not a worse answer — an answer to no question, adding legs that
sit in parallel. Both figures are asserted in `checkcalcsheet` so the
difference is named if it ever comes back.

## What it does not do yet

**No service row.** Every plot has its own service on the drawing; the
spreadsheet's single "Services" line is a notional worst one (10 m of
35 CNE at twice ADMD). Which real service should stand for it is a
judgement — the longest? the worst served? the one the DNO asked
about? — and the sheet does not make it silently. The totals say the
row is absent.

**Phase current is in the sheet's convention** — kVA × 1000 ÷ 3 ÷ 240,
reading the POC's `Output_V` as the phase voltage, which is what the
spreadsheet's B6 means by it. The same field holds the *line* voltage
elsewhere in this app, where it defaults to 400. The two are 3.9% apart
and the difference lands on every current in the table; the panel says
which it is using rather than reconciling them.

## Checked against both

`checkvdsubmit.mjs` is a golden master against the workbook: all eleven
columns of all eight sections, the service row, both totals, the two
POC-inclusive figures and the fault current, to six decimal places.

`checkcalcsheet.mjs` pins the reading of the drawing, against project
16 cut down to the nine legs, the feeder points, the POC and the
trench's span nodes. Those last are in the fixture deliberately: the
trench has span nodes labelled A1, A2, A3 standing at the same corners
as the cable's junctions, and before the layer test the sheet read
"A1 - A2 (A5)" — two trench nodes and a cable leg in one cell. Dead
ends are matched through the leg's own `Tail_M`, because the build
places that feeder point 2 to 4 m past where the cable is drawn.

## Suite state

158 of 178 pass, the same 20 pre-existing failures, no crashes. Build
clean.
