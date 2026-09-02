# Feeder End Points — phase 1, 2 Sep 2026

A span node is a CIVIL fact: the dig branches or ends here. It was also
carrying ELECTRICAL facts — a circuit, a sequence, a cable, a level —
and one trench junction can carry two circuits' cables with two of
everything, which one object cannot honestly hold. That conflation is
where the season's patches came from: pass-through feeding, per-circuit
renumbering fighting the site-wide numbers, ties broken on Feature_ID,
and the two-POC refusal.

The electrical facts now have their own feature: the **Feeder End
Point** (`Feature_Role: 'feederpoint'`). One belongs to ONE circuit and
stands where that circuit's cable ends or forks. Two circuits through
one junction are two points at one location, each with its own cable
and its own level.

**One migration to run: `0201_feeder_end_points.sql`** — adds the role
to the constraint, seeds its style, turns span nodes trench-brown, and
gives feeder-point origins the same one-per-circuit uniqueness span
origins had. (`0200_multiple_electric_pocs.sql` from earlier still
applies if not yet run.)

## What changed

- **Build LV Network** no longer touches span nodes at all. Per
  circuit it deletes its own generated feeder points and remakes them:
  origin (A0/B0…) at the circuit's own POC, one point at every fork and
  end, sequenced outward, carrying the cable of the run arriving.
  Hand-set point cables survive by anchor, run overrides by geometry,
  exactly as before. The status names which POC fed which circuit when
  a rule had to choose.
- **Two POCs on one trench network route.** The circuit decides its
  origin: named (`Circuit_Origin_ID` on its meters), else a substation
  on the network, else nearest along the trenches — said out loud in
  the build status. The same-network refusal is gone; a circuit whose
  network holds no origin at all is still refused.
- **The trace, levels, sync, carry and scenario** all stop at the
  circuit's feeder points where it has any, and at span nodes exactly
  as before where it has none — old drawings work unchanged until
  their first rebuild.
- **Manual feeder points**: Electric → + Feeder End Point arms a click;
  it must land on a circuit's run (that run says whose it is), stops
  the trace immediately, and the next build sequences it. No Generated
  flag, so builds adopt it rather than delete it.
- **Colours**: span nodes trench brown; each feeder point in its
  circuit's feeder colour, so the point and the cable it belongs to
  cannot disagree.
- **Bulk Delete** offers feeder end points: under Electric ("feeder
  end points") and among the general Points entries ("All feeder end
  points"), same shape as span nodes. Deleting them is safe — the next
  Build LV Network remakes its own; hand-placed ones go too, so untick
  the row if you have any you mean to keep.
- **One circuit at a time**: the levels panel and the Circuit Report
  each have a circuit selector — levels of two circuits side by side at
  shared points read as one network contradicting itself. The levels
  export follows the selection and names the circuit in the filename;
  the report's export still carries every circuit.

## Checks

`checkfeederpoints.mjs` (new) drives the takeover through the real
trace: each circuit stops at its own points at the shared junction and
never at the other's or at a span node; a drawing with no feeder points
still stops at span nodes. `checkmultipoc.mjs` holds the origin rule
(named → substation → nearest, shared trenches routing).
`checkspannodes.mjs` keeps the old-drawing rules alive and adds the
takeover flip. Suite **103 of 112** with `--py`; the nine failures are
the same pre-existing set as this morning.

## Not yet (phase 2/3, by agreement)

As-laid plan and call-offs still speak span nodes (correct — they are
dig documents). "Apply Cable Sizes to Span Nodes" still exists and now
operates on feeder points where a drawing has them; renaming the menu,
migrating node-held cables on old drawings, and stripping the remaining
span-node electrical patches is phase 3.

---

# Four fixes and two features, 1 Sep 2026

1. A cable that runs through a span node feeds it
2. A meter beside its service reaches the substation
3. Load tapped along a leg is charged on that leg
4. Hand-set cable sizes survive Build LV Network
5. **Multiple electric POCs** — each serving its own self-contained network
6. **Measured lengths** — a line can carry the length the run really is

Also: **number inputs no longer have spin buttons, and the mouse wheel no
longer edits a focused one** (`src/styles.css`, `src/App.jsx`). App-wide,
because every admin page and modal has these boxes. Typing and the arrow
keys still work.

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

---

# 5. Multiple electric POCs

A site can be fed from more than one point of connection: two POCs in
different roads, each serving its own self-contained network, the
networks never meeting. Gas and water have drawn this for a while;
electric refused the second POC because every electric walk assumed one
origin.

| File | Change |
|------|--------|
| `src/features/gis/electric.js` | `lvOrigins` (all origins, substations first); the circuit report walks every origin and measures each meter from the one that reaches it, with an `originLabel` per row on multi-origin sites |
| `src/features/gis/feeder.js` | `buildFeederModel` roots each circuit at the origin on its own trench component (seeds decide, not distance) and returns `origin`; two POCs on one network refused by name; a substation beside its incomer POC still wins silently; `trenchComponents` calls every origin's piece connected |
| `src/features/gis/GISCanvasPage.jsx` | The one-electric-POC refusal removed; the levels check, canvas labels, single-node trace and scenario search read source impedance, voltage and upstream drop from **each circuit's own origin** |
| `checkmultipoc.mjs` | New; `checklvorigin`, `checksourceimpedance`, `checkutilitymenus` updated to the plural |

**One migration: `0200_multiple_electric_pocs.sql`** — drops the
`gis_poc_one_electric` partial unique index that 0157 deliberately kept.
Without it the database refuses the second POC with a bare
unique-violation error, whatever the application allows. Run it on
Supabase before placing a second electric POC.

Each POC carries its own declared loop impedance and upstream volt
drop, and each circuit is judged against its own POC's figures.

**Placement is by click now.** The menu button arms the next canvas
click; the node goes where you click, snapped onto a main or trench
only when the click lands within a click's reach of one (the same
reach a drawn line end gets), never across the drawing. Esc cancels.
This applies to all plant — POC, substation, governor, service valve —
because the old behaviour (centre of the view, snapped to the nearest
main anywhere) chose the network for you, which is exactly wrong once
there are two. A second POC on a utility is labelled "Electric POC 2";
the first keeps its unnumbered name so existing drawings read
unchanged.

Not done, deliberately: the way-fuse capacity comparison in the report
header still reads the first origin. On a two-POC site the per-origin
capacity split is a design question (which ways belong to which POC)
rather than a walk, and it deserves its own session.

---

# 6. Measured lengths

A line — trench, pipe or cable — can carry a "Measured length (m)"
(`Attributes.Length_m`), entered in the feature editor beside the drawn
figure. The plan is flat and the run is not: risers, ducts, a dig round
an obstruction, slack the drawing cannot show.

| File | Change |
|------|--------|
| `src/features/gis/feeder.js` | The model's edges carry the measured metres, scaled along the line; `mBetween` on the model; trace legs, dig-end overruns and node ordering read it |
| `src/features/gis/voltDrop.js` | `cumulativeToNode` charges legs on `mBetween` (geometric fallback for hand-built models) |
| `src/features/gis/routing.js` | `serviceFor` charges a tail on the service's measured length |
| `src/features/gis/FeatureEditor.jsx` | Drawn length (read-only) beside Measured length (editable), with the override said in the hint |
| `src/features/gis/GISCanvasPage.jsx` | Length labels show the entered figure marked "entered" |
| `checkmeasuredlength.mjs` | New |

Everything that means "how far does the electricity travel" reads the
measurement — the levels check, loop impedance, trace legs, circuit
report distances (which already honoured it), service tails, and the
gas network's metres (which always did). Everything that means "how
near is this thing" — snapping, joining, meter attachment, span-node
reach — stays geometric, because a measured length does not move the
trench. Scaled proportionally, so a tee half way along the drawing is
half way along the measurement.

Not read from it, deliberately: the electric BOM and call-off
quantities still measure the drawn cable features. Whether ordered
cable should follow a designer's measured trench is a commercial
question — say the word and it is a small change.

## Suite

**102 of 111** with `--py`. The nine failures are all pre-existing and
none is in this area: `checkaslaidplan`, `checkbottleends`,
`checkprojecttabs` (as recorded), `checkdevelopers` and
`checkmigrations` (0198 is not in the folder), `checkorphans`,
`checkroutes` (the `calloffs-FUNCTION.js` duplicate), `checkstatusrules`,
and `checkbuttons.py` (32 house-style deviations, HANDOVER item 11).
