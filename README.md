# A cable that runs through a span node feeds it, 1 Sep 2026

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

## Suite

**99 of 108** with `--py`. The nine failures are all pre-existing and
none is in this area: `checkaslaidplan`, `checkbottleends`,
`checkprojecttabs` (as recorded), `checkdevelopers` and
`checkmigrations` (0198 is not in the folder), `checkorphans`,
`checkroutes` (the `calloffs-FUNCTION.js` duplicate), `checkstatusrules`,
and `checkbuttons.py` (32 house-style deviations, HANDOVER item 11).
