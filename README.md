# A flat on a board is not a plot to place — 11 Sep 2026

Reported from two screenshots: MSDB 2 holds plots 2, 19 and 20, and
Place Plots offered all three as seeds — "5 to place".

There are two placement panels: the one that adds plots to the project
and places them, and the one that places plots already on it. The
filter was on the first only, so the same flats were refused in one
dialog and offered in the other. Both filter now.

The reason is said rather than counted as "already placed", which
would send somebody hunting for a seed that does not exist and never
will: a flat's meter is a row on the board, so there is nothing to
seed. A typed range now reports "3 on an MSDB — their meters are on
the board".

Rendered and checked: with the reported drawing's plots, the panel
offers 17 and 18 and reads "2 to place". The check counts the filter
at both call sites, because one passing and the other not is exactly
the fault. Suite 135 of 153.

---

# Offered means reachable — 11 Sep 2026

Reported: the Circuit Report offered "Circuit 1", the meters were
ticked, Move was pressed, and nothing moved.

`moveToCircuit` resolved the target with `circuitsFrom` — the list by
MEMBERSHIP — so a circuit with no members yet was not found and the
move aborted with "that circuit no longer exists". The report offered
it from `circuitChoices`. **A list to choose from and a list to
resolve against have to be the same list**, or the choice is offered
and then refused.

Four places now read the offered list: moving meters onto a circuit,
joining one by lasso, what that lasso dialog lists, and whether a link
box's stamped circuit still exists (a way-only circuit was being
treated as deleted and its stamp thrown away). The places that ask
about circuits with MEMBERS — the build, the colours, the levels, the
bill — still read `circuitsFrom`, and a case asserts that has not
drifted.

Suite 135 of 153. No migration.

---

# A hand-made circuit as a move target — 11 Sep 2026

Reported: "+ New circuit" on a spare LV way makes Circuit 1, and the
Circuit Report offers no way to assign meters to it — only "assign to
a new circuit".

The report grouped circuits by their membership, so one holding
nothing was invisible. The report is the one place a meter is moved
ONTO a circuit, so the circuit somebody had just made by hand was the
only one they could not use.

`circuitReport` now unions in every circuit allocated on an origin's
way that no member answers to — the same union `circuitChoices`
already does for the editor's pickers, and the fourth reader this
session taught what another already knew. It carries the name given at
birth, the way it sits on, and a `wayOnly` flag so the header can say
"new, on LV way 1 — tick meters above and move them here" rather than
showing an empty section that reads like a circuit which lost its
meters.

Suite 135 of 153. No migration.

---

# Circuits that could not be deleted — 11 Sep 2026

Reported with a drawing whose every circuit is held by MSDBs and a
heavy duty cut-out, and whose eighteen drawn meters are on no circuit
at all: circuits 2, 4 and 6 were missing from the Circuit Report
entirely. The report is the only place a circuit is deleted, so they
could not be deleted.

Two halves, both fixed:

- **The report grouped by drawn meters only.** `circuitsFrom` was
  taught that a board is a member; `circuitReport` was not — the third
  time this session one reader of the drawing knew something another
  did not. It now adds circuits held by a board or a cut-out, and the
  header says what is on them: "0 meters + 1 board (3 flats) + 1
  cut-out · 14 kVA". A circuit reading "0 meters · 0 kVA" beside a
  Delete button is an empty-looking circuit that is nothing of the
  sort. It also no longer refuses a drawing with no drawn meters at
  all, which is the flats-only case where the report matters most.
- **Deleting unassigned meters only.** A board kept naming its
  circuit, so the circuit came back the moment anything read the
  drawing again. Boards and cut-outs are now taken off with the
  meters, and their link box output with them: an output feeding a
  board on no circuit is a claim about a feed that no longer exists.
  The confirm dialog says so before anything is written.

On the reported drawing the three circuits now appear with their
boards, flats and cut-out counted. Suite 135 of 153. No migration.

---

# The breech's feeder end point — 11 Sep 2026

Four rules, asked together.

- **Break → a point at the insert point.** Already the case; unchanged.
- **Numbered against its circuit.** `planInsertion` puts it in its
  right place ALONG the cable and renumbers the stops after it — but
  it needs an origin (a stop numbered 0) to measure from, and returned
  nothing without one, so a point on a hand-drawn circuit came out
  labelled "Point" with no number. `nextSeqFor` is the fallback: one
  past the highest on the circuit, or the FIRST where the circuit has
  none. It starts at 1, because 0 is the origin's and a hand-placed
  stop taking it would claim to be the start of the run.
- **Levels at it.** It is an ordinary stop carrying the cable's size,
  so the levels quote it like any other — nothing special was needed.
- **No break → no point.** This is the behaviour change: the stop used
  to be created either way. A breech let into a run that carries on
  ends nothing, so a stop at it puts a figure on the drawing that no
  cable terminates at, and pushes every stop after it up one for
  nothing. The renumbering writes go with it.

Suite 135 of 153. No migration.

---

# Cables offset by ground distance — 11 Sep 2026

Reported from a zoomed-out screenshot: cables sharing a trench splayed
far enough apart to read as separate routes. The offset was a flat 5
pixels applied to screen coordinates — the same gap however wide the
view — and 5 pixels at a site scale is metres of ground.

- The plan now hands out a **lane** (how many cable-widths off the
  true line, and which side) and the pixels are worked out at draw
  time against the current zoom. The gap means `SPACING_M` = 300 mm,
  a real bedding separation, at every scale.
- Clamped at both ends, because a drawing is also a thing to read:
  never below 1.1 px (two cables merged into one stroke is a drawing
  that has lost a cable) and never above 7 px (a hard zoom would push
  them apart into separate routes again). Zoomed out to a whole site
  the pair draws about 2 px apart — tight, which is what a trench
  looks like from a distance.
- Applied in all four places a cable is drawn or clicked: the cable,
  its markers, and both hit tests. A hit test reading the old flat
  pixels would find a cable where it is not drawn, and pick a
  different one at each zoom.
- The collision pass that steps a run off a taken lane moves the lane
  and the pixels together, or the two would disagree and the very
  collision it exists to fix would return at every zoom but one.

`checkfeederoffsets.mjs` measures the gap ON THE GROUND across the
zooms a designer uses, and asserts the tight-when-wide and
not-invisible bounds. No migration. Suite 135 of 153.

---

# A \u2014 on screen — 11 Sep 2026

The breech dialog read "held on it \u2014 it bends with the joint".
A `\uXXXX` escape only means something inside a JavaScript string; in
JSX text it is six literal characters. Mine, and shipped.

`checkjsxescapes.mjs` now scans every .jsx file for it. Two real
instances, both from this session: the breech dialog, and the ohm
symbol in the heavy duty cut-out's loop impedance. Both are HTML
entities now, and the rendered output is checked to contain a real
Ω and no backslash-u anywhere.

The scanner itself needed two goes, which is the interesting part. A
per-line version reported **503** faults: this codebase writes block
comments without leading asterisks, so every continuation line
discussing an escape looked like markup. A character-level state
machine cut that to eleven — of which nine were nested template
literals, `${...}` holes inside a template, where the inner backtick
read as the closing one. With a stack for those holes: two, and both
real. **A checker that cries wolf 500 times teaches people to ignore
it, so the false positives mattered more than the true ones.**

Suite 135 of 153.

---

# Placing a breech joint — 11 Sep 2026

**The reason nothing happened: a typo of mine that threw.**
`snapTargets` returns entries holding `point`; the click handler read
`t.at`, so `undefined[0]` threw a TypeError and the handler died
before doing anything — no joint, no dialog, not even an error
message. It broke the straight joint too, since the snap runs before
the kind is considered.

The check of the day asserted that `snapTargets` was CALLED, which it
was. A loop inside a click handler can only be grepped; the snap is
now `pointOnLineNear` in snapping.js, a function with a return value,
tested against a line for ends, corners, midpoints, out-of-reach and
bad input. Putting `t.at` back makes three cases fail.


**Then reported: no question, and no joint either.** The armed mode
disarmed itself BEFORE testing whether a cable was under the click, so
a click a few pixels off the line ended the mode and said only "click
on an LV feeder cable". The next click — aimed properly — did nothing
whatever: no joint, no question, no error, because nothing was armed
to answer it. Two clicks in a row is what the report describes.

A miss is now a miss: the mode stays on, the message says so, and Esc
ends it, which is what the menu item has claimed all along. The mode
disarms when a cable is actually found.


**Reported after the first cut: "it did not break the cable."** True,
and in the commonest case. At the END of a cable there is nothing to
cut — `splitPolylineAt` returns null, because a split needs a length
either side — and a breech is most naturally placed exactly there, at
the end of the run it terminates. `breakLineAt` set an error and
returned nothing; the placement carried on and wrote
`Breaks_Cable: true` about a cable it had not touched.

Three faults behind it, all fixed:

- `canBreakAt` is asked BEFORE the choice is offered, and the dialog
  no longer offers a break where none is possible — at a cable end it
  says so and offers only to place the joint. One rule, asked by both
  the button and the act, so they cannot disagree.
- A break refused for any other reason (a locked cable) now aborts
  instead of placing a fitting that claims it.
- **`breakLineAt` returned nothing at all, including on success.** Its
  only caller that asks — the joint recording the cables it holds —
  always got undefined, so a joint placed on a break has always
  written down the original cable's id and never the far half's. The
  half beyond the joint was held by nothing, which shows as it not
  following when the joint is dragged. It returns both ids now.


Three things, asked together.

- **Clicked onto a point of a cable.** The breech armed for a click,
  like the straight joint beside it, instead of being dropped in the
  middle of the view and snapped to whatever feeder was nearest. The
  click lands on an end, a corner or the midpoint of a run — the same
  vocabulary the heavy duty cut-out uses — falling back to the point
  under the pointer, so a deliberate click halfway along a long
  straight is not dragged to a corner metres away.
- **Break the cable, or don't.** Asked at placement, because the
  drawing cannot tell: a breech where a run ENDS and others begin is
  two cables, and one let into a run that carries on is one. Two
  buttons that each say what the drawing will hold, rather than a
  checkbox whose unticked state the reader has to work out. The answer
  is recorded as `Breaks_Cable` — afterwards the two look identical.
- **It rubber-bands when dragged.** This falls out of the second if
  the second is done properly. "Leave the cable whole" cannot mean
  "drop a symbol on a line": the drag moves VERTICES, so a fitting
  with none under it slides off its own cable the first time it is
  moved. Leaving it whole therefore inserts a vertex at the point
  (`insertVertexAt`, the other half of `splitPolylineAt`), and the
  existing rule carries it from there — the cable stretches rather
  than sliding, because only the held index moves.

Where several cables lie under the pointer, the existing "which
cable?" dialog asks first and then hands on to the break question —
two questions because they are two questions. Every other joint kind
keeps the behaviour it had. No migration. Suite 134 of 152.

---

# The substation editor — 11 Sep 2026

Follows the per-way fuse below.

- **Headed "Substation"**, not "Point". A header over a panel of ways,
  fuses and circuits should name the thing somebody opened. POC and
  MSDB got their own names at the same time.
- **Rating (kVA), Output (V) and LV ways share one row**, a third
  each. `.fe-row` gives its children `flex: 1`, so the layout follows
  from the count of fields in the row rather than from a width set
  anywhere — which is what the check asserts. The second row went with
  the board-wide fuse control that used to sit beside LV ways.
- **A fifth wider** (504px against the base 420px), because the board
  is a table and the per-way fuse made a fifth column that the row had
  no width left to give.
- **The board-wide Way Fuse control is gone.** One box rating the
  whole board alongside five rating each way is two answers to the
  same question. The ATTRIBUTE stays: every existing drawing has a
  `Way_Fuse_A`, `fuseForWay` still falls back to it, so those boards
  read exactly as before and their ways show that rating until
  somebody sets them. Removing a control does not remove a value.
- **The fuse is chosen, not typed**: 160, 200, 315, 400, 500. A free
  box invited 3150 for 315 with nothing able to notice. Where a board
  already carries a rating off that list — 250, say — it stays in the
  list and stays selected: opening a panel must not quietly round
  somebody's design to the nearest option.

---

# A fuse rating per way — 11 Sep 2026

The substation's board carried one rating for all of its ways, which
is only true where every circuit is the same size. A way feeding four
flats and a way feeding a street of houses are not protected by the
same fuse, so a loading percentage quoted against a board-wide rating
was answering a question nobody had asked.

- Each way row in the substation editor has a **Fuse** box. Typing a
  rating sets it for that way; clearing the box hands it back to the
  board. The board's rating shows as the placeholder rather than as a
  value, so a row following the board reads as following it instead of
  claiming a rating of its own.
- The loading bar beside it is judged against **that way's** fuse, and
  read off the draft, so the bar moves as the number is typed.
- Settable on a spare way too: a rating can be decided before the
  circuit that will sit on it exists, which is the order things happen
  in when a board is planned.
- `fuseForWay(substation, way)` is the one rule — way, then board,
  then the built-in default. A cleared box, an empty string, a null
  and a zero all mean "follow the board", never "no fuse".

Existing drawings are untouched: none has a `Way_Fuses` map, so every
way reads its board's rating exactly as before. That case is the first
one in the check, because on the day this ships it is the only one
that applies. No migration — the map is an attribute. Suite 133 of
151.

---

# Checks live at the root — 11 Sep 2026

Five `check*.mjs` files were sitting in `src/features/gis`. `checkall`
reads the repo root only, so none of them had run since being put
there — and none of them could: their imports are written for the root
(`./src/features/gis/feeder.js`), so they crash where they live.

Four were older, smaller generations of a root check with the same
name; the root versions cover the same rules with their own newer
fixtures. The fifth was different. **`checkoverridecarry` had been
fixed on 9 September in the stranded copy** — the fixed
30,000-character window replaced with a slice to the end of the
function, its comment calling it the fifth outing of fault 33 — and
the root copy kept the old window and kept failing. The repair existed
and had never once run.

- The fix is now in the root copy and `checkoverridecarry` passes.
  Standing failures go from nineteen to eighteen.
- The five strays are deleted (tracked in git, so recoverable).
- `checkdupes` now walks `src` and fails on any `check*.mjs` outside
  the root. A stale duplicate that fails is one thing; a FIX that
  lands in the copy nobody runs is worse, because the work is done and
  the benefit is invisible.

No migration. Suite 132 of 150.

---

# A self-lay plot is on nobody's circuit — 11 Sep 2026

Reported from a 231-plot site: "Link the meters to circuits: 214 of
231 meter(s) on a circuit", and Auto Build LV Network asking to be run
anyway every time. The seventeen short were exactly the seventeen
self-lay plots — checked against the drawing, the two sets match with
no difference either way.

A self-lay plot is fed from the incumbent's network: we dig to their
tee and lay nothing past it. It is on no circuit of ours by design, so
the step could never be completed and the warning could never be
cleared.

- `electricSteps` and `buildBlockers` both take an `isSelfLay`
  predicate now and leave those meters out of the count. The canvas
  passes `isSelfLayMeter`, which already existed and reads
  `Plot_Utility.Self_Lay_Provider` — neither module loads tables, so
  the fact is handed in rather than looked up.
- Both default to "no", so any caller not yet told reads exactly as
  before. Cases hold that, and hold that an ordinary plot genuinely
  off a circuit is still caught: the exemption is self-lay, not "has
  no circuit".
- On the reported drawing the step goes from "214 of 231" to "214 of
  214", and the build from a warning to clean.

No migration. Suite 131 of 150.

---

# Auto Service re-lays only what moved — 10 Sep 2026

A seed with a service trench was skipped as already done. Right the
second time a site is run, wrong the moment somebody MOVES something:
drag the property boundary point, or the end of the trench, or
re-route the mains the service tees off, and the drawn dig no longer
goes where the drawing says it should — and the run skipped it, so the
stale trench stayed until somebody deleted it by hand.

- **Every plot with a service trench**, not just self-lay ones. The
  only gate is that something was already laid to the seed;
  `selfLayOnly` decides which MAINS the tee is measured to (yours or
  the incumbent's) and nothing else. A case states this and a guard
  fails if the check is ever narrowed to self-lay.
- `serviceMoved` compares the drawn dig against the three facts its
  route is built from: the tee foot on the nearest mains to the
  boundary, the stop (`Trench_End_At` or the boundary point), and the
  boundary vertex where the on-site and off-site lengths are split.
  Against the DRAWN geometry, not a fresh plan — re-planning follows
  the dig that is already there, so a plan agrees with the drawing by
  construction and nothing would ever look changed.
- A moved service is re-laid through the same door as a self-lay
  change: old trench and cables deleted, seed back to the planner.
- The run now says WHY: "3 re-laid (2 the property boundary point has
  moved; 1 the mains it tees off has moved)". "Re-laid" alone reads as
  the run doing something unasked for.
- **Most of the work is in NOT re-laying.** A test that says "changed"
  too readily re-digs the whole site every run, which is worse than
  the fault. A dig drawn back-to-front, a round trip through the
  database, a route whose boundary coincides with its stop (the
  planner drops that vertex deliberately), and a self-lay plot teed
  off the incumbent's main all come back unchanged — each has a case,
  and the tolerance and end-swap guards were proved by removing them
  and watching the suite fail.

No migration. `checkservicemoved.mjs`, twelve cases. Suite 131 of 150.

---

# Levels at the cut-out, and a circuit fed through boards — 10 Sep 2026

Two faults, both in the levels check, both reported from one drawing:
four MSDBs on Circuit 1, two supplies and two heavy duty cut-outs on
Circuit 2. Circuit 1 was refused — "Circuit 1 has no supplies on it —
nothing to trace" — and Circuit 2 did not appear at all.

- **The check walked the raw drawing.** A board's flats are not meters
  on the canvas, so a circuit whose only members are boards had no
  members at all here. `withAssumedMeters` is what the build and the
  node labels have always used; `runLevelsCheck` was the third reader
  of the same drawing and the one nobody had told. Circuit 1 now
  traces five legs.
- **The trace pruned the run to the cut-out.** It drops branches
  carrying no load, keeping one that holds a STOP — which saves a span
  node at the end of a dead trench, and did not save this: a cut-out's
  stop is at the FAR end, and the nodes between the origin and it hold
  neither load nor a stop, so the walk was cut at the first of them.
  One leg of 11.9 m came back for a circuit with two supplies and two
  cut-outs. The walk reads `carriesCable` now, the same rule the build
  uses, and Circuit 2 traces three legs — B1, and B2 and B3 at the two
  cut-outs.

No migration. `checkhdcoterminal.mjs` carries both, and the levels case
needed a fixture with bare ground between the last plot and the
cut-out: an earlier one ran straight from plot to cut-out and passed
with the fix removed. Suite 130 of 149.

---

# One circuit's cut-out is not every circuit's — 10 Sep 2026

Reported from the drawing: two heavy duty cut-outs, both set to
Circuit 2, with **two LV cables laid to each** — one per circuit — and
two feeder end points at each (A8/A9 and B8/B9).

The cause was older and wider than the cut-outs. `buildFeederModel`
takes `msdbIds` and `hdcoIds` and reads absent as "count every one of
them"; the build never passed either — it passes `circuitId`. So every
circuit's walk counted every board and every cut-out on the drawing,
and two circuits over one dig produced two identical sets of runs, each
carrying the other's boards. The cut-outs are simply where it became
visible.

- The model now derives both sets from `circuitId` when the caller
  hands in neither. An explicit set still wins unchanged, because the
  link box walk narrows by output as well and that is a judgement the
  circuit alone cannot express; absent both, everything counts, which
  is what a whole-drawing trace means. On the reported drawing circuit
  1 goes from nine runs to five and touches neither cut-out; circuit 2
  keeps three and reaches both.
- **Levels at the cut-out**: its editor now shows "At the cut-out" —
  the volt drop and the loop impedance — resolved the way the board's
  figure is, by reach to the stop the walk numbered a metre or so away
  on the trench end. Blank with "Run the levels check" until one has
  run, rather than a zero: an uncomputed figure and a genuine nought
  read the same on screen and are not the same thing.

No migration. `checkhdcoterminal.mjs` carries the two-circuit case and
fails with the reported symptom when the fix is removed, proved by
removing it. Suite 130 of 149.

---

# A flat on a board has no seed — 10 Sep 2026

Reported from the same flats-and-supplies drawing: **"Place the plot
seeds first — 0 seed(s) for 65 plot(s)"**. The step counted every plot
in the schedule and wanted a seed on the ground for each. A flat fed
from an MSDB has none by design — its meter is a row on the board's
table, assumed for the length of a build — so the LV build was refused
for not doing something it must not do.

- The seeds step now measures against the plots that still want one:
  the schedule less every flat a board has claimed, through
  `plotsOnBoards`, the same reader the build's blockers use. Where none
  do, the step is done because there is nothing to place, and it says
  why: "every plot is a flat on an MSDB — 65 need no seed". A count of
  "0 of 0" against 65 plots on the project would read as a fault of its
  own.
- **The same fault one step along** would have been the next thing
  hit: a service is dug to a seed, so a drawing whose dwellings are all
  on boards has nothing to run one to. Auto Service is now done when
  there is genuinely nothing on the ground to serve — no plot seeds and
  no non-residential supplies. One seed with no service is still a step
  in progress and still says so.
- An ordinary house among the flats still wants its seed, a supply on
  the ground is still something to service, and neither exemption
  touches the schedule.

No migration. `checkelectricsteps.mjs` carries the reported drawing's
shape, the mixed case, and the supply case. Suite 130 of 149.

---

# A cut-out at the end of the line — 10 Sep 2026

0209's heavy duty cut-out is spliced into a feeder that already
exists: the cable runs THROUGH it, no break, no point. That is half of
what one is for. The other half is a cut-out placed at the **end of a
mains trench**, before any cable is drawn, as the thing the run
terminates in — nothing assigned to it, no plots behind it. The
router walks toward load, so a branch worth no meters was never
cabled and the cut-out sat on an empty trench.

- **One idea**: a branch holding a cut-out is worth cabling even with
  no load on it. The cut-out DEMANDS a cable; it does not pretend to
  be load. `demand` accumulates up the tree as `cumDemand` beside the
  meter counts, and one shared rule — `carriesCable` — answers "is a
  cable laid beyond this node" for the section walk, the junction pass
  and the end-of-line pass alike. Three spellings of `cum[i] > 0` is
  how a branch came to be cabled by the router and then ignored by the
  thing that numbers its stops.
- **The feeder end point falls out**: at the end of a dig the cut-out
  is the last node the walk reaches, so the section ends there, so the
  end-of-line pass marks it, so a point lands on it. The same three
  steps that put a point at any other end. Cable counts get a floor of
  one on a demanded run, because `cablesFor(0)` is none — a route the
  build walks and lays nothing along.
- **Placing**: click a bare mains trench (service trenches excluded).
  The LV feeder is tried first, so splicing still wins where there is
  a cable. A trench-placed cut-out has no cable to inherit a circuit
  from, so its editor asks — Circuit (offering way-only circuits too)
  and an optional Supply (kVA), which is zero by default and counted
  as load when stated.
- **Unchanged, deliberately**: a cut-out spliced mid-run stays passive
  — no break, no point, no loss. `checkhdcoterminal` fails if that
  stops being true, proved by wiring the leak in and watching it fail.

No migration: 0209's role and style already cover it, and everything
new is attributes. `checkhdcutout` needed two repairs while passing
through — it sliced a fixed 3,000 characters from the placement branch
(so adding comments to the branch failed four assertions at once) and
pinned three assertions to a variable name that had to change. Suite
130 of 149; the same nineteen standing failures.

---

# The build refused a drawing it could build — 10 Sep 2026

Reported from a flats-and-supplies drawing: three MSDBs, four
non-residential supplies, and Auto Build LV Network refusing with

> 2 plots with no service trench: , .

Two EV charge points, drawn ON the mains route. The model attached
both and skipped nothing — the build could have run.

- **A supply standing in the mains dig needs no service trench.** The
  cable tees where it already runs. `buildBlockers` asked only whether
  a *service* trench was near, so a supply 0.1 m from the mains trench
  read as unreachable. It now also accepts standing in the mains dig
  (2 m — in it, not beside it), which is the build's own question. An
  ordinary plot several metres off the mains route still wants its own
  service, so the omission the blocker exists for is still caught.
- **A supply is not a plot and has no plot number.** The labels came
  from `plotLabel(null)`, which is why the list was two commas. A
  supply is now named from its seed, or from its meter's label with
  the "Electric Meter" prefix taken off, and carries `isSupply` so the
  message counts plots and supplies apart and never calls one the
  other.

No migration. `checkbuildblockers.mjs` carries both cases from the
reported drawing, plus the plot-beside-the-mains case that must still
be refused. One assertion in it was pinned to the exact text of a line
rather than to what the line does, and failed on a `.filter(Boolean)`;
it now tests the rule.

---

# A circuit without a lasso — 10 Sep 2026

A block of flats fed from an MSDB has no seeds on the drawing and no
drawn meters — the dwellings are a table on the board — so there was
nothing for Link to Circuit to draw round, and a flats-only design
could not make a circuit at all: the build stayed gated off and every
picker was empty.

- **Born on a spare way, and born named**: the substation editor's
  board grows **+ New circuit** on every spare row. It writes the way
  map on the draft (like the free button beside it, and for the same
  reason) and the circuit exists from the save — holding nothing, on
  the way it will occupy, **carrying its name from the moment it
  exists**. `nextCircuitNumber` gives the next number in SEQUENCE
  (max + 1 across ids, way allocations and "Circuit N" names), not the
  lowest free gap `nextCircuitId` hands the lasso: with Circuit 2 and
  Circuit 3 on the drawing the gap rule named the new one Circuit 1
  and listed it underneath them. One number serves as id, name and
  letter, so the drawing's letter and the schedule's number agree. The
  name lives in a `Circuit_Names` map on the substation — a memberless
  circuit has no member to carry it — is editable in the way row,
  travels onto the board at membership, and clears with the way.
  `nextCircuitId` now counts way allocations, so a number in use
  cannot be reissued to the next lasso. The way row's name box keeps a
  110px floor and the row wraps: a memberless circuit puts "nothing
  linked" and "Clear this way" in the same cell, and the input — the
  only shrinkable thing there — used to collapse to thirty pixels, so
  a newborn circuit looked as though it had no name.
- **Membered by the board**: the board's Circuit picker reads
  `circuitChoices` — the membered circuits plus every way-only one,
  each way-only entry naming its way and the origin whose board holds
  it (written as `Circuit_Origin_ID` on a two-origin drawing, because
  that IS the answer to "fed from"). Saving the board is the
  membership: `circuitsFrom` counts a board as a member in its own
  right, so the circuit persists, the build gate opens, and
  `withAssumedMeters` carries the flats in as meters exactly as
  before.
- **Completed on save**: saving a board onto a circuit ensures the
  canvas's half — node A0 on the origin and the LV way booked
  (`assignWay` reuses one already held, so joining takes no second
  way) — the same two acts the lasso performs, ensured rather than
  assumed so a board joining a lasso-born circuit changes nothing.
- The substation's way rows count the load honestly: a way's figure
  adds each board's `MSDB_Total_kVA` and says "N flats" beside the
  meters, and a lasso joining a board-borne circuit counts the board
  in the way figure too. The flat count reads `boardFlatCount` — the
  picked plots (`MSDB_Plot_IDs`, the current mechanism) first, the
  manual apartment table as fallback — because counting the table
  alone read "0 meters" on a way carrying a real board kVA, a count
  and a figure disagreeing about the same object on the same line.

No migration. `checkboardcircuit.mjs` drives the birth, the offer, the
membership and the assumed-meter carry-through, and holds the editor
and the save to their halves. Suite 129 of 148; the same nineteen
standing failures as before the change.

---

# The HV ring — 10 Sep 2026

The drawing stopped at the POC. Upstream of it, the standard UK
arrangement is the one the model could not say: the substation is not
on a dedicated way at the primary — it is looped in and out of a
shared 11 kV (sometimes 6.6 kV) circuit, one of several substations in
series on one way's cable, the far end running back to a second way
with a normally open point along the route. The ring switches at each
RMU are load-break switches, so a cable fault anywhere on the chain
trips the way's breaker at the primary and takes every substation on
it; supply comes back by sectionalising and closing the open point.

- **Placing**: the electric menu grows an **HV Ring** branch — Primary
  Substation, Ring Substation, Normally Open Point, and Manually add
  Existing HV Cable (`elec_hv_existing`, dashed, the incumbent's). The
  ring substation and the open point snap onto the HV run; the open
  point takes the cable's bearing and draws as an open switch blade
  with "NO" beside it. All three go down `Build_Status: existing` —
  they are the incumbent's plant and the circuit's operating state,
  and 0208 (once recovered and run) keeps them off the bill.
- **Recording**: the primary carries `Feed_Way` and `Return_Way` (the
  feed way's breaker is what protects the whole chain); the site's
  substation — and any ring substation — carries `HV_Connection`
  (looped / teed / dedicated) and, when looped or teed, the
  transformer tee protection and fuse rating, because the tee's own
  device is the one whose operation takes out that substation alone.
- **Reading**: `hvRing.js` walks the chain from each primary, in cable
  order, stopping at the open point. The editor says the result out
  loud on every station: fed from which primary and way, how many
  substations up the chain, how many share the leg when the cable
  faults, and back-feed via the open point. Findings for a ring drawn
  closed, a chain with no primary, a substation the run does not pass,
  and an open point standing on nothing. Two lengths drawn TO the
  substation symbol rather than to each other chain through it — the
  RMU is the splice. The network trace can start at a primary.
- Model support: `hvRingModel`, `feedSummary`, `faultCompany`,
  `HV_LINE_TYPES`, `HV_CONNECTIONS`, `RMU_TEE_PROTECTION`. Bulk delete
  gains the three plant kinds and the existing HV cable, each on its
  own so redoing the split does not take the primary with it.

`checkhvring.mjs` drives the walk with the standard arrangement —
moving the open point flips the feed direction, the closed ring is
called closed, the dedicated-way substation is left alone — and holds
the canvas, editor, migration and bulk delete to their parts. Suite
128 of 147, one not run; the nineteen failures all predate the session
(checked against a stashed baseline, which fails the same nineteen
plus the two this session greens). **One migration to run:
`0211_hv_ring.sql`**, after 0209
(`0209_hdcutout_role.sql` was found in `supabase/` and moved into
`supabase/migrations/` this session, which un-crashed `checkhdcutout`).

---

# Link box output routing — 3 Sep 2026

A link box is the remedial answer to high losses: break the run, split
the load across fused outputs. The split is a design decision — which
plots hang off which output — and it is now lassoed, stored, and built.

- **Assigning**: open the box, and each output row carries "Lasso
  plots" (and Clear, once it holds any). The lasso is the Link to
  Circuit lasso; what it writes is Link_Box_ID and Link_Way on the
  meters — the same register circuit membership itself uses. Only
  meters on the box's own circuit qualify; others are counted out loud
  and left alone. Re-lassoing overwrites.
- **Building**: Build LV Network splits an assigned circuit into
  parts. Unassigned plots route from the origin exactly as before; a
  TRUNK runs origin → box, one section along the model's own path,
  carrying the total of everything the outputs serve — the input
  cable, sized by what flows through it; and each OUTPUT routes from
  the box to its own lassoed plots. A part that cannot route says so
  with the output's name on it, and the others still build.
- **Marks and points**: junctions and ends are gathered per part and
  deduped by position, so the trunk's far end and the ways' roots —
  all standing on the one box — mark it once, and the maintenance
  adopts the box itself rather than making a twin beside it.
- Model support: `buildFeederModel` takes `rootFeature` (root the walk
  at a stated feature, past the origin machinery); `feeder.js` exports
  `linkWayAssignments` and `circuitBuildParts`, and the build consumes
  parts — still through the one membership walk.

`checklinkbox.mjs` drives the split through `circuitBuildParts` with
the build's own inputs: trunk origin→box at the outputs' total kVA,
each way from the box to its own plot only, the unassigned plot still
fed from the origin, plus the structural stitching. Suite 104 of 113;
the standing nine. No SQL beyond 0202 (already issued).

---

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
- **Linking assigns the POC.** On a drawing with more than one
  electric origin, the "Which circuit?" dialog carries a **Fed from**
  box: a new circuit must say which POC feeds it before it can be
  created (from the lasso or from the Circuit Report), and a join
  keeps the circuit's own POC unless you change the box — changing it
  rewrites every member so the circuit says one thing. The decision is
  written as `Circuit_Origin_ID` on the members, which the build reads
  before every other rule; the LV way is booked on that POC's own
  ways, and the circuit's A0 stands on it from the moment of linking.
- **Fed from, in the editor.** Open any member of a circuit — a meter,
  a feeder point, a run — and the circuit strip carries a "Fed from"
  select on multi-origin drawings: the circuit's POC, or "Not set — the
  build picks the nearest". Changing it rewrites every member and the
  status says to rebuild; the routing moves when Build LV Network runs.
- **Fed from is settable in three places**, all writing the same fact
  (`Circuit_Origin_ID` across the circuit's members): the **Circuit
  Report** — one box in each circuit's header, every circuit in view,
  the natural place; the **linking dialog** when creating or joining;
  and any member's **feature editor** under the circuit strip. "Build
  decides (nearest)" is the honest empty state. Distances in the
  report re-measure immediately; the routing moves on the next Build
  LV Network, and the status says so.
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
