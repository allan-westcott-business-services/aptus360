# Delta — text notes on the GIS canvas

    supabase/migrations/0228_text_note.sql      ← run in order
    supabase/migrations/0229_bom_no_annotation.sql
    src/features/gis/textNotes.js               new module
    src/features/gis/GISCanvasPage.jsx          place, draw, drag
    src/features/gis/FeatureEditor.jsx          the note's panel
    src/features/gis/printVector.js             onto the sheet
    src/features/gis/dxf.js                     into CAD
    src/features/admin/DxfLayersAdmin.jsx       a CAD layer rule
    checktextnote.mjs                           new check
    checkbomroles.mjs  checkmsdb.mjs            two cases each
    HANDOVER.md                                 faults 152 and 153

## GIS Canvas › Annotation › Place Text Note

Click where it goes. It lands under the cursor and grows down and
right, so the corner you aimed at is the corner it keeps.

**Moved** by dragging it anywhere on the plate — not by a handle, and
not by the corner it is stored at.

**Resized two ways, because they are two different intentions:**

- the handle on the **right edge** re-wraps the words at the size they
  already are, for fitting a note into a gap on the drawing;
- the handle on the **bottom-right corner** scales the note — the
  letters grow and the wrap grows with them in proportion — for making
  it read at the scale the sheet will be plotted at.

Text size is also a number in the editor, in metres of ground, with
what that comes to in millimetres at 1:500 printed beside it.

**Fill and text colour** are both set in the editor. The fill can be
turned off for a note over clear ground; off is *no plate*, not a white
one, because the two look identical on screen and print differently.

**A leader** is a checkbox in the editor and a round handle on the
drawing. Drag it onto whatever the note is about. It is deliberately
unsnapped: a note points at gaps, corners and ground with nothing drawn
on it, and a leader that jumped onto the nearest cable would be the
drawing deciding what the note meant.

## Where it lives, and why

On the **annotation layer** — the one 0215 created, whose own comment
names notes as the thing it was waiting for. So a note survives the
trench being hidden, which Print to Scale does deliberately, and can be
turned off on its own without taking a utility with it. There is no
Layer dropdown on a note for that reason.

On its **own menu** rather than a utility's. A note belongs to none of
them, and somebody annotating a gas drawing should not have to go to
the Electric menu for a pencil. The cross-section mark stays where it
is: that one goes ON a trench and reports what the trench holds.

Everything is in **metres of ground**, like the section mark's
two-metre bar. The drawing is printed to scale, and a note sized in
pixels or points is a different size on every sheet.

## It prints, and it exports

The sheet draws the plate, the leader and the words at the size they
were set to. The DXF writes one TEXT entity per wrapped line at the
note's own height, on the text layer so a CAD user freezing the
annotation freezes this too, with the leader as a 2D polyline and no
stray node at the corner.

All three — screen, sheet and CAD — wrap through `textNotes.js`. Three
measurers wrapping one note three ways is a note somebody sized against
the wrong one.

## 0229 changes bills that already exist — read this first

`gis_bom` counts every point whose role is not on an exclusion list,
and that list had never been told about annotation. A note would have
appeared on the bill as "Textnote 3 no." — and the **cross-section mark
has been on it since 0214**, on every project where one was placed.

Running 0229 removes both. On those projects the rows disappear and the
totals beneath them drop. That is the bill becoming right rather than
changing its mind, but it is a visible change to a document people have
read. The migration carries the query for finding which projects are
affected, at its head, before anything runs.

The whole function is replaced because a Postgres function cannot have
one line of one WHERE clause amended. It is 0212 with two roles added
and nothing else changed.

## Suite state

156 of 176 pass, the same 20 pre-existing failures. Build clean.

`checkmsdb` needed two of its patterns loosened: both matched the exact
line a guard was written on rather than the guard, so adding `!isNote`
beside `!isMsdb` reported a board with two Label fields. It has one.
Both still fail if the guard is actually removed — checked by removing
it.

Note that the baseline this was built on is missing `0221` and `0222`
as well as the three absences the handover already records, and that
`checkdxflayers` crashes reading 0222 rather than failing by name.
Neither is touched here.
