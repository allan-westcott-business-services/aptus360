# Four fixes, 1 Sep 2026

1. A cable that runs through a span node feeds it
2. A meter beside its service reaches the substation
3. Load tapped along a leg is charged on that leg
4. Hand-set cable sizes survive Build LV Network

**Settings note.** Unbalanced, Distributed load factor and Joint
equivalent length are one row for the whole system, not per project,
and the GIS page reads them when the project loads — reload the page
after changing them. The levels export's last columns ("Leg charged",
"Leg unbalance factor") show what a run actually used.

---

# 1. A cable that runs through a span node feeds it

Build LV Network, then Apply Cable Sizes to Span Nodes, and many nodes
still read "not set" with a sized cable visibly entering and leaving
them.

| File | Change |
|------|--------|
| `src/features/gis/spanNodes.js` | `runsThrough`, `runThrough`, `nodesFedBy`; downstream rule compares `Span_Seq` only within one circuit |
| `src/features/gis/GISCanvasPage.jsx` | Sync has a second pass for nodes nothing ends at; carry, scenario and out-of-step warning use the same rule; the build syncs the drawing it just built |
| `checkspannodes.mjs` | Three cases, driven through the real router |

No SQL.

## Why nothing ended at those nodes

Trench › Place Span Nodes marks every junction of mains. A circuit's
run only breaks where **that circuit** divides — and the router was
changed on purpose so it would not break at a junction it carries
straight through (feederSections: "circuit A was cut at B1 because
circuit B forks there").

So at a junction where A goes on and only B turns off, A's cable is one
section over the node and B's is one section over it the other way.
Neither circuit's model sees a junction there, neither adopts the node,
and no cable *ends* within reach of it. `nodeFedBy` only ever read the
ends. On a drawing with more than one circuit, that is most of the
junctions.

The cable entering such a node is the cable leaving it, so there is
nothing to choose: the node takes the section running through it.
`runsThrough` requires the node to project onto the body of the line,
not at either end — a node just past a cable's end is the end rule's
business and must not be handed back. Nearest cable wins where two are
in range; ties on the lower `Feature_ID` so the answer is the same on
every run.

## The end rule was also wrong at the seam

Two numberings are in use. The build numbers a circuit's own nodes A1,
A2, A3 outward; Place Span Nodes numbers the whole site the same way,
and a node the build never adopted keeps that number. The downstream
rule compared them as one scale, so a circuit node at seq 3 beside an
unadopted node at seq 2 read the unadopted one as *upstream*: the cable
fed the node it left from and the node it arrived at stayed empty.
`Span_Seq` now only decides between nodes on the same circuit;
otherwise distance from the substation does, as it already did for
unnumbered nodes.

## The build's own sync never ran

`buildLvNetwork` called `syncNodeCables({ silent: true })` with no
drawing, so the sync read `features` — the closure's copy from before
the build: cables just deleted, nodes still on the numbering the
renumber pass had replaced. It found the old cables at the old sizes,
saw no difference, and wrote nothing. Where it *had* found one it would
have written pre-build attributes back over the renumbered ones. It now
re-reads the drawing after the link pass and the joints, and syncs that.

---

# 2. A meter beside its service reaches the substation

Circuit report 2608_018: four meters — plots 88, 126, 128, 129 — with no
distance, each between neighbours that had one.

| File | Change |
|------|--------|
| `src/features/gis/electric.js` | Graph build split out as `networkFrom`; a spliced join gets its distance; only cables and trenches are in the graph; `whyUnreached` |
| `src/features/gis/CircuitReport.jsx` | The reason on the dash's tooltip, in a "Why" column of the not-traced table, and as a last column of the export |
| `checkdistances.mjs` | Three cases |

No SQL.

## Why exactly those four

A meter joins the nearest point on the nearest line. Where that point
is a vertex — the end of the service, which is where Auto Service puts
the meter — the walk had already settled it. Where it is **part way
along a segment** the join spliced a new point in *after* the walk had
run, under a comment saying its distance was "the nearer settled end
plus the bit along the segment", and then nobody worked that out. The
point had no entry; the meter had no distance.

So the four are meters that sit beside their service rather than at
its end — moved along the wall after the service was laid, or served by
a run that carries on past them. Every other meter on the report
projects onto a vertex, which is why it read as "some meters" rather
than all of them. The spliced point has two settled neighbours; its
distance is now the shorter way in.

## Every line was in the graph

Boundaries, gas, water, notes. A meter is a box on the front wall and
the boundary is drawn along it, so a meter a metre from its boundary
and four from its service joined the boundary, which runs back to
nothing. A gas service stopping short of its own main carried the
electric meter beside it down with it. Cables and trenches only now —
a trench because the report is read before Build LV Network has run
and the trench is where the cable will go. Lines with no layer are
kept, for drawings older than layers.

## The dash now says why

`whyUnreached` reads the same graph `distancesFrom` used, so it explains
the blank the report has rather than one a second reading might find.
Four answers: nothing within 30 m (and how far the nearest is); the
line it joined runs back to nothing (which line, how many are joined
together, how far its nearest end stops short of which live line); the
origin is not on the network; nothing on the drawing is reached. The
second is the one with a fix in it — the gap in metres, against
`CONNECT_M` of 0.25.

---

# 3. Load tapped along a leg is charged on that leg

Levels check on 2608_018: A36→A39 is 100.7 m of 3c WAVE 95 with seven
plots along it and nothing beyond, and it read **0 A** and the **same
volt drop at A39 as at A36** — 6.37% at both ends of a loaded
hundred-metre leg. A21→A38, 156.7 m with eleven plots, the same.

| File | Change |
|------|--------|
| `src/features/gis/voltDrop.js` | `cumulativeToNode` counts the load on every spur leaving a leg as distributed load on it; `amps` is the current in the arriving cable, `ampsThrough` the old figure |
| `checkspurload.mjs` | New, through the real model |

No SQL.

## Why a loaded leg dropped nothing

A meter's load sits in the model at its cut-out — the far end of its
service spur, a node *off* the mains. `cumulativeToNode` walked the
mains node by node and read `meterKva` only at the nodes it passed, so
a spur's load was never seen as distributed on the leg it tees off. It
was terminal load of the leg *before* (inside `cumKva` at the previous
span node) and then simply gone.

So every leg was short by whatever left along it, and a dead-end leg —
where `cumKva` at the far node is zero because nothing lies beyond —
was short by everything. The figures that looked right were the legs
whose load was all beyond their far end. The Distribution column was
correct all along because `spanTrace` keys meters to the foot of the
spur for the table; the volt drop never read that.

The load tapped at a route node is now its own meters plus everything
hanging off it that is not the route onward — the service spurs, and a
mains branch at a fork nobody put a span node on — counted at the node
the spur leaves from, which is on the route where the sum can see it.
Terminal load at the span node is unchanged, so nothing is counted
twice. The joint allowance follows: it was "zero on every real drawing"
for this reason, not the one its comment gave.

## The working is in the export

Five columns at the end of the levels export: the kVA tapped along the
leg, the kVA beyond it, the weighted kVA after the distributed factor,
the metres charged (cable plus joint allowance) and the unbalance
factor. Added when another system's figures came out lower and "mostly
higher" was all a total could say; a disagreement now lands on one
column, which names the method that differs.

## The current column

"Phase current" on a leg row was the load passing on *through* the far
node, which at a dead end is nothing — hence 0 A against a cable
carrying seven plots. It is now the current in the cable arriving at
the node (distributed plus terminal), and the through figure is kept as
`ampsThrough`.

Expect every figure in the levels check to rise, and some legs that
passed to fail. They were passing on a sum that left out the plots on
them.

---

# 4. Hand-set cable sizes survive Build LV Network

Found when a designer's sizes came back as the build's defaults and the
levels check moved with them.

| File | Change |
|------|--------|
| `src/features/gis/GISCanvasPage.jsx` | The rebuild carries `Manual_VD_Cable_Size_ID` onto the re-laid run; the build's silent sync leaves a node's own override alone |

Two faults. The LV build had an `overrides` map copied from the gas
build, under a comment saying an override lost on rebuild "is the one
thing a rebuild must not do" — and it read `Manual_Gas_Pipe_Size_ID`,
the gas field, on electric cables, and nothing ever read the map back.
Every cable size set on a run was lost on every rebuild, always. It now
remembers `Manual_VD_Cable_Size_ID` by geometry and puts it back on a run
laid along the same points; a run that breaks differently starts on
the default, because its load has changed.

And since fix 1 made the build's own sync actually run, that sync was
copying the run's size over a cable somebody had chosen on the node
itself. A silent sync now fills only nodes that have no override of
their own; the menu item, which asks first and names every node,
remains the place a node is reconciled with its run.

## Suite

**100 of 109** with `--py`. The nine failures are all pre-existing and
none is in this area: `checkaslaidplan`, `checkbottleends`,
`checkprojecttabs` (as recorded), `checkdevelopers` and
`checkmigrations` (0198 is not in the folder), `checkorphans`,
`checkroutes` (the `calloffs-FUNCTION.js` duplicate), `checkstatusrules`,
and `checkbuttons.py` (32 house-style deviations, HANDOVER item 11).
