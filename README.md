# Bulk edit by kind — selecting without selecting, 26 Aug 2026

The item the last note left open. "Set every service trench to As Laid"
is one decision about four hundred features, and until now the only way
to make it was to draw round them.

| File | Change |
|------|--------|
| `src/features/gis/bulkEdit.js` | `classesIn`, `planBulkEditOn`; name, depth and house type added to `fieldsFor` |
| `src/features/gis/CategoryPicker.jsx` | **New.** The picker lifted out of BulkDelete, one copy for both panels |
| `src/features/gis/BulkEditor.jsx` | Mode switch; fields drawn from `fieldsForMany`; applies through the planner |
| `src/features/gis/BulkDelete.jsx` | Renders the shared picker |
| `src/styles.css` | `.cat-*` — the picker's rules, in the shared sheet |
| `src/features/gis/GISCanvasPage.jsx` | `Edit by Kind…` on the menu; the panel opens with no selection |
| `checkbulkedit.mjs` | Fifteen sections; the last one mounts the panel and drives it |

---

## A category is narrower than a class

This is the whole of the design, and it is the one thing that would have
gone wrong quietly.

The kinds are named from the same list bulk delete names what it
removes, so the sentence is "all the service trenches" either way. But
`bulkEdit.js` works in *classes* — layer plus line type, or layer plus
role — and a category can be finer than that. Tick **service joints**
and the class of every one of them is "electric joints", which is also
the breeches and the straights.

Planning from the classes would have edited four times what was ticked,
and it would have looked entirely right doing it: the count would be of
joints, and they would all have been joints.

So `planBulkEditOn` takes a settled set of features and writes to
exactly those. `planBulkEditMany` is now a two-line wrapper that finds
the members first, so the class route — which the single-class path
still uses — is unchanged. **Classes decide which fields to offer, and
never which features to write.**

## The first line in the array is not an answer

The panel used to settle "are these trenches?" by looking at
`lines[0]`, under a comment saying the selection is already one class to
get here. It was, because the menu item disables itself otherwise.

A ticked set is mixed far more often than a selection is, and the same
line would then have answered from whichever feature the drawing
happened to load first. So the fields come from `fieldsForMany` now —
the intersection across the classes present, which is the honest answer
to what can be said about all of them — and the panel draws a control
per field kind rather than branching on `allLines` and `allTrenches`.

That moved three fields into the module so it could stay the single
answer: **Name** (a column, not an attribute — the planner lifts it out
of the patch), **Depth**, and **House type**, which is not a feature
field at all and carries `onPlot: true` to say so.

## Two things it deliberately will not do

**Cable size.** A run's size is held twice — on the run, and on the span
node it feeds, because the volt drop sum reads it from the node — and
only the canvas can write both. A bulk write of one of them from here is
recurring fault 13 verbatim: a drawing where the cable says 300 and the
sum says 95, each true to whichever reader looked. `fieldsFor` still
returns the field; the panel draws a line of prose in its place saying
where the size is set. Absence alone would have been an invitation to
add it back.

**Anything not shared.** A mixed set is offered the status and the name
and nothing else, and says so.

## The picker moved rather than being copied

It was inside `BulkDelete.jsx`, along with the cascade between a utility
and the kinds beneath it — tick Electric, get its kinds; untick one, keep
the rest. Copying that into a second panel would have produced two
versions that drift, and the first thing to drift would have been the
cascade, which is subtle enough to go subtly wrong rather than visibly.

Its classes went to `src/styles.css` at the same time, as `.cat-*`. A
`<style>` block is injected only while its own component is mounted, so
a picker drawing with `bd-` rules would have been unstyled whenever bulk
delete was shut — which is fault 11, and exactly what `.fe` and
`.fe-body` did to this same panel a session ago.

## The check

Nine sections became fifteen. The new ones cover `classesIn`, the
service-joint trap above, Name written as a column and a line type
carrying its layer, and the shared-stylesheet rule extended to `cat-`
across all three components.

**Section 15 mounts the panel and drives it.** Everything before it
reads the module or greps the JSX, and neither proves the panel runs:
kinds mode opens with no selection, on props the selection mode never
sees, and a panel that threw on an empty `features` array would have
passed every other assertion and blanked the page on the first click. It
ticks All meters on a four-feature drawing, sets a status, presses
Apply, and asserts that the two trenches nobody named are not in what
came back.

It also caught a fault found by reading rather than by any grep. **The
draft outlives the set it was filled in against.** Type a surface for a
hundred trenches, switch to kinds, tick the meters, and the surface was
still in state — so the panel now plans only over fields the current
set is offered, and 15c drives exactly that sequence.

Each assertion was checked by breaking the thing it tests: planning from
classes, ignoring the tick, dropping the Name lift, unhooking the line
type from its layer, offering a surface to a meter, renaming a picker
class, and copying the picker back. All were reported, and one — the
first version of the planner assertion — passed a broken panel because
it matched the import line. It names the argument now.

`checkescapes.py` caught a `\u2026` in the new menu item's JSX
attribute, which is recurring fault 6 and would have shipped as six
literal characters on the menu.

---

## The suite

**87 of 92**, and the five are all pre-existing — confirmed by stashing
this work and running them again. HANDOVER says three, which was true
when it was written; `checkorphans`, `checkroutes` and `checkaslaidplan`
have failed since some point after it. Two of the five are still the
uncommitted migrations. The other three are listed in HANDOVER now, with
what each is actually reporting.

## Still to do

The house type is written through a second call to the plots endpoint,
and the two writes are not one transaction — a features write that
succeeds followed by a plots write that fails leaves the drawing changed
and the load not. It was the same before this change; it is more
reachable now that forty seeds can be named without selecting them.

`GISCanvasPage.jsx` gained eleven lines and is still 12,000. The three
panels it mounts for bulk work — editor, delete, picker — are now
independent of it and would move out cleanly.
