# Aptus360 — handover notes

**This session added text notes to the GIS canvas (0228), found that
the bill of materials counts annotation (0229), and stopped the two
checks that crashed from taking their own reports down with them, and
built the Aptus Calc Sheet — which turned up a volt drop that had been
reading 0.58 points light on every scheme (fault 154).** Both are written
up as faults 152 and 153. Two migrations to run, in order; neither
changes a figure on any bill that exists today. The half that WOULD —
taking cross-section marks off the bill, which they have been on since
0214 — is left undone on purpose and is now item 11 of the open work.
The new module is `textNotes.js` and the new check is
`checktextnote.mjs`.

The paragraph below was written at 0211 and the folder now runs to
**0229**. Everything from 0212 on — the HDCO name on the bill, the
washout and section-mark roles, the annotation layer, the DXF layer
catalogue, the developer portal, the enquiry sheets, and this
session's two — is in `supabase/migrations/` and is not described in
the body of this file. Read the folder before trusting anything here
about the schema.

The migrations folder ran to **0211** when this was written. Three numbers are absent
and READ or REQUIRED by something: **0198** (`checkdevelopers` reads it
and throws), and **0208 / 0210** — both written and described in this
file, both "not yet run" at the time, and neither committed. 0209 was
found sitting in `supabase/` rather than `supabase/migrations/` and
moved in (which is what was crashing `checkhdcutout`); `checkmigrations`
now names all three absences. **It names five now:** `0221` and `0222`
are absent too, both read by `checkdxflayers`. All five want recovering
from the live project; none of them should be written from what the
checks assert. Recover them from the live project rather
than rewriting them — 0208 is the whole existing-plant bill rule and
0210 carries it verbatim plus the HDCO naming. Whether anything from
0196 onwards has been pasted into Supabase is not something this file
can know, since there is no migration runner: check the SQL editor's
history before assuming the schema matches the folder.

**Last session added the HV ring, then circuits without a lasso.** The
HV ring is how the substation is actually fed, upstream of the POC:
looped in and out of a shared 11 kV circuit, several substations in
series on one way's cable, a normally open point splitting the ring in
normal running. Three new roles (`primary`, `ringsub`, `openpoint`),
one new line type (`elec_hv_existing`), RMU facts on the substation,
and a pure chain-walk in `hvRing.js` the editor reads out loud. See
the README's entries and **The HV ring** below. **Migration 0211 to
run**, after 0209. Nothing in the LV build changed; the new roles are
in none of the walks' role lists, so the chain is a record the LV
network sits under, not a participant in it.

The second half is for a design that is just flats on an MSDB, which
had nothing to lasso and so no way to make a circuit: a circuit can
now be **born on a spare LV way** in the substation editor and
**membered by the board** — `circuitsFrom` counts a board as a member,
`circuitChoices` offers the newborn way-only circuit to the board's
picker, and saving the board ensures node A0 and the way booking, the
same two acts the lasso performs. **No migration for this half.** See
**Circuits without a lasso** below.

**The session before was a GIS session.** Three faults in Build LV Network
and the link box are fixed and written up as recurring faults 28, 29
and 30: cable size overrides lost on every rebuild, a link box's label
and sequence not following the walk, and a `Span_Anchor` left behind
when its point is dragged. Two modules came out of `GISCanvasPage.jsx`
in the process — `feederPoints.js` and `anchorFollow.js` — because in
both cases the rule could not be tested where it lived. Three checks
were added. Nothing in the schema changed; no migration was written.

**Before that was a test-suite session**, not a feature one. `npm test`
now runs — it did not before, and this file used to record that as a
standing fact. See **Testing** for what changed and what still fails.
Four faults it uncovered are fixed: the `reducer` feature role (0187),
`Craft_Utility` in the admin allowlist, the energisation phase order
(0180 amended), and two stale duplicate modules that were serving live
traffic. Fault 22 below is the shape all of those shared.

The body below still describes the state at 0136 in places and has not
been re-checked against everything that landed since — call-off utility,
assignment split, gas pressure, craft scope, project organisation branch
and multiple gas/water POCs are all in `supabase/migrations/` and are not
described here. Read the migrations before trusting the "open work" list.

The previous version of this file was written at migration 0048 and had
gone badly out of date: it listed GIS undo/redo, trenching and the
Project Invoices tab as unbuilt when all three had shipped. If you are
reading this more than a few sessions later, check
`supabase/migrations/` and `git log` before trusting the "open work"
list at the foot. **Update this file when the picture changes** — a
handover that lies costs more than no handover, because work gets
planned against it.

## How the project is worked on

Files are delivered as zips, copied into the repo by hand, committed via
GitHub Desktop; Netlify builds automatically. SQL migrations are run by
hand in the Supabase SQL editor — **there is no automatic migration
runner**, so a schema change only exists once it's been pasted and run.

## Architecture

- React + Vite, deployed to Netlify
- Netlify Functions under `netlify/functions/`, one file per endpoint
- Supabase (Postgres) with the service-role key in the functions only
- `src/api/*` wraps every endpoint; components never call `fetch` directly
- `VITE_USE_MOCKS` switches the API layer to in-memory fixtures
- No router. `App.jsx` switches on a `view` string held in state and
  remembered in session storage

**Calculations live in the database**, deliberately. Points, plot refs,
invoice totals, status promotion, network tracing and line lengths are
triggers or functions, so they hold however the data is changed —
including by hand in the SQL editor.

## Navigation

The app opens on a landing page of eight squares, one per area of the
business. Choosing one scopes the sidebar to that area's screens and
nothing else.

`src/lib/navigation.js` is the single source of truth for three things
that previously drifted apart: what the landing page offers, what the
sidebar shows, and which menu items People & Roles can grant. Adding a
screen there adds it to all three. `AREAS` is also exported as
`NAV_SECTIONS`, because People & Roles reads that name.

Two consequences worth knowing before you edit it:

- **`ALL_VIEWS` is derived, not listed.** It used to be a hand-kept array
  in `App.jsx`, which was a second place to remember a screen — one added
  to the sidebar but missed there was a page you could navigate to but
  not reload back into.
- **The sidebar is not on every screen.** The landing page has no menu.
  Anything app-wide must live in `src/styles.css`, not in the sidebar's
  own `<style>` block. See fault 11.

About **thirty unbuilt placeholders came off the menu** in the same
change — the Electric, Gas and Water design sections, the Logs section
and most of the dashboards. Every *built* screen is still reachable, and
`checknav.mjs` fails if that stops being true. If one of those sections
becomes live work, it needs an area in `navigation.js` first.

## Testing

```bash
npm test          # every check*.mjs
npm run check     # the above plus the Python source checks
```

Both go through `checkall.mjs`, which **runs everything and reports
everything** rather than stopping at the first red one. Individual
scripts still work: `node checkspannodes.mjs`, or
`node checkall.mjs --only span` for a subset.

As of this session: **99 of 108 pass in about 40 seconds**, with three
of those new — `checkoverridecarry`, `checklinkboxseq` and
`checkanchormove`. It said 88 of 93 and five failing; the count moved
because three checks were added and because the numbers below have to
be re-counted rather than carried forward. The nine that don't pass are
listed at the foot of this section, and **none of them are new** — the
five recorded last time, plus `checkdevelopers`, `checkstatusrules` and
`checkvehicles`, which had already gone red before this session started.
A handover that lies about the suite costs the same as one that lies
about the schema.

Note also that the suite needs `npm install` first. Four of the nine
"failures" were jsdom crashes on a fresh clone with no `node_modules`,
which is a different thing from a check reporting a fault and reads
identically in the summary line.

Run these after touching the relevant area. They exist because each one
caught a fault that had already shipped at least once.

| Script | What it checks |
|---|---|
| `node checkall.mjs` | The runner. Discovers the others; `--py`, `--only`, `--quiet` |
| `node checknav.mjs` | Every rendered view sits in an area; no view in two areas; area colours distinct; areas open on a built screen |
| `node checkhome.mjs` | Mounts the shell in jsdom and drives it — landing page, per-area menus, back navigation, reload restore |
| `node checkhr.mjs` | Mounts all sixteen HR modules; icons, modals, sidebar bridge |
| `node checklazy.mjs` | Lazy pages recover from a deploy: one reload on a stale chunk, none on anything else |
| `node checkspannodes.mjs` | Span node origins, and which node a cable run feeds |
| `node checkoverridecarry.mjs` | A hand-set cable size survives Build LV Network |
| `node checklinkboxseq.mjs` | Which point stands at each stop on a circuit, and what it is called |
| `node checkanchormove.mjs` | Whose `Span_Anchor` follows the point when it is dragged |
| `node checkplaceseq.mjs` | A newly placed point takes the number of the place it stands |
| `node checkdownloaddrawing.mjs` | Download Drawing is on the menu and signed like every other call |
| `node checkcabletrace.mjs` | A boxed circuit traces along the cable, each output carrying its own load |
| `node checkcircuitpick.mjs` | Link to Circuit: rows choose, one button commits |
| `node checkcircuitrings.mjs` | Assigned meters are ringed while the circuit lasso is up |
| `node checkbreechdrag.mjs` | Every cable follows its breech; a levels panel stays one |
| `node checkcablemenu.mjs` | Cable menus offer rated cables of the right usage, sorted |
| `node checkspectable.mjs` | Derived columns, and where a new column lands |
| `node checklengths.mjs` | Drawn follows the drawing; measured is somebody's word |
| `node checkdeadzone.mjs` | No hook depends on something declared later |
| `node checkrealdrawing.mjs` | A real site still gives the answers recorded for it |
| `node checktrace.mjs` | The trace follows one cable, one way, forking where it does |
| `node checklevelsgrouping.mjs` | The levels sheet is sectioned by cable, not flattened |
| `node checklinkwayisolate.mjs` | One output shown on its own, the input and the dig kept |
| `node checkmenuguards.mjs` | Nothing offered that can only report nothing |
| `node checkjointhold.mjs` | Joints hold their cables; released only on purpose |
| `node checkclickdrag.mjs` | Nothing moves until the pointer says it is a drag |
| `node checkschematic.mjs` | The schematic draws one circuit, and says which |
| `node checkprint.mjs` | A metre on the ground is 1000/N mm on the paper |
| `node checkzoomfloor.mjs` | The zoom stops at the drawing's own extents |
| `node checkshadow.mjs` | No name added across `draw` is one it already used |
| `node checkmsdb.mjs` | Flats on a table; load and levels derived, never guessed |
| `node checkinherit.mjs` | A drawn cable takes the circuit it was drawn from |
| `node checktwostations.mjs` | Each meter says which substation and way feeds it |
| `node checkroutepair.mjs` | Routing a supply asks which pair, and keeps the other |
| `node checkdeletekey.mjs` | Delete removes the selection, live and not stale |
| `node checknumberremoved.mjs` | The old numbering pass stays out of the client |
| `node checkmsdblink.mjs` | Board-to-board links: stamped, ordered, routed past |
| `node checkisolation.mjs` | A trench that refuses LV is not walked across |
| `node checkbulkfields.mjs` | Bulk edit offers only what the selection shares |
| `node checkcablelevels.mjs` | Changing a cable changes the levels below it |
| `node checkbuildblockers.mjs` | The build refuses a drawing it cannot build from |
| `node checkhdcutout.mjs` | The cut-out stays passive, LV-only and aligned |
| `node checklayintrench.mjs` | Laying a run along a trench: whole, own shape, allowed |
| `node checkprogress.mjs` | A routine that takes seconds says what it is doing |
| `node checkcutout.mjs` | The cut-out figure sits at the meter it belongs to |
| `node checkhvring.mjs` | The daisy chain reads off the drawing: feed, split, shared fault |
| `node checkprintdefaults.mjs` | Print to Scale defaults what nobody set, and keeps what somebody did |
| `node checkprintsymbols.mjs` | The sheet draws what the screen draws |
| `node checklayerswitches.mjs` | The switches say what they govern; the picker says what things are |
| `node checkenquiryfile.mjs` | An enquiry takes a document: straight to storage, and only its own |
| `node checktrunkload.mjs` | A link box's input carries what it serves, each customer once |
| `node checkservicejoint.mjs` | One service, one joint: the cables decide, the distance shortlists |
| `node checkvdsubmit.mjs` | The Submit sheet against the submission workbook, to six decimal places |
| `node checkcalcsheet.mjs` | The sheet reads the drawing: right legs, right nodes, one route |
| `node checktextnote.mjs` | A note wraps one way on screen, on paper and in CAD; stays on the annotation layer; resizes, re-wraps and points |
| `node checkboardcircuit.mjs` | A circuit born on a spare way, membered by a board |
| `node checkhdcoterminal.mjs` | The build runs out to a cut-out at the end of the dig |
| `node checkservicemoved.mjs` | Auto Service re-lays the plots whose ground moved, and only those |
| `node checkwayfuse.mjs` | Each LV way carries its own fuse rating |
| `node checkbreechplace.mjs` | A breech is placed on a cable point, breaking it or not |
| `node checkboardsections.mjs` | A circuit's flats are grouped under their board |
| `node checkjsxescapes.mjs` | No \uXXXX escape is stranded in JSX text |
| `node checktrace.mjs` | One token to the fork, two after it |
| `node checkdupes.mjs` | One dialog and one producer per piece of state |
| `node checkbomroles.mjs` | The bill counts what is bought, not the markers |
| `node checkjointonline.mjs` | A joint clicked onto a cable breaks it there |
| `node checkstraightjoint.mjs` | A straight joint is a stop, one cable in and one out |
| `node checkspaneditor.mjs` | Mounts the span node editor; both sizes shown, override read |
| `node checkbottleends.mjs` | Bottle ends at feeder ends only, not on every dead end |
| `node checkmigrations.mjs` | Numbering against a policed baseline; seeded style scopes that collide under the unique index; endpoint column lists against `ADD COLUMN` |
| `python3 checkdefs.py` | Calls with no definition, state set with no `useState` |
| `python3 checkcols.py` | Explicit column lists against the schema |
| `python3 checkorder.py` | Use before declaration (heuristic — read the hits, see fault 2) |
| `python3 checkescapes.py` | `\uXXXX` in JSX attribute strings |
| `python3 checkmodals.py` | Modals rendered inside the clipped canvas wrapper |
| `python3 checklocks.py` | Geometry writes behind a lock check |
| `python3 checkadmin.py` | Table names the admin endpoint will accept |
| `python3 checkbuttons.py` | Button classes against the house set |
| `python3 checkdead.py` | Unreachable statements |

`checkseedlive.mjs` is **not** in the suite and should not be added: it
is a diagnostic that takes a drawing JSON and a `Feature_ID` and reports
why a seed cascade rejected something. It has nothing to assert without
an argument. `checkall.mjs` names it, and the reason, in
`NOT_A_SUITE_CHECK`.

`checkorder.py` currently reports **three** hits — `rollback`,
`addFeature` and `zoomToPoints`. It said four; `missingMetersFor`
dropped out when the feeder-point sequencing moved to its own module. All four are false
positives, and for the same reason: each is referenced inside a
`function` body — `onDown`, `placeAt` — that only runs on user action,
by which time the `const` is initialised. It exits 0. Don't "fix" them.

### Why `npm test` was a chain, and why it isn't any more

The previous version of this file recorded, correctly at the time, that
**`npm test` did not run at all.** It was eighty-three `node checkX.mjs`
calls joined with `&&` inside a JSON string, and it died on step one.
Two things were wrong with that shape, both of which cost a session.

**It stopped at the first failure.** A run that died on step twenty
looked exactly like a run that died on step eighty-three: one error,
then the prompt. Nothing said how many checks never ran.

Worse, an `&&` chain cannot tell a *crash* from a *failure*.
`checkprojecttabs.mjs` read a migration that is not in the repo and
threw ENOENT on load — and a missing-file error at step twenty reads as
one broken script rather than as a suite that never started. That is
how "npm test does not run" became a standing fact about this repo
instead of a bug somebody fixed.

**The list was hand-kept**, which is the same fault as the `ALL_VIEWS`
array the README describes: a second place to remember something.
`checklazy.mjs` was in the chain and not on disk for weeks, and
`checkseedlive.mjs` was on disk and not in the chain. The runner derives
the list from the folder, so neither can happen again, and anything
left out has to say why.

`checkall.mjs` also reports CRASH separately from FAIL, because the
difference matters: a check reporting "3 problem(s)" looked at
something, and one that throws never got to look.

### The nineteen that still fail

The count moved from nine and the heading has been re-counted rather
than carried forward: 159 of 178 pass as of this session, and none of
the nineteen is new here. `checkmeasuredlength` left the list when its
stale argument was fixed (fault 155). Two of them used to be CRASHes and are named
failures now — see below.

Five are **migrations that were pasted into Supabase by hand and never
committed**, read by four checks. The folder now runs to 0229 and
`checkmigrations.mjs` holds the absences as a baseline. Since there is
no migration runner, that folder is the only record there is.

- `checkprojecttabs.mjs` — needs `0138_project_tabs.sql`, the seed
  saying which tabs each area hides.
- `checkbottleends.mjs` — needs `0163_bom_bottle_end_name.sql`, the
  bill's joint-name `CASE`.
- `checkdevelopers.mjs` — needs `0198_developer_organisation_branch.sql`.
- `checkdxflayers.mjs` — needs `0221_cad_layer_trim.sql` and
  `0222_cad_layer_status.sql`.

`0182` is missing the same way and nothing reads it yet. **Do not
reconstruct these from the checks.** 0138 encodes decisions about what
each part of the business sees, and 0163 replaces a function whose body
is not in the repo; inventing either writes a guess into the only record
the schema has. They want recovering from the Supabase project.

Both checks now degrade to a **named failure** rather than throwing, so
they no longer take the rest of the suite down with them. That pattern —
`try` the read, `fail("... is missing")`, skip the section — is the one
to copy for any check that reads a file it does not own.

`checkdevelopers.mjs` fails the same way: it needs
`0198_developer_organisation_branch.sql`. `checkdxflayers.mjs` needs
`0221_cad_layer_trim.sql` and `0222_cad_layer_status.sql`.

**Both used to THROW and now fail by name.** Each read its migration
with a bare `readFileSync`, so the check died on load and reported
nothing at all — including every case that had nothing to do with the
missing file. That is why the suite showed two CRASHes: not two broken
scripts, but two scripts that never got to look. They now `try` the
read, `fail` with the file named, and skip only the section that needs
it.

What that uncovered is worth recording: `checkdxflayers` carries about
twenty other cases that had not run for as long as 0222 has been
absent. They all pass. Nobody knew, because a crash says nothing about
what it did not reach.

**Do not write any of these three files from what the checks assert.**
The assertions are what somebody wanted the migration to say, not what
it says. Recovering them from the live project is the only way to get
the truth back, and a plausible guess in that folder is worse than a
gap, because a gap is visible.

Six more, none of them about a missing file:

- `checkorphans.mjs` — `src/api/calloffs-API.js`,
  `src/features/poc/forms/openForm.js` and
  `src/features/poc/forms/submissions.js` are imported by nothing. That
  is fault 22's shape at rest: a module serving no traffic looks exactly
  like one whose callers have not been written yet. The opposite was
  found a session ago — two stale duplicates that *were* serving live
  traffic — which is the reason to read all three before deleting any of
  them.
- `checkroutes.mjs` — `/api/projects/:projectId/calloffs` is claimed by
  both `calloffs-FUNCTION.js` and `calloffs.js`. Which one Netlify picks
  is not something to leave to chance, and it is recurring fault 1
  wearing a different hat.
- `checkaslaidplan.mjs` — the re-take refuses without saying why, which
  is the fault the check was written for.
- `checkstatusrules.mjs` — "there is no bulk status setter".
- `checkvehicles.mjs` — no warn expiry badge; sample data or urgency.

The last two were red before this session and are not described
anywhere. Neither was touched here; both are reporting something and
neither has been read.

And `checkbuttons.py`, which runs only under `npm run check`, is 30
house-style deviations across the admin screens and two GIS panels. Cosmetic, pre-existing, and never
gating before now: the old `check` script ran the Python checks in a
shell loop that discarded their exit codes, so none of them had ever
failed a build.

**A check that re-implements the thing it tests proves nothing.**
`checkspannodes.mjs` carried local copies of `nodeFedBy` and the node
sync and went on passing through every fault listed under 13 below,
because the copies were right and the functions they stood for had
moved. It imports them now. When adding a check, import the real
function or move the logic somewhere it can be imported from.

**A check that cries wolf stops being run**, which is the same failure
by a slower route. `checkdefs.py` reported two permanent false
positives — `blight`, from the regex `/\blight(ing)?\b/i`, and
`signIn`, an object method shorthand it read as a call. Neither was ever
a fault, and a report that is always two lines long teaches everyone to
skim it. It blanks regex literals and understands method shorthand now.
If a check's output includes a hit nobody intends to act on, fix the
check or write the exemption down here.

## Recurring faults — all of these bit more than once

1. **Branch ordering in Netlify functions.** A conditional
   `if (req.method === "X" && ...)` placed *below* an unconditional
   `if (req.method === "X")` never runs, and fails silently with the
   wrong shape rather than an error. Hit four times. The fix adopted is
   a separate function file per endpoint — see `gis-plots.js`,
   `gis-ensure-plots.js`, `project-revision.js`, `project-resurrect.js`.

2. **Temporal dead zone.** A `const` read before its declaration in a
   component body throws and blanks the entire page. Hit three times.
   Checking that one line appears before another in the *file* proves
   nothing — scope is what matters, and function declarations hoist
   while `const` doesn't.

3. **Missing imports and missing state.** Adding a call without its
   import, or `setX(...)` without the matching `useState`. A check that
   filters out identifiers beginning with `set` cannot find the second
   kind — which is how one shipped.

4. **Explicit column lists drift from the schema.** Every function
   selects a named list; a column added to the database but not the list
   is neither saved nor returned. Hit three times.

5. **`upsert` replaces whole rows.** Supabase's upsert is
   `ON CONFLICT DO UPDATE` with exactly the fields supplied — everything
   else becomes null. Any screen saving fields incrementally needs
   read-then-update-or-insert.

6. **JSX attribute strings don't process `\uXXXX` escapes.**
   `placeholder="\u2014"` renders those six characters. Needs
   `placeholder={"\u2014"}`.

7. **React registers `wheel` as passive**, so `preventDefault()` in an
   `onWheel` prop is ignored and a trackpad pinch zooms the page. Needs
   a native listener with `{ passive: false }`, keyed on when the
   element actually exists.

8. **`ON CONFLICT DO NOTHING` isn't idempotent with a nullable key
   column** — NULL never equals NULL, so the seed inserts again. Needs a
   unique index over `COALESCE(col, -1)`.

9. **`CREATE OR REPLACE FUNCTION` can't change a return type.** Adding a
   column to a `RETURNS TABLE` needs `DROP FUNCTION` first.

10. **Reserved words as plpgsql variables** — `by` fails to parse.

11. **App-wide CSS inside a component's `<style>` block.** The sidebar
    carried the `@font-face` fallback, `.lazy-wait`, `.topbar` and
    `.boot` — fine while the sidebar was on every screen, silently gone
    on the first screen without one. If a rule is not about the
    component, it belongs in `src/styles.css`.

12. **New CSS features that fail closed.** `color-mix()` was used for the
    area tints and backed out: it appears nowhere else in the app, and a
    browser that doesn't know it drops the whole declaration, taking the
    tile background with it. The house idiom is eight-digit hex alpha
    built in JS — see `src/lib/colour.js`.

13. **Two records of one fact, editable apart.** A cable size lives on
    the drawn run *and* on the span node it feeds, because the volt drop
    sum reads it from the node. Every fault in the span node cable
    reports came from those two drifting: a run saying 300 with its node
    saying 95, and the trace quietly reporting a design nobody is
    building. Made worse by the system/manual pair, which doubles each
    record again — writing only the overridden field left a node reading
    300 through `Manual_VD_Cable_Size_ID` and 95 through
    `VD_Cable_Size_ID`, both true, with each reader believing whichever
    it happened to look at. The node now mirrors the run in *both*
    fields, including clearing the override when the run loses one. If
    you add a third reader, make it read `sizeIdFor(f, utility,
    "manual")` and nothing else.

14. **A whole-drawing reconciliation hung off a single edit.** Saving one
    cable called `syncNodeCables`, which walks every electric line in the
    project. One edit became a site-wide sweep that "corrected" nodes
    which had drifted for unrelated reasons months earlier, and asked
    about all of them in one dialog. The edited feature was passed to the
    handler and discarded. Reconciling everything is a deliberate act and
    belongs on the menu; a save carries to the one node it feeds.

15. **A `silent` flag that doesn't cover the loudest thing.**
    `syncNodeCables({ silent: true })` suppressed the status toasts and
    not the `window.confirm`, so a background call stopped the page with
    a modal.

16. **A menu divider means one thing, or it means nothing.** The rule
    across all seven GIS menus: a `gm-sep` above every `MenuGroup`
    heading, *except* the first heading in a menu and *except* any
    heading carrying `newColumn`. A column break is already a break, and
    a divider above one draws a line across the foot of the previous
    column, under nothing. Before this was applied the Layers menu had
    three dividers in a row and a fourth dangling at its foot, Electric
    had one above its first heading and one stranded between a heading
    and its first row, and Gas/Water had two with only a comment between
    them. `checkmenus.py` is not written yet; the audit was done by
    script and is worth re-running if the menus are reworked.

17. **Comments outlive the code they describe.** Most of the stray
    dividers above were left behind when the control between them moved
    to another menu — the comment stayed, so the gap still looked
    intentional. When moving a menu item, move or delete its comment in
    the same edit.

18. **A duplicated control drifts.** The Labels switch existed twice in
    the Layers menu, one copy carrying a comment written for a utility
    menu ("Labels, on every utility menu") — an edit that landed in the
    wrong menu and whose original was never removed. Two controls for one
    setting is the same fault as two records of one fact in 13.

19. **The canvas does not flip the y axis.** `toPx` is
    `x = m[0] * scale + view.x`, `y = m[1] * scale + view.y` — no flip,
    so drawing and screen share an axis convention and a vector's angle
    in metres is already its angle in pixels. `jointAngle` negated its
    `atan2` under a comment claiming the drawing's y grew upward, which
    reflected every joint about the horizontal rather than turning it.
    It is right on a horizontal run and right at 45 degrees, and wrong
    everywhere else — a square joint is symmetric enough that it read as
    "leaning slightly odd" rather than as a fault, which is how it
    survived. Only the bottle end, which has a front and a back, made it
    visible. If a symbol needs turning to the drawing, do not negate.

20. **A label that vanishes when you reach for it.** Anything drawn only
    while a stored result is fresh disappears the moment it is dragged:
    the drag writes an offset, that makes a new `features` array, the
    result goes stale, and the label is removed from under the cursor.
    The span node levels label had this and the **gas pressure label
    still does** — same shape, same cause, not yet fixed. A label that
    can be moved has to be drawn from something a move does not
    invalidate.

21. **`buildFeederModel` was O(n²).** `intern` scanned every node found
    so far for every vertex in the drawing — and the drawing is every
    trench on the site, not just the circuit being routed. On an estate
    of a few hundred plots that scan alone was two thirds of a levels
    check, repeated per circuit. It is a spatial hash now, `eps` across,
    checking nine buckets. It returns the lowest matching index, which is
    what the linear scan did: bucket order is not insertion order, and
    taking the first match found would quietly pick a different node
    where two are both in range. Build LV Network, Place Feeder Joints
    and the call-offs all sit on this path.

22. **A tolerant fallback that hides a permanent failure.** Three
    features shipped, ran, and did nothing at all — each behind a
    `catch` written for a different reason.

    `placeReducers` writes `Feature_Role: "reducer"`, and 'reducer' was
    never added to the `GIS_Feature` role constraint, so every insert was
    rejected. `adminList("Craft_Utility")` 404s because the table is not
    in the endpoint's allowlist, and the call site catches that with
    `.catch(() => ({ rows: [] }))` under a comment explaining that a
    database without 0151 should fall back to the older rule — which it
    also does on a database *with* 0151, so the craft scope has never
    been applied anywhere. The energisation phase sorted last because the
    list endpoint never selected the `Display_Order` the page sorts on.

    The shape to watch for is not an error on screen. It is a feature
    that stays politely inert, indistinguishable from one that is
    correctly deciding it has nothing to do. **A fallback for a missing
    migration must not also swallow a missing allowlist entry**, and if a
    catch exists to tolerate absence, something has to prove presence —
    a check, or a log line, or a status the screen can show.

23. **A hand-kept list beside a folder that already knows.** `npm test`
    named its eighty-three scripts in a string; the migration seed order,
    the role constraint and `ALL_VIEWS` have all had the same problem.
    Every instance drifted, and drift is silent in this direction: the
    thing on disk and not in the list simply never runs, and nothing
    reports a script that was not asked for. Derive the list, and where
    something genuinely must be excluded, make the exclusion carry its
    reason — see `NOT_A_SUITE_CHECK` in `checkall.mjs`.

24. **A uniqueness definition that has not caught up with a matching
    definition.** `GIS_Style` matches on Layer_Key, Line_Type,
    Feature_Role, Site, Supply_Type, Utility_ID and Organisation_ID.
    What makes a style scope *unique* is `gis_style_scope_uniq`, and
    0194 added `Supply_Type` to the first list and not to the second.

    So its black triangle rule for non-residential supplies was, to the
    index, the same scope as the plain Meter rule seeded in 0051. The
    insert collided and `ON CONFLICT DO NOTHING` swallowed it. The
    column arrived, the migration reported success, and the rule was
    never written.

    Three supplies were placed on live drawings and drawn as ordinary
    meters for as long as it took somebody to ask why. Every other part
    was correct: the placement writes `Supply_Type: 'nrs'`,
    `resolveStyle` matches on it and scores it above `Feature_Role`,
    `checknrs.mjs` passed throughout — because it feeds `resolveStyle` a
    fixture containing the style row and correctly proves a triangle
    comes out of it. Nothing in the suite could see that the row was not
    in the database.

    This is fault 22 again and its clearest instance: not a catch
    swallowing an error, but a seed that could never succeed, reporting
    success. **Adding a scope column to `GIS_Style` means adding it to
    `gis_style_scope_uniq` in the same migration** — 0195 does that and
    then writes the row — and `checkmigrations.mjs` now reads the index
    definition out of the folder and fails on any seeded rule that
    cannot be inserted beside one already there. It reads the definition
    rather than restating it, because a check with its own copy of the
    rule would have agreed with 0194 and passed.

    The same migration also missed `Supply_Type` from the column list in
    `gis-styles.js`, which is fault 4, and left the GIS Styles admin
    screen showing the rule as a second identical Meter rule. Both
    halves of one change, both invisible, both found by the same
    question.

25. **A shape chosen for what it saves, not for what it is.** 0194 made
    a non-residential supply BE a meter — one point, `Feature_Role
    'meter'`, `NRS_ID` and `Supply_Type` on it — reasoning that fifty
    places ask whether something is a meter and a new role would need
    every one of them auditing.

    The reasoning is sound and the conclusion was wrong, because it can
    only ever describe an **electric** supply. It is why placement
    hard-coded `Layer_Key: "electric"` and why the record took exactly
    one utility: a pumping station needing a water connection as well as
    a three-phase supply could not be said at all.

    A supply is a plot seed with a different symbol. 0196 makes it one:
    `Feature_Role 'nrs'` for the seed, ordinary meters against it, one
    per utility, linked by a shared `NRS_ID`. The load did not move —
    `circuitKva` already read `NRS_ID` off the *meter*, and
    `meterBelongsTo` already had a fallback for a seed with no plot
    behind it. The model was built for this shape; only the placement
    was not.

    The tell to watch for: a design that is cheap because it reuses
    something, described in terms of what it avoids auditing rather than
    what the thing is. The audit gets avoided once and the wrong shape
    stays.

26. **A model that reports what it could not do, and a caller that does
    not look.** `buildFeederModel` returns `skipped` — meters more than
    `SNAP_TOL` from any node on the network. Build LV Network reads it
    and says "N meter(s) not on the trench network". `runLevelsCheck`
    never did, so a meter the model could not attach was absent from
    every volt drop and ELI figure with nothing on screen to say one was
    missing.

    Found through a non-residential supply placed on a circuit before
    any service was dug to it, but it was never supply-specific: a plot
    meter placed ahead of its dig did the same thing, for as long as the
    check has existed.

    Worth separating from fault 22. Nothing here was inert and nothing
    swallowed an error — the model did its job and said so. The failure
    was one caller of two not reading the answer, which is the shape to
    look for wherever a function returns both a result and a list of
    what it left out.

27. **Two readers of one fact, one of them not told.** A meter's load
    comes from its plot, or — for a non-residential supply — from its
    own record. `buildFeederModel` asked both ways. `circuitReport`
    asked only `plotById`, so the levels check counted a supply's kVA
    and the report showed the same supply as having none.

    The mechanism is worth the note. `plotById` was positional and
    `nrsById` arrived later in an options object, so a call site could
    supply one and omit the other, and omitting it does not fail: it
    reports no load, which is indistinguishable from a record nobody has
    filled in. Both lookups are in the options together now.

    Fault 13 is two records of one fact drifting apart. This is the
    other half of that shape: **one fact with two readers, and only one
    of them given what it needs to read it.** When adding a second way
    to look something up, put it beside the first rather than behind it.

28. **A key made of the thing the operation changes.** Build LV Network
    deletes its generated mains and lays them again, so a hand-set cable
    size has to be carried across the gap. It was carried in a map keyed
    on the run's GEOMETRY — every vertex to two decimal places — and put
    back only onto a new run laid along exactly the same points.

    Geometry is precisely what a rebuild changes. A plot added breaks
    the run somewhere new, a trench nudged moves an interior vertex, and
    either way the key no longer matches: the override is dropped and
    the run comes back on the build's default. Every drawing anybody was
    working on lost its sizes on every build, and the levels check moved
    with them.

    The carry is keyed on where the run ARRIVES now, per circuit —
    `carriedOverrides` / `carriedOverrideFor` in `feeder.js`. A section
    is walked outward from the origin, so its last point is the feeder
    end point it feeds, and that stands on a trench junction the
    interior of the run can be redrawn around. A run that genuinely
    breaks somewhere new arrives somewhere new and starts on the
    default, which is the honest answer for a length whose load has just
    changed.

    Worth separating from fault 13. Nothing here was two records
    drifting: there was one record, correctly written, filed under a
    name that stopped existing. **When something has to survive an
    operation, key it on what the operation does not touch** — and if
    nothing about the thing is stable, that is worth knowing before
    writing the carry rather than after.

    This one also carries fault 22's signature and its own note about
    it: the previous version read `Manual_Gas_Pipe_Size_ID` on an
    electric cable, so the map was always empty and nothing read it
    back. The comment above it said, correctly, that losing an override
    is the one thing a rebuild must not do. A paragraph describing the
    intent is not evidence of the behaviour.

29. **One point, two positions, and only one of them dragged.** A
    `Span_Anchor` means opposite things on the two kinds of point that
    carry it, and the drag knew about neither.

    A span node and a feeder point are MARKERS: dragged clear of the
    trench so a label can be read, with the anchor holding the place on
    the dig everything measures to. Their anchor must not follow — and
    does not, and each has a handle for correcting it.

    A link box is not a marker. It is a chamber with fuses in it, and
    its anchor is where it stands. It has no handle, so nothing could
    move its anchor at all: dragging a box left the anchor behind, and
    every reader went on describing where the box used to be. The joint
    pass suppressed the joint at the old spot, the stubs drew to the old
    spot, and the next build matched its walk against the old spot,
    missed, and made a generated feeder point standing there.

    That last symptom is the same stray duplicate that fault 30 covers,
    arriving by a different route — which is the thing to notice.
    **Two mechanisms producing one symptom means fixing either one
    leaves it apparently half-fixed**, and the drawing looks the same
    whichever half is missing.

    The rule is `anchorFollow.js`, in one place because the drag is four
    places — capture, frame update, save, undo — and all four have to
    agree. The save goes through `bulkUpdateFeatures` rather than
    `moveFeatures` deliberately: under `VITE_USE_MOCKS`, `moveFeatures`
    applies `Geometry` alone, so an anchor sent that way would work
    against the API and do nothing in the fixtures. That is fault 22
    waiting to happen in the one environment where it would not be
    noticed.

30. **A name that does not follow the number it is a name for.**
    Adoption in Build LV Network wrote `Span_Seq` and `Span_Kind` and
    not `Span_Label`. For a span node that was right and deliberate —
    its name is its own, site-wide, and the build renaming it is the
    fault recorded at the head of `checkspannodes`. For a feeder point
    or a link box it is the opposite: the name IS the sequence. "Point
    A3" is where the point stands on its circuit, and the editor says so
    on the panel — not editable, the number is its place in the order.

    So a box placed after nine feeder points takes A10 (max plus one,
    all placement can know), gets resequenced to 1 by the next build,
    and goes on being called A10 in the circuit report, the call-off
    spans and the levels table. A feeder point had it worse, carrying
    the stale code in its own `Label` too.

    The same pass had two more faults in it. A box placed in open
    ground — no cable under the click, cables drawn to it afterwards —
    has no circuit and no sequence, so the build never considered it and
    made a generated point on top of it. And once circuitless boxes ARE
    considered, nothing stopped the second circuit adopting the same
    box, because each circuit is planned against the drawing as it was
    read: hence the shared claim set.

    And placement was writing max-plus-one into that same field, which
    is the fault stated at its plainest: **a count of how many points
    exist, written where the position on the run goes.** A box put on
    the cable just past the POC — the first stop there is — came out
    A10 on a circuit with nine points, so the drawing read A0, A10, A2,
    A3. The two agree only if every point is placed in order outward
    and none is ever added in the middle, which is not how anybody
    draws. `planInsertion` measures how far along the cable the new
    point stands, drops it into that slot, and moves the ones beyond it
    up. It does NOT re-derive the existing order — that came from the
    build's walk, and a second derivation of it here would be two
    writers of one fact. Distance is along the run and projected onto
    the segment, not to the nearest corner: a box goes where the
    chamber goes, which is usually mid-span.

    The slot is decided by which points lie **on the way to** the new
    one, not by which have a smaller distance. Those are different
    things on a branched circuit, and every circuit on an estate is
    branched: the build walks one branch to its end before starting the
    next, so A2 can be 150 m down one branch while A3 is 60 m up
    another, and the numbers are not in distance order across the
    drawing. The first cut compared distances and put a point 70 m up
    the second branch at A2, ahead of the A3 the cable passes to reach
    it. P is on the way to N when the distance out to P plus the
    distance on from P to N is the distance out to N — within a metre,
    since both go through projections onto segments.

    And a fourth, found by somebody looking at the drawing after the
    other three were fixed: **the box never drew its code at all.** The
    pass that draws span codes takes span nodes and feeder points, and
    a link box is neither, so the one stop a designer can point at on
    site was the one stop the drawing would not name. The data was
    correct and invisible, which is indistinguishable from the data
    being wrong. It draws in the box's own branch — widening that pass
    would put its circle over the square.

    The same was true of its **levels**, and worse, because a figure is
    what the design is worked to. The trace already stopped at a box —
    the levels map is keyed on the leg's `stopId` and the box's id was
    in it — so the volt drop and loop impedance were computed, correct,
    and drawn on every stop except the one a designer can point at on
    site. A box showing nothing reads as being outside the design.

    The pass takes link boxes now, with the round node symbol guarded
    behind `isBox` so the square and its fuse numbers stand. Widened
    rather than copied into the box's own branch: two pieces of code
    drawing one plate would drift the first time either was touched.
    `levelsKey` gained the role too, or a box moved along the run keeps
    the figures it had at the old place — the check does not re-run,
    because nothing it watches has changed.

    Worth keeping as the note on the whole group: three of these were
    fixed against the checks and the fourth was only ever going to be
    found by opening a drawing. **A record being right is not the same
    as it being readable**, and a fix that stops at the database is
    half a fix wherever a person is meant to read the answer.

    The rules are `feederPoints.js` now. They were ninety lines inside
    `buildLvNetwork`, a function that deletes rows, calls the database
    and reports progress, so nothing could drive them and **every fault
    in them was found on a live drawing.** Two checks had pinned them by
    matching source text over `GISCanvasPage.jsx`; both now drive
    `planFeederPoints`, because a regex proves the text has not moved,
    which is not the rule.

31. **Array order deciding a schedule, for the third time.** A link
    box's outputs are three runs of ONE circuit lying in one trench:
    they store overlapping routes, and the separation on screen is
    display offset, not geometry. So a service tee'ing in touches more
    than one main and something has to choose which it came off.

    `sizesForPlot` and `sizesAt` did not choose — `.find()` answered
    with whichever run came first in the feature array. Plots on output
    3 were reported as fed by output 2's cable: the wrong size on the
    jointing sheet and the wrong cable named to the gang, on a drawing
    that looked right.

    Worth noting how well-signposted this was. `drawnMainAt` carries a
    comment describing exactly this ("a snap measured against the stored
    geometry is a coin toss between them"), and the joint-feeder pick in
    the move handler was already fixed for it ("three matches, no
    winner"). Two places had been found and corrected and the third was
    never looked for. **When a fault is about a SHAPE in the data —
    several features sharing a route — fixing the instance is not
    fixing the fault; every reader that resolves that shape by geometry
    has it.** The readers of "which main is this on" are worth listing
    the next time one of these turns up.

    The pick is the output claim first (the build stamps `Link_Box_ID`
    and `Link_Way` on the runs it lays, and the meter carries the same
    pair), then the NEAREST run, ties on the lower id. Nearest is the
    part that works on every drawing, including ones from before the
    stamps existed.

    **And a fourth instance, in the colour.** `feederRenderPlan`'s live
    membership takes "the run nearest the meter" and stamps the METER's
    way onto it, so where two outputs share a trench the nearer stored
    line won and output 2's cable came back wearing output 3's colour.
    That is what a designer actually sees: the service tees into a
    cable drawn in the wrong output's colour, which reads as the plot
    being on the wrong feeder. Same fix — stamped runs first, nearest as
    the fallback.

    Two of these four were found only because somebody looked at a
    drawing and said the colour was wrong. The list of readers that
    answer "which main is this on" is now: `cableSizes.pickMain`,
    `feederRenderPlan`'s live membership, the joint-feeder pick in the
    move handler, and `drawnMainAt`. **If a fifth is added, it needs the
    same two-step rule**, and if one of these four is changed the other
    three are worth re-reading.

**The link box goes down BEFORE Build LV Network.** The order to work
in is: draw the trenches, Link to Circuit, snap the box to the trench,
lasso plots onto its outputs, Build LV Network, Auto Lay Services,
levels check. One pass.

It used to take two builds, and the first one existed only to give the
box a cable to be clicked onto. `linkWayAssignments` required
`Circuit_ID` and `Span_Seq` on the box, and placement can only write
those when the click lands on an existing electric main — before the
build there are no mains, only trenches. So a box on the dig was
invisible to the router, which laid the circuit as though it were not
there; and the lasso refused outright ("place it on the cable, or
rebuild, then lasso").

**A box has no circuit of its own.** It is on the circuit of the plots
fed through it, and the assignment is what says which those are. So the
lasso now gives the box its circuit and the router reads a box that has
never been near a cable. `Span_Seq` came out of that filter entirely —
it was a proxy for "on a run" doing no routing work, and where the box
stands in the order is the walk's to say. A box that already names a
circuit is still only that circuit's, and a lasso spanning two is
refused rather than resolved to one.

Placement snaps a box with no cable under it to the nearest trench, for
the same reason a substation snaps to one: it is a chamber in the
ground. The cable still wins where there is one — a box added to a
network already built belongs in the run, not near it.

**Setup → Download Drawing** saves the drawing as JSON — the same
payload `listGis` returns, features, layers, line types and styles.

It exists because there was no way to get a drawing out of the app, and
the workaround was a fetch pasted into the browser console. The
instructions for that, at the head of `checkseedlive.mjs`, were wrong in
two ways at once: the route had moved to `/api/projects/:projectId/gis`
when the functions were split one per endpoint, and a bare fetch carries
no token, so every endpoint answers "Sign in to use this." Both faults
were found by somebody following the instructions and getting a file
with an error message in it.

**An instruction in a comment is code nothing runs.** No check reads
comments, so it goes stale exactly as quietly as a hand-kept list does —
fault 23 in a form the checks cannot see. Where a comment tells somebody
to call something, prefer pointing at a thing in the app that has to
keep working.

The item reads through `listGis` rather than the drawing in memory:
`features` carries optimistic `tmp-` rows mid-edit, and a drawing sent
for diagnosis has to be what the database holds.

32. **One walk for two cables.** A link box's outputs are separate
    cables leaving one point, and they share a dig for as long as the
    designer runs them together. The levels check traced the circuit as
    one network — and the walk follows the TRENCH, so two cables in one
    trench had one path, and therefore one leg, one cable size and the
    two loads added together.

    On a live drawing that reported 61 m of a 185 mm output as 95 mm,
    the neighbouring output's cable, because the node where they parted
    company had been given whichever run was written to it last. Every
    plot on that output read worse than it is.

    Three parts to the fix, and **the tempting small one makes it
    worse**: the stop where the cables diverge is not an electrical
    event, and deleting it alone leaves the walk crossing the shared
    stretch on the way to both ends, so the plots teeing off it are
    counted twice. One error traded for a worse one. It had to be all
    three or none.

    - `circuitTraceParts` traces the trunk from the origin to the box,
      then each output rooted at the box and pruned to its own plots.
      The shared trench is walked once per output, each time carrying
      only its own load. A circuit with no box comes back as one part
      and behaves exactly as it always did.
    - `spanTrace` was building its own meter map filtered on
      `Circuit_ID` alone, ignoring the membership it had been handed —
      so a pruned output still picked up the neighbour's plots. Two
      prunings of one fact with only one of them told, which is fault
      27 again.
    - `marksOnPart`: a build part may only mark nodes on the cable it
      lays. The trunk's model is the whole circuit's, deliberately, so
      marking off it marked every fork of the dig. **A bend is not a
      stop, and a fork of the dig is not a fork of the cable.**

    The volt drop carries across the join through hooks that already
    existed and were written for this argument: `startPct` is what the
    feeding network has spent and `transformer.Loop_Impedance_Ohm` is
    what it starts from. An output's feeding network is the trunk, so
    an output starts from the trunk's figures AT THE BOX.

    **Not verified against a known-good figure.** The topology and the
    loads are driven and proven; the arithmetic is proven only to be
    self-consistent. Check a boxed circuit against a hand calc before
    issuing anything from it.

    Two boxes in series on one circuit is a design error — it should be
    refused by name rather than rendered, and it is NOT refused yet.
    The levels sheet groups per output (option B) — also not built.

33. **A dialog whose commit did not look like one.** Link to Circuit
    lists the circuits on the drawing and clicking one WAS the assign —
    the row committed and closed. Fine on a drawing that already has
    circuits; the FIRST circuit on a site has none, so the list was
    empty and the only thing that would commit was a dashed
    "+ New circuit", under a "Fed from" picker and above Cancel. It
    read as a form with no OK. People cancelled believing nothing had
    been assigned, which was true.

    A row is a choice now and the action row commits, with the button
    named for what it will do. **One commit control, not two** — a row
    that assigns and a button that assigns is fault 18's duplicated
    control, and they would drift. Where there is nothing to choose
    between the choice is made already: a list with one option is not a
    decision.

    The tell: a control that is both the option and the action reads as
    the action only when there are several of them. Worth looking at
    the other pick-one dialogs for the same shape.

**Circuit rings show while the lasso is up.** A meter on a circuit is
ringed in that circuit's colour — an existing setting, off by default,
reachable from the Layers menu and the Circuit Report. The one moment it
is indispensable is the moment nobody has turned it on: drawing round
plots for Link to Circuit, where an assigned meter looks exactly like a
free one and the same plots get lassoed twice. The dialog refuses them,
so no work is lost, but that is a count in a paragraph after the fact
rather than something visible while the outline is being drawn.

So they show whenever `tool === "circuit"`, whatever the setting says,
and go back to the setting afterwards. **One setting temporarily
overridden by the job in hand, not a second switch** — `checkcircuitrings`
holds that: one toggle, and anything else may only turn them on.

Worth generalising: a setting that is off by default and needed by one
particular job is a setting somebody has to know about before they can
do the job. The other display toggles are worth reading with that
question in mind.

34. **A check that could only see one line.** `\u2014` in JSX text
    renders as six characters on screen — recurring fault 6, which
    `checkescapes.py` exists for. It shipped anyway, into a dropdown a
    customer reads: "Not set \u2014 the build picks the nearest POC".

    The check looked for `>text<` **on a single line**. JSX text is
    wrapped like prose, so the tag, the text and the closing tag are
    usually on three lines, and a per-line rule cannot see it. It was
    found on screen, which is the one place the check exists to stop it
    being found.

    It reads whole files now, with comments blanked first — every file
    here carries long comments full of em dashes written as escapes,
    quite correctly, and scanning them is what kept the rule narrow
    enough to miss the real thing.

    **Two narrowings, both learned from false positives**: the `>` must
    end a tag (not `=>`), and the span may not contain a quote. Seven of
    the first ten hits were escapes sitting legitimately inside JS
    strings in JSX expressions. A check whose output includes hits
    nobody acts on teaches everyone to skim it.

    It immediately found **two more, written this session** — both
    `hint="…\u2014…"` on menu items. The rule is old and the faults were
    new, which is the argument for widening a check rather than fixing
    the one instance.

35. **A stamp outliving the thing it names.** A circuit exists while
    meters name it — `circuitsFrom` derives the list from the meters, so
    the last meter leaving takes the circuit with it. A link box's
    `Circuit_ID` is a second record of that same fact, and nothing
    clears it. So a box that was on Circuit 1 went on saying so after
    Circuit 1 had ceased to exist, and the output lasso measured against
    it and refused everything: *"Nothing in that outline is on Circuit
    1"* — naming a circuit that is not in the report, which reads as the
    app caching something.

    Fault 13 again: two records of one fact, editable apart. The meters
    are the fact and the stamp is a copy, so **a copy naming something
    that is not there is not a claim.** It is dropped, the lasso stands,
    and the status says the old name was dropped rather than the box
    changing circuits quietly.

    Worth checking the other carriers of `Circuit_ID` against this — a
    feeder point, a joint, a run — all hold the same copy and none of
    them is cleared when a circuit dissolves. Only the box's copy is
    known to have bitten.

36. **Parts counted as circuits.** Splitting a boxed circuit into trunk
    and outputs made `parts` several per circuit, and everything that had
    been counting parts went on counting them: the levels picker listed
    "Circuit 3" three times, and the header said four circuits on a
    drawing with two. Deduped by circuit name in one place, so the
    count, the picker and the export cannot disagree.

    The shape to watch when splitting a collection: **every reader that
    said "one of these is one of those" is now wrong**, and none of them
    fails — they just count differently.

37. **An output walked its neighbours' cable.** Rooted at the box, the
    graph radiates in every direction: back up the trunk toward the POC,
    and out along the other outputs. Those branches carry no load for
    this output, but the walk keeps a loadless branch that holds a stop —
    correct for a circuit's walk, which covers the whole of it, and wrong
    for one output.

    So an output walked back up its own input and out along its
    neighbours, reporting their stops as its own. Two outputs produced a
    leg to the same point with different figures and the table showed
    one leg twice, which is what somebody spotted on screen.

    The exception is now for a circuit's walk only: an output goes where
    its own plots are. Verified on a live drawing — the back-legs gone,
    and with the bend point removed as a rebuild removes it, output 2 is
    one 106.8 m leg and output 3 one 89.1 m leg, no duplicates.

38. **Two origins, because the first had been dragged.** Place Span
    Nodes matched an existing ORIGIN node by its marker, within 1.5 m.
    The marker is the one part of a span node that moves — it is pulled
    clear of the plant so its label can be read — and the anchor is what
    says where it belongs. So an origin nudged two metres off its
    substation stopped matching, and the next run made a second E0 on
    top of the plant while the first sat beside it. Found on a live
    drawing carrying two E0s and two E0bs.

    The galling part: **the rule was already written twenty lines
    below**, for every other node, with a comment explaining precisely
    this — *"A node nudged off the trench by hand is the case this has
    to recover: at one metre it was not matched, so re-placing added a
    second node beside it."* Five metres, against the anchor. The
    origins were added later and never got it.

    A fix applied to a loop and not to the special case beside it is
    fault 27's shape in one function. Both now use the anchor and five
    metres, and a matched origin is claimed so the node pass cannot
    reclaim it as an ordinary node and renumber it.

    **Existing duplicates are not cleaned up by this** — it stops more
    being made. A drawing that already has two has to have one deleted
    by hand, and the one to keep is the older, since call-offs and legs
    may name it.

39. **"A joint sits on one cable" — true of a service joint, false of a
    breech.** The drag narrows a joint to the single nearest feeder, for
    a good reason: two circuits' mains share a trench, so a service
    joint at a tee would otherwise drag both. A **breech** is not a
    fitting let into a run — it is where a run ENDS and others begin.
    Three feeders meet at one on a live drawing: the incoming cable's
    last vertex and two outgoing cables' first. One followed and two
    stayed, so dragging the joint tore the cable apart at the fitting
    whose whole purpose is joining it.

    The narrowing now applies to joints that sit on a run, and a breech
    takes every feeder meeting it — same circuit, and END vertices only,
    since offering it every vertex would let it claim a cable that
    merely passes close and pull it out of shape.

    Worth reading `Joint_Type` as a real distinction rather than a
    label: `service`, `bottleend` and `breech` are three different
    things geometrically, and a rule written for one of them will be
    wrong for at least one of the others.

40. **A panel re-run as something else.** Applying a suggested cable
    change re-ran `runFullTrace` — a SINGLE-NODE trace — whatever had
    produced the panel. The levels check traces every circuit and hands
    back parts, so applying a suggestion swapped a whole-site levels
    report for one node's legs: the circuit picker vanished, the other
    circuits with it, and the volt drop columns went with the `levels`
    flag that was no longer set.

    Which run made the trace is recorded on the trace. It re-runs that
    one, at the same depth, and keeps the circuit being read — the
    levels check clears the selection, which would drop somebody back to
    the first circuit after a change made on the third.

41. **One narrowing, applied to one of the two menus.** The service
    cable editor filtered its "Manually set" list by Usage and by the
    active flags, through `cableChoices`. The mains editor beside it
    read the raw catalogue: HV cores, earth cable, pilot cable and 20 kV
    triplex, in the order rows were entered, offered to a designer
    choosing an LV feeder.

    Both read `cableChoices` now, with two rules added to it rather than
    to one caller: **`Rating_Amps` must have a value** — a row without
    one is a name somebody typed and never finished, and choosing it
    sets a size the network cannot be checked against — and the list is
    sorted on the label as it reads on screen, numbers compared as
    numbers so 95 sorts before 185.

    Never an empty menu: where nothing survives the narrowing the whole
    catalogue is offered and the panel says so, because a designer
    facing an empty dropdown cannot tell a filtered list from a broken
    one. The message names both reasons — no Usage set, or no rating —
    since they want different answers.

    Same shape as fault 38: a rule written for one place and not the
    near-identical one beside it. **When a menu is narrowed, the check
    is whether every menu offering the same thing was narrowed.**

42. **A new column went to the far right, for everybody.**
    `useTableLayout` saves a column order on first use — so everybody has
    one — and merged a new column by APPENDING it. A column added as the
    second arrived last, and the only way to find it was to know it had
    been added. It is inserted after whichever of its declared
    neighbours is already in the saved order now, leaving arranged
    columns alone. Every table in the app is affected, not just this
    one.

    `SpecTable` also gained derived columns: `value(row)` computes a
    cell from somewhere else, read-only, sorting and filtering like any
    other because everything goes through `shown`. Cable Specs uses it
    to show the Usage each size inherits from its cable TYPE — which is
    what decides whether the drawing offers it for a main or a service,
    and could previously only be found by crossing to Cable Types and
    matching rows by name.

43. **One question, three answers.** The mains editor, the service
    editor and Edit by kind each built their own cable menu — naming,
    filtering and ordering written out three times. They agreed on the
    naming by accident and differed everywhere one of them had been
    corrected: usage filtering in two of the three, the raw catalogue in
    the third, and no sort in any of them.

    `cableMenu.js` is the one answer now, and all three go through it:
    name (type plus size), order (alphabetical, numbers as numbers so 95
    sorts before 185), usage, active flags, and `requireRating` as an
    option.

    **The rating rule deliberately differs between callers** and that is
    a decision, not drift: the feature editor offers only rated cables,
    Edit by kind offers every active service cable, because turning it
    on there would take most of the service sizes out of a bulk edit
    without anyone asking. The note sits above the call and
    `checkcablemenu` holds both halves so it stays deliberate.

45. **A dependency array is evaluated during render.** The effect body
    is not — it runs long after everything is declared — so an effect
    placed near the state it watches can safely CALL something declared
    a thousand lines below, and cannot safely NAME it in the array. A
    watcher added at line 1928 listed `typeOf`, declared at 3014, and
    the canvas would not open at all: *"Cannot access '$r' before
    initialization"*.

    **`vite build` compiles it happily.** It is a runtime fault and
    legal to write, so nothing caught it before a person opened the
    page. `checkdeadzone.mjs` now walks every hook's array and reports a
    name declared later in the same top-level function.

    Writing that check took three passes, and the two wrong ones are the
    lesson: it first recorded whichever declaration a regex matched
    first, so a local `const rows` inside a handler shadowed the
    `useState` above it and nine working pages were reported broken;
    then it was file-scoped, so one component's parameter was measured
    against another's state. **Earliest declaration, and the same
    top-level function.** Both narrowings lose real faults in theory and
    neither invents one — the right way round, because a check that
    cries wolf gets switched off and then catches nothing at all.

    Proven by putting the fault back and watching it fail, which is
    worth doing for any check written after the fact.

46. **A leg's cable read off a copy.** `spanTrace` took each leg's cable
    size from the NODE it ends at. A node's cable is mirrored onto it by
    Apply Cable Sizes from "the run feeding it", under a comment saying
    two runs meeting at one node "cannot happen on a routed network".
    At a link box it happens by design — the trunk arrives and three
    outputs leave, all touching one point — so the last run processed
    won, and the trunk leg reported an output's 185 where the input is
    300. On a sheet somebody sizes a network from.

    A leg now takes its cable from the RUN it lies along, sampled at the
    MIDDLE of the leg: every run at a junction touches the ends and only
    the right one covers the middle. Where a box's outputs share a
    trench and several runs cover the whole leg, the run stamped with
    that output wins — the same two-step rule as the other four places.

    Fault 13 once more: the run holds the fact, the node holds a copy,
    and the copy was being read.

**`checkrealdrawing.mjs` — a real site, and the answers it is known to
give.** Every other check here is built from a fixture written to show
one rule, which is right, and has a gap: a fixture only contains what
its author thought of. Every fault found on screen this session was
invisible to fixtures because none of them held a link box with three
outputs down one trench, or a node somebody had dragged.

So `fixtures/drawing-2202-043.json` — a Download Drawing export — and
the figures it produces. **Not a specification.** Several of the
recorded answers were wrong when it was written, and one still is: the
breech joint's cable in is recorded as `null`, because `sizeOf` looks
for `Size`/`Cable_Size`/`Size_Label` and the build writes
`VD_Cable_Size_ID`, so every jointing sheet goes to the gang blank. That
is recorded rather than fixed because fixing it needs a decision — the
call-off feeds a tablet that has no catalogue — and **when it starts
reporting a cable the check will fail, which is the fix arriving.**

A failure here is a question: did you mean to change this? Where the new
answer is better, update the numbers and say so. Where it is not, a
regression has been caught before it reached a designer's screen, which
is the thing nothing in this suite could do before. It found the
`sizeOf` fault on its first run.

47. **Two assumptions that only held while the box sat on a junction.**
    A redesign moved a link box to the far end of its network, mid-span
    on a trench rather than at a fork of it, and two separate things
    broke at once.

    - **The box was never numbered.** `planFeederPoints` numbers what
      the walk MARKS, and the full-circuit model calls a mid-span box
      nothing — neither a fork of the dig nor an end of one. So no stop
      was offered at its position, it was never adopted, and it kept the
      number placement gave it: C10 on a circuit with nine points, the
      sequence starting at ten. It had worked only by accident: before
      each part's marks were filtered, the trunk marked every junction
      on the circuit, which included the box whenever it stood on one.
      `partEndMark` marks the far end of what each part lays, because
      **that is a stop by definition — it is where the cable ends**.

    - **The box carried an output's cable.** `syncNodeCables` mirrored a
      run onto the node it feeds, last one wins, under a comment saying
      two runs meeting at one node "cannot happen on a routed network".
      At a box it happens by design: the trunk ENDS there and every
      output STARTS there. Three runs claimed the box and an output won,
      so it carried 185 where its input is 300 — a figure appearing
      nowhere else at that point, neither as the system size nor the
      manual one. A node now takes the cable of the run that ARRIVES at
      it; a run leaving is the next length of cable and has its own node
      further on.

    Worth stating as one lesson: **both were assumptions about geometry
    that nothing wrote down**, and both survived every fixture because
    every fixture put the box where the assumption held. The second
    fixture, `drawing-2202-043-box-moved.json`, exists to keep the
    awkward shape in the suite.

48. **"The same place" is not the same string.** The override carry
    (fault 28) keyed a hand-set cable size on the run's arrival
    quantised to centimetres, and looked it up EXACTLY. A rebuild
    re-routes, so the same junction comes back a few centimetres off,
    and an exact key does not match.

    Measured on a live drawing before the fix: **two of five hand-set
    sizes would have been lost by a rebuild.** One run came back at
    286.484 where it had ended at 286.46 — a cable size dropped over
    24 mm. The trunk was worse: its terminus moved 0.55 m when the link
    box became the end of the run, taking a 300 with it.

    Nearest arrival on the same circuit within two metres now, which is
    far tighter than the gap between two stops and far looser than the
    noise of re-routing. Same drawing after: nine of nine carried.

    The lesson is about the shape of the first fix rather than the fix
    itself. **Keying on a position is right; comparing positions by
    equality is not.** Anywhere a coordinate is used as an identity,
    the comparison wants a tolerance — and the tolerance wants a reason,
    not a round number.

49. **Two correct fixes, both deployed, both unable to work.** The
    build flattens every part's sections into one list for the runs to
    be laid from, and did it by writing that list ONTO the trunk part:
    `r.sections = sections`. The marks are read from each part's
    sections a few lines further down — so the trunk was filtered
    against sections covering the whole circuit, which filters nothing,
    and its terminus came out as the last point of the last section on
    the drawing rather than the link box it ends at.

    `marksOnPart` and `partEndMark` were both live and correct. Neither
    could do anything. On the drawing the bend kept its numbered point
    and the box was never adopted — the exact symptoms of neither fix
    being deployed, which is what four rounds were spent chasing.

    **A shared object edited for one reader's convenience is read by
    every other reader too.** The flat list goes to `planned` directly
    now and no part is mutated.

    Two things worth carrying from how long this took:

    - **A simulation that re-implements the caller proves nothing about
      the caller.** Every check ran the two functions on the real
      drawing and they answered correctly, because the harness never did
      the one assignment that broke them. Drive the real path, or accept
      that a passing check only covers what it actually calls.

    - When behaviour on screen contradicts a passing check, the
      assumption to question first is the harness, not the deployment.
      The status marker added mid-hunt — `partsSaid`, printed in the
      build's own banner — is what finally separated "not deployed" from
      "deployed and wrong", and it did so in one line. **Anything that
      changes the shape of an answer should say so while it happens.**

**The levels sheet groups by cable (option B).** A circuit with a link
box is a trunk to the box and one cable per output, each fused on its
own. Two outputs sharing a trench produce two legs over the same
stretch — genuinely two cables, and on a flat table two rows that read
as the same row twice. The panel now heads a section per part, naming
the box and the output and its fuse; the export carries the same fact
as a `Part` column, since a spreadsheet cannot hold a heading and a
filter on it gives one output's design on its own.

A circuit with NO link box gets neither: one part, no headings, no
column value, exactly the table it always was.

**Two link boxes in series is refused by name.** A box takes one input
and splits it; feeding one from another output fuses everything beyond
twice. `circuitTraceParts` returns an error naming both boxes rather
than tracing it, because a trunk-then-outputs report of a nested pair
reads as though it were sound — the figures are consistent and the
shape is simply wrong. **Where a drawing states something nobody means,
say so instead of describing it.** Boxes side by side on one circuit
are two independent splits and trace normally; `checkcabletrace` holds
both halves.

**An output of a link box can be isolated.** Same shape as isolating a
circuit — a piece of state, a rule about what it hides, the same banner
offering everything back — reached from the box's editor per output, or
from any object standing on that output.

The rule is in `linkWays.js`. What says which output something is on is
what the build and the lasso WROTE: `Link_Box_ID` and `Link_Way` on the
runs and the meters, and for anything holding a `Plot_ID`, the output of
that plot's meter. **Nothing is guessed from position.** A feeder point
at a junction carries no stamp, and inventing one for it from where it
stands is the geometry-guessing that produced faults 31, 38, 39 and 46.

It hides the other outputs of the same box and nothing else — not the
input, not the trenches, not another circuit. Somebody reading output 3
wants to see what feeds it and where it runs. An unstamped feature
stays, because "not known to be on another output" is not "on this
one", and hiding on a guess loses work.

**Feeder end points are off the bill — migration 0204, NOT YET RUN.**
A feeder end point says where the build breaks a run; it is made and
deleted by Build LV Network on every run and nobody orders one. That is
the third point of its kind: 0058 took plot seeds off, 0075 took span
nodes off, 0204 takes these. All three say WHERE something is measured
rather than WHAT is to be bought.

A link box standing exactly where a feeder end point would be is still
counted, because it is a `linkbox` and not a `feederpoint` — it is a
chamber with fuses in it.

`gis_bom` is one SQL function, so 0204 is 0167 rebuilt with one role
added to the exclusion list rather than a patch. **It has to be pasted
into Supabase** like every migration here; the folder is the only record
the schema has. `checkbomroles` reads the newest definition in the
folder rather than a named file, so it keeps working when the next
rewrite lands, and it holds both halves: the markers stay off and the
plant stays on.

**A STRAIGHT joint can be clicked onto a cable, and the cable breaks
there.**
`+ Joint on a Cable` arms a placement: the cable says ON LINE under the
pointer, the click puts the fitting on it, and `breakLineAt` splits the
run at the same point.

**The break is not a nicety.** A joint IS a break in the cable — two
lengths of conductor come into a fitting and are joined inside it.
Drawing the fitting and leaving one unbroken run through it draws
something that does not exist, and every reader downstream believes the
run: the levels walk it as one leg, the bill counts its whole length as
one cable, the schedule quotes one drum.

It reuses what was there rather than adding a second way to do either
half: the ON LINE badge is the existing edge snap, and the split is the
same `breakLineAt` that breaking a line by hand uses — which recomputes
`Connects` for both halves and for everything that touched them, rather
than copying the old list onto two runs that no longer go where it says.

**A straight joint, not a service joint** — `STR` in the catalogue,
"two cable ends brought into one fitting". A service joint is a fitting
let into a run to take a service off it, which is a different thing.
This placed a service joint at first and it was wrong.

**And the two ends follow it when it is dragged.** The drag narrows a
joint to a single feeder, which is right for a service joint — one
cable passes through it, and two circuits share a trench. A breech and
a straight joint are not that: both are places where cables END and are
joined inside the fitting. Every cable meeting them is genuinely
attached, so narrowing to one leaves the rest behind and dragging the
fitting tears the cable apart at the thing whose purpose is holding it
together. The test is a LIST of kinds rather than "is not a service
joint", so a kind added later has to say which it is rather than
inheriting a rule by default.

**Drawn on the click.** It went in with `addFeature` and then
`breakLineAt` did its own save, two reads and a Connects rewrite —
nothing appeared until all of it came back, so the click looked ignored
and the fitting arrived seconds later, long enough to click again and
place two. Every other placement here draws optimistically for exactly
that reason; this one did not, because it was written as a call to the
API rather than as a placement. Rolled back if the save fails, so a
joint that was never stored does not sit on the drawing looking as
though it was.

The break still round-trips — `breakLineAt` recomputes `Connects` for
both halves and everything that touched them, and doing that on guessed
geometry is worse than a moment's wait. So the fitting lands at once and
the cable parts a beat later.

The menu's other three joint items are unchanged. They drop one in the
middle of the view and snap it to the nearest feeder, which answers
"somewhere on this circuit"; this answers "here". Both are wanted.

**A straight joint is a feeder end point.** It takes one cable in and
one out, and exists so a designer can change size either side of it —
the cable genuinely STOPS there and another begins, which is the
definition. So the walk adopts it exactly as it adopts a link box, the
trace stops at it, and the volt drop and impedance are drawn beside it
on the canvas. The two lengths either side become two legs carrying two
cable sizes, which is the whole point of placing one.

A service joint is NOT one: a cable passes through it and nothing about
the run changes. A breech is where a run divides and the walk already
marks that as a junction.

**And the build breaks its run there.** This is what makes a straight
joint survive a rebuild, and without it the feature was unusable: Build
LV Network deletes every generated main and lays them again from the
trench routing, and a joint is NOT in that routing — it is a fitting
somebody clicked onto a cable, usually mid-span between two trench
vertices, so nothing in the model knows it is there. Left alone, a
rebuild lays one run straight through the fitting and the two sizes
either side become one: the designer's work undone by the next build,
silently.

Done on the sections rather than by adding nodes to the graph. **The
graph is the dig, shared by every circuit; a fitting on one circuit's
cable is not a fact about the ground.** The load does not change at a
straight joint — nothing leaves there — so both halves carry what the
whole length carried; what changes is that they are two lengths, which
is what lets them be two sizes.

`jointMarks` then offers a stop at the fitting, because neither
`marksOnPart` nor `partEndMark` can: one filters marks the model
produced and the other adds the end of a part's cable, and the model has
never heard of the joint. Without it the joint is never adopted, never
numbered, and carries no levels.

**No joint on any drawing had a `Connects` of its own.** The relink
pass — the thing that records what connects to what — filtered to lines
and meters. A joint got a link only where something else happened to
reference it, and `breakLineAt` rewrites the features that ALREADY
reference the halves, which a joint created a moment earlier does not.
So the joint came out of the break holding no record of what it joins.

That is why reading `Connects` did not stop the wrong cable moving:
there was nothing to read, and the geometry fallback ran. Joints are in
the relink pass now, which repairs every one already placed on the next
build, and a joint placed on a cable writes its own links as it is
made.

**And it drags exactly the two cables it holds.** Where `Connects`
exists it answers. Where it does not — and no joint on any drawing had
one until the relink pass was widened — the fallback is bounded by what
the fitting IS: the two NEAREST cable ends, and no third. The halves
have a vertex on the joint, so they are nearer than anything merely
ending close to it, and the rule needs no record to be right. A breech
is deliberately not bounded this way: how many cables leave it is the
designer's business.

**And the bound applies whatever the record says.** `Connects` is
computed from GEOMETRY — `connectedTo` takes anything with a vertex
within a quarter of a metre — so the relink pass writes a passing cable
into a joint's list as readily as the two it holds. Treating that list
as the answer put the bug straight back on the next build, with the
record now agreeing with it.

**A record derived from the same geometry that was wrong cannot correct
it.** The fitting's own definition can: one cable in, one out. So the
bound is unconditional and the list may only narrow it further. Where a
fact about a thing is fixed, say the fact rather than reading it back
out of the drawing.

**The earlier note on Connects:** Lifting the single-feeder
narrowing for breech and straight joints let in anything with a vertex
within reach — and where cables share a trench that is not only the two
the fitting holds. A straight joint dragged took a cable that merely
passes it, because that cable's end lay within a quarter of a metre.

`Connects` is the drawing's own record of what is joined to what, kept
by the link passes and rewritten by `breakLineAt` for both halves when a
cable is broken. Where the joint has one it IS the answer: **it says
what this fitting holds rather than what happens to end nearby.** Where
it has none — an older drawing, a joint placed before the passes ran —
geometry stays the fallback, so nothing that worked stops working.

Worth stating generally, because this is the third time it has come up:
**proximity is evidence of connection, not connection.** Where the
drawing records the fact, read the record.

**The fitting and the stop are two OBJECTS.** A straight joint is a
fitting, and there is a feeder end point on the run where it sits. The
diamond says what is in the ground; the circle says where this is on the
cable; and a designer wants to move each without the other.

Adopting the joint AS the stop fused them into one thing that could only
be dragged together, and three drawing shapes were tried on top of that
mistake before the mistake itself was the answer: the code as loose text
beside the diamond, the circle drawn OVER the diamond (which made the
fitting vanish), and the circle offset on a leader (which still moved
with the joint, because it still WAS the joint).

**A breech had it right all along**: the fitting is a joint and the
build makes a separate feeder point beside it. A straight joint works
the same way — `jointMarks` offers the stop, nothing adopts it, and the
build creates a point there like any other. The joint is out of the
levels pass, out of `isStopFeature`, and out of the editor's span-code
panel.

The lesson is about where a fix goes. Each of those three attempts was a
drawing change answering a complaint about drawing, and the fault was in
the model: two things had been made one. **When the third attempt at
presenting something still looks wrong, the thing being presented is
probably wrong.**

**The old note, kept because the reasoning still holds:** A straight joint is a
fitting AND a feeder end point: the diamond says what is in the ground,
the circle says where this is on the run. Two wrong answers were tried
before the right one — a code as loose text beside the diamond, which
made the stop look unlike every other stop; then the circle drawn OVER
the diamond, which made the fitting vanish. A joint that looks like a
node is a joint nobody can see.

The circle stands BESIDE it on a leader, exactly as a generated feeder
point does at a breech, in the colour of the cable it holds — the link
box output's colour where the run has one. The diamond is untouched.

Sizing it by the link box's formula also made its text larger than every
other stop's, for no reason a reader could see; it takes the node's
radius.

**A filter is a list of what is wanted.** Adding the joint to the
levels pass, the `linkbox` clause was deleted along with the line it
shared, so the box dropped out of the pass and its levels vanished from
every drawing. Editing a filter by rewriting the line before it is how
an entry goes missing, and nothing failed — the box simply stopped
being asked about.

**It wears its code.** C2, C3 — a feeder end point belongs in the
sequence, so a designer reading the drawing can find it in the schedule
and quote a level at it. Beside the symbol rather than over it: a node's
code is white inside its own circle, and a joint's symbol is a small
diamond drawn with the features, so writing over it would bury the
fitting. The editor shows the same code, but only once the walk has
adopted it — a blank one would read as a number missing rather than one
not yet assigned.

**One in, one out — said, not refused.** Three cables at one is a
breech and one is a bottle end, and the editor names the fitting it
actually is. It does not block: a drawing is mid-edit for most of its
life, and a joint with one cable on it is exactly what you have between
placing the fitting and drawing the second run. The person who meant to
draw it should find out from the panel rather than from site. Counted by
cable ENDS at the fitting — a main running past is not connected to it,
and one touching at an interior vertex is passing through, which is a
service joint's arrangement.

**A cable's colour is what tells it from the one beside it.** Three
places asked "which cable" and only one of them showed the answer:

- the **object picker** read the STYLE's colour, so three cables on one
  route came up as three identical amber squares — and three cables on
  one route is exactly when that dialog opens. It reads
  `feederPlan → ringColours → style` now, the same precedence the canvas
  strokes the run with, and names the circuit and the output in words
  beside it;
- placing a **joint** on a route with several cables asks which, rather
  than taking the nearest, and offers the same colour, circuit, output
  and length;
- the link box's **input dot** was drawn slate. Every output wore its
  way's colour, so the one termination that did not say which cable it
  belonged to was the input — the trunk, which is the cable somebody is
  usually tracing back. It takes the colour of the cable that ends at
  the box and is not one of its own outputs.

50. **The same feature, built twice.** The measured-length prompt had
    TWO effects writing one piece of state in two different shapes, and
    TWO dialogs reading it. The surviving producer set a single feature;
    the consumer expected a list of rows. Whichever dialog rendered,
    answering it would have thrown on `ask.rows` and taken the canvas
    down — and it shipped, because nothing fails while nobody redraws a
    measured line.

    Nothing in the suite could see it: both halves were syntactically
    fine, the build passed, and each check tested the half it knew
    about. `checkdupes` now holds the rule — **one dialog and one
    producer per piece of state** — because two of either means the same
    thing was built twice and the two will disagree.

    **Before adding a feature, look for it.**

51. **A string that appears twice is not an anchor.** An edit anchored
    on `if (jointFor) {` matched the DRAW pass rather than the click
    handler and deleted two thousand lines between them. The build then
    passed, because what was left was still valid JavaScript.

    Recovered from the copy last delivered, which is the only reason
    this was survivable. **Anchor inside the function being edited, and
    assert the replaced span is the size you expect** — a bounds check
    on the region would have caught it before it was written.

**Nothing is offered that can only report nothing.** Almost everything
on these menus works on the dig, and on a drawing with no trench they
can only find nothing — which for a CHECK reads as a pass. "Check
Services Reach the Mains" on a drawing with no service trenches said
every service reaches the mains.

Two facts, `hasTrench` and `hasServiceTrench`, computed once so every
menu agrees, and each guarded item names the missing thing in its hint.
**Disabling on its own is a dead end**: a grey item with no reason sends
somebody looking for what they did wrong. Build LV Network names its two
requirements separately — a circuit to route and a dig to route it
along — because they are fixed in different places.

`checkmenuguards` holds it. Worth extending as more items are added:
the test is whether the thing can do anything at all on an empty
drawing, and if not, whether it says why.

**The Electric menu groups by the thing, not the verb.** One row per
fitting or cable, opening to the kinds of it — `MenuBranch` in
GisMenus.jsx, closed by default, `data-keep-open` so opening a branch is
not choosing anything.

**Mains Network** (POC, Substation, Route POC to Substation, then Feeder
Cable, Link Box and Joint as branches) and **Services** (Cable, Link to
Circuit), because they are two jobs done at different points in a
design and the old flat list mixed them.

Two renames, both because the old name claimed to be the only way:
**Auto Build LV Network** is one of four ways to get a feeder cable, and
**Auto Place Feeder Joints** sits beside the four placed by hand.

**"Apply Cable Sizes to Span Nodes" is gone** — removed on request. The
build already applies the sizes, so the button repeated a step the build
had taken and could be pressed at the wrong moment. `syncNodeCables` is
still called by the build, so nothing is orphaned; `checkorphans` would
say if it were.

Three checks pinned the old shape and were updated rather than worked
around: `checklinkbox` (the two ways are now under a branch),
`checkmenuguards` (the rename) and `checkutilitymenus` (the section
order and the removed item). **A check that names a menu item is a check
that will fail when the menu is reorganised** — which is right, so long
as whoever reorganises reads it rather than deleting it.

**One rule for the colour of a stop.** A feeder end point on a link box
output wears that output's colour, not the circuit's. Two places ask —
the drawing and the "objects here" picker — and the picker asked the
STYLE, so it showed amber for a point drawn pink, on a dialog whose
whole job is telling apart things lying on top of each other.

`wayColourOf` in linkWays.js is the one answer, driven by
`checklinkwayisolate`, and `checkstraightjoint` holds that the canvas
goes through it rather than working it out again. Null where the point
is not on an output, which is the caller's cue to fall back to the
circuit — a colour invented for a point that has none would be worse
than no colour at all.

The general shape, now seen enough times to state: **a swatch beside a
thing must be the colour that thing is drawn in.** Anywhere a list
names features, the colour is doing the work of telling them apart, and
a list that computes it differently from the canvas is a list that
lies.

52. **Two filters for one rule.** The straight joint's drag falls back
    to "the two nearest cable ends" where no `Joint_Cables` was
    recorded. The LOOP guards on circuit a few lines above; the fallback
    scanned every feeder main on the drawing. So a cable from another
    circuit ending at the same point took one of the two slots — and
    ties break by id, which the newer half of a freshly broken cable
    always loses.

    One half followed the joint and the other stayed, which reads as the
    break having failed rather than as a third cable being counted. The
    narrowing was correct and picking from the wrong pool.

    **A narrowing has to select from the same set the caller will
    accept**, or it spends its slots on candidates that were going to be
    rejected anyway. Reproduced with three cables and the ids the real
    case produces, before and after.

**A cable is joined to a joint because somebody joined it.** Snapping a
cable END onto a joint records it on the joint, and the connection then
stands however the drawing is moved about. Released only by
**Disconnect** in the joint's editor, named per cable — a breech holds
several, and releasing the wrong one silently would be worse than the
accident this prevents.

This generalises what `Joint_Cables` already did for a straight joint to
EVERY kind of fitting, and the helpers live in joints.js so the canvas,
the editor and the drag read one definition: `jointCables`, `withCable`,
`withoutCable`, `jointAtEnd`.

**Ends only.** A cable passing across a fitting is not joined to it, and
treating it as joined is how a joint came to drag a run that merely
crosses its position.

**And the panel shows on every joint, not only the ones holding
something.** Every joint drawn before connections were recorded holds
nothing, so a panel listing only what is HELD showed nothing on the
joints somebody already had — the feature read as missing on every kind
of joint but the one that writes the record when it is placed.

It lists what is STANDING at the fitting too, greyed, with **Connect**.
Offered rather than assumed: a cable ending at a joint is usually joined
to it and on a shared trench sometimes is not, so one click says who
decided. That is how a finished drawing catches up without a migration
and without anything being inferred behind somebody's back.

The point of the whole thing: **`Connects` is derived from geometry and
`Joint_Cables` is not.** Everything that read the derived one moved the
wrong cable sooner or later, on a drawing where cables share a trench.
A record of what somebody did outlives a guess about what they meant.

**A stop standing at a joint travels with it.** The feeder point placed
with a straight joint has its anchor at the fitting and its leader drawn
from there to wherever its marker was nudged. Moving the joint alone
left the leader ending in mid air, pointing at nothing.

The ANCHOR follows; the marker does not. Somebody put the marker where
it reads best, and the two being separate objects is the point — so the
leader stretches, which is what attached looks like.

Matched on `At_Joint_ID`, stamped by the placement, **not on position**:
two joints a metre apart would each claim the other's stop. Points made
before the stamp existed fall back to standing within a third of a
metre at the moment the drag begins — a bridge for drawings already
made, narrow enough not to be a guess.

And it is SAVED through `bulkUpdateFeatures`. These points' geometry
never moves, so they are not in the move's updates and `moveFeatures`
never sees them. Left out, the leader would follow until the next reload
and then jump back — **which looks right while being wrong**, and is
worse than not following at all.

53. **A click is not a drag.** Only the PAN had a movement threshold.
    Every other mode acted on the first `pointermove`, so a click that
    wavered by a pixel or two — which most clicks do, and every click on
    a trackpad does — moved whatever was under it and saved the move on
    release.

    Worst on a VERTEX, because that path SNAPS: its first move resolves
    the cursor against everything nearby, so a click on a cable end
    could jump it metres onto another feature. Reported as the drawing
    leaping when all somebody did was select something.

    `DRAG_PX`, in SCREEN pixels — the same hand movement at any zoom,
    where a metre of slack would be a hair at 1:500 and a shove at 1:20.
    Placed ABOVE every mode branch, because the vertex and anchor
    branches return before the delta is computed and a check below them
    would have guarded only the modes least likely to surprise. The pan
    keeps its own test from the same constant: it moves the view from
    the first pixel and only records whether the gesture counted, which
    is the opposite way round.

    Nothing is written for a gesture that never became a drag either —
    a save of unchanged geometry is still an undo entry and a version
    bump for having done nothing.

**Trace from a Point.** Started from any utility's menu, so what is
being followed is already answered; the click supplies the only thing a
menu cannot. The panel then offers all three questions — cable or pipe
versus trench, and upstream, downstream or both — and re-runs from the
same point when either is changed, because "actually, show me the
trench" is the same question about the same place.

**The forking is geometry, not code.** `traceWalk.js` returns one
polyline per LEAF, each running the whole way from the start, and the
token on every branch travels at the same speed in METRES. So two
branches sharing their first ninety metres carry their tokens over the
same ground and read as one, then part at the fork. Nothing in the
drawing knows what a fork is. A tree of nodes — the obvious shape —
would have needed an explicit "now split" step and a rule for what
happens to the token that was there.

**Direction is distance ALONG the network from a source**, not as the
crow flies: a run that loops back is further downstream at every step
while getting closer to the POC in a straight line. A trench has no
source, so upstream and downstream are not questions it can answer, and
the panel greys them with the reason rather than hiding them — a
control that disappears looks like a fault.

Speed is in metres per second, so how far a trace went is part of what
the animation says; a fraction would make a street and an estate take
the same time. A token that arrives stops being drawn rather than
sitting on the last point looking like it is still going, so the short
branches finishing early is the trace showing which way is further.

54. **A click on a line is not a click on a vertex.** The trace walk's
    graph is built from the lines' VERTICES, and the start was the
    nearest one within reach. A click in the middle of a run is nowhere
    near a vertex — a twelve metre service has both ends six metres from
    where somebody clicked, against a reach of about two — so it
    reported *"click on a line"* to somebody who had clicked on a line.

    The segments are asked when no vertex is near enough, and the walk
    starts from whichever end of the segment the click was nearer. Not
    the projected point itself: starting mid-segment means splitting an
    edge and rebuilding the graph around it, for a marker that would sit
    two metres from where the walk begins anyway.

    The reach is unchanged, and deliberately: it is what says "on a
    line", and widening it to make the middle work would make a click in
    a field trace the nearest cable in the county.

55. **Two numbers for one question.** A vertex was RECORDED as joined
    to a fitting within 0.35 m and FOLLOWED within `CONNECT_M`, 0.25.
    So a vertex snapped a third of a metre from the joint was written
    down as held and then never moved with it — **glued on paper and
    adrift on the drawing**, which is worse than not being glued at all,
    because the editor says it is connected.

    `JOIN_REACH_M` is the one number now, exported from joints.js and
    used by both. Everything the fitting does NOT name keeps the tighter
    tolerance, which is what "touching" means for a cable nobody has
    spoken about.

    And the record is consulted BEFORE the guesses. The circuit guard —
    a good inference for cables nobody has spoken about — was overruling
    it, so a joint carrying one circuit's stamp refused to move a cable
    from another that somebody had deliberately joined to it: the
    fitting disagreeing with the person who placed it.

    **Where a fact was stated, state-beats-infer, and the tolerance that
    recorded it is the tolerance that honours it.**

    Three separate inferences sat between the record and the cable, and
    each had to be told to stand down: the **circuit guard**, the
    **nearest-feeder narrowing** (`jointFeeder`), and the **tolerance**.
    All three are good rules for a fitting nobody has spoken about. Any
    one of them left in front of the record was enough to make a joint
    refuse to move a cable it says it holds.

    Worth expecting: **a guess does not know it is a guess.** When a
    stated fact is added to a system built on inference, every inference
    already in the path has to be found and put behind it.

**A joint the build placed holds what the build joined.** Auto Place
Feeder Joints puts a fitting where a service leaves a main, where a run
divides, where a cable stops — and recorded none of it. So the editor
said *"nothing joined to this fitting yet"* on a joint the app had just
placed between two cables it had just laid, and moving it left both
behind.

Read at the moment of placement, which is the one moment the drawing is
exactly what the build laid: nothing dragged since, no stale geometry.
**Inferring the same thing later, off a drawing somebody has been
editing, is the guess this area keeps being bitten by; doing it as the
thing is created is not.**

`cablesHeldAt` is deliberately narrow, because a wrong entry moves a
cable that should not move. A SERVICE counts by its end. A MAIN counts
by any vertex — a service joint is let into the middle of one — but only
where the circuits agree, so another circuit's main sharing the trench
is excluded. Written only where it changes something, and only on the
build's own joints: one somebody placed by hand is theirs.

56. **"Nothing here" and "here but unnamed" are two different facts.**
    The joint panel's Serves line reads `servedPlots`, which answers
    "which plots" and returns nothing for a cable that names none. So a
    fitting with a service ending exactly on it reported **"no service
    cable reaches this point"**.

    On the live drawing that was all **82 service joints, each with a
    cable touching it** — because not one of the 84 services carries a
    `Plot_ID` or a `Seed_Feature_ID`. The panel was reporting a cable
    that is right in front of the reader as absent, which sends somebody
    hunting for a missing cable instead of at the thing that is actually
    missing.

    `servicesAt` answers the other question, and the panel now says
    which it is. The first is a fault in the drawing; the second is a
    gap in what the cable records.

    **Left open, and it matters:** the services carry no plot link at
    all. The jointing sheet's plot list depends on the same field, so
    that is very likely blank too — the same shape as the `sizeOf` /
    `VD_Cable_Size_ID` fault, where the call-off data depends on links
    the build does not write. Worth taking together.

**Laying services updates the joints too.** Only Auto Place Feeder
Joints recorded what a fitting holds, so laying services AFTERWARDS left
every existing joint holding a stale list — and re-laying them replaced
the cables with new rows, leaving joints naming ids that no longer
exist. A fitting naming a deleted cable moves nothing; one naming a
REPLACED cable is worse, because an id can be reused.

Both passes now read at the moment they finish, which is the moment the
drawing is exactly what they laid. **Only the build's own joints are
re-read.** One placed by hand holds what somebody said it holds, and an
automatic pass is not entitled to a view about that — except to drop an
id that has gone from the drawing altogether, which is not an opinion.

57. **The editor renders a snapshot, not the live row.** `editing` is
    taken when the panel opens. Connect wrote the connection, the
    drawing changed, and the open panel went on showing the list from
    before — which reads as the button doing nothing at all.

    Both connection writers refresh `editing` as well as `features` now.
    **Worth remembering for anything else that writes while a panel is
    open**: updating the drawing is not the same as updating the thing
    the reader is looking at.

    The cables in that list were named `#46157` — a database row number,
    which is not on the drawing, not on any sheet, and no help in
    telling one of two cables from the other, which is the only question
    the list exists to answer. They read as what the drawing calls them:
    *"C2 · Electric Main · Circuit 3 · output 1 · 311.1 m"*, or
    *"Electric Service · 12.8 m"* for one the build laid with no name of
    its own. The id survives as a last resort, because a cable with
    nothing else to say still has to be called something.

**Auto Place Feeder Joints shows its progress.** Every joint is its own
round trip, so on an estate it ran for several seconds with nothing on
screen but a menu that had closed — and somebody who cannot tell that
from a dead click runs it again, with the second run working on a
drawing the first has not finished changing.

Counted across the whole job: joints added, reclassified, removed, and
the connections recorded. **A bar that reaches the end and then sits
there while more work happens is worse than no bar**, because it says
the opposite of what is true. Cleared with the busy flag, so a run that
fails does not leave one stuck at whatever fraction it reached, and
silent runs stay silent so they do not draw over the bar of whatever
called them.

**Auto Lay Service Cable places its own service joints** — one per
service, as it lays each cable — and does NOT run the full joint pass.
Breeches, straight joints and bottle ends come only from Auto Place
Feeder Joints, which reads the routed network. Both record what their
joints hold.

58. **A trace ran both ways when one was asked for.** The walk builds a
    graph keyed on POSITION, and two circuits sharing a trench have
    vertices at the same places — so the graph welded them into one
    network. A downstream trace walked from one circuit onto another at
    a shared point and carried on, which on the ground means hopping
    across and coming back the way it came. Measured on the live site: a
    trace begun on circuit 3 returned **88 cables across both
    circuits**.

    Every edge carries its circuit now, and the walk refuses a step onto
    a cable naming a DIFFERENT one. A cable naming none — a service — is
    still followed, because it is fed by the cable it hangs off.

    **And which cable the click meant cannot be measured.** Cables
    sharing a trench are STORED with the same geometry; the separation
    on screen is display offset. Taking the nearest started half the
    traces on the wrong circuit. So the trace asks, through the same
    "Which cable?" dialog placing a joint uses, and passes the answer to
    the walk as `startLineId`. Nothing in traceWalk.js guesses at it.

    The general point, and the third time this session: **where the
    drawing genuinely cannot answer, ask — do not measure harder.**

**A trace starts from anything on the network.** The click looked for a
LINE, so starting one from the thing somebody is actually looking at —
the meter whose supply they are chasing, the joint they suspect, a
feeder end point — worked only by accident, when a cable happened to lie
within reach of where they clicked.

A point feature under the pointer is now the start, at ITS position
rather than at the click: a marker nudged clear for legibility is still
the node it stands for, so the anchor is used where there is one. And
the "Which cable?" question follows as before, which at a joint is the
normal case rather than the exception — a main and a service both lie
there.

The engine never needed changing for this. `traceTree` already answered
from a meter (correctly: nothing downstream of the end of the line),
from a joint and from a service. **What was missing was the question
being asked of the drawing at the point somebody clicked.**

**The trace asks once.** What is being followed, which way, and — where
several cables share the point — which one, are ONE decision about one
click. They were a floating panel and a separate modal, so starting a
trace meant answering in two places with the drawing in between.

One dialog now, opened by the click. The cable list is re-read when the
kind changes rather than stored, or switching to Trench and back would
show the list from the other one, and it names what it will follow even
when there is only one candidate rather than leaving that to be
guessed.

The floating panel stays for a trace already on screen, where the point
is settled and only the reading of it is being adjusted — *"actually,
show me the trench"* is the same question about the same place. Setting
one up is a different moment from changing one.

**The result panel reports; the dialog asks.** The panel carried the
same Cable/Trench and direction rows as the dialog, so finishing a trace
put the questions back on screen — which reads as the dialog reopening
rather than as a result. It shows what was found, with **Play again**,
**Show all** and **Change…**, and Change reopens the one dialog at the
same point.

59. **A backtick in a comment ends a template literal.** These files
    hold their stylesheets in a template literal, and a comment written
    in `code style` inside one terminates the string. The build then
    fails somewhere else entirely, on the next line that happens not to
    be valid JavaScript — the reported line was three hundred lines from
    the cause.

    `checkescapes.py` catches it now, and it is proven the only way
    worth proving: the fault was put back, the check fired on the right
    line, and it passed once removed. **A check written after a fix and
    never seen to fail is a check that passes for the wrong reason.**

60. **Two rules, one drawing, no agreement.** "Downstream" means the
    distance from the source increases — and that distance was measured
    across every edge regardless of circuit, so it took shortcuts the
    supply cannot. On the live drawing the distance to the link box was
    measured along a NEIGHBOURING circuit's cable sharing the trench;
    the box came out nearer the source than the cable feeding it, every
    output measured as leading BACK towards the source, and a downstream
    trace from one said **"nothing downstream of there"** with half the
    estate beyond it.

    The walk had been taught not to cross circuits (fault 58) and the
    distance had not. **Half-applying a rule is worse than not applying
    it**: the two disagreed about the same drawing and the answer looked
    considered.

    Fixing it also needed the search state to change. Keying Dijkstra on
    the node alone, a node first reached along one circuit locked the
    other out and six of the box's eight outputs came back "not
    connected to a source". Measured FOR the circuit being traced
    instead, which the walk is bounded to anyway.

**Known and not fixed: upstream fans out.** From deep in an output,
upstream returns dozens of paths where it should return one. Two outputs
sharing a trench are welded at every coincident vertex, which makes a
loop, and in a loop the distance decreases in both directions from the
far point. The honest fix is to stop welding two DIFFERENT cables at a
shared vertex — joining them only where a joint or an end says they meet
— which is the same "sharing a trench is not being connected" rule as
everywhere else, and a bigger change than this one.

62. **A cable teeing into another was not joined to it.** The trace
    graph joins lines where they share a VERTEX. A service does not
    share one: it runs from a main to a plot and its end lands part way
    along a segment of the main, between two corners. So the service was
    an island — tracing from it found one cable, itself, and a trace
    from anywhere else never reached the plot.

    **Twelve of eighty-four services on the live drawing were
    unreachable that way**, and nothing said so: they are drawn
    touching, and they look joined.

    A further three were islands because their end lands a sixth of a
    metre from a vertex, and the graph keys positions to the centimetre
    — 0.16 m apart is two nodes and two networks.

    Both welded on a COPY before the graph is built: this is the trace
    deciding what counts as joined, not an edit to the drawing. ENDS
    only, both times — a line crossing another without stopping is not
    joined to it, and inserting a vertex there would invent a connection
    nobody drew.

    Found by sweeping every cable on the drawing rather than trying one:
    **966 traces, 73 errors before, 32 after — and 30 of those 32 are
    correct answers** ("nothing downstream" at a cable's far end). A
    fault that shows on one click in ten is a fault somebody reports as
    "this never works", because their click lands in the same place
    every time.

63. **A trace of one output reported another circuit's plots.** Three
    things had to be true together, and each was found only by counting
    what the trace actually reached rather than looking at it:

    - two OUTPUTS of a link box are the same circuit, so the circuit
      rule let the walk step between them at any shared vertex. Bounded
      by output as well now: two runs naming different outputs are two
      cables sharing a dig;
    - a SERVICE carries no circuit at all, and an unstamped cable is
      followed from anywhere. The JOINT knows — `Joint_Cables` names the
      main and the service together, so the service takes the main's
      circuit AND its output;
    - the welding that joins a tee to its main (fault 62) snapped an end
      to the NEAREST vertex, and where two circuits are drawn on the
      same line every vertex is equally near. Ranked now: a cable the
      fitting says it is joined to, then the same circuit, then
      unstamped — and never onto a different named circuit, which is not
      a near miss but two networks in one trench.

    Measured on the live drawing, tracing output 1: **43 meters reached,
    of which 29 belonged to another circuit → 14, which is exactly what
    is lassoed onto it.** Output 2 reaches its 27.

    Counting what was reached is what found this. "It traces everything"
    is not a fault you can see on a drawing of eighty-four plots; a
    tally by circuit and output is.

64. **Two ends nine centimetres apart, and both of them moved.** The
    welding snapped every end onto its nearest neighbour, measured
    against the ORIGINAL positions — so two ends near each other each
    moved to where the other had been. They swapped, and still did not
    meet.

    On the live drawing that was the two halves of a cable a straight
    joint had just broken: **0.093 m apart, no shared vertex**, so the
    trace reached the fitting and stopped with the rest of the output
    beyond it. The joint's own record was perfect — both halves, same
    circuit, same output — and none of it mattered, because the two
    lines were not connected in the graph.

    The lower id is the anchor and the higher one moves. Arbitrary, and
    that is the point: **any rule that picks the same one every time
    converges, and picking by distance cannot**, because the distance is
    the same in both directions.

65. **Direction was measured across a cable it was not tracing.** An
    output and the trunk feeding it share a trench for hundreds of
    metres, drawn on the same line, so a graph keyed on POSITION let the
    distance-from-source take the trunk as a shortcut. The ordering
    along the output stopped increasing, and downstream halted at the
    first step that measured as going back — while "both ways", which
    asks no such question, walked the whole output correctly. Reported
    as *"it works both ways, can you make one direction work"*.

    The distance is measured along the cable being traced and the
    lengths it feeds now, by carrying the OUTPUT through `fromSource` as
    well as the circuit. On the live drawing, downstream from that
    output: **14 paths reaching exactly the 14 plots lassoed onto it**,
    and upstream a single route back.

    **Two attempts before it.** One narrowed the walk (an output meets
    its feed only AT the box) and made every trace worse. One rebuilt
    the graph so each cable kept its own chain, joined only where a
    fitting or an end says — the right shape in principle, and it broke
    the basic fork fixture, so it was reverted rather than left in
    half-working. The fix that held was the smallest: the walk was
    already right, and only the MEASUREMENT crossed between cables.

    **When two rules disagree, change the one that is wrong.** Both
    earlier attempts changed the walk, which was already correct.

    A third drawing is in `fixtures/` for this —
    `drawing-2202-043-straight-joint.json`, the site with the straight
    joint on output 1. A synthetic fixture was tried first and was worse
    than useless: to show the shortcut an output has to run back along
    its own trunk, and a small fixture that does so ends up touching the
    source, which changes the right answer. The site has the shape; use
    the site. The check was proved by removing the fix and watching it
    fail on the right line.

**The cut-out figure is on the drawing.** A stop's levels are the drop
to that POINT on the main; what a customer gets is that plus their own
service. The levels already computed it — `atCutout`, for the
worst-served meter on the stop, whose id is recorded with it — and it
appeared only in the report. So the one figure a design is judged on
could be read only by finding a row in a table and then finding the plot
on the drawing.

Drawn at EVERY meter, each with its own service in it.

It was one per leg at first, on the reasoning that the worst is what has
to pass and twenty labels would say one thing. That reasoning was wrong,
and the drawing said so: **a missing figure reads as a good figure.**
Two plots on one street, one labelled and one blank, and the blank looks
better when it may be worse — reported as "why is 41 worse than 39" when
39 had no figure at all and was in fact further downstream.

**And each plot is measured at its own tee.** Every meter on a leg was
first given the LEG's figure, which is taken at the leg's END — so a
plot teeing in thirty metres earlier was charged the whole leg, and the
only thing separating two plots was the length of their services. A plot
upstream with a longer service then came out worse than one downstream
with a shorter one: *"how can 43 be worse than 39 when 39 is 36 m
further downstream"*, and it could not.

The node the plot's service leaves from is already known — the model
walks a meter back to its foot on the main to decide which leg claims
it — and the drop there is what that plot sees before its own service
starts. A plot whose foot is unknown still gets the leg's end, which is
the conservative answer.

The leg's own worst is unchanged, and is still what the sheet reports
and what the limit is judged on: the end of a leg is the worst point on
it.

Behind the SPAN NODE LEVELS switch with the other level labels, at the
same zoom, and red only past the limit — the main's allowance plus the
service's, because the figure includes the service. Every figure in red
is a drawing nobody reads.

**A figure has to say which figure it is.** A percentage beside a meter
and a percentage beside a stop looked identical apart from the
impedance, and nothing said that one includes a service and the other
does not. Two numbers a few metres apart then read as disagreeing when
they agree — the node figure plus the service IS the cut-out figure.
Reported as *"how can plot 58 be worse than 59"*, and it was not: 58's
was a cut-out and 59's neighbour was a node.

It reads `5.94% cut-out` now. The word costs a little width and settles
the question on the drawing rather than in somebody's head.

**And it moves.** On a terrace the meters sit a few metres apart and the
figures land on the plan and on each other. `Cutout_Offset`, its own —
a meter can carry a name and a cut-out figure, and one offset would move
the pair — with a leader back to the meter so a figure dragged clear
still says which plot it belongs to. Saved by the label drag's existing
path, which writes the whole attributes object.

**The levels report sorts three ways and wears the drawing's colours.**
By node, by output, or along the cable, cycled from one button because
the panel is narrow and the orders are exclusive. Grouping by output
puts the trunk first — everything hangs off it — then each output, with
node order kept INSIDE each part rather than abandoned.

A boxed circuit is several independent runs sharing a sheet, and node
order interleaves them: C2, C3, C6, C7 reads down the page as one run
when it is two.

**And the rows are tinted with their output's colour**, from the box's
own `Way_Colours` so the drawing and the table cannot disagree. Pastel
at 14% — a row is a background behind black text, not a marker, and
these colours are chosen to stand out on a plan. The section heading
carries a full-strength swatch, because the tint is too pale to name a
colour by and the heading is where somebody learns which is which.

Keyed on the box's **id**, not its label: two boxes on a site can share
a name, and a colour from the wrong box is worse than no colour. An
unknown box or an output with no colour set gets no tint rather than a
guess.

67. **A schematic of two circuits at once.** A levels check covering
    several circuits puts all their legs in one list, and the schematic
    drew the lot as one tree. `treeFromLegs` takes the first root it
    finds, so ONE circuit came out as a hierarchy and every other
    circuit's nodes — unreachable from that root — landed at a single
    depth: **a straight line of boxes across the page.**

    Reported as *"circuit 2 looks fine and circuit 3 is a straight
    line"*, which is exactly what it was. Circuit 2 held the root.

    One circuit is drawn now, with the others offered as buttons rather
    than dropped — **silently hiding them would trade a wrong drawing
    for a missing one.** The root is taken from the circuit being drawn
    rather than from the check, because `trace.from` belongs to one
    circuit and not the others.

    `checkschematic` holds it, and it asserts the FAULT as well as the
    fix: if two circuits in one tree ever stop flattening, the fixture
    has stopped reproducing the thing it was written for and says so.

**The levels head reads as three questions.** Which circuit, how to view
it, and what is wrong — instead of a paragraph of running text with the
controls scattered after it.

The paragraph said things that mattered (meters not on the network, an
assumed voltage, legs with no service) mixed in with a leg count and a
title, so **the warnings read as part of the furniture**. They have
their own line now, drawn only when there is something to say, which is
what makes it worth reading.

The orders are radios rather than a cycling button: three behind one
button meant pressing it twice to find out what the third was.

Export and Schematic moved to a footer with Close. They act on the whole
check rather than on any part of it, so they belong after it — which is
also where somebody is when they have finished reading.

**The rewrite dropped a guard and a check caught it**: the Cumulative /
From-origin switch is offered only where something upstream exists,
because on a substation-fed scheme the two figures are identical and a
switch between one number and the same number teaches somebody it does
nothing. `checksourceimpedance` failed within a minute of the rewrite.

**The drawing prints to scale, A4 to A0.** *Tools & Reporting → Print to
Scale*. Paper, orientation, scale and resolution are chosen; the sheet
decides how much ground fits, rather than the screen deciding the scale.

**The arithmetic is the whole feature.** 1:N means a metre on the ground
is 1000/N millimetres on paper, and `checkprint` verifies it the way a
draughtsman would: 100 m at 1:500 must print as 200 mm, on every paper
size and at every resolution. **The resolution must not touch the
scale** — dpi decides sharpness and nothing else, and if it leaked in,
the sheet would be wrong in a way nobody would think to check.

**One renderer.** The sheet is drawn by the canvas's own `draw`, given a
different canvas and a different transform — `draw({ canvas, view })`.
A second renderer would be a second set of rules about what a joint
looks like, and the two would drift apart on the first change to either.
That is what the `toPx` → `at` and `view.scale` → `vs` rename inside the
draw body is for.

**A0 at 300 dpi is refused.** It is 139 megapixels, half a gigabyte of
canvas, and a browser hands back a BLANK canvas rather than an error. A
blank A0 at the printers is an expensive way to find that out.

**The sheet is outlined on the drawing while the dialogue is open.**
"What size and what scale" are two questions whose real answer is a
rectangle on the ground, and until it was drawn the only way to see
whether it covered the work was to print it.

**And it tiles.** *Cover the drawing* divides the ground into as many
sheets as it takes at the chosen size and scale, outlines every one of
them on the canvas numbered across then down, and prints them as
separate pages. A site at 1:200 does not fit on anything, and the honest
answer is several sheets rather than a scale nobody can read — the live
site is 1 sheet at A1 1:500, 9 at A1 1:200, 25 at A3 1:200.

An **overlap** can be asked for: a common strip on both sides of a join
for trimming and taping, and because a plotter that under-scales
slightly leaves a white seam without one. Zero is a legitimate answer,
so it is offered rather than assumed.

One canvas, redrawn per sheet — twenty-five A3s at 150 dpi is more than
a gigabyte if each keeps its own. Each carries its own scale bar and
**sheet N of M**, because a pile of A3s with no numbers is a puzzle. And
`break-after:page`, or the browser flows the second onto what is left of
the first and cuts it in half.

**Two rectangles, not one.** The outer, faint, is the paper — what comes
out of the printer. The inner, dashed, is what lands on it. They differ
by the margin, and drawing only the paper would promise ten millimetres
of coverage all round that the sheet does not have.

Never drawn on the sheet itself: `over` is the print pass, and a printed
plan with a dashed line round the edge showing where the paper is would
be a joke at the reader's expense. Cleared when the dialogue closes,
including when it closes because the print succeeded — an outline left
behind is a line somebody would try to select.

**The sheet opens the browser's print dialogue, and says so.** Which
printer, which tray, how many copies belong to the browser, and an app
cannot reach into that — so the sheet carries a **Print…** button that
opens it. Without one the sheet just appeared in a tab: correct, to
scale, and with no visible way to get it onto paper. *"I don't see where
I select the printer"* is the right question to ask of that.

The bar is screen-only — a control bar printed across the top of a
drawing would be its own kind of wrong — and it repeats the 100% warning
where it is acted on rather than only where it was set.

The dialogue's button says **Open the sheet**, because a button called
Print that opens a tab is not what the word promises.

**And the sheet carries a scale bar.** Printing "fit to page" rescales
everything and makes the stated scale a lie; nothing in the app can
prevent that. The bar is drawn in the same transform as the drawing, so
a rescaled sheet has a bar that no longer matches its own label — two
seconds with a rule settles it.

**The zoom stops at the drawing.** The floor was a fixed 0.4 px per
metre, which is a number and not an answer: on a 368 m site that is 147
pixels — the whole scheme as a smudge in an empty window, and finding
the way back is a hunt. The floor is the scale at which the work fills
the window, because past that there is nothing further to see.

**Never a trap.** A drawing with one point in it, or none, has extents
that say nothing useful, and a floor derived from nothing would lock
somebody at whatever zoom they happened to be at — so there is a hard
0.05 underneath, and a window with no size yet is refused rather than
giving a floor of infinity.

**There is a button for it on the toolbar**, at the far end, with four
arrows on two diagonals. Somebody who has lost the drawing wants one
obvious thing to press, not a menu to remember — and it belongs away
from the drawing tools because it does nothing TO the drawing, it
changes where you are standing.

Pushed right by its own `margin-left: auto` rather than by respacing the
bar: a rule that moves everything to place one button moves it again the
next time something is added. The glyph is drawn inline in
`currentColor`, so it follows the bar's colour and its disabled state,
and one icon is not worth a dependency.

**Reset View is now Zoom to Extents**, and it lands on the same place
the wheel stops at. It used to jump to a fixed corner at a fixed scale
of 4, which is where a drawing STARTS rather than where it is: on a
large site it put somebody in an empty field beside their work.

**And a manual drag says nothing.** *"3 connected line end(s) moved with
it"* described something the reader had just watched happen, and the
status line sits above the canvas — so every drag pushed the drawing
down a line and let it spring back four seconds later. **A message worth
that jump is one that says something the drawing does not**: a refusal,
or a count of what could NOT be done.

68. **A name introduced across a long routine that the routine already
    used.** Giving `draw` an overridable transform for printing, I named
    it `at`. Five places inside that routine already declare an `at` of
    their own — a label's anchor, a boundary's anchor, two corner
    helpers — so **inside those scopes every call meant for the
    transform found a coordinate array instead.**

    It built. It passed every check. It threw the moment a layer drew
    one of them, and the name had been minified, so what reached the
    person was *"when I select the Water menu, J is not a function"* —
    a message pointing at nothing.

    Renamed `pxOf`, `panX`, `panY`: names that appear nowhere else in
    140,000 characters. `checkshadow` holds it, proved by putting the
    name back and watching it fail.

    **The routine is too long to hold in your head, which is exactly why
    a name added across all of it has to be checked rather than
    assumed.** The mechanical rename was right; the name was not.

**The MSDB — a block of flats as one object.** One cable arrives at a
board in a riser cupboard, one leaves it for the next, and the dwellings
hang off tails of a metre or two inside the building. Drawn as
forty-five service points it is unreadable, unmovable, and wrong about
what is in the ground.

**The flats come from the Plots tab.** A dwelling is a plot: it has a
number, a house type and a bedroom count recorded against it already.
Asking for those again on the board would be a second place to say one
thing, with no way to tell which was right when they disagreed.

So the board holds only what the Plots tab cannot know: **which flats
hang off THIS board, and how far each is from it.** A plot counts as a
flat when its house type says so — matched on the type's NAME, because
the ids are per-scheme and the names are what somebody typed into Admin.

A board naming no flats serves none. Every flat on every board would
double count on a scheme with two, and a board that quietly claimed the
lot would size its cable for the whole block.

The load comes from `House_Type_Consumption` on bedrooms AND heat
source; the level is the board's own figure plus that flat's tail, which
is exactly how a plot meter's cut-out figure is reached.

**The heat source is the plot's too.** It is set against the plot on the
Plots tab with everything else about the dwelling, and asking again on
the board would be a second answer to a question already answered — as
well as making a block where one flat is heated differently, a
ground-floor commercial unit among them, impossible to describe.

Each flat reads as a coloured pill: **1BF**, not "1 bed Flat", which is
four words for a thing that appears forty-five times in one table. The
colour is the bedroom palette the placement panel and the property admin
use, so a one-bed is the same colour wherever somebody meets it, and the
full description is on hover.

**Nothing is guessed.** A bedroom count with no row in the consumption
table contributes nothing and is REPORTED — a zero there reads as a flat
that draws nothing, which is a flat nobody sizes a cable for. A flat
with no load figure, no tail cable, or no levels check behind it shows a
dash rather than a number: **a figure that leaves out everything before
the board looks passable when it is not.**

Drawn as an upright square with DB in it — a thing in a building, and a
building does not lean with the trench. `msdb.js` holds the model,
`checkmsdb` holds the rules.

**On the bill — migration `0205_bom_msdb.sql`, NOT YET RUN.** The board
as a unit named MSDB rather than the "Msdb" that `initcap` produces, and
the tails inside it as their own line of cable. A board's flats are rows
in an attribute rather than lines on the drawing, so nothing counted the
cable in the risers and the take-off was short by the whole block.

Reported separately from the drawn service cable of the same size: they
are ordered together but cut, pulled and terminated differently. A board
naming no tail cable still contributes its metres under a name that says
so, because a length nobody has specified is still a length somebody has
to buy.

**And `0206_msdb_role.sql`, also NOT YET RUN, before either of them.**
`Feature_Role` is a CHECK constraint listing every role by name, so
placing a board was refused outright until the role was added. The list
is dropped and rewritten whole — Postgres has no ADD VALUE for a CHECK —
and a role left out would make every existing feature of that role
unwritable, sitting there looking fine until somebody edited one.
`checkmsdb` compares the new list against 0201's and fails if any role
went missing.

**Two things 0205 got wrong on the first run, both mine.** It filtered
on a `Deleted` column that this schema does not have — a habit from
other schemas rather than a fact about this one — and the error only
appears when the function is CREATED, so it cost a round trip. The check
now compares every column 0205 reads on `GIS_Feature` against the ones
0204 reads, and fails on anything invented.

**0205 is 0204 verbatim plus fifty lines.** The first attempt at it
rewrote `gis_bom` from memory and lost the site, utility and developer
columns, the surface handling and most of the water pipe cases — it
would have replaced a working nine-column function with a five-column
one. `checkmsdb` now compares the two files and fails if 0205 mentions
anything less often than 0204 did. **A working function is copied, not
recalled.**

**What feeds it, and what the flats are metered on.** The board names a
circuit, and a link box output where the circuit runs through one — two
outputs are two independent runs, and a board on the wrong one is
counted against the wrong fuse. A circuit with no box has no output to
choose, so the field is not offered; and a two-way box has ONE output,
because the input is not one.

**Every flat has an assumed meter.** Not drawn — forty-five points in a
riser cupboard is what this object exists to avoid — but a meter is how
this application knows a load exists: `circuitsFrom` builds the circuit
list out of meters carrying a `Circuit_ID`, and the feeder model sizes
cable by the meters a run reaches. A flat with no meter is a flat
nothing counts.

So `assumedMeters` returns real meter records carrying what a drawn
meter carries, at the board's position, on the board's circuit and
output. They are **derived on demand**, never written to the drawing:
one place says which flats exist and one says which board they hang off,
and a copy in the features would be a third that went stale the moment
either changed. They carry no `Feature_ID`, so nothing is tempted to
save them.

**Build LV Network routes to a board.** The build routes to METERS: it
scans the features for them, attaches each to the nearest node on the
dig, and sizes cable by what it finds. A board's flats are not features,
so the build did not know they existed — no cable was routed to a board
and no stop was placed at it.

`withAssumedMeters` is applied at the one place the build's view of the
drawing is decided, so everything downstream works unchanged: the
routing reaches the board because there is load there, the cable is
sized for the flats it feeds, and a feeder end point lands at the board
because that is where a run carrying load ends. Measured on the live
site: circuit 3 went from 41 meters to 43 with a two-flat board on it.

**And a flat is a member of its circuit.** A meter joins a circuit
through its plot SEED — `circuitMembership` looks for `Seed_Feature_ID`,
then for a plot feature sharing the meter's `Plot_ID`. A board's flats
have neither: nobody places forty-five seeds in a riser cupboard, which
is what the board exists to avoid. They missed both routes and joined
neither set, so the circuit did not know they existed and **nothing was
routed to the board however much trench ran to it.**

Members by their own id now, the way a non-residential supply is:
whatever a meter belongs to, it belongs to it whether or not somebody
drew a seed for it. A drawn meter still joins through its seed — this
adds a route rather than replacing one.

**A view, not an edit.** Nothing writes those meters. Their ids are
NEGATIVE, derived from the board and the plot — no row has a negative id,
so anything that tries to save one or look one up fails loudly rather
than quietly writing a meter nobody placed. A board with no circuit is
left out rather than routed to one picked for it, and a drawing with no
boards comes back as the same array.

69. **A canvas colour set to a CSS variable.** The MSDB's selected
    state used `var(--accent)`. Assigning a CSS variable to `fillStyle`
    or `strokeStyle` is silently **ignored** — no error, no warning — and
    the context keeps whatever colour it had from the last thing drawn.
    Here that left a white square drawn in white with white letters: the
    board vanished when it was clicked and came back when it was not.

    The stylesheet in that file is full of `var(--...)` and it belongs
    there, which is exactly why it looked right. `#1d4ed8` is what
    everything else in the draw routine uses for a selected feature.
    `checkshadow` now rejects any canvas colour or gradient stop set to
    a variable, proved by putting one back.

    **The same class as fault 68**: something legal in the file at large
    and meaningless in this one routine, failing without a word.

**A role the canvas draws must be in the GIS Styles list.** Adding
`msdb` to the role constraint without adding it to
`GisStylesAdmin.jsx` made a thing nobody could restyle —
`checkboundarystyle` caught it within a minute of the migration being
written. It reads the newest migration that states the constraint and
compares it against the admin list, so this cannot be forgotten for any
future role either.

70. **A panel that edited one object and read another.** The MSDB's
    fields wrote to the editor's draft through `setAttr` and the table
    read `feature.Attributes`, the saved prop. Every edit landed and was
    immediately invisible: **Add flat appeared to do nothing at all.**

    Nothing failed. The write worked, the read worked, and they were
    about different objects. `checkmsdb` now rejects any
    `feature.Attributes?.MSDB_` in that panel.

71. **A lookup that does not exist returns nothing, and the message
    blamed the data.** The MSDB read `lookups.consumption`. The table is
    `lookups.houseTypeConsumption` — which the future-allowance panel
    three hundred lines below has always used. The guess returned an
    empty array, every flat reported *"no consumption figure for their
    bedrooms and this heat source"*, and **the message pointed at the
    specs**: a correctly-worded explanation of the wrong thing.

    `?.` and `|| []` between a typo and an empty result mean no error
    ever appears. `checkmsdb` now rejects `lookups.consumption` by name.

    **A message that names a cause is a claim, and a wrong one sends
    somebody to fix a table that was never broken.**

**The board's Label sits at the top of its panel**, above Location — the
first thing somebody sets and the first thing they read, where the
shared Label field is at the FOOT of the editor, past forty flats. The
shared one is hidden for a board: two boxes writing one value is two
places to wonder which won.

**And a placed board has no default name.** It fell through to the POC
branch of `placePlantAt` and came out called "Electric POC 2" — not
merely unhelpful, but the name of a different kind of thing. Everything
else there has a name that means something the moment it is placed;
a board is "the one in core B's riser", which that function cannot know.

**The panel has vertical spacing of its own.** The shared `fe-row` sets
a horizontal gap and nothing vertical, which is fine for a panel of
three fields. This one has a label, a location, a floor, two riser
lengths, two readouts, a tail cable and a table — stacked tight they
read as one block of boxes rather than separate questions. Spaced on
`.fe-msdb` rather than on the shared class, which every other editor
uses and none of them asked for this.

**Two vertical runs, not one.** `GROUND TO MSDB` is the cable running UP
to a board on the fourth floor; `MSDB TO GROUND` is the separate run
back DOWN that the outgoing feeder takes before it goes anywhere. Not
the same length — the outgoing cable may drop a different shaft.

**They carry different loads.** The run up carries everything the board
draws: its own flats AND whatever is fed onward through it. The run down
carries only what is downstream, because the flats are taken off at the
board — costing it for them would size it for load that never travels
it. The downstream figure is `ampsThrough` on the stop's own levels
figure, converted back with `kvaOf`, which is written beside `ampsOf` so
the two cannot drift.

**The board's own figure does not move.** The drop down affects what
LEAVES the board. Its flats hang off the board and are unaffected by a
cable running away from them.

**Blank, not zero, where nothing continues past.** A board at the end of
the line has no cable back to ground, and an empty field says that where
a nought would claim a run of no length. A run recorded AS zero is still
a run and is treated as one.

Measured: boundary 4.42% → board 7.30% (15 m up, 62 kVA) → outgoing
cable starts at 9.15% (15 m down, 40 kVA).

**Two boards on one floor** need no field: the horizontal cable between
them is drawn on the canvas and measured there.

**The riser is part of the level.** The drawing stops at the boundary; a
board on the fourth floor is fifteen metres further on, up a riser
nobody has drawn and nobody can. `MSDB_Riser_M` carries the boundary
figure up to the board, with the whole block's load through it, and the
flats hang off THAT rather than off the boundary.

Measured: fifteen metres carrying 24 kVA costs **1.11%**. Left out,
every flat in the block reads better than it is — by the same amount, in
the same direction, on every board. A figure wrong the same way every
time is the hardest kind to notice.

**A cable drawn from a fitting is on that fitting's circuit.** A
hand-drawn LV cable arrived with nothing: its editor showed none of the
circuit fields a built cable has, and the levels never saw it — somebody
had drawn a cable onto a circuit and it was not on it.

Taken from what the ends TOUCH — a joint, a feeder point, a link box, or
the cable already there — and the link box output travels with it, since
a cable leaving an output is on that output and not merely on the
circuit. Only where the ends agree or only one names anything: two ends
on two different circuits is a cable joining two networks, and stamping
either would be picking one at random.

72. **A circuit's lasso is stored as a cable.** `Feature_Type: "line"`,
    `Line_Type: "elec_main"` — identical to the cable it encloses, and
    only `Feature_Role: "shape"` says otherwise. Matching on the type
    found three overlapping outlines round the breech joint, called them
    three circuits meeting, and inherited nothing at all.

    So a drawn cable is a line with NO role: anything carrying one is a
    shape, a seed or a fitting. Found by printing everything within two
    metres of the joint rather than by reading the rule again — the rule
    looked right, and the data was not what it assumed.

    The same check then caught a second hole unprompted: `trench_mains`
    contains the word "main", so a mains TRENCH drawn from a joint would
    have been put on the circuit. A trench belongs to no network.

    **And the reach was the wrong measure.** `JOIN_REACH_M` is a third
    of a metre: the distance at which two things are CONNECTED. Drawing
    is not that precise — a joint's symbol is several metres wide on
    screen, and somebody starting a cable at it clicks the SYMBOL, which
    lands a metre or two from the point the joint occupies unless the
    snap happened to fire. Two metres, fixed.

    A reach that varied with the zoom was tried first and is worse twice
    over: it reads the view during render, which that function cannot
    do where it sits, and it makes the same drawing behave differently
    depending on how far in somebody was.

    **And refusing on ambiguity refused EVERYWHERE.** Where circuits
    share a trench almost any point has two within two metres, so the
    rule meant to be careful never fired once on a real drawing. The
    nearest thing wins now, and a FITTING outranks a cable at the same
    distance: on a shared trench another circuit's cable passes exactly
    through a joint, and the joint is a stated thing at that point while
    the cable is merely passing. A genuine tie — two of the same kind,
    equally close — still refuses.

    Verified on the live drawing: every joint type, and the MSDB,
    inherit correctly; open ground inherits nothing.

73. **Two readers, one question, and only one was told.** A meter joins
    a circuit through its plot SEED. A board's flats have no seed —
    nobody places forty-five in a riser cupboard — so `circuitMembership`
    was taught to admit them by their own id, the way a non-residential
    supply is.

    And nothing changed, because `spanTrace` asks the SAME question
    again when it attaches meters to the dig, and that copy still pruned
    against seeds. The flats were members of a circuit that then dropped
    them before routing: the circuit knew about them and the routing
    reached nothing.

    **Recurring fault 27, exactly**: the reader that was not told sees a
    circuit with fewer things on it and says so plausibly. Both readers
    now ask `isNrs || Assumed`.

**The build says what happened to each board.** *"3 run(s), 41 cable(s),
1 of 2 board(s) reached (MSDB 2: no circuit set)"*. A board is routed to
because its flats are load on the network, and several things have to be
true for that — a circuit named, flats ticked, the board within reach of
the dig. When one is not, the build used to say nothing and the drawing
simply had no cable to it.

**Three rounds were spent guessing at which condition had failed.** A
count answers "did it work"; the reason answers "what do I change",
which is the question somebody has when it did not. Measured against the
drawing as the build re-reads it, so what was laid is what is counted.

74. **Two objects at one position, and the id of one is not the id of
    the other.** `elecLevelsAt` is keyed on the STOP a leg ends at — the
    feeder point the build places at a board. The board is a different
    feature at the same place, so the editor looked its level up by the
    board's own id, found nothing, and every flat showed a dash.

    Read off the nearest stop with a figure now, within the same two
    metres the build's own "did it reach" test uses.

**Reached is not the same as served.** A leg can run to a board and
carry nothing: the routing reaches it because its flats are members, and
the flats then fail to ATTACH to the dig. The report showed
`B2 → B3` at 0.0 A with a terminal count of zero, and it read as a board
that had been served.

The build counts both now — boards reached, and flats attached — from
what the model actually put on the dig, and names any board whose cable
arrived without its load. **A cable running to a board that carries
nothing is the failure that looks most like success.**

75. **Three rounds lost to reading a property that did not exist.**
    `spanTrace` returns `attached` on its MODEL, not on the result. My
    harness read `r.attached`, got `undefined`, and reported **zero
    attached meters for a drawing with eighty-four of them** — which
    looked like a total failure of the routing and was a typo in the
    test.

    Then `attached` turned out to be a list of plain IDS, not objects,
    so `.filter(m => m.id < 0)` filtered everything out and the new
    check failed against a fix that worked.

    **A harness that reports nothing working is far more likely to be
    broken than the thing it is testing.** Two rounds of "it must be the
    membership, it must be the pruning" came out of believing it.

**A board's flats are counted off the BOARD.** They were reaching the
model as synthesised meters, through the plot list, the house types, the
consumption table and two membership rules — five things that each had
to be right for a number the designer typed into one field, and any one
of them failing left the column blank with no error anywhere.

The model counts them at the board's node instead. No plot list, no
house types, no consumption table:

    without it:  B2 -> B3 terminal  0, 43 meters on the circuit
    with it:     B2 -> B3 terminal 10, 53 meters on the circuit

The synthesised meters still earn their place — they carry each flat's
own tail for the levels — but **the count no longer depends on any of
that machinery being right.** Ten flats on a board is ten, whatever the
specs say about bedrooms.

**A board is load, not a customer.** It is counted in `meterCount` and
`meterKva` and deliberately NOT pushed into `metersAt`, which feeds the
service-tail machinery: for every entry there, the levels go looking for
that customer's own service cable. A board has none — its flats hang off
it inside the building — so listing it there would make a well-served
leg report "no service".

**And a cable may leave a board to serve plots beyond it.** The board is
counted before the roll-up, so its flats and everything downstream both
reach the legs above: 53 where 43 were, and 54 with a further plot past
it. Counted after the roll-up, the flats would vanish from every leg
upstream.

The whole chain runs against `fixtures/drawing-2202-043-msdb.json` —
the drawing it failed on. Proved by zeroing the count and watching it
fail.

76. **A board at the end of a run got its stop for free.** The end of a
    run is always marked, so while the MSDB sat on a spur it had a
    feeder point, a figure, and levels for its flats. Run a cable onward
    from it to serve plots beyond and it becomes a point MID-SPAN, which
    nothing marked: no stop, no figure, no level at the board, and a
    dash against every flat.

    **The drawing looked right and the numbers silently stopped.** On
    the live drawing the board's feeder point had moved fifty-six metres
    away and the board sat at vertex 1 of 6 on a cable.

    `jointMarks` already existed for exactly this — a straight joint is
    a fitting mid-run that the run must stop at — and a board is the
    same kind of thing for the same reason: one cable arrives, one
    leaves, and everything the block draws is taken off in between.
    Nothing about being mid-span makes a board less of a stop.

**Dragging a board takes its cables and its stop with it.** One cable
arrives and one leaves; dragging left both where they were, so the board
came away from the cables it sits on. `isJoint` in the drag is the name
for "a fitting the cable follows", and a board is one.

**And the stop is now stated rather than guessed.** The anchor followed
by PROXIMITY where a stop carried no link — a third of a metre out and
it stayed behind. `jointMarks` carries the fitting's id and
`planFeederPoints` writes it as `At_Joint_ID`, which is the name the
drag already reads. One fact, one name, no second guess.

**A board's flats are on the circuit report.** It lists a circuit's
meters with their plot, house type, distance and load; left out, a block
of dwellings was missing from the one sheet that says who is on which
feeder. The report is given the same view the build works from, so the
two agree about what is on a circuit — two counts of one circuit is
fault 27.

Each flat carries its own figures: the report resolves load through the
plot record, and a flat has no plot FEATURE behind it, so a meter that
knew its own load reported nothing and **read as a dwelling drawing
zero**. It is read off the meter now, and the house-type column says
"Flat on MSDB" — a reader looking for that plot on the drawing will not
find one.

77. **Every flat reported the same distance.** An ordinary meter joins
    the network at its own point, so the report's distance column
    already covers that customer's run — which is why no plot on a
    circuit shares a figure with another. Every flat on a board stands
    AT the board, so they all reported the distance to the board and
    the tails the designer had recorded, fifteen to twenty-eight metres
    apart, counted for nothing.

    A flat's distance is the board's plus its own way in: the RISER,
    which is on every flat's route and on none of the network because
    the drawing stops at the boundary, and then its own tail.

        board 470.9 m + riser 15 m + tail 15..28 m  ->  500.9 .. 513.9 m

    **The figures were all there and nothing joined them up.** Ten rows
    reading one number is the kind of wrong that looks deliberate.

**A board's stop label carries the worst flat.** The figure at a board
is the figure at the bottom of the riser, where nobody lives. What has
to pass is the flat at the end of the longest tail.

On the live drawing:

    stop reads    4.42%
    at the board  5.44%   (15 m riser, 22 kVA through it)
    worst flat    5.63%   at 1010, 28 m of tail

So the label reads `4.42% · 0.159Ω → 5.63% at 1010`. **Over the 5%
limit, behind a label that said everything was fine** — which is what
the drawing showed before this.

Worked from the same functions the editor uses — `riserDrop` then
`apartmentLevels` — so the drawing and the panel cannot disagree, and
the stop is matched to its board by the id the build stamps rather than
by position alone.

**Two groups of plots from two substations.** One drawing with two
networks on it, and the circuit report is the sheet that says who is on
which.

The pieces were mostly there — both POCs and substations are already
offered as origins, each circuit can be assigned one from its heading,
and a meter's link box way is already settable per row. What was missing
was **saying it on the meter**: the export wrote `report.station`, the
FIRST origin on the drawing, into the Substation column of every row. A
scheme served from two exported one name for all of it. The column
existed and was answering a question nobody had asked.

Each row now carries the station it is assigned to and its way.

78. **"First origin wins a tie" was answering the wrong question.** Two
    substations on one site are normally drawn on ONE trench network, so
    every meter is reachable from both and the first claimed all of
    them. A scheme deliberately split across two substations reported
    one name down the whole sheet — contradicting the choice made in the
    heading two lines above it — and measured every distance from a
    station half those plots are not on.

    The tie-break is right where nobody has said otherwise and wrong the
    moment somebody has. A meter that NAMES its station is now labelled
    and measured from that one; the walk answers only where nothing was
    stated, which is what it is good for.

    **State beats inference, and the inference had a comment explaining
    exactly why it was safe.** It was safe until two substations shared
    a trench, which is the normal way to draw them.

79. **`find` where the drawing allows two.** `originsOf` took the FIRST
    substation as the electric origin. A site fed from two — two groups
    of plots, each on its own transformer — gave the first an E0 and
    left the second to be picked up as an ordinary junction: **span node
    10 where an origin belonged**, so half the estate was numbered as
    though it hung off the other half's network.

    The POC branch immediately below it has handled this from the start,
    with a comment explaining why a site can be fed from more than one
    side. Plant is the same question and had the older answer. Every
    substation is an origin now, lettered after the first — E0, E0b —
    exactly as a second POC is.

    **The fix was already written twenty lines further down.** Two
    branches for one question, and only one of them had been revisited.

**Plots and NRS off the bill — migration `0207_bom_no_plots_nrs.sql`,
NOT YET RUN.** A bill lists what somebody buys and lays. A plot seed is
a marker saying a dwelling exists; a non-residential supply is a record
of a connection somebody asked for. Neither arrives on a lorry.

Plots have been excluded since 0167. **NRS was not**: it fell through to
`initcap('nrs')` and read "Nrs" — a line item named after an acronym,
counting supplies as units of plant.

0207 is 0205 verbatim plus one word in the exclusion list. `checkbomroles`
already owned this rule and reads the NEWEST definition of `gis_bom`
rather than a named file, so it caught the new migration without being
told about it — and caught a real fault in my first draft at the same
time: a comment placed BETWEEN `IS NULL` and `NOT IN` broke the pattern
that guards them. **NULL NOT IN (...) is NULL, not true**, so without
the null test every point with no role vanishes, which cost a whole
class of joints once.

**Route POC to Substation asks which pair.** It took the FIRST POC and
the FIRST substation. On a site with one of each that is the only pair
there is, so nothing ever showed; with two of each it silently routed
POC 1 to Substation 1 and there was no way to ask for anything else.

Where the drawing has more than one of either, it now asks. Both lists
are offered even when only one side is ambiguous, because the PAIR is
what somebody is choosing and half a pair reads as a trick question.
With one of each it never fires — a step that answers itself is worse
than no step.

80. **"Replace the existing route" became "delete the other supply".**
    A second route was almost always a mistake rather than a design with
    two incomers, so an existing one was replaced — a reasonable rule
    written when a drawing had one POC. On a site with two POCs and two
    substations it IS the design: routing the second pair deleted the
    first, and the feature would have looked as though it simply did not
    work twice.

    A route now records the pair it was drawn for, and only that pair's
    route is replaced. A route from before this existed names neither
    and is still replaced, because on those drawings there was only ever
    one.

81. **Two lane groups handing out the same lane.** A group of parallel
    runs spreads its own members evenly and knows nothing of any other
    group. `isParallel` needs the overlap to be half a run's WHOLE
    length, so a long HV route that shares ONE trench with a short main
    is not grouped with it — correctly, they are not parallel over most
    of their lengths.

    Both groups then start at zero, and where they DO share a trench two
    cables land on the same offset and draw on top of each other. **Four
    cables in a trench read as three** — which is what somebody counts
    against the drawing when the dig is open.

    A second pass now steps any run off a lane already taken by
    something it overlaps, moving outward from where the grouping put it
    so the tidy spread survives. Grouping decides the arrangement; this
    only settles collisions the grouping could not see.

**A near miss worth recording.** Appending a block to a check by
writing `block + file.slice(from_the_last_console_log)` **overwrote the
whole file** — the check then passed, because the success line it
printed was the one line that survived. `git checkout` had it back. A
check that passes after an edit that destroyed it is the worst possible
result: read what a rewrite leaves behind, not just what it prints.

82. **A right total naming the wrong thing.** The trench editor's "in
    this trench" list groups by UTILITY, which is right for the case its
    note gives: a gas main that steps from 180 to 90 part way along is
    one pipe in one slot, however many features the build cut it into.

    Electric is not like that. A trench holding two HV routes and one LV
    main reported **"3 × HV Cable"** — the count was of everything
    electric, the name was of whichever covered most of it, and together
    they described a cable that is not there. It now reads `2 × HV
    Cable` and `1 × 3c WAVE 185`.

83. **Splitting a group is only half the job if one field shows it.**
    The list had a single "Electric Cable Size" slot filled by a `find`
    on utility. Splitting electric into HV and LV made a second group
    that nothing ever rendered, so a trench with two HV and one LV
    showed `2 × HV Cable` and **dropped the LV out of sight entirely** —
    a worse answer than the wrong one it replaced, because nothing on
    screen said a cable was missing.

    HV and LV have a field each now. Two cables in a trench are two
    things to know, and somebody opening the ground counts both.

84. **And the split was worked out after the evidence was thrown away.**
    The row is rebuilt from the content with a fixed set of fields, and
    the FEATURE is not among them. Testing
    `r.feature.Attributes.Line_Type` on that row found nothing every
    time and called every cable LV — so the HV field came up empty on a
    trench with two HV cables in it.

    The same line was wrong a second way: `utility` on the row is the
    DISPLAY name, "Electric", which somebody can rename in Admin. The
    layer key is what `layerKey` exists for.

    Decided on the row now, while the feature is still in hand. **Three
    goes at one panel, each fixing the previous fix**, because I checked
    the shape of the data I expected rather than the shape it had.

85. **Two boxes side by side answering different questions.** Avoiding
    the repetition in "2 × HV Cable" under a heading of HV Cable left
    the HV box showing a COUNT and the LV box showing a SIZE. A reader
    comparing them had to work out which kind of thing each was first,
    and `2` beside `3c WAVE 185` invites reading the second as one
    cable. **Saying HV twice is a small price for two fields that can be
    read the same way.**

86. **And a field naming only the dominant type.** Naming the biggest
    and hiding the rest in a tooltip is right for a pipe that steps size
    part way along — one pipe, one slot — and wrong for a field that
    says what is IN the trench, because two different cables read as
    more of the first one.

    Every field now lists every type with its own count:
    `1 × 3c WAVE 185, 1 × 3c WAVE 95`. The gas and water boxes lost the
    word "Size" from their headings, because a box headed for one
    property of a thing and holding two says less than it delivers.

    **The WIDTH keeps the coarser grouping on purpose.** It takes the
    widest in each group and repeats it, so an LV counted as HV digs a
    little wide. Splitting them there would narrow the dig, and that
    module's rule is that over-digging is money while under-digging is a
    pipe that will not fit. The two still agree about how many things
    are in the trench, which is what the list's note requires.

**The HV editor lists `Voltage_Rating_ID = 2` and nothing else.**
`Usage_Type` says mains or service, and both HV and LV mains are
"Mains", so a menu filtered on usage alone offered 3c WAVE, earth,
service and LSZH cable to somebody sizing a run at eleven kilovolts.

87. **A filter that needed a table the screen does not have.** My first
    attempt looked the rating's NAME up in `Voltage_Rating`, reasoning
    that ids are per-scheme while names are what somebody chose in
    Admin. That table does not reach this screen. The lookup found
    nothing, and the fallback I had written for exactly that case — no
    ratings, no filtering — meant the filter **quietly did nothing**.

    The list came back LONGER than before, because the earlier
    usage-only behaviour had at least been filtering something.

    One column, one comparison, no second table to be missing:
    `Voltage_Rating_ID === 2`. A type with no rating recorded is not
    offered either — an earth cable has none, and putting it on an HV
    list because nobody filled the column in is the same fault as
    offering LV.

    **A fallback that hides a broken lookup is worse than the lookup
    failing loudly**, and I wrote the fallback and the bug in the same
    change.

88. **And a SECOND fallback, older than me, did the same thing again.**
    `cableMenu` has always offered the WHOLE catalogue when a filter
    leaves nothing, so an empty dropdown can never be mistaken for a
    broken one. Right for usage. Wrong for voltage: where the catalogue
    holds no cable at `Voltage_Rating_ID = 2`, it fell back to every LV
    main, service and earth cable **on an eleven kilovolt run** — which
    is why the list came back showing everything after being asked twice
    to show only HV.

    An empty list now says the catalogue has none of what was asked for,
    which is a thing to fix in Admin. The fallback said the opposite and
    looked helpful doing it.

    **Two fallbacks, both written to avoid an empty box, both hiding the
    fault they were covering for.** An empty box is a fact; a full one
    that should be empty is a hazard.

89. **And then a THIRD gate emptied it for a different reason.**
    `requireRating` drops any size with no `Rating_Amps`, because for an
    LV main the build sizes by what the cable can carry and a row
    without one is a name somebody typed and never finished.

    **No HV size carries an amp rating.** The catalogue holds Triplex
    11KV, 3 Core HV and Triplex 20KV at `Voltage_Rating_ID = 2`, and
    every one was dropped by that gate rather than by the voltage
    filter — so the panel reported no HV cable in a catalogue with
    three, in a message I had just written to be reassuring.

    Lifted only where a voltage was asked for: the person is choosing
    explicitly, not asking the build to size anything. The LV rule is
    untouched, and `checkcablemenu` holds both halves now rather than
    just `requireRating: true`.

    **Three gates, one symptom, three rounds.** Each fix was right and
    none was sufficient, because each time I confirmed the gate I had
    just changed instead of listing every gate the list passes
    through.

89. **And then a THIRD gate emptied it for a different reason.**
    `requireRating` drops any size with no `Rating_Amps`, because for an
    LV main the build sizes by what the cable can carry and a row
    without one is a name somebody typed and never finished.

    **No HV size carries an amp rating.** The catalogue holds Triplex
    11KV, 3 Core HV and Triplex 20KV at `Voltage_Rating_ID = 2`, and
    every one was dropped by that gate rather than by the voltage
    filter — so the panel reported no HV cable in a catalogue with
    three, and did it in a message I had just written to be reassuring.

    Lifted only where a voltage was asked for: the person is choosing
    explicitly, not asking the build to size anything. The LV rule is
    untouched, and `checkcablemenu` now holds both halves rather than
    just "requireRating: true".

    **Three separate gates, one symptom, fixed one at a time over three
    rounds.** Each fix was right and none of them was sufficient,
    because I confirmed the gate I had just changed rather than listing
    every gate the list passes through.

**Delete removes the selection.** Delete or Backspace, through the same
`removeSelected` the button uses — a shortcut that skipped the
plot-marker warning or the service cascade would delete a service nobody
picked. Never while typing, since Delete and Backspace are how a field
is edited.

**Read through a ref, not the closure.** That key listener is bound once
per change of `features`, so everything it closes over is as it was
then. The Escape handlers beside it have the same shape and mostly
survive it because a drawing reloads often — but a SELECTION changes on
every click, and deleting whatever was selected when the drawing last
loaded is the worst possible way to be wrong. `liveSelected` is written
on every render.

`preventDefault` fires only when something will actually be deleted:
Backspace on a page with no selection is the browser's Back on some
setups, and swallowing it silently would be its own surprise.

And `removeSelected` takes a list only when it IS a list — an `onClick`
hands it a MouseEvent, and the button and the key reach the same code by
different doors.

**"Number the Network from Here" is gone from the client.** It walked
out from a source and wrote `Way` and `Circuit` onto the cables it
reached. That predated the circuit work: Build LV Network now assigns
real circuits and their ways, and the lasso decides which output a run
belongs to — so the tracer was **a second writer of the same two
fields**, arriving at its own answer. That is the shape of fault this
session kept finding.

It was already hidden from the Electric menu. Its last route was the
catch-all branch of the canvas context menu — offered on any point that
was not a span node or a vertex, which is how it came to appear on
features it makes no sense for.

**The endpoint and `traceNetwork` stay.** Gas and water have no circuits
and "which main leaves the source" is a fair question there, so this is
a call to restore rather than a rewrite. Nothing in the client calls
them today.

`checknumberremoved` holds all of it, including that **Assign Meters is
untouched** — it shares `runNetwork`, and removing one branch of a
function must not take the other with it.

**Two boards joined by a hand-drawn feeder.** Two MSDBs in one
building, linked by a cable running through the structure where no
trench goes. The dig runs up to the first board and starts again at the
second, so **the second board's trench is an island** — unreachable from
the source, because the only thing joining them is a cable and the
routing graph is built from trenches. Left alone, everything past the
second board was never routed at all.

**Stamped, not deduced.** A cable drawn end to end between two boards
records both board ids and takes their circuit, the way a POC route
records its POC and substation. Without it, dragging a board onto the
end of an ordinary run would turn that run into a link with nothing
said. `linkEnds` falls back to the ends' positions for cables drawn
before the stamp existed — as good as the drawing, never overruling a
stamp, and it disappears as cables are redrawn.

**Boards on two different circuits** are still recognised as a link, so
the build can route past them, but the circuit is left alone: stamping
one of them would be picking whichever end was read first.

**First is the board nearer the source ALONG THE NETWORK**, not the
direction the cable was drawn in. Decided in the canvas, because only it
knows how far anything is from the substation. On the reported drawing
MSDB 1 is 43.4 m and MSDB 2 is 66.1 m — and the risers the designer had
already entered agree, which is a good sign the rule is the natural one.

`msdbLinkParts` adds a part rooted at the second board, exactly as a
link box output is rooted at its box, on **both** exits of
`circuitBuildParts`. `spanTrace` now accepts a board as a root for the
same reason it accepts a link box. The link is never `Generated`, so a
rebuild already spares it.

**The levels chain across the link.** A part rooted at the second board
starts from the FIRST board's figure, exactly as a link box output
starts from the figure at its box. Between them lie three lengths, and
they are on the cable in this order:

    up   the first board's riser
    along the link, drawn through the building
    down the second board's run to its own dig

On the reported drawing: 9 m + 22.7 m + 9 m = **0.831%** at 6.6 kVA.

90. **The two risers, reversed.** I first wrote the first board's DOWN
    and the second board's RISER — the reverse of the way the cable
    runs. It read as **nought for both** on the reported drawing,
    because each board records only the one it has, so the chain simply
    cost nothing and looked plausible. Getting it backwards is invisible
    while the other two fields are blank, which is why it needed
    checking against a drawing rather than reasoning.

91. **The same early return, missed twice.** `circuitTraceParts` and
    `circuitBuildParts` each have an exit for a circuit with no link
    box, and each was added before the link parts below it. Both
    returned before making them, so the second board had no figure on
    the levels path and no route on the build path. Found separately,
    an hour apart, in two functions with the same shape.

92. **A new kind of part poisoning the whole circuit's context.** The
    levels take the transformer, the working voltage, the upstream drop
    and the undeclared-POC test from `parts.find((x) => !x.error)`.

    That was fine while every part began at the substation. A part
    rooted at an MSDB does not: its model's origin is the BOARD, which
    has no transformer and no declared output voltage — so
    `originMissing` reports it as undeclared, the loop hits `continue`,
    and **every feeder point on that circuit loses its level at once.**

    Named now rather than found: the origin or the trunk part, and
    nothing else may stand in for it. **Adding a part changed what "the
    first part" means**, and nothing about the change said so.

93. **One default field serving two voltages.** `Default_Main_Cable_Size_ID`
    on the scope is stamped on every hand-drawn electric main — and it
    serves both `elec_main` and `elec_hv`. A scheme whose default is an
    HV cable put that HV cable on every LV main somebody drew.

    On the reported drawing the hand-drawn link between two boards came
    out carrying cable 55, the same size the HV routes use, while all
    eight built LV mains beside it carried cable 1. The build works its
    own size out and never consults the default, which is why only
    hand-drawn runs were affected and why it went unnoticed.

    The default is now checked against the run's own voltage, the same
    rule the dropdown applies. Where it does not suit, **nothing is
    stamped**: an empty size is a question the panel already asks
    plainly, and the wrong cable is a wrong answer nobody is prompted to
    check. A cable with no rating recorded is still allowed, because a
    catalogue with an empty column stamping nothing on anything is a
    worse day than a wrong size.

94. **One part-maker, two callers wanting different shapes.** The
    levels want LEGS, which `spanTrace` gives. The build wants SECTIONS
    — the cable it is about to lay — which only `feederSections` gives.

    `msdbLinkParts` used `spanTrace` for both, so on the build path the
    part rooted at the second board **reached the meters beyond it and
    laid nothing**: one leg, no sections, no cable on the drawing past
    MSDB 2. Nothing errored; the part was simply the wrong shape and
    the build had nothing to write.

    The walker now comes from the caller, exactly as `rootFeature` is
    how a link box output is walked on each path. Measured on the
    reported drawing: **22.5 m of cable in seven points** where there
    was none.

    **A shared helper serving two callers has to be told which one is
    asking**, and "it works on the path I tested" is not the same as
    "it works".

95. **Two feeder end points at one cable end.** Marks are deduped by
    node INDEX, which is right while the far end of a part is the same
    node the end-of-line pass found. A part rooted at a board has its
    own node numbering, so the two landed 0.88 m apart and both were
    kept — B4 and B5 on top of each other on the reported drawing.

    Deduped by position within a part — and that was not where it
    showed. `seen`, the ACROSS-parts test, keyed on the exact
    centimetre, which dedupes a mark two parts found at the same NODE
    and nothing else. A part rooted at a board walks its own trench with
    its own numbering, so its far end and the trunk's end-of-line landed
    near one cable end without being the same point: **0.88 m apart on
    one drawing, 2.39 m on the next.** Raising a within-part threshold
    could never have fixed it, and my first attempt did exactly that.

    Both tests are by distance now, the across-parts one at 2.5 m. Two
    stops that close together on one circuit is not a design: a span is
    tens of metres.

    **It was never only about boards.** On the same drawing A3 and A6
    are 2.36 m apart on circuit 1, which has no MSDB — and only A6 has a
    cable ending on it. The duplication predates the link work; the
    board part just made it happen often enough to notice.

**Service joints are a different feature.** `autoLayServices` /
`layServicesThenTee` place them, and neither knows anything about parts
or boards — they work from the drawing. Plots past a board are not
excluded by anything in the MSDB work; the drawing simply had no
service cables on it at all, so **Auto Lay Service Cable has to be run**
after the feeder is built.

96. **A part rooted at a board was marked by nobody.** Every other
    part's root is already a stop by the time it is walked: a link box
    is marked by the trunk arriving at it, and the origin is the origin.
    **Nothing arrives at the far side of a board-to-board link** — that
    is the whole point of it — so MSDB 2's root had no mark, and with no
    mark there is no feeder point, no figure, and no levels for its
    flats.

    The root is marked now, stamped with the board it stands on so the
    drag carries it and the editor can find its figure. On the reported
    drawing the root node sits exactly on the board, and the nearest
    other stop is fourteen metres away, so it survives the 2.5 m dedupe
    comfortably.

    **Three rounds on one board, each a different thing that assumed
    something arrives from upstream.** The routing assumed the trench
    reached it; the levels assumed a leg ended on it; the marks assumed
    somebody else had already numbered it.

97. **Every figure came from a leg's END.** That is right for a trunk
    and for a link box output: their roots are already stops that
    something else arrived at, and the arriving leg set the figure.

    A part rooted at the far side of a board-to-board link has no such
    leg — nothing arrives there, which is the whole point. So even with
    a feeder point standing on MSDB 2, **no figure was ever written
    against it**, and every flat on it showed a dash.

    The board's own stop now takes the part's STARTING figure: the first
    board's level carried across the link. Measured end to end with the
    stop the build places: MSDB 1 at 3.500%, MSDB 2 at **4.331%** —
    0.831% for the riser, the link and the run back down.

    **Four rounds on one board, four different things that assumed
    something arrives from upstream:** the trench, a leg, a mark, and
    now a figure. Each was necessary; none was sufficient. When a new
    kind of thing enters a model that has only ever had one shape, the
    question to ask is not "does this work" but "what does everything
    here assume about how a part begins".

98. **Two functions of one name, and only the wrong one was asked.**
    `networkFrom` in `electric.js` declares a LOCAL `carries` that asks
    which LAYER a line is on. The module `trenchCarries.js` exports a
    `carries` that asks what a trench has been told to hold. Every
    distance on the drawing went through the local one.

    So a trench with `Carries_LV` off — deliberate isolation, two
    circuits drawn to meet nowhere — was walked straight across by
    everything that measured anything. **11 of circuit 1's meters were
    measured back through circuit 2's dig.** The routing had always
    honoured the flag, which is why no cable was ever laid across it and
    why this went unseen: the drawing looked right and the numbers were
    from another network.

    Imported as `carriesUtility` now, because a name that shadows
    another answering a different question is the fault itself, not an
    accident of it. A CABLE is still a way through whatever a trench
    says: a cable that exists is a fact, and the flag is about where
    cable may be LAID.

    Verified both ways on the live drawing: each circuit still reaches
    all of its own meters from its own substation, and neither reaches
    the other's.

**Bulk edit offers what the selection shares, and only that.**
`fieldsForMany` already intersected the classes correctly; what was
wrong was what the classes themselves offered.

**Circuit was missing entirely** — the field somebody opens this panel
for. It is on every electric feature now, cables and fittings and
meters alike, but not on a trench: a dig belongs to no circuit, and two
circuits commonly share one.

**A circuit carries its name and letter**, for the same reason a line
type carries its layer. Writing the id alone leaves a run numbered 3 and
still called Circuit 2 on every sheet that names it. Taken from whatever
is already on that circuit, since there is no circuits table.

**Line type is off the bulk panel entirely.** *"Reclassifies every one
of them"* was the warning it carried, and it was the right warning:
turning forty cables into trenches, or a run of gas main into water, is
not an edit somebody makes to a selection — it is a mistake somebody
makes to a selection. What a line IS was decided when it was drawn, and
changing it moves the feature to another layer, another catalogue and
another set of rules.

It stays on the single-feature editor, where one line at a time can be
reclassified deliberately and its own panel redraws around it. The
control and the layer-carrying rule in `planBulkEditOn` are kept rather
than deleted — both are correct, and reinstating the field is one line
if a deliberate bulk reclassify is ever wanted.

**Name and Depth are off cables and pipes.** Forty cables sharing one
label says nothing anybody wants to read — the drawing tells them apart
by circuit, size and where they run. And a cable's depth is the depth of
the trench it lies in: setting it on the cable as well is two places to
say one thing, disagreeing the moment either is edited. A TRENCH keeps
both, being a thing on a programme and the thing that is dug.

Two rules in `checkbulkedit` expected Label to survive every mix and had
to be corrected rather than weakened — they were right about the old
behaviour and this is a deliberate change to it.

99. **A refusal that cost more than the fault it prevented.** A mains
    run's cable size is held twice — on the run, and on the point it
    feeds, because the volt drop sum reads it from the point. Writing
    one without the other leaves the cable saying 300 and the sum saying
    95. So the bulk panel refused the edit: *"Cable size is set on the
    run itself, not here."*

    **Sizing a run is the commonest bulk edit there is.** The refusal
    sent somebody to open forty editors instead — where the drift is
    just as possible and nobody is watching for it. The guard protected
    the data by making the job worse.

    The cure was already written: `syncNodeCables`, the routine behind
    "N nodes out of step with their cables — fix", pairs every cable
    with the point that copies it. It now runs after a bulk cable edit,
    from the drawing AS SAVED rather than from state that has not caught
    up — reading state there would put the old sizes back.

    Only where a cable size was part of the edit. A sync nobody asked
    for is a second write to explain.

    **When a guard exists because two things must move together, the
    answer is to move them, not to forbid the move.**

100. **And removing the refusal dropped mains into the service
     branch.** The dropdown was hard-coded to `usage: "service"`, which
     was true while the only cable field reaching it was a service —
     mains were turned away above with a message. With the message gone
     they fell through to it, and two LV feeder mains were offered
     **service cables**, under a note about the tail each customer is
     fed through: the wrong list, described as the wrong thing.

     `f.usage` had been on the field the whole time and was ignored.
     The note follows it too.

     **Deleting a branch moves everything it caught into the branch
     below**, and what that branch assumed about its input was written
     down nowhere except in the branch that no longer runs.

101. **An HV run is not an LV main, here as in the cable editor.** Both
     are "Mains" by usage, so a field carrying usage alone offers LV
     cable for eleven kilovolts. The voltage now rides on the field and
     `fieldsForMany` compares it alongside kind and usage — so a
     selection holding both is offered NEITHER, which is right: there is
     no one size that suits both.

102. **A trench with nothing in it is still a trench.** Surface, build
     status and duration sat inside the "In this trench" block, which
     draws only where something is LAID in it. Two of the three do
     follow from the contents — the surface multiplies the dig, the
     duration is computed from what is being laid — which is why they
     were grouped there, and the note beside them says so.

     But they are facts about the trench, and a trench exists before
     anything is in it. **On a fresh dig, which is exactly when somebody
     sets the stage, the whole group vanished.**

     Lifted into a block guarded on `isTrench` alone, kept after the
     contents so the reading order the original note argued for
     survives.

**A trench between two boards is the simpler answer**, and the link
machinery now stands down when it sees one.

A link part exists because the second board's dig is an ISLAND: the
trench stops at the first board and starts again at the second, with
only a cable between them. Dig a mains trench between the two and there
is no island — the ordinary routing reaches the second board by itself,
and a link part on top of that would lay a second cable over the first
and stand a second stop beside its stop.

Reachability is measured over TRENCHES alone, because that is what the
routing walks. Measuring over cables as well would call every board
reachable the moment somebody drew the link, which is the case the whole
mechanism exists for.

The stamping, ordering and level-chaining stay: a hand-drawn link
through a building where no trench can go is still a real case, and the
guard is what lets both approaches sit on one drawing.

103. **A mains trench drawn between two boards was stamped as a link.**
     `"trench_main"` matches `/main/`, and `stampLink` is given geometry
     and a list of boards — what KIND of line it is has to be decided by
     the caller, and was not. So the trench came back carrying
     `MSDB_Link_A_ID` and a **circuit**, which a dig never has.

     The build then had a link to route around a dig that had already
     joined the two boards, and laid the whole run a second time: **B5
     covered B2 and B3 end to end, 83 m of duplicate cable on circuit
     2.**

     Two guards now. The stamp is not written on a trench, and
     `linkEnds` refuses one — so a drawing already carrying the bad
     stamp stops acting on it rather than needing the stamp cleared by
     hand.

     **A predicate that matches on a substring will eventually match
     something it was never meant to.** `/main/` catching `trench_main`
     is the second time today one word inside another has cost a
     rebuild.

104. **And the stray circuit was still being LABELLED.** Fixing the
     write does nothing for a drawing that already carries the bad
     value: the trench went on showing "Circuit B · 30.2 m" because the
     label read `Circuit_Letter` from whatever was on the feature.

     A dig belongs to no circuit — two circuits commonly share one
     trench, so a trench naming one is saying something untrue about the
     other. The label now refuses at the point of DRAWING, so a drawing
     that already has one stops showing it without anybody editing the
     trench.

     **A bad value has two lives: the writing of it and the reading of
     it.** Stopping the write leaves every drawing made before the fix
     still displaying it as fact.

**Existing plant is off the bill of materials.** Migration
`0208_bom_no_existing.sql` — **NOT YET RUN**, and it must go after 0207.

A bill lists what somebody has to buy and lay. Something already in the
ground is neither: it is a fact about the site, drawn so the design can
avoid it, tee off it, or record that it is there. Counting it puts cable
on the take-off nobody will order and trench on it nobody will dig — and
the error is invisible, because an existing main looks exactly like a
new one on a bill that does not say which is which.

**One rule catches both ways of being existing.** `Build_Status =
'existing'` is the field somebody sets; the line types ending
`_existing` default to that status when drawn, so a feature drawn as an
existing main already carries it.

**`remove` stays ON the bill.** Taking a main out is work somebody
prices.

**COALESCE, not a bare comparison.** `Build_Status` is NULL on every
feature never given a status — 89 of 130 on the drawing this was written
against — and `NULL <> 'existing'` is NULL rather than true, which would
drop them all. Same fault as the NRS exclusion, same fix.

Applied to all THREE feature reads: lines, points and the MSDB tails.
The body is 0207's, copied and added to — `checkbomroles` diffs the two
functions and fails if 0208 differs by more than the new rule, because
0205 lost nine columns to being reconstructed from memory.

**An existing trench: no dig, and laying only for what is new.** The
dig and the setup were already zero — a hole somebody else opened is not
dug twice, and the machine is not moved for it.

The LAYING was kept whatever the trench held, on the reasoning that a
pipe goes in whether or not this job made the trench. That is right for
a new run through an old route. It is wrong for a run already in the
ground: an existing trench holding an existing cable was charged an hour
to lay a cable that is lying there, while the bill — which drops
existing features altogether once 0208 runs — said nothing of the sort.

Each content now answers for itself, which is what keeps the reuse case
working: the new cable in the old trench is laid, the old one beside it
is not.

105. **The bulk cable field wrote the size the build recalculates.**
     Every electric line carries two: `VD_Cable_Size_ID`, which Build LV
     Network works out, and `Manual_VD_Cable_Size_ID`, which a designer
     sets to overrule it. The single-feature editor has always written
     the second.

     The bulk panel wrote the FIRST. A change looked right on screen
     until the next build recalculated the field and put its own answer
     back — the size returned to what it had been, the levels never
     moved, and **nothing said why**. On the reported drawing every
     cable was still size 1 with no override anywhere.

     Now the same field as the one-at-a-time editor, so the two agree
     about what "set the cable" means, and the calculated size is left
     alone so the build's own answer survives for everything not
     overridden.

     **Two fields for one idea, and the two editors picked different
     ones.** The one that looked like the answer was the one the build
     owns.

106. **The levels read the POINT's copy, and the wrong point was being
     updated.** A cable's size is held twice — on the run, and on the
     span point the volt drop sum reads it from.

     `carryCableToNode` carries a changed cable to the node `nodesFedBy`
     returns. That is not always the point the LEG uses: on the reported
     drawing, changing cable 49627 on leg B0→B1 updated **B2**, the leg
     went on being costed from B1's stale copy, and every figure stayed
     exactly where it was.

     Proved by setting the override on the cable alone (figures
     unmoved: B1 0.187%) and then on the point as well (B1 0.060%).

     `syncNodeCables` — the routine behind "N nodes out of step with
     their cables — fix" — pairs every cable with the point that copies
     it by ONE rule, and the bulk save already ran it. The single-feature
     save now runs it too.

     **Two mechanisms for one job, and the older one paired things
     differently.** The symptom was not "the sync is broken" but "the
     number never moves", which points at the calculation rather than at
     a copy nobody mentions.

107. **The sync paired the cable with the wrong point.** Which point a
     cable feeds was decided by `nodeFedBy`, from where the cable's ends
     lie relative to the substation. That is a guess, and where two
     points sit close together it picks the wrong one.

     On the reported drawing, cable **"B1" — the section leaving the
     substation — was paired with point B2**. Changing it moved B2's
     figure and left B1's exactly where it was, which is "the levels do
     not change when I change the cable that leaves the substation".

     **The build already states the pairing.** It labels each section it
     lays after the point that section runs to, so cable B1 feeds point
     B1 — no inference and no two points to choose between. The
     geometric rule stays for anything unlabelled, since a hand-drawn
     cable has only its ends to go on.

     Measured before and after: every point on the circuit now improves
     when the first cable is made bigger (B1 0.187% → 0.060%, B3 0.771%
     → 0.645%).

     **Three rounds on one symptom**, each a different link: the bulk
     panel wrote the field the build recalculates; the single save
     synced only one point; and the pairing itself was wrong. The first
     two were mine from today.

     **`checkcablelevels` has a weakness worth knowing.** Its
     arithmetic half emulates the pairing rather than calling the app's
     own sync, which lives inside the React component and writes through
     the API. It locks the expected figures and the structural rules,
     but it would not catch the app diverging from the emulation.

108. **And the drift detector could not see an override at all.**
     `cablesOutOfStep` compared `VD_Cable_Size_ID` on each side —
     the CALCULATED field, on both the cable and the point. A cable set
     by hand changes `Manual_VD_Cable_Size_ID` and leaves the calculated
     one alone, so drift caused by an override was invisible: no
     warning, no "fix" button, and the levels went on being costed from
     the point's old size.

     Measured on the reported drawing: overriding one cable reported
     **0 nodes out of step** comparing the calculated size, and **1**
     comparing both.

     **The one number a designer sets by hand was the one number this
     could not see.** The sync had always written both fields; only the
     detector read one.

     Four rounds on this symptom now, each a different link: the field
     the bulk panel wrote, the point the single save synced, the pairing
     rule, and the drift check. Every one of them looked correct in
     isolation.

109. **A board was marked as a stop and never broke the cable.**
     `isBreak` was the origin, a fork, or an end. A board sitting
     mid-run has exactly one child, so it was none of those and the
     cable ran straight THROUGH it: **one 60.6 m section from B1 past
     both MSDBs to B4**, where the ground holds three cables with a
     board between each pair.

     `jointMarks` has treated a board as a stop since the day it was
     added — one cable arrives, one leaves, everything the block draws
     is taken off in between. So the point was placed and the cable was
     not cut at it, and the note directly above `isBreak` says those two
     are meant to be the same place.

     A STRAIGHT JOINT was in the same position: marked as a stop, never
     breaking a section. Both break now.

     Measured on the reported drawing: three sections became five —
     8.4, 41.9, 11.2, 30.2, 19.3 m — ending B1→MSDB 1, MSDB 1→MSDB 2,
     MSDB 2→B4.

     **The comment beside the fault described the fault.** "A section
     end and a span node are meant to be the same place" had been true
     of forks and ends only, and nothing checked the other half.

110. **The root, after five rounds of patching around it.** The volt
     drop is settled from a part's SPAN NODES, and each of those took
     its cable from `cableIdOf(feature)` — the copy stored on the point.
     So changing a cable moved the legs and left every figure exactly
     where it was, and the only thing that ever helped was writing the
     copy as well.

     The legs had always preferred the run, and said why in a comment
     directly above: *"the run is where the cable actually lives; the
     node's copy is fault 13 waiting to be read."* **The span nodes
     beside them never learnt it.**

     A span node now takes the cable of the leg ARRIVING at it, worked
     out from the run. The copy remains the fallback, for a stop no leg
     reached.

     Measured with no sync, no copy written and no rebuild — the cable
     alone: B1 0.000% → 0.060%, B3 0.585% → 0.645%.

     **Five fixes, four of them patching a copy nobody should have been
     reading.** Each was a real fault and each made the copy more
     correct; none of them asked why the calculation read a copy at all.
     When a fix has to be made repeatedly in different places, the thing
     being fixed is usually not the fault.

     Two of the checks written along the way asserted on that copy
     mechanism. One has been cut back to its structural half, because
     testing an emulation of a mechanism the answer no longer depends on
     is testing nothing.

**`spanNodes` is now `stops`.** The field had not held a span node
since feeder points took over as the measuring points: `stopRole` picks
`feederpoint` on any drawing that has them, and falls back to span nodes
only for drawings older than that.

A span node belongs to the TRENCH; a feeder point belongs to the cable,
and the volt drop is settled at the cable's points. `stops` is what
`isStopFeature` and `stopRole` already called them.

Renamed across `feeder.js`, `voltDrop.js`, `scenario.js`,
`GISCanvasPage.jsx` and seven checks. **Two things deliberately left
alone:** the `spanNodes.js` MODULE, which is correctly named and does
concern the trench; and `CallOffsTab`, whose own `spanNodes` state
genuinely holds span nodes.

`checkcablelevels` now fails if any of the four files uses the old name
outside a comment, and if the stops list ever contains a span node on a
drawing that has feeder points.

**Three names cost real time in one session** — `/main/` matching
`trench_main`, two separate functions called `carries`, and this. A name
that was true when it was written and is not true now is worse than a
bad name, because it reads as documentation.

111. **The levels could not see a board's flats at all.** They walked
     the raw drawing, where a board is one point with nothing hanging
     off it — its flats live in `MSDB_Plot_IDs` and are not meters on
     the canvas. So their kVA was absent from every figure UPSTREAM of
     the board: the cable arriving at it was costed for whatever lay
     beyond it and nothing else.

     `withAssumedMeters` is what the BUILD has always used for exactly
     this. The levels use it now.

112. **And what LEAVES the board must not carry them.** The flats are
     taken off at the board; the run back down to ground carries only
     what is fed onward. `ampsThrough` was unambiguous while a flat was
     not a feature on the drawing — the moment 111 put an assumed meter
     at the board for each flat, "through" at that very stop became a
     question about how the model counts a meter standing on a node
     rather than a fact.

     The board's own flats are subtracted outright now, floored at
     zero. Two ways of saying the same thing agreeing is worth more
     than either alone, and this is the one somebody can check by hand.

     **The fix for one of these made the other one wrong.** 111 changed
     what "through" means, and 112 is the correction — worth remembering
     as a pair rather than two entries.

113. **The run-down never reached the cascade, because it was looked
     for on the wrong feature.** `cumulativeToNode` already added a
     board's run-down to everything past it — the code and its note
     were written and correct. It read `MSDB_Down_M` from
     `sn.feature.Attributes`, and **a stop at a board is a FEEDER
     POINT**: the board is a separate feature standing in the same
     place, and the point carries `At_Joint_ID` naming it rather than
     the board's own fields.

     So the lookup found nothing on every drawing and added nothing. B4
     read 0.08% from B3 while B3's own panel said 0.17% leaving.

     The stop now carries `downM`, resolved in `spanTrace` from the
     board the point names — falling back to position for points that
     predate the stamp. Measured: at the board unchanged, beyond it
     9.282% → 10.117%.

     **A feature and the point standing on it are not the same
     feature**, and this is the third time that pair has been confused
     today — the board's own figure, the levels' pairing, and now this.

114. **The panel and the cascade costed the run down from different
     loads.** The invariant somebody spotted from the screen: if 0.17%
     leaves the board, a stop downstream cannot read 0.10%.

     It held only if both used the same load, and they did not. The
     cascade used `ampsThrough` — the load at whichever node the CALL
     was measuring — so the same riser cost a different amount depending
     on which stop was being asked about. The panel used a third figure
     again.

     The cascade now uses `cumKva` at the next node on the path. That is
     the load leaving the board, arrived at without subtracting
     anything: cumulative load flows downstream, so the child's figure
     already excludes the flats metered at the board. It equals the
     panel's `through − flats` exactly, and the check asserts they
     agree rather than trusting that they do.

     **Three routes to one quantity, no two the same.** The fix is not
     a better formula; it is one number with two readers.

     **The first check written for this passed under both rules.** A
     three-node model made "the load at the target" and "the load
     leaving the board" the same number, so either rule gave the same
     answer; and the downstream-is-worse invariant held either way once
     the leg drops were added. The test that works varies each load
     separately: change the load at the FAR END and the riser must not
     care, change what leaves the board and it must. **A check that
     cannot fail is worth less than no check**, because it is read as
     cover.

**A note worth keeping:** on the reported drawing the run-down correctly
adds NOTHING, because the flats are the only load and they come off AT
the board. Nothing travels the cable back down, so nothing drops along
it. Once "leaving the board" stops counting the flats (112), the panel
and the canvas agree at 0.08%. The two fixes together are what make that
true; either alone leaves them disagreeing.

115. **The build fed itself: three lots of cable on one circuit.** A
     link is a feeder somebody drew BY HAND through a building where no
     trench goes. Once the dig reached both boards, the build laid its
     own sections between them — and those sections END on two boards,
     so `linkEnds` matched them.

     Each rebuild then made a link part for every cable the previous
     rebuild had laid, and laid the run again. Three runs, eleven
     sections where five belong, with 19.3, 30.2 and 53.0 m each
     appearing three times.

     `Generated` is what the build stamps on everything it lays, and it
     is already the discriminator the rebuild uses to know what is its.
     `linkEnds` refuses it now. A hand-drawn cable between two boards is
     still a link, which is the case the mechanism exists for.

     **The deletion was working the whole time.** A rebuild would have
     removed all sixteen generated mains; the extras were made WITHIN
     each run, from the output of the run before. "It is not deleting"
     and "it is creating too many" look identical from the drawing.

116. **The export said what the code could not: `Leg charged (m)`
     equalled the drawn length on every leg.** B3→B4 read 18.4 m with
     MSDB 2's nine-metre run down nowhere in it.

     That showed the fix was the wrong SHAPE, not just misplaced. It
     added an extra ohms-and-percent to the total, which moved the
     figure while the charged length still read 18.4 \u2014 a run that is
     27.4 m of conductor. **A number that changes with nothing on the
     sheet to explain it is worse than one that is wrong**, because it
     cannot be argued with.

     The run down is charged as METRES on the leg leaving the board:
     `legLenM` starts at the riser length instead of zero. Length,
     impedance, drop and the export now agree, and the load is right
     without being chosen \u2014 the leg leaving a board carries what leaves
     the board, by construction.

     That also deleted three things the earlier attempt needed:
     `onwardKva`, `downPct` and the separate drop. **A fix that needs
     new fields to explain itself is usually being made in the wrong
     place.**

**The cut-out columns are blank because the service cable has no
electrical figures.** All sixteen services are Single Phase Service CNE
35 (size 51) — the catalogue row exists and is named, so it is the
FIGURES that are absent, not the row.

Fill in under **Admin → Electric Specs → cable sizes**: `Loop Z Ω/km`
and `VD base` are the two the volt drop sum reads. Nothing else is
needed and no rebuild is required — the columns fill on the next levels
run.

The panel already says so: the warnings line under the levels head
carries "N with no cable figures" whenever `missingSpec` fires. Worth
knowing it is there, because the export's blank cells say the same thing
silently.

**The cut-out columns are blank because cable 51 has no electrical
figures.** All sixteen services use it, and `missingSpec` fires when a
cable has neither `Loop_Impedance_Ohm` nor `Volt_Drop_Base`. The blank
is deliberate: a service that contributes nothing must not read like one
that genuinely drops nothing. Fixed in Admin, not in code.

117. **The seam closed: "leaving the board" is now READ, not
     recomputed.** The panel worked the figure out itself — its own
     load, its own cable, its own arithmetic. It could be made to AGREE
     with the cascade and never guaranteed to, and for a while it did
     not: 0.17% in the panel against 0.10% at the stop beyond.

     The cascade charges the run down as the first metres of the leg
     leaving the board, so **its share of that leg's drop is its share
     of that leg's length**. Taken as a proportion rather than
     recomputed — no second choice of load, no second cable lookup,
     nothing to drift — and attached to the board's own figure, which
     the panel reads.

     `outputDrop` is no longer called from the panel. One number, two
     readers.

     **The panel's 0.17% was wrong on two counts, and B4's 0.10% was
     nearly right.** It costed the nine metres with `msdbTailCable` —
     the 35 mm tail that feeds a flat — where the run down carries the
     outgoing FEEDER, 95 mm. And it counted the flats' load, which comes
     off at the board. Together: 0.087% claimed over nine metres where
     the feeder drops 0.0078%, an eleven-fold overstatement.

     From the export's own figures — the B3→B4 leg drops 0.0160% over
     18.4 m at 4.3 A — the honest numbers are **leaving 0.091%, B4
     0.107%**. The invariant holds, and it was the 0.17% that had to
     move, not B4.

     Reading the figure from the cascade fixes both faults at once: the
     leg's own cable and the leg's own load, because it IS the leg.

118. **And charging it revealed a fault in charging it.** Setting
     `legLenM` to the riser length at every board charged those metres
     to the BOARD's own figure when the board was the target: the walk
     ends there and the leftover counts as a remainder past the last
     stop. B3 read **0.821% against B4's 0.771%** — the board worse than
     the stop beyond it, which cannot happen.

     Set only where the walk carries on. At the board the run down has
     not been travelled, which is what "at the board" means.

     **A hand-built model hid this and the real pipeline showed it in
     one run.** Three times today a synthetic `model` object gave a
     confident wrong answer because its `cum`, `parent` and `cumKva`
     were not consistent with each other. Test through
     `circuitTraceParts` on a real drawing.

**Build LV Network refuses a drawing it cannot build from.** Two things
it cannot invent, and neither of which it used to mention:

A meter with **no `Circuit_ID`** belongs to no circuit, so no walk
reaches it and no cable is run toward it. A meter with **no service
trench** has nothing for its tail to run along. The build said nothing
about either — the plot was simply not there as far as it was concerned.
That is how "why is there no cable between node 2 and node 5" came to be
a question: three plots past node 5 had no circuit, and the trench
joining them was perfectly good.

**Refused, not warned.** A build that runs on a drawing that is not
ready produces a network somebody then has to un-believe, and the
drawing looks finished either way. `opts.anyway` is the escape hatch if
one is ever wanted; nothing passes it today.

**Flats on a board are exempt.** A flat is fed from its board's tails,
recorded in the board's own table and never drawn as a trench. Asking
for one would be asking somebody to draw a thing that does not exist.

119. **The first version of this cried wolf.** A service trench dug by
     Auto Lay Service names the seed it was dug for, and that link is
     exact where proximity is a guess. But a trench somebody DREW
     carries no stamp, and neither does a meter placed some other way —
     on the reported drawing **not one meter had a
     `Seed_Feature_ID`**, so the stamp-only rule flagged ten plots,
     including ones with a service trench plainly running to them.

     Stamp where there is one, ground where there is not. **A blocker
     that cries wolf is worse than no blocker: it is the one everybody
     learns to click past.** Measured on the drawing: 4 with no circuit
     (49, 50, 51, 57) and 1 with no service (62), the six flats
     correctly excluded.

120. **And the check I wrote for it asserted those plot numbers.** It
     compared the result against `[49, 50, 51, 57]` and `[62]` — a
     snapshot of one afternoon's drawing, not the rule.

     Fixtures are refreshed from whatever somebody was working on, and
     three were replaced today alone. The next refresh fails such a
     check for no fault; and whoever edits the numbers to make it pass
     has quietly stopped testing anything, because the expectation now
     comes from the output.

     The rule is asserted on features built in the check: one meter on a
     circuit and served, one on no circuit, one served by a trench that
     names no seed, one flat on a board. The fixture still runs, but it
     asserts RELATIONSHIPS — every meter reported as circuitless has no
     circuit, every meter with none is reported, no flat is asked for a
     trench — none of which mention a plot number.

     **A check that names the data is a check that will be edited to
     match the data.**

**Auto Lay Service writes its trenches as `existing`.** On this scheme
the developer digs the service trenches and we lay in them, so they are
in the ground before the job starts: no excavation, no machine setup,
and off the bill of materials. That is what `existing` already means
everywhere else, so nothing new had to be invented.

**Not the same as SELF-LAY.** That row was already written as
`existing`, and it means somebody else lays the CABLE as well —
`Self_Lay: true`, and the cable leaves the bill with the trench. Here
the trench is the developer's and **the cable is ours**, so `Self_Lay`
is not written and our cable stays on the bill.

`Developer_Dug: true` records why the status was set. `Build_Status` can
be edited by hand, and a status with nothing saying why it is there is
one somebody changes back.

**This is a scheme-wide assumption, not a setting.** If a project ever
digs its own service trenches, this needs a switch — as it stands every
Auto Lay Service run on every project writes them as existing, and
sixteen service digs leaving a bill is quiet. The `Developer_Dug` flag
is the hook to build that on.

**Requires migration 0208 for the bill half.** The dig is skipped by
`digRate` today; the trenches stay ON the bill until 0208 runs.

**A plot number belongs to a seed or to a flat, never both.** A seed is
a plot on the ground with its own service; a flat is fed from a board's
tails. Nothing stopped somebody allocating one twice — the MSDB editor
offered every flat-typed plot on the project, and Place Plots offered
every number that was not already a seed.

Allocated twice, **the load is counted twice**: once at the seed and
once on the board, metres apart on the drawing. On the reported drawing
all six flats were in exactly that state.

`plotsOnBoards` and `plotsAsSeeds` answer it, and both screens ask the
same function so they cannot disagree about who owns what. The board
being EDITED is excluded from its own filter, or opening its editor
would empty its table.

Place Plots MARKS them rather than dropping them, and says "on an MSDB"
rather than "already on the canvas" — a plot on a board has no marker to
go and look for, and a silently shorter list reads as a range that did
not parse.

**GROUND TO MSDB is now PREVIOUS FLOOR TO MSDB.** The field has always
been the length of the run arriving at the board; only the wording of
where it starts has moved — it was BOUNDARY TO MSDB before that. Worth
knowing that the levels still treat it as the whole run from the stop on
the ground to the board: if it is now read as one floor's worth, a board
three floors up needs the sum, not the last leg.

121. **The blocker cried wolf within a day of being warned about it.**
     Four plots with service trenches plainly on the drawing were
     refused. Two faults, both mine:

     **A seed stamp that matches nothing was read as proof there is no
     trench.** A meter stamped by one pass and a trench drawn by hand,
     or by an older pass, or re-dug after the meter moved, leaves a
     stamp that pairs with nothing while the trench sits there. The
     stamp is evidence FOR and never against: it can prove a plot served
     and cannot prove it unserved, so anything it does not settle falls
     to the ground. Written as an OR rather than a ternary — the ternary
     consulted the ground only where there was no stamp at all.

     **And two metres was too tight.** A service trench commonly stops
     at the plot boundary with the meter several metres inside it. Eight
     now, and deliberately generous: **the two ways of being wrong are
     not equal.** A plot wrongly let through gets a build somebody can
     see and re-run; a plot wrongly flagged stops the work and teaches
     everybody to distrust the message.

     I wrote "a blocker that cries wolf is worse than no blocker" into
     this file yesterday and then shipped one. The lesson that survives
     is narrower and more useful: **when a guard refuses work, every
     input it consults must be a positive signal.** Absence of a
     matching stamp is not a fact about the ground.

**Heavy duty cut-out.** A cut-out spliced into an LV feeder so a supply
can be taken from it. The cable runs THROUGH it: no loss, no break in
the run, no feeder end point at its position.

**Almost none of that is written anywhere, and that is the point.**
Every rule that makes a fitting matter to the network names the roles it
acts on — `jointMarks` for a stop, `isBreak` for a section end,
`cumulativeToNode` for a drop — so a role none of them mentions is
passive by construction rather than by a flag somebody has to remember.
`checkhdcutout` holds that silence: it fails if any of those files
learns the role.

**A role, not a joint with a type.** A straight joint carries
`Joint_Type` and DOES break the cable. Sharing the role would put a
passive fitting one typo away from cutting a run in half, and every rule
reading `Feature_Role === "joint"` would need the exception.

**LV only**, by the type's name and not a substring — `elec_main`
exactly. `/main/` matching `trench_main` cost a rebuild today; a rule
that matches part of a word eventually matches a word nobody meant. HV
is a different conductor, and a service has its own cut-out at the plot.

**Snapped to a midpoint, a vertex or an end** of the cable it is
spliced into — the three places a fitting belongs — using the same
`snapTargets` the drawing tools use, restricted to that one cable.
Snapping to the whole drawing would take the vertex of a trench that
happens to cross there, and the symbol would sit on a line it is not
spliced into. With nothing in reach it falls back to the point on the
run nearest the click, so a long straight span still takes it where it
was aimed.

122. **The green snap circle never appeared while arming a fitting.**
     The mousemove handler showed the snap for drawing, for aiming a
     joint and for tracing — and `placing` is the PLOT QUEUE, not a
     plant placement. Arming a cut-out sets `plantPlace`, which the
     condition did not mention, so the one mode where somebody is
     trying to land a symbol exactly on a cable was the mode with no
     indicator.

123. **And the first attempt at the snap read the wrong fields.** A
     target carries `point`; read as `x` and `y` they came back
     undefined, every distance was `NaN`, and `NaN < NaN` is false — so
     the FIRST candidate won by default, which is the cable's start
     wherever somebody had clicked. It would have looked like a snap
     that always jumped to the far end of the run.

     **A comparison against NaN does not throw and does not warn; it
     quietly picks whatever came first.**

**Turned to the SEGMENT it lands on**, not the whole run: a feeder
bends, and the angle that matters is the one under the symbol. Unlike a
board, which is a thing in a building and stays upright.

**On the bill it is HDCO** — migration `0210_bom_hdco.sql`, NOT YET RUN.
The naming CASE in `gis_bom` lists the roles whose key is not their
name and falls back to `initcap` for anything unlisted, so 'hdcutout'
came out **"Hdcutout"**. The note beside that list said the fallback
exists so a role added later "shows up here as the odd one out when
somebody looks" — it did, and 0210 is the looking.

0210 is **0208 verbatim plus one WHEN and its two-line note**: 288 lines
carried, nothing dropped. `gis_bom` is replaced whole by every one of
these, so a line lost in the copy is a rule silently lost —
`checkbomroles` now diffs the two files and fails on any line of 0208
missing from 0210, proved by deleting one.

**Migration `0209_hdcutout_role.sql`, NOT YET RUN.** The constraint is
rewritten whole, so the check asserts every previously allowed role
survives — one left out is every feature of that kind refused on its
next save.

**Right-click a trench to lay a run along it.** HV cable, LV cable,
service cable, gas pipe or water pipe, the whole length of that one
trench.

The trench is already the route: it was dug where the run has to go, it
bends where the ground made it bend, and it is the length the run will
be. Drawing that shape again by hand is copying a line already on the
drawing, and the copy is never quite the same shape.

**The MEASURED length comes with it too.** A trench's drawn length is
what the polyline measures; its measured length is what somebody walked
with a wheel, and where the two differ the measured one is the truth.
Copying the geometry brought the drawn length across and left the
measured one behind, so a 60 m dig corrected to 68 laid a 60 m cable in
it. Not written where the trench has none — putting the drawn figure in
that field would turn "as drawn" into a measurement nobody took.

**Its own points, copied.** A reference would have been tidier and
wrong: the run is its own feature from there, and moving the trench
later is a decision about the trench.

**What the dig allows is honoured.** A trench with `Carries_LV` off is
two circuits kept apart, drawn on purpose — laying an LV cable down it
would undo by hand what somebody set deliberately. HV and LV are asked
separately, since a dig may take one and not the other. Silence still
means everything, so drawings made before the flags lay as they always
did.

**It decides nothing else.** No circuit of its own, no cable size, no
meters served — those are questions about a network, and this is one
length of pipe in one dig. It takes the same `defaultsFor` and
`inheritedCircuit` a hand-drawn run takes, and records `In_Trench_ID`,
which everything else has to work out by proximity. Proximity cannot
tell two parallel trenches apart.

The menu is built from the types the PROJECT has, not a fixed five: a
scheme with no gas layer has no gas pipe to lay, and a button for one is
a button that fails.

124. **The menu items were written into a branch nothing could
     reach.** They went into a
     `Feature_Type === "line" && isTrenchType(...)` arm placed AFTER the
     plain `Feature_Type === "line"` arm of the same ternary chain. **A
     trench IS a line**, so the wider test won every time and the
     narrower one was dead. The code read correctly, built, passed a
     check that matched its text, and did nothing at all.

     A chain of ternaries is decided by the FIRST condition that holds,
     so a narrower case placed after a wider one is unreachable however
     right it looks.

     The check now tests POSITION rather than presence: the items must
     sit inside the branch a line takes, and it fails outright if a
     trench-only arm appears after the plain line arm. **A check that
     greps for the code it wants cannot tell whether that code ever
     runs.**

**The older "Lay X" items are gone.** They armed the DRAWING TOOL with
a line type and left somebody to draw the run by hand along a trench
already on the drawing. Laying it along that trench is what choosing a
dig and a type was always for, so the two sat side by side offering the
same intent with one of them doing the work.

**Their rule was worth keeping and is now on the new items:** mains
types in a mains trench, service types in a service trench. A service
cable in a mains dig is not a mistake the drawing should help somebody
make, and the trench already says which kind it is.

`drawAs` itself stays — the toolbar and the Electric menu use it.

125. **And the check's fixed window broke again.** Adding the filter
     pushed the type list to 1466 characters from the button, past the
     1400-character slice the check read, and it reported half the types
     missing. Anchored on the list now rather than on an offset. That is
     fault 33's sixth outing today; the shape is always the same — a
     window sized to the code as it was, read as though it were a
     boundary.

**A cable can be set Planned, As-Laid or Live** — and an HV cable could
not be set at all.

126. **`isMainFeature` tested `/_main$/`.** That covers `elec_main`,
     `gas_main` and `water_main` and misses **`elec_hv`**, so an HV
     cable was neither a main nor a service and NEITHER editor branch
     drew a build status field. It is a main in every sense that matters
     here: a run of the network, laid in a trench, passing through the
     same stages. A service is the thing being excluded, and it says so
     directly now.

127. **And the trench's own field offered every status there is.** It
     mapped `BUILD_STATUSES` whole, so a trench could be set Live and a
     cable As-Built — neither of which means anything. It uses
     `statusChoices`, which the two selects below it already used, and
     which also greys out a stage a trench underneath will not allow
     yet. A check pinned the old behaviour in place and was corrected
     rather than weakened.

128. **Knowing which trench was existing was not enough.** The tee was
     chosen with

         nearestMains(boundary, ourMains.length ? ourMains : existingMains)

     which falls back to the incumbent's network wherever we have no
     main of our own. So services were still cut into a trench marked
     Existing even once `isExistingFeature` was right about which trench
     that was — **the split was correct and the caller ignored it.**

     Our mains alone now. Where there is none the plot is skipped with a
     reason, which the code above already arranged: a skipped plot is a
     line somebody reads, where a service run off the incumbent's main
     is a drawing that looks finished and is wrong.

     **The SELF-LAY tee still uses the existing network, and should** —
     that connection is the developer's own arrangement with the
     incumbent, not work this job is pricing. Both remaining uses of
     `existingMains` are guarded by `slpUtils`, and the check asserts
     they stay.

     **A fix to a predicate does not fix a caller that has its own
     opinion.** Two rounds on one symptom for that reason.

**Auto Lay Service will not tee into a mains trench marked Existing.**
`isExistingFeature` asked only the LINE TYPE —
`trench_main_existing`, the incumbent's main drawn in. A mains trench
somebody marked Existing by its BUILD STATUS is equally in the ground
before this job starts: not dug by us, not on our bill, not a dig to tee
a new service into. Either says the same thing, so either counts now.

**The levels export now names the service cable.** A blank cut-out
column is honest — a service that drops nothing and one nobody has
specified must not read alike — but it cannot say WHICH, and a reader
has no way to tell a finished sheet from an unfinished catalogue.

129. **And the catalogue was fine all along.** I told the user twice
     that Single Phase Service CNE 35 had no `Loop_Impedance_Ohm` and no
     `Volt_Drop_Base`. A screenshot of Electric Specs showed **0.9785
     and 3094** against that row.

     The service lookup read `VD_Cable_Size_ID` alone:

         const svcId = found.service?.Attributes?.VD_Cable_Size_ID

     Every service on both drawings is sized BY HAND — the size sits in
     `Manual_VD_Cable_Size_ID` and the calculated field is empty. So the
     lookup found nothing, `serviceVoltDrop` returned
     `missingSpec: !cable`, and the cut-out columns went blank on a
     complete catalogue.

     `cableIdOf` is the one rule and now decides here too.

     **`missingSpec` means two different things and reports them the
     same way.** `!cable` is "there is no cable"; the other is "the
     cable has no figures". Reading the second where the first was true
     sent two mornings after a data problem that did not exist \u2014 mine,
     twice, and both times I said "found it".

     A flag whose name states one cause and whose value has two is worth
     splitting; until it is, "no figures" must never be reported without
     checking a cable was found at all.

The new column reads `Single Phase Service CNE 35 — no figures in the
catalogue`, named with `cableMenuName` so the sheet and the screen call
one cable the same thing. The blanks stay blank: a service that
genuinely drops nothing must not be given a figure to make the column
look complete.

Still an Admin fix, not a code one: **Electric Specs → cable sizes →
`Loop Z Ω/km` and `VD base`.**

**A note on writing checks.** Three checks this session were anchored on
a string that appears more than once in the file, or sliced by a
character count that fell short of the block. Each reported a fault that
did not exist, and each took a round trip to work out. **Anchor on
something that appears once, and slice to a marker rather than a
length** — these files carry more comment than code, so a few thousand
characters is a hundred lines of prose and no rules at all.

130. **The print embedded the page in the file; the screen showed the
     page corrected.** Print to Scale came out with the basemap turned
     a quarter from the features traced over it. A PDF page can differ
     from its own content stream in two ways a viewer silently
     corrects: a `/Rotate` attribute — routine on landscape scans and
     OS extracts — and a CropBox offset from the MediaBox. pdf.js
     applies both, so the calibration (`Origin_X/Y`,
     `Metres_Per_Pixel`) and every traced feature live in the
     *displayed* page's space. pdf-lib's `embedPdf` applies neither:
     the form is the raw content stream, MediaBox-bounded, unrotated.
     Both libraries were "showing the page" and disagreed about what
     the page was.

     `printPdf.js` now embeds against the CropBox and turns the placed
     form by the page's own rotation, standing it on the corner that
     puts its displayed top-left at the georeferenced origin. The check
     asks pdf.js itself where the mark shows on screen
     (`convertToViewportPoint`) rather than recomputing it with the
     print's own arithmetic — a check that mirrors the fix inherits the
     fix's mistake. All four rotations and an offset CropBox are
     measured through the CTM the finished sheet actually carries;
     reverting the fix fails five of the six.

     The shape to remember: **two renderers of one file agree only on
     what is in the content stream.** Page-level attributes — rotation,
     crop, and for that matter UserUnit — are each renderer's own
     business, and any hand-off from one renderer's coordinates to
     another's must carry them across explicitly. The existing
     registration check passed throughout, because its synthetic
     basemap carried no attribute either renderer had to correct.

131. **The print read the raw drawing; the screen read the filtered
     one.** Hidden layers printed. So did the rest of the estate when
     one circuit was isolated, which is worse, because isolating a
     circuit and printing is precisely how one circuit's plan would be
     issued. The canvas draws its `visible` memo — hidden keys, circuit
     and way isolates, the lighting view, the live-trench filter — and
     the print handlers were handed `features`.

     The fix is one word in three places: `savePdfSheets`,
     `printPdfSheets` and the `PrintModal` prop all read `visible` now.
     The modal matters as much as the handlers — sheets costed over
     hidden geometry frame and price paper for lines that will not be
     on it. Reusing the canvas's own memo rather than re-deriving the
     predicate is the point: a rule added to what the screen shows is a
     rule added to what the sheet shows, with no second copy to drift.
     `withAssumedMeters` runs on the filtered set, so hiding electric
     also synthesises no board flats.

     The check slices `GISCanvasPage.jsx` to the two handlers before
     matching, because `withAssumedMeters` has other callers — the
     levels and the circuit report — that rightly read the raw drawing,
     and the previous check's file-wide regex would have matched one of
     those and passed while the print read the wrong set. The slice
     fails loudly if its anchors move, per the anchoring note above.

     Same family as "Four readers of one drawing": the screen learned
     what visibility means, and a second reader of the same drawing
     carried no idea of it while looking perfectly correct.

132. **The print labelled by rules of its own.** Sheets came out with
     "Water Meter 19" down every street — text the screen has never
     shown anyone, because the canvas's point-label gate excludes
     meters (their name is answered on selection), span nodes and
     feeder points (their codes are a drawing of their own), and puts
     everything else behind the master Labels layer and the per-kind
     switches in `labelKinds.js`. The print's label pass in
     `printVector.js` read none of it: `if (labels)` wrote every
     feature's `Label`, so a switch turned off on screen changed
     nothing on paper.

     `pageDrawList` now takes `showLabels` and `labelKinds`, applies
     the same role exclusions the canvas applies, and asks
     `labelShown` from labelKinds.js — the one module that states the
     rule — for the rest. `pdfOptions` carries the canvas's live
     switch state through, so what the print writes is what the
     screen was writing at the moment Print was clicked. Selection is
     the one part of the screen's rule with no meaning on paper.

     The check is functional this time, because `pageDrawList` is
     pure: a meter, a span node, a feeder point, a joint and a valve,
     each with a Label, and the text items counted under defaults,
     under `labelKinds: { joints: true }`, and under
     `showLabels: false`. Reverting the fix fails five of the six
     label cases.

     Third print-parity fault in one session (130, 131, this).
     `printVector.js`'s own header calls itself "a SECOND renderer"
     and names the drift risk; the pattern for closing each one is
     the same — make the print read the module the screen reads, not
     a restatement of it.

133. **Fourth print-parity fault, found from the other direction.**
     Reported as "the water main style is wrong on the CANVAS": green
     dashed expected, thin solid purple shown, while the rule looked
     right in Admin → GIS Styles. The canvas was behaving correctly.
     The drawing had an operator standard selected, and an
     operator-scoped rule covering water — weight 32, the strongest
     claim in the cascade, by design — outranked the base green rule.
     What made it read as a canvas fault was that the PRINT showed the
     green: `pageDrawList` resolved styles with no `organisationId` at
     all, so every org-scoped rule silently fell off the sheet, and
     the print's accidental base-style rendering became the user's
     reference for "correct". `pdfOptions` now carries
     `organisationId: standard || null` and the print resolves under
     the same standard the screen does. Checked functionally: an
     org-scoped rule changes the sheet only under that operator's
     standard.

     Two lessons. First, when screen and print disagree, do not assume
     the screen is the broken one — this time the print's bug had
     defined the user's expectation. Second, **the GIS Styles admin
     preview draws the row in isolation and ignores its scope columns
     entirely**, so it cannot show which rule WINS on a given feature.
     That blindness turned a working cascade into a support round trip.
     A cascade inspector in the admin — pick a line type and operator,
     see the matching rows in specificity order and the resolved
     result, through resolveStyle itself — is the standing fix, not
     yet built. The Line_Type autocomplete there also offers keys from
     already-saved styles rather than the real line-type list, which
     is a second trap of the same shape (a rule that previews and
     matches nothing).

     **Postscript: the operator theory was wrong**, and the user found
     the truth — see 134. The print-side fix above stands on its own
     merits (org-scoped rules must print), but the purple was never an
     operator's rule. The cascade inspector proposed above IS now
     built — explainStyle in gisStyle.js on a shared cascadeOf, the
     panel in GisStylesAdmin, checkstyleinspector.mjs — and would have
     shortened this hunt to one look.

134. **Build Water Network laid the incumbent's pipe.** The "wrong
     water main style" of 133 was never a styles problem: the build
     found its main type with
     `/main/i.test(Type_Key) && !/service/i` and took the FIRST match
     in Sort_Order — and `water_main_existing` (46) sorts ahead of
     `water_main` (50). So every generated water main was the
     incumbent's type: drawn in the incumbent's grey `#8fa8bf` (read
     as "thin solid purple" on screen), and defaulted by
     `defaultStatusOf` to `existing` — a pipe this job had supposedly
     done nothing to, off the bill and outside every status flow. Gas
     and electric only escaped because their `_existing` types happen
     to sort AFTER the real ones — the identical fault, passing by
     luck of an ordering anybody can change in admin. Fault 126's
     shape again: a loose pattern over type keys.

     `newMainTypeFor(lineTypes, layerKey)` in buildStatus.js — beside
     `isExistingLineType`, the module that owns ours-vs-theirs — now
     answers it for every build: on this layer, a main, not a service,
     not the incumbent's by key OR label, lowest Sort_Order among what
     remains. All five call sites (four gas readers, the water build)
     use it; the water build also states `Build_Status: "planned"` on
     its runs explicitly rather than riding the default that betrayed
     it. `checkbuildmaintype.mjs` holds it functionally, including the
     case where gas's ordering flips the way water's already was.

     **And the line editors no longer offer changing a line type** —
     stated read-only instead, at the user's direction: a line is
     drawn as what it is, and the type decides the status list, the
     bill and what every build reads, so retyping a drawn line
     reclassifies work. The drawn-wrong line is deleted and redrawn.
     (Bulk edit had already withdrawn the same field for the same
     reason; the draw-time picker rightly remains.)

     **Later: the read-only field went too.** The drawing already says
     what a line is — colour, style, the menu it was drawn from — and a
     field that can only be read spends a row of the panel saying what
     is on screen. Nothing anywhere edits `Line_Type` now, which is the
     rule worth remembering; two checks asserted the old arrangement
     (`checkbuildmaintype` wanted the read-only field, `checkbulkfields`
     wanted the editor to keep it so a line could be reclassified) and
     both were rewritten to the current rule rather than deleted. A
     check that encodes a decision has to be revisited when the
     decision is, and saying so in it is better than quietly dropping
     the case.

     Diagnostic lesson, at my own expense: three rounds of style-
     cascade theory for what was a data-writer bug. The screenshot's
     "purple" was `#8fa8bf` grey-blue, and one click on the line —
     which names its type — would have ended the hunt at once. **When
     a drawing looks wrong, read the feature before theorising about
     the renderer.**

135. **Fifth and sixth print-parity faults: symbols and line labels.**
     Reported from a printed sheet: service valves drew as filled green
     discs where the screen shows a bar across the main, and no pipe or
     cable carried a label.

     *Symbols.* `printVector` kept its own `SHAPE` table of role →
     square/disc/diamond and its own `SYMBOL_MM` sizes, so the style
     cascade decided a point's symbol on screen and a hard-coded map
     decided it on paper: a meter styled as a square printed as a disc,
     a DNO's hexagons printed as discs, and a service valve — which had
     no row in the map at all — printed as the default disc. Fixed by
     recording the very path `symbolPath` traces for the canvas
     (`pathRecorder` in printVector, a canvas-shaped sink answering to
     beginPath/moveTo/lineTo/rect/arc, arcs as 12-gons) and handing it
     to the writer as a new `paths` primitive. One drawer, two
     surfaces: a symbol added to gisStyle.js now appears on paper with
     no change here. Service valves keep their bespoke bar, computed
     from `VALVE_WIDTH_M` and `Angle_Deg` as on screen, without the
     canvas's "SV" text — the label pass already writes "SV 10", and
     both would read "SV SV 10". Joint spin travels too: `jointAngle`
     moved out of the canvas into joints.js beside `bottleEndAngle`,
     with `symbolSpin` as the one rule both renderers turn a symbol by.

     *Line labels.* The label pass had `if (isLine(f)) continue;` — the
     sheet labelled points and skipped every line, so a drawing went
     out with its mains and services anonymous, which is the one
     drawing somebody digs from. New `lineLabel.js` composes the tag
     (`lineTag`, the circuit/way rule the canvas now reads too) and the
     size-and-length stack, and the print sets it half way ALONG the
     run rather than at a middle vertex. It obeys the screen's
     switches, which were already carried (fault 132): Mains labels and
     Service labels default OFF, so a sheet only carries them when the
     screen does.

     *Sizes, one round later.* The first cut of the symbol work read
     its radius off `appearance`, which holds a scaled symbol between
     `Min_Symbol_Px` and `Max_Symbol_Px` — SCREEN PIXELS, by their own
     names. The print hands `appearance` millimetres-per-metre as its
     scale, so the figure coming back was millimetres held between
     pixel bounds: a floor meant to keep a meter visible at site zoom
     became a floor of 8 MM on paper, and every meter printed as a
     centimetre-wide blob over the plot it named. `symbolRadiusMm` in
     printVector now works from the raw style and converts the clamps
     at MM_PER_PX before applying them. The check measures a meter's
     printed diameter: 1.7 mm with the fix, 9.6 mm without.

     The general trap, worth naming: `appearance(style, scale)` takes
     any scale, and the print's scale is in different units from the
     screen's. Anything it returns that is mixed with a px-named field
     needs converting; widths already did this, symbols did not.

     *Placements.* The first cut of the line labels set every tag at
     the midpoint of its run, which would have snapped back every label
     somebody had dragged clear of a crowded pipe or a boundary —
     undoing on the sheet the arranging that was done for the sheet.
     `Attributes.Labels` holds placements as points and offsets in
     METRES, which is what makes them printable at all: ground units
     mean the same thing at any zoom and any sheet scale. The print now
     reads them, legacy `Label_At`/`Label_Offset` included, and draws
     one tag per placement.

     Worth being plain about what "moveable" does and does not mean
     here: a label is moved on the CANVAS and the sheet follows. The
     PDF itself is flat vector art — its text is not draggable in a
     viewer, and making it so would mean emitting free-text
     annotations, which every viewer renders differently and which no
     plotter would honour. Reprinting after moving a label on screen is
     the intended loop.

     Known and deliberate limits, stated rather than left to be
     discovered: the catalogue-spelled cable name and the gas flow (Q)
     are canvas-only, derived from lookups the print does not load, and
     a sheet needing them should be passed them rather than given a
     second source. The remaining bespoke oriented pictures — tee,
     reducer, HD cut-out, boards, link box, primary, ring sub, open
     point — still print as their style symbol rather than their
     drawn picture. Same shape of fault as this one, not yet closed.

136. **Wash outs on the water network (feature, not a fault).** Asked
     for: a wash out at every END of pipe on a built water main — not
     at junctions — drawn as a filled disc, the colour of the main,
     with WO inside, and its size and visibility editable in GIS
     Styles.

     *Where.* `washOuts.js`, pure and modelled on serviceValves.js:
     interns vertices within CONNECT_EPS, counts pipe ENDS at each node
     and takes the nodes of degree one. Degree two is a bend OR two
     runs meeting — and the builder cuts a run wherever the size
     changes, so a taper mid-street is two runs and must NOT get one;
     that case has its own check. The node nearest the water POC is
     skipped: it is an end by geometry and the one place water comes
     in. With no POC on the drawing every end takes one, which is the
     honest answer rather than silently drawing none. A POC dropped on
     the drawing but not connected (beyond SNAP_TOL) suppresses
     nothing.

     *What it looks like.* `SYMBOLS` gains "washout" (a disc) and a new
     `SYMBOL_TEXT` map in gisStyle.js says which symbols carry letters
     inside them. BOTH renderers read it — the canvas writes them after
     filling, the print emits centred text — because a table each is
     how a symbol comes to read WO on screen and nothing on paper. The
     PDF writer gained centred text (`align: "centre"`, measured with
     `widthOfTextAtSize`), without which two letters sit beside a 2 mm
     disc rather than inside it.

     *Colour, deliberately unset.* Neither the build nor the seeded
     style writes one, so the cascade falls through to the water layer
     and the disc comes out the colour of the main it terminates.
     Setting one would freeze the two against each other and is exactly
     what somebody would then have to remember to change twice. The
     check enforces it.

     *Editable.* Size and visibility are style fields on a row scoped
     to the washout ROLE, seeded by migration **0213** at 9 px, and the
     role is offered in the GIS Styles admin. That is the whole point
     of it being a style row rather than a number in the canvas.

     **Migration 0213 is required, not optional**: `Feature_Role` has a
     CHECK constraint, so without it the build cannot save a wash out
     at all.

     ⚠ **Trap this hit, worth reading before writing the next role
     migration.** A CHECK is replaced wholesale. The first cut of 0213
     copied 0209's role list, which silently REVOKED 'primary',
     'ringsub' and 'openpoint' — added by 0211 — so every one of those
     on every drawing would have become a row its own table refuses.
     It was invisible in the suite except as checkboundarystyle
     appearing to START PASSING: that check reads its role list from
     the latest constraint, so a constraint missing three roles simply
     stopped checking them. **A pre-existing failure that turns green
     for no reason is a symptom, not a win.** checkwashouts now asserts
     the constraint still carries the older roles.

     Also caught by the suite: `checkscope` found `r` referenced
     outside the branch that declares it, in the canvas's letter
     drawing. Fixed by carrying the radius out beside the symbol.

137. **The main stopped at the last service, not at the end of the
     trench.** The walk in waterNetwork.js prunes every node with no
     water beyond it (`kids` filters `served > 0`), which is right for
     sizing and wrong for laying: a run ended at the last service tee,
     so the final stretch of dig had no pipe in it, no wash out at its
     end, and nothing in the bill for pipe that would in fact be laid.
     The bare-trench report named it, which is how it survived — it was
     reported rather than wrong.

     A run that ends at a LEAF of the served tree now carries on along
     the trench, one onward length at a time, to where the dig stops.
     `tailNode` and `tailM` record where it finishes and how much of it
     is past the last service.

     Three rules hold it together, each with a case:
       - only from a leaf. A run that ended because the main divides or
         the size changed has served pipe ahead of it, and extending
         there lays a second main down the same length.
       - a fork beyond the last service stops it. Which leg is the main
         is a question for the designer; the bare-trench report still
         names what was left.
       - the size does not change over the tail. Nothing is fed along
         it, so the pipe that arrives is the pipe that carries on.

     The wash outs follow for free: washOuts.js reads the drawn pipe,
     so the end moving moves the wash out with it. `checkmaintotrenchend.mjs`.

     **Consequence worth knowing: it made the wash out look like part
     of the dig.** `connectedTo` is geometry and nothing else, and once
     the main reaches the end of the trench the pipe's last vertex and
     the trench's last vertex are the same point — so a wash out
     touched both and was reported as connected to the trench, which
     reads as a fitting installed in a hole and puts the dig into a
     graph meant to describe the network. `linkable` now refuses every
     pairing but wash-out-to-water-main, and the build writes the wash
     out's `Connects` at creation: the links pass at the end of the
     build runs over the drawing as it was BEFORE the wash outs
     existed, so nothing else would ever have filled it in.

     Wash outs are also in Bulk Delete now ("All wash outs", under
     Points), beside the service valves.

     **Placed by hand as well as by the build** (Water › Place Wash
     Out). `snapToMain` in washOuts.js takes the click to the nearest
     VERTEX, segment MIDPOINT or END of a water main — the places a
     pipe can be met — and returns null where no main is within reach,
     which the canvas refuses rather than dropping a fitting in open
     ground joined to nothing. A hand-placed one carries no `Generated`
     flag, so a rebuild leaves it alone, and it is numbered after the
     wash outs already there.

     **Placement inserts a vertex in the pipe** where there was none.
     That is what makes the rubber band work: a fitting and its pipe
     have to share a point, or dragging the fitting stretches nothing.
     The vertex lies exactly on the line, so neither the shape nor the
     length of the main changes. Two rules in the drag then make it
     behave: a wash out offers EVERY vertex of its pipe rather than
     only the ends (one set at a bend or mid-length would otherwise be
     left behind), and it follows water mains only — the pipe and the
     trench end at the same point now, so the general "ends of any line
     within reach" rule was dragging the DIG out of shape behind it.

     And no label beside the symbol. The generic point-label pass wrote
     `Label` against every point, so a disc already reading WO carried
     a black "WO 8" next to it — the same thing said twice, on a plan
     with no room to spare. Excluded by role in BOTH renderers, beside
     meters, span nodes and feeder points which are excluded for the
     same kind of reason. The Label itself stays: it names the fitting
     in the editor, in a schedule and in the bill, which is where a
     number is read rather than counted off a drawing. Service valves
     deliberately keep theirs — "SV 10" is how one is referred to on
     site, and the canvas draws only "SV" in the symbol.

138. **DXF export for AutoCAD (feature).** `dxf.js`, pure: features in,
     DXF text out. Offered as Export to AutoCAD (DXF) beside Print to
     Scale and Download Drawing, and it exports the canvas's VISIBLE
     set for the same reason the print does (fault 131).

     Decisions worth not relitigating:
       - **R12 (AC1009).** AutoCAD reads every version; everything else
         reads R12 — Civil 3D, MicroStation, QGIS, free viewers. It
         costs LWPOLYLINE, so a polyline is written POLYLINE / VERTEX /
         SEQEND, and that is the whole price.
       - **One metre, one drawing unit**, with `$INSUNITS` 6 (metres) so
         a receiving drawing in millimetres scales on insert rather
         than landing it a thousand times too small.
       - **`origin` offsets every coordinate.** The drawing grid is
         local. A project whose origin is a known easting and northing
         exports straight onto the national grid; left at zero the file
         is internally correct, to scale, and arbitrary in position.
         Asked for rather than guessed, because it is a fact about the
         project.
       - **Layers from the drawing's own vocabulary** — the line type
         key becomes WATER-MAIN, a point takes its role
         (WATER-WASHOUT) — rather than a mapping table somebody has to
         keep in step. Labels go on a matching -TEXT layer so a CAD
         user can freeze annotation and keep geometry, which is the
         first thing anybody does with a drawing they are tracing.
       - **Colour becomes an ACI index** (a DXF layer has no hex), by
         nearest RGB across the classic palette.

     ⚠ **Trap found while building it:** the first cut skipped any
     feature whose `appearance(...).visible` was false. That flag comes
     from `Min_Scale`/`Max_Scale` — a rule about SCREEN ZOOM, which a
     CAD drawing does not have — so a fitting styled to appear only
     when zoomed in would have been dropped from the export silently:
     the file opens, looks complete, and is missing geometry. The
     export now reads the style for COLOUR only, and what the drawing
     is showing stays the caller's business. The general shape: a
     function shared between the screen and an export may be answering
     a question the export is not asking.

     ⚠ **The drawing came out MIRRORED, and was fixed by negating y.**
     Reported from AutoCAD: geometry flipped about the X axis — and
     the reporter was right to say mirrored rather than rotated, which
     is the distinction that identifies the cause. The drawing stores
     metres in SCREEN convention (`toPx` maps metres to pixels with no
     sign change, so y grows downward); CAD grows y north. Writing the
     stored y straight out therefore mirrors the whole plan.

     It is a nasty one because a mirrored drawing is nearly plausible:
     text reads the right way round, lengths and angles are right, and
     only north and south are swapped. My check had ASSERTED the bug —
     "y must not be flipped" — which is a reminder that a check
     encodes an assumption and is only as good as it.

     The negation happens before the origin is added, so an `origin`
     given as a real easting and northing means what a surveyor means
     by it. `checkdxf.mjs` now also checks the turn direction of a run
     survives, which is what tells a mirror from a move.

     **PARKED, and worth picking up: layer mapping to the CAD team's
     own standard.** The layer names here are derived from the
     drawing's vocabulary (WATER-MAIN, WATER-WASHOUT). The export is
     for an internal CAD team who keep their own layer schedule —
     split by pipe size, cable size, fitting kind and more — so the
     geometry currently lands on names their system does not use.

     Everything a mapping needs is already on the features, which is
     why this is a table rather than a rewrite: `Layer_Key` and
     `Line_Type` for the utility and kind; `Attributes.Size` as text
     plus the catalogue ids behind it (`Water_Pipe_Size_ID`,
     `Gas_Pipe_Size_ID`, `Cable_Size_ID`/`VD_Cable_Size_ID`, and the
     Manual_ overrides); `Feature_Role` and `Joint_Type` for fittings;
     `Build_Status` if their standard separates proposed from existing;
     Circuit_Letter/Way if electric layers split by circuit.

     Two open decisions, both asked and not yet answered:
       - a table in code (fast, but every standard revision is a
         deploy) versus a DXF Layer Map in admin beside GIS Styles
         (their CAD lead maintains it; new pipe sizes stop coming
         through us). Leaning admin, given the standard will evolve.
       - what a feature matching NO rule should do. Suggested a
         visible catch-all — APTUS-UNMAPPED — so nothing is quietly
         merged into a real layer; refusing the export outright is
         also defensible.

     Needed from them to build it: a CSV of layer name against
     utility / type or role / size / status, or an AutoCAD LAYERS list
     plus their naming standard.

     Not carried, deliberately: symbols are POINT entities with their
     label, not blocks. A symbol library means agreeing names with the
     receiving CAD team, which is a conversation rather than a guess.
     Import FROM DXF is a different and harder job — deciding which
     incoming polyline is a main needs a layer convention agreed up
     front. `checkdxf.mjs` reads the file back as group-code pairs, the
     way a parser does.

139. **Print to Scale sets the drawing up for issue first.** A sheet
     for issue is not the drawing somebody designs in. Clicking Print
     to Scale now switches OFF the trench (the `trench` layer key,
     which catches mains and service trench together), plot seeds,
     span nodes and feeder end points, and switches ON the mains and
     service labels — master Labels switch included, without which the
     per-kind ones say nothing.

     Applied to the CANVAS, not passed to the print. The print already
     draws what the screen draws (131, 132), so anything else would be
     a second opinion about what a sheet shows; and it means the
     drawing in front of somebody IS the sheet they are about to
     produce. Added to the hidden set rather than replacing it, so an
     isolate or a hidden utility somebody chose survives.

     Left applied afterwards rather than restored on close: a silent
     restore would undo, unasked, whatever they then changed. A status
     line says what moved and the layer menu puts any of it back.

     Also offered from each utility menu, since that is where the work
     is done — the same handler, because two Print buttons that set up
     differently would be worse than one in an awkward place.
     `checkprintsetup.mjs` holds the key SHAPES too: the hidden set
     takes a bare layer, `lt:`, `role:` or `layer:role:`, and a key in
     the wrong shape hides nothing while looking entirely plausible.

140. **A moved label was never saved.** Reported as "I have to keep
     moving the cable labels back after every refresh", and it was
     exactly that: the position was never written.

     The move handler had TWO `d.mode === "label"` branches. The first
     applies the offset and RETURNS; the second — which is where
     `d.moved = true` lived — was therefore unreachable. So no label
     drag was ever marked as moved, and the release handler's first
     test is `if (!d.moved) { select the line; return; }`. Every drag
     released as a click: line selected, nothing saved. It looked
     perfect until the page reloaded, because the label follows the
     pointer on local state whether or not anything is written.

     The flag is now set inside the live branch, past the same DRAG_PX
     threshold a pan uses so a click with a shake in it still reads as
     a click, and the dead branch is gone.

     Two general lessons. **Dead code that looks like it is working is
     worse than missing code** — the second branch read exactly like
     the thing that would have made this work, which is presumably why
     it survived review. And **a bug that only shows after a reload is
     invisible in the session that causes it**: anything written on
     release deserves a check that the write is reachable at all.
     `checklabelmove.mjs` holds the handler's shape, including that no
     second label branch reappears.

     **Second half, found once the first was fixed: the label jumped
     back when grabbed again.** First drag fine, second grab and it
     sprang to its unmoved position. A feature carrying only a legacy
     `Label_Offset` is rendered from a SYNTHESISED placement — the
     renderer builds `[{ at, off }]` from the legacy keys — so `placed`
     is true and the hit records `idx: 0`, while `Attributes.Labels`
     does not exist. The grab then looked the offset up by that index,
     found nothing, and started the drag from `[0, 0]`.

     Only visible on the SECOND drag, because the first one is what
     writes the legacy key that creates the synthesised placement. A
     fix for one fault exposing the next is the usual shape of this;
     it was not a regression from 140.

     The hit now carries the offset the renderer DREW at (`off: off ??
     null`) and the grab starts from that, with the old lookups only as
     a fallback. One account of where a label is, which is the same
     move as every other parity fix this session: the thing that draws
     and the thing that reads must not each work it out.

     Worth noting the check I wrote for this initially passed while the
     bug was in, because its regex matched the FIRST
     `labelHits.current.push` in the file — the one for point labels —
     rather than the line label's. A static check anchored on a common
     pattern can silently test the wrong thing; anchor on what is
     unique to the case (here `idx: placed ? idx : null`).

141. **Cross-section marks, and the section itself (feature).** Asked
     for: a mark placed on a trench, 2 m of ground long, turned square
     to the line, right-clicked to show the section.

     `sectionMarks.js` — `snapForSection` puts the mark on the nearest
     point ALONG a trench (not at a vertex: a section is taken wherever
     somebody wants to look) and records the trench, the bearing OF THE
     TRENCH, and the distance along it. `sectionMarkShape` returns the
     bar and its two heads in metres about the centre, and both
     renderers draw from it. The bar is square to the line because a
     cut at any other angle is through a longer trench than was dug —
     the check asserts the dot product at four bearings.

     `njug.js` holds NJUG Volume 1 Issue 8 as DATA: cover depths per
     utility for footway, verge and carriageway, the across-a-footway
     positions from Figure 1, and the colour coding. Recorded as data
     so there is one place to look when somebody asks where a number
     came from, and one place to change it when an operator's spec
     differs. Three things stated in the module and repeated under
     every drawing: they are recommended minima, not law; an asset
     owner's spec overrides them; Issue 8 is from 2013 and should be
     checked as current. Gas is the only utility whose verge figure
     differs from its footway one, which is why verge is a separate
     entry rather than folded in.

     `trenchSection.js` builds the section from `contentsOf` — the
     drawing's own answer about what is in the trench — and reports
     departures as FINDINGS rather than redrawing the design to match
     the guidance. A drawing that silently corrects itself hides the
     thing somebody needed to see. A run with no size is drawn nominal
     and says so.

     Built when asked for, never stored: the drawing changes under a
     mark, and a section saved at placement would go stale while
     looking authoritative.

     Two things the suite caught that I had not: `checkscope` found
     `clamp` used where it is not declared, and **`checkjsxescapes`
     found `\u00b7` written loose in JSX text**, where it renders as
     six literal characters rather than a separator. Both were mine,
     both were invisible in a build that passed.

     **And one it did not catch: Show Cross-section did nothing.** The
     mark's trench was looked up with `f.Feature_ID === id` against the
     id stored in `Connects`; an id that comes back from the database
     as a string fails that comparison, the lookup found nothing, and
     the early return left no trace on screen. A button that does
     nothing at all is the worst failure there is — a misclick and a
     bug are indistinguishable, so somebody just clicks again.

     Three changes, and the second two matter more than the first:
     `Number()` on both sides; a fallback to the trench the mark is
     geometrically SITTING on when the link is missing or stale; and a
     try/catch that reports rather than swallows. Anything that ends in
     an early return with no message deserves the same look.

     The button also moved into the feature editor, where somebody who
     has opened the mark is already looking, rather than living only on
     a right-click menu they have to know about. The right-click item
     stays as a shortcut.

     **Then the mark disappeared, twice over my own doing.** It was
     created on the `trench` layer — that is what it is placed on — and
     `classKeys` uses the layer as a hide key, so switching the trench
     off switched off every section mark. Worse, fault 139's print
     set-up switches the trench off deliberately, so a mark vanished
     from exactly the sheet it was drawn for. A section mark is a note
     ABOUT the dig, not part of it: migration **0215** adds an
     `annotation` layer, moves the marks already placed onto it, and
     new ones are created there. Any future annotation — north points,
     notes, revision clouds — belongs on it for the same reason.

     **And the mark was drawn wrong.** The two heads pointed back along
     the bar at each other, which is an arrow across the trench saying
     "this width". A section mark says "viewed this way": a straight
     bar square to the trench with a small triangle at each END,
     both pointing ALONG the trench in the direction of view. Without
     it, a reader cannot tell which way round the section beneath is —
     the same cut viewed from the far side is its mirror. `flip`
     reverses the view without moving the bar, since it is the same
     cut. The check asserts the apex direction against the view vector
     rather than merely counting triangles, which is what let the first
     version pass.

     **Then: "s.has is not a function".** `contentsOf` takes SETS for
     `serviceLineTypes` and `serviceTrenchTypes`; I built a second copy
     of them in `showSection` and made them arrays. The canvas already
     has `serviceTypeSets`, a memo whose own comment warns that two
     copies of this answer are how the trench editor and everything
     else come to disagree — and I wrote the second copy anyway, in a
     file that already had a working one. `showSection` now reads the
     memo.

     The lesson is about the CHECKS, not the bug. Every case on this
     feature tested a piece — the shape, the snap, the depths, the
     escaping — and every one passed while the join between them was
     broken. A case that runs the real path (a trench with things in
     it, through `contentsOf`, into a section, out as SVG) reproduces
     the failure exactly, and is now in `checksectionmark.mjs`. A
     static check cannot see a wrong argument TYPE; only running it
     can.

     The try/catch added the round before is what made this
     diagnosable: the same bug without it was a button that did
     nothing.

     **Turning a mark about.** `Section_Flip` on the mark, set from a
     checkbox in its editor ("Viewed from the other side"), does two
     things from ONE flag: the heads on the drawing look the other way,
     and the section opens mirrored. They are one fact — which side you
     are standing on — and two switches for it is how a drawing comes
     to lie about itself.

     What mirrors and what does not: the item positions are unchanged,
     because they are what the guidance gives; only the DRAWING is
     reflected, about the middle of the footway. The boundary and
     carriageway labels travel with the sides they name — a mirrored
     section that still says "boundary" on the road side is worse than
     one not mirrored at all, and the check tests for exactly that.

     **Then a screenshot of the real thing showed four faults**, none
     of which the checks were looking for, because every case tested a
     NUMBER and none tested whether the drawing could be read:

       - a run with no size printed "100 nommm";
       - every cover figure was written at the top of the drawing
         instead of beside the run it measured, so three runs gave
         three numbers in a stack belonging to nothing;
       - two runs in one position had their names drawn over each
         other;
       - the notes under the drawing ran out of the dialogue and over
         the map, which made the whole thing look broken.

     The drawing is rewritten: dimensions written on their own lines at
     their own heights, names pushed clear of anything already written
     near them, the two side labels inside the frame against their own
     edges, and the dialogue sized and scrolled rather than left to
     grow. The checks now measure the OUTPUT — that the cover figures
     are not all at one height, that two names in a position are not on
     top of each other — which is the only way a layout fault is
     catchable at all.

     **And "unmade" is not an NJUG surface.** The drawing has six
     surfaces (`footway`, `carriageway_12`, `carriageway_34`, `unmade`,
     `verge`, `agricultural`); the guidance has three. `njugSurface`
     maps them BY KEY, from GIS_Surface_Type, rather than by matching
     words in a label — which breaks the day somebody renames one in
     admin.

     Three kinds of answer, and the difference between them is the
     point:
       - **the guidance's own** — footway, verge, both carriageways;
       - **policy** — `unmade` follows the FOOTWAY figures, which is
         this operator's decision and not something NJUG says. The
         dialogue says which column was used without implying the
         guidance named it;
       - **assumed** — `agricultural` has no decision and no NJUG
         column, so it reads as a verge and the section ADMITS it had
         to choose. Ploughing is why that deserves a real answer rather
         than a quiet default: an inferred cover on agricultural land
         is the kind a subsoiler finds. Still open.

     Anything added to the surface table later is assumed, never
     silent.

     **The dialogue had no background**, which looked like the bottom
     half of it being transparent. It used `.sch`, the schematic
     dialogue's class — and that CSS is INJECTED BY SchematicModal.jsx
     when that component renders. With the schematic unmounted the
     rules do not exist: the drawing looked boxed only because its own
     SVG paints a white rectangle, and the notes under it sat straight
     on the map.

     **And the flip did nothing visible.** The editor's checkbox wrote
     to its DRAFT, and the dialogue was built from the SAVED feature,
     so ticking it changed nothing until a save and a reopen — which
     nobody would guess. Two changes: the editor hands `showSection`
     the draft rather than the stored feature, and the dialogue carries
     its own switch, which redraws the section AT ONCE and writes the
     answer to the mark afterwards. Redrawing first matters: a drawing
     that waits on a round trip before mirroring reads as a control
     that does not work.

     The general shape: a control that edits a draft and a view built
     from saved state will always disagree until somebody saves. Put
     the control where the thing it changes is, or feed it the draft.

     **And mirroring moved the ground.** Both rects — the ground and
     the grey surface over it — were drawn from `X(0)`, and mirrored
     X(0) is the RIGHT-hand edge, so they shot off to the right while
     the pipes stayed put. A rect needs a left edge and a width; only
     things that sit at a POSITION across the footway go through the
     mirroring transform. The ground is the frame those positions are
     measured in, not a position.

     Worth generalising, because it will recur in any mirrored drawing:
     under a reflecting transform, a coordinate maps and an EXTENT does
     not. The check compares the ground rects in both directions and
     fails if they differ, and separately that nothing is drawn outside
     the picture.

     **A cable's size is an AREA, not a diameter** — corrected by the
     user after a 185mm\u00b2 LV cable drew wider than a sewer. "63mm" on a
     water main is 63mm across; "185mm" on a cable is 185 SQUARE
     millimetres of conductor, which is how cable is specified and
     ordered. `diameterMm` now takes `asArea` and returns the circle of
     that area (d = 2√(A/π), about 15mm for 185mm\u00b2); the label reads
     "185mm\u00b2"; a run with no size is nominal in the right unit (95mm\u00b2
     for a cable, 100mm for a pipe).

     And the section SAYS what that circle is: the conductor, not the
     finished cable. A 185mm\u00b2 four-core is nearer 50mm over the
     sheath, and `Electric_Cable_Size` holds impedance and volt drop
     but no overall diameter — so drawing an invented one would put a
     measurable number on a drawing with nothing behind it. If
     diameters are added to that catalogue later, `diameterMm` is the
     one place that needs to read them.

     Worth remembering as a class of fault: a number with a unit the
     code does not know is not a number. This one was visible only
     because somebody who knows cables looked at the picture.

     **The mark draws no name.** It wrote "Section 1" along the trench,
     which on a drawing carrying several is annotation about
     annotation — and the shape already says what it is. The Label
     stays on the FEATURE: it names the section in the dialogue, which
     is where a number is read. Drawn and stored are different
     questions, and only the first one changed.

     **Place Cross-Section moved to the TRENCH menu.** It was offered
     from each utility menu beside Print to Scale, on the reasoning
     that somebody printing would want one — which put it in three
     wrong places at once. A section mark goes on a trench, reports
     what the trench holds, and belongs to none of the utilities it
     draws. It is disabled with a reason when no trench is drawn, like
     the checks beside it. The check counts the offers and fails at
     anything but one.

     The section dialogue now carries its own box. The general point:
     **a class defined inside another component's injected stylesheet
     is not a shared class** — borrowing one couples two things that
     have no reason to be mounted together, and the failure is
     invisible until somebody opens one without the other. Anything
     else in this codebase reaching for `.sch`, `.fe-` or similar
     outside its owning component deserves the same look.

143. **The DXF exported 3D objects, and nothing took its layer's
     properties.** Both reported by a CAD team, and both produce a file
     that opens and looks plausible — which is why neither showed up
     here.

     *3D.* The POLYLINE carried flag `70 = 8` and each VERTEX `70 = 32`.
     Those are the 3D polyline flags. The comment I had written beside
     them claimed 3D "keeps a reader from assuming a plan projection",
     which was wrong twice over: a plan drawing is 2D, and a team
     working in 2D got objects they could not edit as lines. Both flags
     are now zero.

     *Layer properties.* No entity said BYLAYER. Absent, a reader is
     entitled to default colour and linetype to its own idea — so
     moving an entity onto a layer left it looking exactly as it had,
     which reads as the layer having no properties. Every entity now
     carries `62 = 256` and `6 = BYLAYER` explicitly rather than
     relying on the default.

     *And the tables a layer depends on.* A layer naming a linetype the
     file does not DEFINE leaves the reader to substitute. The export
     now writes an LTYPE table defining CONTINUOUS and every linetype
     the schedule mentions, and a STYLE table for the TEXT entities to
     answer to, with LTYPE before LAYER because layers reference
     linetypes.

     The lesson for the checks: everything here was structurally valid
     DXF. "The file opens" is not the test; the test is whether the
     entities behave as the kind of object the receiving team works
     with. Flags and BYLAYER are now asserted entity by entity.

143. **The DXF exported 3D objects, and entities ignored their layer.**
     Reported together, and the first causes much of the second.

     The polyline carried flag 70 = 8 and each vertex 70 = 32 — the 3D
     POLYLINE flags. My own comment claimed 3D "keeps a reader from
     assuming a plan projection", which was invented reasoning for a
     wrong number. A CAD team working in 2D got objects they could not
     edit as lines, and a 3D polyline will not take a linetype
     properly either, so moving one onto a layer did not make it look
     like that layer. Both are 0 now: a plain 2D polyline at elevation
     zero, which is what a plan is.

     Separately, every entity now states `62 = 256` and `6 = BYLAYER`.
     Absent, both SHOULD default to BYLAYER — and "should" is doing a
     lot of work across the dozen programs a DXF passes through. An
     entity carrying its own colour is precisely what stops it taking a
     layer's when somebody moves it, which is what was being reported.

     `checkdxf.mjs` now asserts no 3D flags, BYLAYER on every drawn
     entity, and every z at zero: a stray elevation is what makes
     geometry unsnappable in a 2D drawing.

     The lesson worth keeping: the comment was confident and wrong, and
     a confident comment on a magic number is worth more suspicion than
     no comment at all. Numbers in a file format should cite the format,
     not a rationale.

     **And the export carried no mains or service tags.** It wrote
     `Label` alone, so a main went into CAD as "W1" or as nothing —
     while the screen and the sheet both showed its size and length,
     composed by `lineLabel.js`. The export now calls the same module:
     one account of what a run is called, in all three places. Points
     keep their own Label, which is what names a fitting.

     Two details that matter in DXF: TEXT holds ONE line, so each row
     of a tag is its own entity stacked upward from the run; and the
     tag is set half way ALONG the run rather than at a middle vertex,
     which on a run that bends near one end is nowhere near its middle.
     Same `midOf` reasoning as the print.

144. **CAD layer catalogue, guided entry, and External/Internal
     (0220).** Three things asked together, all in service of one
     workflow: somebody sitting with the CAD team's schedule and
     entering it without having to remember anything.

     **Their layer names are a table** (`CAD_Layer`: name, class,
     geometry, colour, linetype). The mapping rules named a CAD layer
     as free text, which is fine for one rule and miserable for two
     hundred — every name retyped, and a typo produces a layer nobody
     notices until a drawing is issued. A rule now picks from their
     list. It stores the NAME as well as the id, because the export
     reads a name and a rule pointing only at a row would export
     nothing if that row were deleted.

     The layer-names form asks THREE questions — name, class, geometry
     — and no more. Colour and linetype were there and are not now:
     they would only matter if our DXF defined how a layer LOOKS, and
     it does not. The file is imported into a drawing that already has
     these layers, and the receiving template's own properties win.
     Asking for them was asking somebody to type a hundred values
     nothing reads. Sort order and notes went for the same reason:
     nothing sorts by one and nothing shows the other.

     **0221 drops those four columns** at the user's direction. A
     column that exists invites data: somebody fills it in, reasonably
     expects it to do something, and is quietly wrong. An empty field
     nothing reads is a small lie in the schema.

     One thing that had to move with them: the admin endpoint ordered
     `CAD_Layer` by `Sort_Order`. Ordering by a dropped column is an
     empty list and an error nobody connects to a migration — it now
     orders by `Layer_Name`, which is how a layer is looked up anyway.
     Worth checking for whenever a column goes: the endpoint's `order`,
     any index, any view.

     **0222 adds `Status` to CAD_Layer**: Planned, Existing, As-Laid,
     constrained so a typo cannot create a fourth stage nobody notices.
     A CAD schedule carries each utility three times over — proposed,
     already there, as built — and they must not be mixed; existing
     plant drawn as proposed is the dangerous direction of that
     mistake.

     ⚠ **Their list is not ours.** `Attributes.Build_Status` is
     planned / live / existing / abandoned: no "as-laid", and "live"
     has no counterpart. The two answer different questions — ours is
     the state of the ASSET, theirs is the purpose of the DRAWING. The
     mapping form therefore SHOWS a layer's stage beside its name and
     does not filter by it: quietly mapping one vocabulary onto the
     other would hide a choice somebody should make with their eyes
     open. If a mapping between them is ever wanted, it should be
     written down deliberately, probably as a small table, not inferred
     in code.

     The MAPPING rules keep their own colour and linetype, which is a
     different question — those are an override for a drawing that
     needs one, and are written into the file when set.

     **The mapping form asks for an OBJECT, not its parts.** First cut
     asked class, geometry, then size, cable type, line type, build
     status and a size band — which made somebody assemble an object
     out of the fields it happens to be stored in. Now: class,
     geometry, **the object**, their layer. Electric and Line offers
     every cable in the specs by its full description ("3c WAVE 95"),
     gas and water offer their own pipe as "Main 180mm" / "Service
     32mm", and a Point offers the fittings THAT class has rather than
     every role in the business.

     Each option carries what it sets, so the form asks about objects
     while the rule stores the fields the matcher reads. Line type,
     size band and build status are gone from the form; the columns
     remain, and rules written before this still work.

     **The entry form asks in the order somebody thinks in**: class,
     geometry, then the sizes THAT class has, then their layer. Gas and
     Line shows gas pipe sizes; water shows water; electric shows cable
     types and the sizes that type comes in. Changing the class clears
     a size chosen under the old one, because 125mm gas is not 125mm
     water. The layer list is filtered to the class and geometry
     already chosen.

     ⚠ **And it rendered nowhere for a while.** The editor has THREE
     Status dropdowns — trench, service and main — and "beside the
     status" was implemented beside the TRENCH one, where a cable and a
     meter never go. It rendered for nothing, and to the user the field
     had simply disappeared. Now built once as `sitingField` and
     rendered under `isMain` (beside the main's status, which is what a
     feeder cable has) and under `isMeter` (beside the meter
     reference, since a meter has no status dropdown of its own). The
     check asserts it is built once and rendered in both branches:
     "the code exists" and "the code runs" are different claims, and
     only the second is what somebody sees.

     On a main it sits INSIDE the status row (`fe-row`, the class this
     panel already uses for two fields that belong together), to the
     right of the Status dropdown — what stage this length is at and
     where it sits are answered in the same breath, and stacked they
     read as two unrelated questions. Its unset option says "Not set",
     which is what every other unset option in the panel says; this
     file already recorded, about a different field, that a phrase used
     once is one somebody has to stop and read. I wrote "Not said"
     anyway.

     **External or Internal** is a new fact about apparatus, on mains
     feeder cables and meters to begin with: the two are drawn on
     different CAD layers and are different jobs on site. No column
     needed on the feature — it lives in `Attributes.Siting` with
     everything else a feature knows about itself — and `DXF_Layer_Map`
     gained a `Siting` column so a rule can match it. A rule asking for
     one siting matches neither the other nor a feature that says
     nothing, which is the case the check holds.

     Also `Geometry_Type` on a rule, since a schedule that separates
     lines from points cannot be written without it.

142. **CAD layer mapping (feature).** The DXF export named layers from
     the drawing's own vocabulary; the CAD team keeps their own
     schedule. Migration **0216** adds `DXF_Layer_Map`: one row is one
     rule — what it matches (layer, line type, role, build status, size
     band, customer) and what the layer is called when it does.

     A new admin screen, **CAD Layers**, deliberately separate from GIS
     Styles: one says how a thing LOOKS on our screen, the other what
     it is CALLED in somebody else's CAD. They answer to different
     people and will diverge.

     Decisions worth keeping:
       - **House style first.** A rule with no `Organisation_ID` is
         ours and applies to everyone; a rule with one belongs to that
         customer and outranks the house rule it competes with. Scored
         so a customer's plain rule beats any amount of house detail:
         "this client's standard" is the stronger claim. The same shape
         as the GIS style cascade, on purpose.
       - **Seeded to reproduce today's output**, so applying the
         migration changes nothing about an existing export. That is
         why it is seeded rather than started empty.
       - **A fallback to the derived names**, so a system with no
         schedule exports exactly as before rather than filing
         everything as unmapped.
       - **Unmatched goes to APTUS-UNMAPPED**, which is obvious in
         AutoCAD, where something plausible merged into a real layer is
         not.
       - **Sizes carry a unit decided by the utility** — a pipe's size
         is a diameter in mm, a cable's an area in mm² (fault above) —
         from one function, so the editor's label and the matcher
         cannot disagree.
       - **An inspector on the screen**, answering "which layer would
         this land on" from the real matcher. Fault 133's lesson: an
         editor that shows rules one at a time cannot answer the only
         question anybody brings to it.

     **0217: a layer for a particular CABLE.** Asked after 0216 shipped:
     "3c WAVE 95" is a cable TYPE and a size together, and a schedule
     that separates 3c WAVE 95 from 4c WAVE 95 cannot say so with a
     band — they are the same 95mm². So a rule can also match
     `Cable_Type` and `Size_Label`, as TEXT: a CAD schedule is written
     by people against names they can read, and ids would be
     unreadable in the editor and would break if the catalogue were
     rebuilt. Matched case-insensitively, because "3C wave" is the same
     cable.

     Ordering: an exact size label (24) beats a band that contains it
     (16), and a cable type (32) beats both — "this cable" is a more
     specific claim than "a cable of about this size" — while a
     customer (64) still outranks the lot.

     The cable's identity is in the CATALOGUE, not on the feature: the
     feature holds an id, which `subjectOf` resolves through the cable
     size and type rows the caller passes. Two traps found doing it:
     the live tables spell their keys `Cable_Size_ID`/`Cable_Type` while
     0082 creates `Electric_Cable_Size_ID`/`Type_Name`, so BOTH are
     accepted rather than betting on one (a wrong bet shows as a rule
     that silently never matches); and the manual override is read
     before the calculated size, because a cable somebody set by hand
     is the cable that will be laid.

     And a band now matches a cable at all: a pipe carries its size on
     the feature, a cable carries an id, so the band number falls back
     to the catalogue's Size_Label. Without that a 185mm² run with no
     rule of its own went unmapped rather than into the 95–300 band it
     belongs to — found by a check case, not by reasoning.

     Two faults the suite caught in my own new screen: `checkscope`
     found `rules` used where `rows` is declared, and `checkjsxescapes`
     found another loose `\u00b7`. Both invisible in a passing build.

     And one my first check missed: removing the "no size, no band"
     guard did not fail, because a missing size coerces to ZERO — which
     fails every minimum and slips under every maximum. The case now
     uses a band with only an upper bound, which is where the guard
     actually earns its place. Coercion hid a bug from a test; a fixture
     has to include the case the bug needs.

144. **The client portal, and the door in front of it (feature).**
     Four audiences now sign in at the same place: Aptus staff and
     contractors, client developers, DNOs (electric DNOs, gas
     transporters, water undertakers) and IDNOs (IDNOs, iGTs, NAVs).
     Migration **0218**: `Portal_Access`, `Milestone_Type`,
     `Project_Milestone`, `Portal_Document`.

     ⚠ **The square is a signpost, not a permission.** Pressing "Client
     Developer" grants nothing. After sign-in the app asks
     `/portal/me`, and the AUDIENCE RECORDED AGAINST THE ACCOUNT
     decides what opens: a staff account that pressed the developer
     square still gets the app, and a developer account that pressed
     the staff square still gets the portal. If the landing page
     granted anything, the landing page would be the security
     boundary — and a boundary anybody can walk around by editing a URL
     is not one.

     Five properties the portal endpoint holds, each with a case:
       - identity comes from the verified token, never from a body. The
         check asserts the body is not read for email, audience,
         customer or organisation;
       - a project id from a portal caller is proved against their own
         sites before anything is read, and a refusal is 404 rather
         than 403 so nobody can enumerate project numbers;
       - every document read or written is tied to the proved project
         as well as its own id;
       - storage paths are COMPOSED by the server, and a path handed
         back after an upload is accepted only if it is the one this
         endpoint would have issued;
       - a developer may upload only against what we asked for, and
         mark as reviewed only what we sent them.

     Uploads go straight to storage on a signed URL, so a large layout
     drawing does not pass through a function and time it out.

     Milestones are RECORDED, not derived: the dates live in half a
     dozen nullable places, and a portal that derived them would show a
     blank where the truth is "not yet" and a stale date where the
     truth is "changed". `Source` says where each came from, so a wrong
     one can be traced. The site view lists every milestone the
     business tracks with the reached ones filled in — a list of what
     has happened cannot tell a developer what is still to come.

     DNO and IDNO accounts are named as not built rather than dropped
     into the staff app, which would be a network owner looking at
     every developer's scheme.

     One existing check needed re-anchoring: `checkfieldqueue` asserted
     the Gate's old one-line `field ? <FieldApp /> : <Shell />`. The
     field branch is now its own early return; the property is the
     same and the case tests it in both shapes.

     **0219 and the sign-in, one round later.**

     *The door was remembered across a reload*, so somebody who had
     once pressed a square went straight to a sign-in screen ever
     after, with no way back short of clearing their storage. It is
     state within a visit now, not a preference: every arrival starts
     at the door, and both sign-in screens carry a way back to it.

     *A portal account belongs to a BRANCH.* 0218 scoped to a customer
     or an organisation, which is one level coarser than the business
     records people: an organisation has branches and a contact is
     assigned to one. "Barratt" does not sign in; "Barratt,
     Northampton" does. `Branch_ID` added, nullable — a developer with
     one office is legitimately scoped to the whole organisation — and
     a developer's sites are found through `Project_Developer` by
     branch where they have one.

     *The portal sign-in asks for organisation and branch.* Neither is
     a credential and neither is sent as a claim: the sign-in call
     carries the email and password only, and what somebody sees comes
     from the record read against the verified token. They are asked
     because it is how a contact is held, because a group with several
     offices needs to say which, and because an account with no record
     can then be told where we have them rather than shown an empty
     page. The check asserts that no organisation rides along with the
     credential — a form that could override the record would make the
     form the security boundary.

     *`portal-orgs` is OPEN*, because a sign-in screen that needed a
     session to fill its own dropdowns could never be used. It is thin
     on purpose: names of active organisations and their branches, and
     nothing about who has an account. A list of who our clients are is
     a marketing page; a list of who can sign in is not.

     *`portal-accounts` creates the Supabase auth user AND the record,
     and deletes the auth user again if the record fails.* Half an
     account is worse than none: an auth user with no record signs in
     and sees nothing, and nobody knows why. Invitation by default,
     because a password we choose is a password that lives in an email
     thread. Staff only, checked by name — this endpoint runs with the
     key that can create any account at all.

     **The role keys, confirmed from Organisation_Type.** A housing
     developer is recorded as **`customer`** — the label is "Customer
     (Housing Developer)" — which is worth knowing because "developer"
     is the word everybody uses for them and is not the key. The
     operator doors take three keys each: `dno`/`gt`/`wu`, and
     `idno`/`igt`/`iwu`.

     With the right keys the old fallback became a fault rather than a
     kindness: offering every organisation when the filter matched
     nothing would put every supplier and subcontractor in a
     developer's dropdown. An EMPTY result is now an answer — the list
     is empty and the screen says so, while still allowing sign-in,
     because an account whose organisation is missing from a list
     should not be locked out by it. Only a FAILED query falls back,
     because that means the view could not be read rather than that
     nothing matched.

     **Admin › Portal Accounts** now creates them: email, name, kind,
     organisation, branch, and an optional password. Blank password
     sends an invitation, which the screen explains where the decision
     is made rather than in a manual. The list switches an account off
     rather than deleting it — an account that uploaded documents and
     approved things is part of a site's history, and deleting the row
     would leave those actions attributed to nobody. The Supabase
     sign-in itself is removed from the Supabase dashboard,
     deliberately not from here.

     ⚠ **The three new endpoints had no ROUTE.** Netlify routes a
     function by `export const config = { path }` inside it, not by its
     filename — netlify.toml says so in a comment. Without one a
     function exists, deploys cleanly, and answers 404. The sign-in
     screen asked for the organisations, got that 404, and showed
     "None listed", which reads as an empty database: a routing fault
     wearing a data fault's clothes.

     Two fixes, and the second matters as much as the first. The
     routes are declared (`/api/portal/:what`, `/api/portal-orgs`,
     `/api/portal-accounts`), and the screen now tells a FAILED request
     from an empty list — "could not load" rather than "none listed",
     so nobody goes looking in the database for a missing line of
     routing.

     `checkportal` now audits EVERY function in netlify/functions for a
     declared route, not just the portal's: the next one added will
     have the same hole and the same silent symptom.

     ⚠⚠ **And the same routing fault exposed a FAIL-OPEN.** The app
     asks `/portal/me` to learn what an account is, and a failed call
     was caught and treated as "no portal record" — which means staff.
     So while the endpoint was unreachable, EVERY account, developer
     included, landed in the full application: a routing fault became
     an access fault, and the only reason it was not worse is that the
     accounts in question were staff members' own.

     A successful answer with no audience still means staff, because
     that is what it means. A FAILED call now refuses to route: it
     stops, names the error, and offers try-again or sign-out. Refusing
     beats guessing — the worst case that way is a staff member seeing
     "try again", where the other way round is somebody outside the
     business seeing every project on the system.

     The general rule worth taking from it: **when an authorisation
     answer cannot be obtained, that is not the same as a permissive
     answer.** Any `catch` that resolves to a default identity deserves
     this treatment.

     ⚠ **I invented project columns.** The portal asked for
     `Project_Name` and `Project_Number`; neither exists. A project is
     known by its `Site_Name` and by `Display_Ref`, which is the
     reference printed on everything a developer has had from us.
     Postgres only says so at RUN time, to whoever opens the page —
     there is no build-time error for a column that is not there.

     `checkportal` now audits the columns the portal asks for against
     the list `projects.js` maintains, which is the nearest thing this
     repo has to a schema. Any endpoint inventing a column now fails a
     check rather than a user.

     ⚠⚠ **And I nearly scoped the portal on a CACHED column.** Reading
     the project columns turned up `Project.Organisation_Branch_ID`,
     which looks like the obvious route to a developer's sites, and I
     used it. It is a cached copy of the main developer written by
     `sync_project_main_developer()` — projects.js says so beside the
     code that maintains it — and on the live data it has drifted
     badly: ELEVEN unrelated schemes all carry branch 17, including
     sites belonging to other developers entirely. The user spotted it
     immediately; the portal would have shown one developer ten other
     developers' projects.

     Scoping now reads `Project_Developer` only, which is the record
     rather than a copy of it, and a check fails if the cached column
     reappears in the scoping query.

     The rule worth keeping: **a denormalised convenience column is
     fine for a screen that staff can see is wrong, and is not fit to
     decide who may see what.** Authorisation reads the record.

     Separately, the cache itself is wrong on live data and worth
     fixing — a screen reading it is showing eleven projects the wrong
     developer.

     **The dates, from the sources the business named.** Four of them,
     and DERIVED at read time rather than copied into Project_Milestone
     by a job:

       enquiry          `Project.Date_Received`
       poc_applied      `POC_Application.Application_Date`, falling back
                        to `Submitted_Date` where the first is null —
                        both are populated on live rows, and the
                        response says which was used
       poc_quoted       `POC_Option.Date_Received` and
                        `POC_Quotation.Date_Received`
       outline design   `Project_Scope.Actual_Date`, PER UTILITY

     0218 argued for recording rather than deriving, on the grounds
     that the sources were scattered. With the sources actually named
     that argument reverses: each has exactly one, and a copy goes
     stale silently where a read cannot. `Project_Milestone` stays for
     the stages nothing records yet, which staff set by hand and which
     therefore should be a stored statement. Where both exist the
     SOURCE wins: a hand-entered date that disagrees was typed before
     the system knew.

     **Outline design is one line per utility**, not one for the site.
     A single date would have to mean "all of them" or "any of them"
     and could not say which, and a site with gas and electric is owed
     both.

     **POC options and quotations are shown whole.** An application
     draws several options and each option several quotations, so it is
     a tree rather than a date — collapsing it would hide that three
     arrived and one was chosen, which is the part a developer is
     waiting on. `POC_Quotation` carries no project, so the tie to the
     site is through the options, which are already proved; a check
     asserts that filtering happens, because without it one site's page
     lists another's quotations.

     ⚠ **And the enquiry date did not appear, because it was never
     SELECTED.** `Date_Received` was derived from and left out of
     `PROJECT_COLS`, so it arrived undefined and the stage showed "to
     come" on every site. Recurring fault 4 in a new place — a column
     absent from a function's select list is neither saved nor
     returned — and the symptom is silence rather than an error, which
     is what makes it worth a check rather than a memory.

     `checkportal` now asserts that every field read off a project row
     appears in the list the query asked for.

     Twice while writing that check, the check failed on its own
     explanation: the first version read the comment INSIDE
     `PROJECT_COLS` as column names, and the second read a quoted
     phrase within that comment. A static check that parses source has
     to strip comments before it parses, and the lesson generalises —
     if a check is failing on words rather than code, it is reading
     prose.

     **The progress page became a TREE on two tabs** (Pre Contract,
     Site Build), to a mockup: nested stages with a RAG dot each, the
     upload action on the line that asks for the document, and the POC
     branching per utility into applications, options and quotations.

     Three decisions in it worth keeping:

       - **a parent's colour is computed, never claimed.** The server
         rolls children up: all done → done, some done → doing, none
         done → waiting. A parent asserting it was done over an
         outstanding child would be the page lying about itself.
       - **grey is not red.** A stage nothing records \u2014 "invoice
         paid", today \u2014 is grey and says "not recorded yet". Red
         means "not done", and claiming that about something we cannot
         see would put a developer on the phone about nothing.
       - **the team is named.** "Team assigned" without the names is a
         date about strangers; the project already holds the project
         manager, estimator and account manager, with their email and
         telephone, and the developer's next question is who to ring.
         (This answers the question on the mockup: yes.)

     Site Build is an empty tab that says so, rather than being hidden:
     a developer should see the stage exists.

     **Restructured again, to the business's own order:** Enquiry,
     Documentation, Team assigned, POC, Outline Design, Quotation,
     Contract Design. POC sits ABOVE the design because that is the
     order the work happens in and the order a developer asks about it.
     Outline Design and Contract Design are headers with a utility
     branch each, and five stages under every utility: designer
     assigned, design started, design completed, sent to client,
     approved by client.

     **Every stage is shown, and an undated one is GREY.** Red used to
     mean "no date" and now means one thing only: a document we have
     asked THEM for and not received, which genuinely is outstanding
     and which they can act on from that line. Red on a stage nothing
     records would have a developer ringing to ask why it had not
     happened, when the honest answer is that we do not track it.

     Sources today: design completed (`Actual_Date`), sent to client
     (`Date_Sent`), designer assigned (`Designer_ID`, shown by name).
     Design started, approved by client, all three Quotation stages and
     every Contract Design stage have no source and are grey.

     ⚠ **And the rollup was wrong in a way that would have mattered.**
     The first version ignored unknown children when colouring a
     parent, so a design branch with two stages recorded and three
     untracked came out GREEN — "Outline Design complete" over an
     approval nobody has. A parent is finished when its children are
     finished, and an unknown child is not a finished one. Green now
     requires every child done; anything between is amber.

     The `indexOf` trap appeared a third time while checking the
     section order: -1 for absent is less than any real position, so an
     order test alone passes when a section is missing entirely.
     Presence first, then order.

     **Still to do:** the remaining stages have no source yet
     (accepted, detailed design, adoption, works start, energised,
     complete) and need either a source naming or a staff screen; and
     the DNO and IDNO portals.

145. **The canvas lost its position when the tab came back.** Reported
     as "I move away from the browser and return, and the GIS Canvas
     refreshes and I lose the zoom".

     `view` is component state, so anything that unmounts the page puts
     somebody back at the default corner of a site they were working in
     at 1:200. I could not pin the remount statically — the visibility
     listener in AuthContext only bumps an idle timer, and lazyPage's
     reload only fires on a stale chunk at import — and the honest
     reading is that the cause is various and mostly outside this page:
     a browser discarding a background tab, a deploy swapping the chunk
     underneath, an error boundary.

     So the answer is to remember the answer. `gisView:<projectId>` in
     the session store, restored when the project changes (which
     includes a remount), written on a 400ms delay because a pan is a
     hundred view updates and a hundred serialisations for one gesture.

     Three guards on the way back IN, which is where a remembered value
     can do damage: the scale is clamped to the same 0.05–40 the rest
     of the page uses, every field is checked for being a finite
     number, and a value that is neither is ignored rather than setting
     the view to NaN — which draws nothing and reads as a broken
     canvas.

     Per project and in the session store deliberately: where somebody
     was looking is not a fact about the scheme, and should not follow
     them to another machine or be inherited by a colleague opening the
     drawing. `checkviewmemory.mjs`.

     If the underlying remount is ever worth chasing, the thing to
     instrument is whether GISCanvasPage's mount effect runs on tab
     return — that distinguishes a remount from a re-render, and the
     two have completely different causes.

146. **The audience landing page now looks like the section one**, and
     its four buttons sit in a two-by-two square rather than a row.

     These are the two screens somebody sees before they are anywhere:
     one asks who you are, the other what you came to do. Styled apart
     they read as two products; styled alike they read as one door with
     two questions behind it. The audience page had its own flatter
     squares — a hairline border, a grey wash, left-aligned text — and
     now carries the section page's: a true square by aspect-ratio, the
     2px border in the area's own colour, the same hover lift and focus
     ring.

     The grid is `repeat(2, 1fr)` rather than auto-fit. Four across a
     wide screen is a row to read along; two-by-two is one shape the
     eye takes in at once. It still collapses to a single column under
     560px, where a two-column square is two narrow boxes.

     **The CSS is copied, not shared**, because the original keeps its
     own inside its component and lifting it into a stylesheet was a
     bigger change than this warranted. A copy drifts unless something
     watches it, so `checkportallanding.mjs` compares the rules the two
     pages share and fails if any differ — with one deliberate
     exception, the column layout the audience page needs for its
     blurb, which the check strips before comparing.

     If a third page ever wants these squares, that is the moment to
     lift the CSS out: two copies is a coincidence, three is a pattern.
     That check should be deleted then, not worked around.

     It also asserts there are still FOUR audiences, since a two-by-two
     only reads as a square with four — a fifth leaves an orphan on a
     second row and the grid needs revisiting.

147. **Portal contacts: a third scope, and a hazard found on the way.**
     Asked for three tiers, of which two already worked: an
     organisation contact sees every branch's sites, a branch contact
     sees that branch's. The missing one is the narrowest — a contact
     there for ONE scheme.

     Migration **0223** adds `Portal_Access.Project_ID`. Null means the
     row is scoped as before, so no existing account changes.

     **The narrowest is a CEILING, not a floor**, and this is the part
     worth defending. A project-scoped row also names the organisation
     the project belongs to — because that is who the contact IS — and
     reading that as a grant too would turn the narrowest scope into
     the widest. `mine()` returns the project and stops, BEFORE the
     customer and organisation passes, and the check asserts the
     ordering rather than merely the presence of the line: after them
     it would collect the whole group's sites on the way past.

     Sites are offered in the admin from `Project_Developer` — the same
     record `mine()` reads — so the list offered and the list granted
     cannot disagree. Neither reads `Project.Organisation_Branch_ID`,
     the cached copy portal.js already warns about at length.

     ⚠ **Found while doing it: the Portal Accounts screen's
     organisation and branch dropdowns were probably empty in the live
     app.** It called `adminList("Organisation")` and
     `adminList("Organisation_Branch")`, and NEITHER table is in the
     admin endpoint's allow-list — so both requests were refused and
     both failures were swallowed by `.catch(() => {})`. An empty
     dropdown reads as "there are no branches", which is a different
     thing from "that request was refused" and wants something
     different done about it. The screen now reads `portal-orgs`, which
     is the endpoint built for this, and SAYS when a lookup fails.

     The general point: `.catch(() => {})` on a lookup turns a refusal
     into an empty list, and an empty list is a plausible answer. Worth
     grepping for elsewhere.

     **And the sign-in now asks for the credential only.** It used to
     ask for the organisation and the branch first — and the code
     admitted, in a comment beside its own submit handler, that they
     were "a convenience, not a claim": never sent, never checked. Two
     questions before the two that matter, and a dropdown of every
     organisation on the system that somebody had to find themselves in
     before they could type a password. Worst for the case they were
     meant to help, a contact at two branches, who had to choose one in
     advance and then wonder where the rest went.

     What the account may see was always settled server-side by its
     Portal_Access row. Now the portal SHOWS it once they are in:
     `sites` returns each site's branch (from Project_Developer, not
     the cached column — a wrong label would tell a developer that
     somebody else's office runs their scheme), and the list is grouped
     under a heading per branch when there is more than one. One branch
     or one site gets no headings, because a single heading over a
     single list is furniture, and a site whose branch is not recorded
     is grouped under "Other sites" rather than dropped: a scheme
     somebody can see, missing from the page with nothing to say why,
     is the worst outcome available.

     ⚠ **And I left `))}` on the page.** Lifting the site card out into
     its own function left the old list's closers behind, and a `))}`
     on its own line is not a syntax error — it is a JSX TEXT node, so
     React printed it beside the panel. The build passed and nothing
     warned. Twice this session, both times after code was lifted out
     of a `.map` into a function.

     `checkjsxclosers.mjs` now catches the shape: a line of nothing but
     closing parens immediately after a line that already ends `)}`. A
     genuine closer never follows one of those — it follows the thing
     it closes. Zero hits across 114 files and it reproduces the real
     bug, which is the test a heuristic has to pass before it earns a
     place: a first attempt flagged three innocent `}}` lines and was
     narrowed rather than shipped.

     **A client door opened the staff app.** Reported as "I sign in at
     the Developer portal with a test address and land in the staff
     app". `/portal/me` answers with no audience when the account has
     no `Portal_Access` row, and NO ROW MEANS STAFF — which is right,
     because staff have no portal record and there are far more of
     them. It also meant any account without a record walked through
     the client door into the whole internal application.

     Not an escalation: it took staff credentials to do it, and the
     server still scopes every portal request by the record. But a door
     that promises one thing and delivers another is wrong on its own
     terms, and it makes testing the portal with your own login
     impossible. A client door now only ever opens a client portal; an
     account that turns out to be staff is told so and signed out, with
     the way back offered.

     The reverse is deliberately NOT guarded: staff signing in at the
     staff door while also having a portal record is somebody's own
     account, and the record says what they may see.

     **Then: an address that DOES have a record still landed in the
     staff app.** Three faults in `accessFor`, found by reading it
     rather than by guessing:

       - **`Project_ID` was not on the select list.** Mine, from 0223 —
         and the comment four lines above it records the same fault
         (recurring fault 4): a column not selected comes back
         undefined and goes QUIET. Every site-scoped contact would have
         been silently widened to their whole branch.
       - **`maybeSingle()` fails when an address matches more than one
         row**, and more than one is reasonable: a contact at two
         branches is the case the sign-in was just rebuilt around. It
         surfaced as "we could not work out which portal this account
         belongs to", which reads as a broken account rather than a
         duplicate record. Now: active rows, narrowest scope wins —
         site, then branch, then organisation, the same order `mine()`
         resolves in.
       - **The audience was returned as typed.** The app routes on an
         exact match, so an `Audience` of "Developer" routed nowhere
         and fell through to staff. Normalised to lower case on the way
         out.

     Any one of those explains the report; the third is the likeliest.
     Worth checking the row itself before assuming it is fixed.

     **And the row was not there at all** — which turned out to be the
     answer, and pointed at a different fault. `portal-accounts`
     CREATES an auth user, and creating one fails when the address
     already has a sign-in. It often does: a staff member given access
     to a client's site, a contact set up for another audience, anybody
     ever invited. The whole request then failed and NOTHING was
     recorded — and the failure looks exactly like success from the
     outside, because the person can still sign in with the credentials
     they already had, and lands wherever an account with no portal
     record lands.

     An existing sign-in is now reused rather than treated as an error:
     the account exists, and what this endpoint is actually for is the
     record that says who they are to us. The rollback was narrowed to
     match — a failed insert must not delete an auth user this request
     did not create, or a portal record failing would take away
     somebody's staff login.

     The shape worth remembering: an operation that half-succeeds and
     reports nothing is worse than one that fails loudly, and "they can
     sign in" is not evidence that setting them up worked.

     **And the real answer, which none of the above was:** the contact
     had been added under Organisations › Branches & contacts, which
     writes `Organisation_Contact` — a different table from
     Portal_Access entirely. Everything the portal needed was already
     recorded; it was simply looking somewhere else.

     So (0224) **a contact IS a portal identity.** `Organisation_Contact`
     gains `Organisation_ID` and `Project_ID` beside its existing
     branch, giving the three scopes asked for at the start; existing
     branch rows have their organisation backfilled. `portal.js` falls
     back to the contact list when there is no explicit grant, with
     scope narrowest-first and the audience taken from
     `Organisation_By_Role` — the view the rest of the app reads, so
     "is this a DNO" keeps one answer.

     One guard, and one that was withdrawn:
       - ~~**Staff are excluded.**~~ Added on the reasoning that our own
         people are often contacts on an organisation, so reading that
         as portal access would take a staff member out of the
         application. WITHDRAWN: the business says an address will
         never be both, and the guard was keeping a genuine contact out
         of a portal they were plainly entitled to because somebody had
         made a `Person` row for them. A `Person` row is made for all
         sorts of people.

         Between the two I built a third thing — a `door` parameter on
         every portal request, so somebody who was both got whichever
         identity they had asked for. It worked, and it was machinery
         for a case that does not arise, needing a parameter on six
         calls that would fail quietly on the one somebody forgot. Also
         withdrawn. The check asserts the staff test stays ABSENT, so
         the decision is on the record rather than looking like a gap:
         if the two ever overlap, the contact wins and that address
         opens the portal.
       - **An organisation with no portal-serving role yields nothing.**
         Guessing "developer" would show a subcontractor a developer's
         schemes.

     **Then the order was reversed, at the user's direction.** Access
     comes from three places and only three:

       - a contact of an ORGANISATION — every site of every branch;
       - a contact of a BRANCH — that branch's sites;
       - a STAKEHOLDER on a project (`Project_Contact`) — that scheme,
         whatever else they are.

     The contact list is asked FIRST and `Portal_Access` after it, as a
     legacy grant for accounts made before this. Nothing creates one as
     the route in any more. The reasoning is the one this whole episode
     demonstrated: two lists to keep in step is what nobody does, and a
     contact was added while the portal knew nothing about them.

     A stakeholder names no company, so their audience comes from the
     SCHEME's developer, through `Project_Developer` — the record, not
     the cached column. A scheme with no developer recorded yields
     nothing rather than a portal opened on a guess.

     Worth noting the shape of this particular fix: the list somebody
     maintains while running a job is the list that should decide who
     can watch it. Access that has to be granted separately is access
     that will be forgotten.

     Two cases in `checkportal.mjs` asserted the old form and were
     rewritten, not deleted — one required the organisation and branch
     fields, the other required the sign-in to distinguish a failed
     lookup from an empty one, which is now the admin screen's job
     because that is where the lists went.

148. **The app threw the page away every time somebody returned to the
     tab.** Reported twice: first as the GIS canvas losing its zoom,
     which I patched by remembering the view (145) while saying I could
     not find the cause; then as "every page refreshes when I come
     back", which is the same fault seen plainly.

     The cause, found by reading rather than guessing:

       1. Supabase fires `TOKEN_REFRESHED` whenever a tab regains
          focus, and `onAuthStateChange((_e, s) => setSession(s))` gave
          React a NEW session object each time.
       2. App's routing check depends on `session`, so it re-ran and
          set `asking`.
       3. `if (asking || !who) return <Loading/>` — and that return
          UNMOUNTS THE WHOLE TREE. Whatever page somebody was on was
          destroyed and rebuilt empty.

     Two lines. The session is now replaced only when it is a different
     SESSION — a different user, or signed in versus signed out — and a
     token refresh keeps the object it had. Nothing reads the token
     from the context (the api client asks Supabase per request), so
     there is nothing to go stale. And the Loading screen is shown only
     while the answer is not yet KNOWN, not while it is being
     re-checked; a re-check happens behind whatever is on screen,
     because there is already an answer and a refreshed token does not
     change it.

     `asking` was then written and never read, so it is gone: an unread
     flag is one somebody eventually puts back into a render.

     Two lessons worth keeping. **A `return` in a component body is an
     unmount**, not a placeholder — anything above the thing that
     renders the page can destroy it. And when a symptom is "it
     refreshes", the question to ask first is what changes IDENTITY on
     the event, not what re-renders: re-rendering is cheap and
     invisible, and remounting is what loses work.

     Fault 145's stored view is still worth having — it survives a real
     reload, which this does not address — but it was a plaster over
     this. `checktabreturn.mjs` holds both halves.

149. **Date Received was on the Add form and nowhere else.** Set when a
     project is created and then invisible on the Details tab, so a
     date typed wrongly on the way in could never be corrected — and it
     is the date the KPI clock runs from.

     Added at the left of the reference row, before the AP number:
     first of the three because it is the first thing that happened, an
     enquiry arrives and the references follow when they are issued.
     Nothing else was needed — `Date_Received` was already writable by
     the projects endpoint, so only the field was missing.

     `checkdatereceived.mjs` holds its presence, its position relative
     to the AP number, that it is a date input rather than free text,
     and that its value falls back to "" rather than null (a date input
     given null warns and then refuses to be typed into).

150. **Portal header: the developer, its branch, and a metric card.**
     The page now names the company and office it is showing —
     "Barratt Homes (Yorkshire East)" — above a quieter "Your sites",
     with a card counting the projects. The name is the heading; the
     list's label is the label. It was the other way round, which made
     every developer's portal look identical at a glance. An
     organisation-level contact sees the company alone, rather than an
     office they are not at.

     The count is taken from the sites already returned, not asked for
     separately: a second request can disagree with the list it sits
     above.

     ⚠ **Two faults in one small change, both mine, both silent:**
       - I reused `.pt-who`, which this file already uses for the
         signed-in person's name in the top bar. The later rule wins,
         so a 24px bold heading landed on that too. A class name is a
         name: two things called the same thing ARE the same thing to a
         stylesheet. Renamed `.pt-org`, and a quick scan says no other
         duplicate class rules exist in that file.
       - I wrote backticks inside the CSS TEMPLATE LITERAL while
         explaining the rename. A backtick ends the template; the build
         still passed, and `checkscope` was what caught it. Never quote
         code with backticks inside a template string.

151. **Enquiry sheet: schema only (0225).** Form, question, option,
     submission, answer. Branching lives on the OPTION — "if Yes, jump
     to 5" is a fact about the answer — so a question with four choices
     sends four ways with no rules engine. Forms are versioned and
     answers keep the question text as asked, because an enquiry
     answered last month was answered against the questions as they
     were then. Deliberately no compound conditions: that is a rules
     engine and they all end up needing a debugger. The admin designer,
     the developer-facing form and the New enquiry button are still to
     build, deliberately held until the schema is confirmed.

150. **Enquiry sheets — and a schema I duplicated because I did not
     look.** ⚠ Read this before adding any table.

     `Enquiry_Form`, `Enquiry_Question`, `Enquiry_Option`,
     `Enquiry_Answer` and `Enquiry_Submission` ALREADY EXISTED in the
     live database, built outside the migrations folder — so nothing in
     the repository showed them, and I grepped the repository. I wrote
     a second design for the same thing.

     `CREATE TABLE IF NOT EXISTS` then did the worst available thing:
     silently skipped every table that existed, created the two that
     did not, and left the schema half one design and half another. It
     surfaced as "column Enquiry_ID does not exist" from an index,
     which says nothing about the actual problem.

     **The lesson: this database is ahead of its migrations folder.**
     Several migrations are missing from the repo (0052, 0163, 0198,
     0208, 0210 among them), so the folder is evidence of what we
     wrote, NOT of what exists. Before creating a table, ask the
     database:

         SELECT table_name FROM information_schema.tables
          WHERE table_name LIKE 'Thing%';

     And prefer `CREATE TABLE` over `CREATE TABLE IF NOT EXISTS` when
     the table is supposed to be new: failing loudly on a name clash is
     the behaviour wanted, and IF NOT EXISTS turned a clash into a
     corrupt half-migration.

     The existing design is kept and is better in one respect worth
     noting: `Enquiry_Answer` snapshots `Question_Text` onto the
     answer, so an old enquiry reads in its own words without keeping
     every version of the form. It also holds the section as TEXT on
     the question rather than as a table, uses `Kind` for the answer
     type, `Is_Live` for the form in use, `Ends_Form` on an option, and
     `Is_Active` to retire rather than delete.

     0225 is now a guarded CLEANUP: it drops the section table I
     created, and drops `Enquiry` / `Enquiry_Attachment` only if they
     are EMPTY — a table with rows in it is somebody's data until
     proven otherwise.

     **And it had no layout at all.** The screen used `gs-grid` and the
     `.fld` rules from the GIS Styles admin — and that CSS is INJECTED
     BY THAT COMPONENT. With it unmounted the rules do not exist, so
     every control stacked with no grid and no spacing. Third time this
     has bitten (the section dialogue's `.sch` was the second): **a
     class defined inside another component's stylesheet is not a
     shared class.** Only `src/styles.css` is shared.

     The screen now carries its own CSS, with room deliberately between
     things: a sheet is edited by reading down it, and rows with no air
     between them read as one run-on, so which help text belongs to
     which question stops being obvious — the one thing this screen has
     to get right.

     A quick survey for other borrowings found none that matter:
     PortalLogin and AudienceLanding each define their own copies of
     the names they share with LoginPage and HomePage. Worth repeating
     the survey if a screen ever looks unstyled: the question is
     whether the file that USES a class also defines it, or whether it
     is relying on some other component being on screen.

     `EnquiryFormsAdmin` is written to the real columns.
     `checkenquiryform.mjs` asserts the wrong names never come back:
     a screen written against `Answer_Type` when the column is `Kind`
     saves nothing and says nothing.

151. **Enquiry sheets (feature, part one).** A developer starts an
     enquiry by filling in a sheet whose questions WE set, without a
     deploy: they differ by utility, they change when a NAV changes
     what it wants, and the person who knows what to ask is not the
     person who can ship code.

     0225 holds the questions, 0226 the answers, and they are separate
     on purpose: a submitted enquiry outlives the form it was answered
     against. Forms are VERSIONED and a new version is a COPY —
     rewording a question must not rewrite what somebody already said,
     and "what did we ask them in March" has to have an answer.

     Answers settled by the user: one sheet per utility; an enquiry
     belongs to the BRANCH (the person who typed it may leave, be
     covered, or send on somebody's behalf); and nothing becomes a
     project by itself — somebody here accepts it, because that
     decision creates work, a reference and a place in a pipeline.

     **Branching lives on the OPTION.** `Next_Question_ID` /
     `Next_Section_ID` say where an ANSWER leads; both null means carry
     on. A jump is a property of the answer given, and every other
     arrangement — a rules table keyed on question and value, an
     expression on the question — re-derives which answer it was.

     **Forward only, by construction.** The editor offers as jump
     targets only the questions that come AFTER, so a loop is
     unrepresentable rather than detectable. A form that can send
     somebody backwards can send them round, and a loop in a form
     somebody is filling in is a trap with no way out. Cheaper to make
     impossible than to detect.

     `Chosen` on an answer holds option IDs, not labels: rewording an
     option must not rewrite what somebody chose.

     ⚠ Process note: the edit registering the four tables in the admin
     endpoint anchored on text I had changed earlier in the session and
     silently did nothing. The check caught it. A `python` replace
     without an assert is a no-op waiting to happen, and I have done
     this twice today — assert every anchor.

     **Flow logic built (`enquiryFlow.js`).** Pure: questions, options
     and the answers so far in; the path, the current question and
     whether the sheet is complete out. The renderer will draw what it
     decides, which is what lets branching be tested without a browser
     or a database — `checkenquiryflow.mjs` does exactly the case that
     was asked for ("if Yes, skip 4 and jump to 5") and seven others.

     Decisions in it worth keeping:
       - A jump comes from the OPTION first, the question's own
         `Next_Question_ID` second, the order last. The answer is more
         specific than the question.
       - For a multi-choice, the first CHOSEN option in the SHEET's
         order that carries a jump decides. A single answer cannot lead
         two ways, and the order somebody happened to tick them in is
         not a rule anyone could rely on.
       - An unanswered question leads nowhere, so a half-filled sheet
         shows exactly as far as somebody got rather than guessing.
       - Only questions ON THE PATH can be missing. A question the
         answers jumped over was not asked, and judging completeness
         against the whole sheet is how a branching form becomes
         unsubmittable.
       - `pathOf` refuses to visit a question twice. The editor cannot
         build a loop, but a hand-edited sheet could, and a form that
         hangs has no way out for the person in it. (Note: deleting
         that guard makes the CHECK hang rather than fail — the one
         case in this suite that reports by timing out.)

     **The renderer and submission are built**, against the real
     columns read from the database: `Enquiry_Submission` is
     (Form, Organisation, Branch, Submitted_By, Submitted_At, Project,
     Status) and `Enquiry_Answer` holds `Question_Text`, `Answer_Text`
     and `Storage_Path` — one text answer per question, no typed
     columns.

     How it works and why:
       - The sheet is served WHOLE and the branching decided on the
         client by `enquiryFlow`. A round trip per question makes a
         form that stutters on a site-office connection.
       - The sheet offered is the live one for the account's AUDIENCE,
         or one published for everybody. Never another audience's: a
         developer asked a DNO's questions would answer them, and we
         would hold the wrong information in a form nobody can tell
         from the right one.
       - The submission's branch comes from the ACCOUNT, never the
         body. A caller who could name their own branch could file
         against somebody else's office.
       - Only questions that were ASKED are sent. An empty answer
         against a question somebody was never asked reads later as a
         refusal to answer.
       - A choice is stored as its LABEL. The answer has to read beside
         its question years from now, and an option id needs the option
         to still exist and still be worded the same.
       - One question at a time on screen, with what has been answered
         above it. Showing them all would mean showing questions
         somebody may never be asked, then taking them away.

     ⚠ **The form advanced as somebody typed.** `currentQuestion` reads
     "has a value" as "answered", which is right for working out where
     an answer LEADS and wrong for deciding when somebody has finished
     giving it: the first letter typed into a text box counted, and the
     form jumped to the next question mid-word.

     The renderer now holds the current question explicitly (`here`)
     and moves on a Next press, following the same jumps. Back returns
     to the last question answered and keeps its answer. Send appears
     only when there is no current question, rather than sitting
     disabled beside one still being answered.

     The general shape: a pure function that answers "where does this
     lead" cannot also answer "is the person finished". The second is a
     fact about the interface, and reading it out of the data made
     every keystroke a decision.

     Dates in the portal read **dd-mmm-yy** (18-Sep-26): unambiguous on
     a page read in several countries, short enough for a line of text,
     day padded so a column lines up. Months come from a fixed list
     because `en-GB` renders September as "Sept" — four letters where
     every other month has three. A date ANSWER is stored in that form
     too, because it is read beside its question by whoever picks the
     enquiry up, and an ISO date in a sentence reads as a reference
     number.

     The radio and checkbox rows use the portal's own `pt-check`. They
     had `fe-check`, which is defined inside the FEATURE EDITOR's
     injected CSS — fourth instance of that pattern today — so in the
     portal it was a label with no gap and the words sat against the
     button.

     ⚠ And a booby trap worth knowing: a backtick inside a comment in
     one of these CSS template literals ENDS THE STYLESHEET mid-rule.
     Writing `fe-check` in prose broke the build with "Expected ; but
     found fe", which points nowhere near the cause.

     **Attachments are NOT built.** A `file` question renders a plain
     line saying we will ask for the document, rather than a control
     that looks ready and does nothing. `Storage_Path` on the answer is
     where it will go.

     **The queue is built** (Business Development › Enquiries,
     `enquiries.js`, 0227). It was briefly in Admin, and moved at the
     user's direction: an enquiry is WORK NOT YET WON, which is what
     that section is for, while Admin sets up the SHEET — the questions
     asked — which is a different job done by different people. The
     navigation already had an `enquiries` item marked `soon`, so the
     move was a matter of building it out rather than adding a menu
     entry.
     List on the left, the enquiry beside it, Accept or Decline.

     0227 adds `Decided_At`, `Decided_By` and `Decision_Note` — the
     table held what was decided but not who, when or why, which are
     the three things asked about a decline months later when the
     developer comes back. `Decided_By` is an EMAIL rather than a
     Person_ID: a decision outlives an employment, and a name that
     stops resolving is worse than a plain address that still reads.

     Decisions in it:
       - **Staff only**, behind `withAuth`. A portal account reaching
         it would see the whole business's pipeline. Note `withAuth`
         passes the user as the THIRD ARGUMENT, not on the context —
         taken from the context it is undefined and every decision
         records nobody.
       - **Decided once.** A second decision is refused with a 409
         rather than overwriting a colleague's answer and the date they
         gave it.
       - **Answers are read with `Question_Text`**, never joined back to
         the live questions: that would show today's wording against
         last spring's answers.
       - **Accepting LINKS a project, it does not make one.** A project
         needs a reference, a customer and a branch decided by rules
         this endpoint does not know, and a wrong project is worse than
         a missing link. The field is optional, so an enquiry can be
         accepted now and joined up after.
       - Waiting work sorts first; decided enquiries stay, because
         "what did we say in April" is asked as often as "what is new".

     **Still not built: attachments.** A `file` question says plainly
     that we will ask for the document. `Enquiry_Answer.Storage_Path`
     is where it goes, and the portal's existing document upload is the
     pattern to copy.

44. **Length_m had two writers and one meaning too few — CLOSED.**
    `gis_length_trg` maintains it from the geometry on every change; the
    Feature Editor offered the same attribute as a "Measured length"
    override. Both were doing what they were written to do, and the
    result was that **every line arrived carrying a measurement equal to
    its drawn length**: labels read "299.8 m entered" about their own
    geometry, the panel announced that calculations read 299.8 m instead
    of the drawn 299.8 m, and a genuine measurement would have been
    overwritten by the next drag.

    Two columns, since it is two facts. `Measured_Length_m` is written
    by a person and by nothing else, so its presence means what it says.
    `Length_m` goes back to being the trigger's own mirror of the
    drawing — the bill of materials reads it in SQL and is untouched;
    **nothing in the client reads it any more**, which `checkmeasuredlength`
    holds across all seven GIS modules.

    The drawn length is computed from the geometry every time and never
    stored. That is what makes a line rubber-banded by a joint or a
    meter being dragged show its new length as it moves — a stored
    figure is a snapshot of where the line used to be.

    `lengths.js` holds all of it. The rule had been written out in eight
    places (`electric.js` twice, `feeder.js` three times, `routing.js`,
    `gasNetwork.js`, `waterNetwork.js`, the canvas label), which is why
    it could be half-right for years.

    **No migration, deliberately.** Every `Length_m` on a drawing today
    was written by the trigger and equals the drawn length, so ignoring
    it changes no figure. If anybody had genuinely measured a line, that
    entry reverts to the drawn length and must be typed again — there is
    no way to tell one from the other, which was the fault.

    **And a measured line that is redrawn asks.** A measurement is a
    deliberate statement about the world, so it does not move when the
    drawing does — but once the line is not the line that was measured,
    only the person who entered it can say which of three things they
    meant. Keeping it silently leaves a stale figure every calculation
    trusts; clearing it silently throws away something somebody went out
    and measured. Both are worse than asking, so it asks: keep, remove,
    or update to a figure they type.

    Watched over `features` rather than hooked into the ten places that
    save geometry — an effect catches all of them, including undo, and
    cannot be forgotten by the eleventh. The baseline is a ref, moved on
    whether or not anybody answers, or the comparison stays true and the
    dialog returns on every render. No backdrop dismissal: dismissing
    would silently pick one of three different answers.

    Nothing is written on "keep" — the measurement is already what it
    should be.

    The trigger body is still not in the repo and did not need to be:
    the fix works whatever it does, because the client no longer reads
    the column it writes.

    **And redrawing a line that carries one asks.** A measurement is a
    statement about the world, so when the line moves the app cannot
    know what was meant: the run may be unchanged and the drawing merely
    tidied, or the run may be the thing that just changed. Keeping it
    silently leaves a stale figure every calculation trusts; clearing it
    silently throws away something somebody went out and measured. Three
    answers — keep, remove, update — and no fourth way out of the
    dialog, because dismissing it would silently pick one of three
    different designs.

    Watched by an effect over `features` rather than hooked into the ten
    places that save geometry. It catches all of them including undo,
    and cannot be forgotten by the eleventh. Gated on `drag.current`
    (mid-drag the length is still moving) and on a centimetre of
    tolerance (a round trip through the database is not a redraw), and
    the new length becomes the baseline whether or not anybody answers,
    so a line is asked about once per redraw.

152. **Text notes on the drawing (0228).** Free text somebody writes on
     the plan, moved, resized, coloured and given a leader that points
     at what it is about. A point feature, role `textnote`, on the
     `annotation` layer — which is what 0215 made that layer for, in
     as many words.

     **The words are the `Label`.** Not a column and not an attribute
     of their own: the DXF export writes a point's Label, the search
     box reads it and a schedule lists it, so text held anywhere else
     would have been invisible to all three and would have had to be
     added to each. The cost of that decision is that every pass which
     ALSO writes a point's Label has to skip a note — the canvas, the
     sheet's label pass and the DXF label pass all do, each saying why.
     Miss one and the note is drawn twice: properly, and again as a
     single unwrapped line of label-sized text over the top.

     **One wrap, in `textNotes.js`.** The canvas measures glyphs with
     `ctx.measureText`, the sheet with pdf-lib's metrics and CAD with
     whatever the reader is set to. Three measurers wrapping one note
     three ways is a note somebody sized against the wrong one, so the
     wrap is a deterministic per-character table here and all three
     read it. Being a few per cent out everywhere in the same way is
     worth more than being exact in one place and different in the
     others; the padding absorbs it.

     **Everything is in metres of ground** — text height, wrap width,
     leader — like the section mark's two-metre bar and for the same
     reason: the drawing is printed to scale, and a note sized in
     pixels or points is a different size on every sheet. The editor
     quotes the height in millimetres at 1:500 beside the box, because
     "1.2" is not a size anybody can picture.

     **Two handles, because they are two intentions.** The right edge
     re-wraps at the size the letters already are; the bottom-right
     corner scales the note and its wrap together, so a note made
     bigger is the same note bigger rather than the same note
     re-flowed. Not one handle with a modifier key: a modifier that
     changes what a handle does is a thing nobody discovers.

     **The leader is not snapped**, alone among things placed by hand.
     A note points at a gap, a corner, or ground with nothing drawn on
     it yet, and a point that jumped to the nearest cable would be the
     drawing deciding what the note meant. The note itself is placed
     without a snap too, for the matching reason: every other hand
     placement belongs ON something and refuses a click in open
     ground, and a note belongs in the space BESIDE the work, which is
     where there is room to read it.

     It is drawn in a pass of its own after everything, like the span
     nodes, and picked up anywhere on its plate — its geometry is the
     top-left corner, which is the one part of a note nobody aims at.
     No Layer dropdown in the editor: moving one onto a utility layer
     re-makes the fault 0215 fixed, since Print to Scale hides the
     trench deliberately.

     On its own **Annotation** menu rather than a utility's, which is
     also where 0215's other three — north points, revision clouds,
     detail bubbles — would go.

153. **The bill counts the writing on the drawing.** Found while adding
     notes, and older than them. `gis_bom` counts every point whose
     role is not on an exclusion list, and that list had never been
     told about annotation.

     **Text notes are off it (0229).** That migration changes no
     existing figure: 0228 is what makes a note possible, so on the day
     0229 runs there are none.

     **Cross-section marks are still on it, and that is open work.**
     A `sectionmark` bills as "Sectionmark 2 no." on every project where
     somebody placed one, and has since 0214 shipped. Correcting it
     removes rows from bills that have already been issued and drops
     the totals beneath them — a visible change to a document people
     have read, which is a commercial decision rather than a
     developer's. It is one line when somebody makes it: add
     `'sectionmark'` to the exclusion list in the `points` CTE, in a
     migration of its own so it can be dated and pointed at. 0229's
     head carries the change and the query for seeing which projects it
     would affect.

     `checkbomroles` records it rather than asserting it. A check that
     fails until somebody does what it wants is a check that gets the
     migration written to silence it, and this one wants a decision
     instead.

     The shape of the fault is worth more than the fault: a rule that
     works by an exclusion list is silently wrong about everything
     added after it was written. Nothing failed, nothing threw, and the
     only way it would have been found is somebody reading a bill and
     wondering.

154. **The Aptus Calc Sheet, and the two terms the volt drop was
     missing.** Electric › Aptus Calc Sheet: the submission sheet laid
     out to match the SUBMIT worksheet of the Aptus volt drop workbook,
     one row per leg of main walked out from the point of connection.
     `submitSheet.js` lays it out, `calcSheetRows.js` reads the
     drawing, `AptusCalcSheet.jsx` is the panel, and the arithmetic
     underneath is `legVoltDrop` — the same one the levels check uses,
     because a page that worked its own volt drop out would be a second
     answer to a question already answered.

     **`blockKva` and `groupKva` were missing from `legVoltDrop`.** The
     spreadsheet adds a per-section block load and a flat 8 kVA small
     group allowance to every section carrying customers. On Fox Covert
     Ln that made this app read 4.09% where the sheet reads 4.67% —
     under by 0.58 points, ALWAYS in the direction that makes a design
     look further from the limit than it is. Nothing failed and both
     figures looked reasonable; it was found by running the app's own
     function over the workbook's eight sections and watching the gap
     decompose exactly into those two terms. Both default to zero, so
     no existing scheme moved, and `checkvdsubmit` pins that.

     **A volt drop is a figure TO somewhere.** The spreadsheet's tick
     box says which: its ticked sections form one unbroken path from
     the point of connection and the unticked ones are the other
     branches. The first cut of this panel ticked every leg and
     totalled all nine, printing 3.897% on project 16 against the worst
     route's 2.937% — not a worse answer, an answer to no question,
     adding legs that sit in parallel. The panel now picks a route,
     defaults to the worst, and warns when what is ticked is not one
     path.

     Three things about reading a drawing that cost time, all worth
     knowing before touching `calcSheetRows.js`:

     - **`Meters` on a leg is CUMULATIVE.** Terminal is the sum of the
       children's; distributed is the leg's own less that. Read the
       other way round the sheet halves the wrong load and both numbers
       stay plausible.
     - **The trench has span nodes too**, labelled A1, A2, A3, standing
       at the same corners as the cable's junctions. Without a layer
       test the sheet named every electric node after the trench node
       sharing its corner.
     - **A dead end's feeder point is not on the cable.** The build
       places it `Tail_M` beyond where the cable is drawn — 2 to 4 m —
       so an exact coordinate match leaves every spur unnamed. Matched
       through the leg's own tail, not a constant.

     Still open: no service row (which real service stands for the
     spreadsheet's notional one is a judgement), and the phase current
     convention — the sheet divides by 3 × the POC's `Output_V`,
     reading it as the PHASE voltage, which is what the workbook means,
     while the same field holds the LINE voltage elsewhere in this app
     and defaults to 400. The two are 3.9% apart on every current.
     Stated on the panel rather than reconciled.

155. **A measured length was honoured on the trench and ignored on the
     cable — and the check that should have said so was stale.**
     Reported from use: a run measured at 100 m, typed against a cable
     drawn at 11.15, and Run Levels Check went on reporting 11.15.

     The editor offers the measured-length box on EVERY line and its
     note promises that "the levels, distances and tails use that
     figure instead". `buildFeederModel` scaled only trenches, because
     the model is built on the dig. So the promise held for a trench
     and was silently false for a cable.

     Fixed in the MODEL, not in the table. The measurement scales the
     edges the cable lies along, so the volt drop, the loop impedance,
     the trace's legs and the circuit-report distances all move
     together — a length printed in a table that its own calculation
     does not use is worse than a wrong length, because it is two
     answers with nothing to say which is which. Scaled rather than
     substituted, as the trench rule scales, so a cable covering two
     legs gives each its share instead of both the whole figure. Node
     indices are looked up and never created: a cable drawn off its
     trench must not add a junction the router could route through.

     The table now shows the drawn figure beneath the charged one
     wherever they differ, so a row that will not scale off the
     drawing explains itself.

     **`checkmeasuredlength` had been failing for a stale argument.**
     It called `cumulativeToNode` with `spanNodes:` after the
     parameter was renamed `stops`, so it passed no stops, got a zero
     drop and reported "the calculation ignores measured lengths" —
     about a calculation that had honoured them all along. One of the
     suite's twenty standing failures was a check accusing working
     code, which is worse than no check: it spends attention every run
     and trains people to ignore the list.

     And the Aptus Calc Sheet read `Length_m`, the trigger's mirror of
     the geometry, so a submission and the levels check behind it
     reported different lengths for one leg. It reads `runLength` now,
     and `checkmeasuredlength`'s list of files that must not touch
     `Length_m` has `calcSheetRows.js` on it.

     **And the first fix of it was wrong in a way that read as
     rounding.** Each edge was scaled by `stated ÷ the cable's own
     drawn length`, which is right only when the cable and the dig
     beneath it are drawn to the same length. They are not — two
     drawings of one route, each with its own vertices, and A3 on
     project 16 is drawn 107.27 m over a trench path measuring 103.6.
     So 94.2 entered came out as 91.0, every leg short by its own
     ratio, and the report looked plausible on every row.

     The edges a cable covers are collected first and scaled by
     `stated ÷ what the dig measures across them`, so they total
     exactly the figure somebody typed. Reported from use, twice: the
     first report was that the measurement was ignored, the second
     that the numbers were close but not the ones entered. The second
     is the harder fault, because nothing about it looks wrong.

156. **Auto Lay Service Cable placed two service joints at one tee.**
     Reported from use, with three plots named. Counted on the drawing:
     twelve pairs, 0.251 to 0.467 m apart, each pair holding the same
     main and the same service.

     The tee is computed twice. Place Feeder Joints puts the fitting on
     the feeder model's node; Auto Lay puts it where the cable was
     snapped to the main. The two answers differ by a quarter to half a
     metre, and the routine treated "already jointed" as any electric
     joint within **0.25 m** — just inside the gap, every time.

     **Widening the radius is the trap.** The nearest GENUINE pair on
     that same drawing is 0.605 m: 56024 and 56025, two adjacent plots
     each properly jointed to main 55981. Anything that catches a
     0.467 m duplicate and spares a 0.605 m neighbour is a number
     fitted to one estate, and the next one with tighter frontages
     loses a joint — the worse fault, because a missing fitting is one
     nobody orders and nobody digs.

     So the CABLES decide and the distance only draws the shortlist
     (`serviceJointHere` in autoService.js, a metre). A joint near the
     tee is this service's if it already holds this service, or if it
     holds no other service at all — an unclaimed fitting, which is
     what Place Feeder Joints leaves when it marks a tee before the
     cable has an id. One already holding a DIFFERENT service belongs
     to that plot however close it is.

     Two things worth carrying forward. The decision came OUT of
     GISCanvasPage into a pure function, because a rule with three
     cases and a counter-example cannot be tested inside a
     thirty-thousand-line component. And `checkautoservice` sliced a
     fixed 2600 characters from a comment anchor: the added reasoning
     pushed its assertions outside the window and three cases reported
     that Auto Lay had stopped placing joints, about code that was
     placing them correctly for the first time. A window measured in
     characters closes whenever somebody explains themselves — it is
     bounded by the statement that ends the block now. The same fault
     shape as checktextnote's placement slice, one session earlier.

     **And the fix had a hole, found the same day.** The
     unclaimed-fitting rule says "holds no other service", and a
     BREECH joint holds no service at all — three mains and nothing
     else. So a service teeing within a metre of one read as already
     jointed and got nothing: 56159 at breech 56014, 0.839 m away.
     Only a service joint can be a service's joint; where a fitting is
     genuinely both, joints.js has already split it in two.

     The shape of that mistake is worth more than the mistake: the
     rule was widened from 0.25 m to 1 m at the same time as its test
     was changed from "any joint" to "any unclaimed joint", and the
     second change was not as tight as the first was wide. A
     shortlist that grows needs its filter tightened in the same
     breath.

     **Not repaired: the twelve pairs already on project 16.** This
     stops new ones. The existing duplicates want deleting, and which
     of each pair to keep is a decision — the feeder one carries
     Circuit_ID and Ways_In, the Auto Lay one does not.

157. **A cable's length is not its trench's.** Asked from use, and the
     right question: "when we are dealing with cable lengths in
     calculations, why are we considering anything to do with the
     trench?"

     Because the feeder model is built on the dig — a cable has to be
     routed along one — and the volt drop borrowed the dig's
     distances because they were there. On project 16 the nine cables
     total **580.6 m** against **565.4 m** of trench. The difference
     is the tails: the stretch past the last plot out to the feeder
     point at the end of each spur, on every spur. That cable exists,
     carries load and drops volts, and no volt drop this app ever
     produced counted it.

     A leg now charges the run of the cable covering it — the
     measured figure where somebody entered one, the cable's own drawn
     length otherwise — and `spanTrace` hands that length to the
     stops so `cumulativeToNode` settles on it instead of
     re-measuring the graph. `trenchMetres` rides along on each leg,
     because the two disagreeing is a thing worth being able to see.

     **Every volt drop on every scheme moves up by its tails.** Taken
     deliberately; `checkrealdrawing` recorded three legs moving by
     0.6 to 1.0 m and those figures were updated with the reason.

     **One cable can cover more than one leg.** A run through a
     junction is two legs of one cable, and charging each the whole
     run reported 108.7 m twice where the two legs are 61.3 and 46.
     The run is split in proportion to the dig each leg uses; a cable
     covering one leg gets it whole, tail included.

     **The Aptus Calc Sheet needed no change and was checked rather
     than assumed.** It reads `runLength` off each leg's cable, which
     is the rule the levels check now follows, and the two agree leg
     for leg — 569.2 m each on project 16. Pinned in
     `checkmeasuredlength`, because the way they could drift is
     silent: two readers, one fact, and a submission disagreeing with
     the check behind it is the worst of the three possible faults.

     Still on the trench, and left there: `distancesFrom`, which the
     circuit report uses for how far a meter is from the origin. It
     honours a trench's measured length already. Whether "how far
     along the network" should mean cable or dig is a separate
     question from what a volt drop is computed on, and it has not
     been asked.

     ── Two failed attempts, both worth remembering ──

     Before the question was asked, a cable's measured length was
     pushed into the trench graph so that everything reading the model
     would get it. Neither way of doing that worked. Matching cable
     segments to trench edges covered only the segments that happened
     to be exactly one edge, so part of each leg scaled and the rest
     rode along at its drawn length — 45 m entered came back as 54.0,
     longer than both the measurement and the drawing, which is the
     tell. Matching by geometry instead swept up the service stubs and
     the tail, and 45 came back as 41.8.

     The lesson is not about either bug. Two polylines over one route
     are not the same length, and no amount of fitting makes them one;
     the second drawing was the wrong place to express the first
     drawing's fact. Both attempts shipped, and both were reported
     back within the hour by somebody reading the table.

158. **A link box's input carried double its load.** Found by reading
     project 20's Aptus Calc Sheet against the meters on the drawing.

     The trunk's load was the sum of every SECTION's meter count
     across all the box's outputs, and a section's count is
     CUMULATIVE — so each customer was counted once for every section
     they sit behind. Circuit 1 has 41 meters; its trunk read 82.
     27 + 14 at the two way roots is the answer, and
     27 + 14 + 6 + 6 + 6 + 16 + 1 + 6 is what was being added.
     `feederSections` has returned `totalMeters` — the count at the
     root, each customer once — all along.

     It cost 2.5 points of volt drop out of 11 on that scheme: the
     trunk is 327 m of 300 mm, and 41 customers that do not exist were
     charged to it at half weight. It also sized the input against
     double the load, which is the harmless direction and is probably
     why nobody looked.

     Worth naming the shape: the figure was plausible from every
     direction. The trunk IS the heaviest cable on a drawing, so a big
     number against it looks right; nothing failed; and the only way
     to see it by eye is to add a circuit's meters up by hand.

     `checktrunkload.mjs` holds both halves — a forked run where the
     sections sum to 6 against a total of 3, and the call site reading
     the total. The second is a source assertion, because reaching the
     box path needs a drawing with ways assigned and seeds split
     across them; a behavioural case over a real link box is still
     wanted and is written down as such in the check.

159. **The calc sheet could not read a second drawing at all.**
     Project 20 came back blank, all sixteen mains unreached, and the
     cause was two assumptions project 16 happened to satisfy.

     **Legs were joined by an exact coordinate.** Project 20's mains
     stop 0.351 m short of one another and of the origin. Ends within
     half a metre are one node now — a drawing is not built to a
     coordinate, and the nearest genuinely separate nodes on either
     drawing are tens of metres apart.

     **The walk started at one origin.** A site fed from two points of
     connection has two, and circuit B's seven legs were simply off
     the sheet: half a scheme missing from its own submission. It
     walks from every origin.

     Both are the same lesson as fault 154's node naming: a reader
     written against one real drawing inherits that drawing's
     accidents as rules. The second drawing is where they show.

160. **Three fixed-window slices went stale in one week.** Worth
     recording as a pattern rather than three incidents.

     A check that reads source often slices a window from an anchor —
     `canvas.slice(at, at + 2600)` — and asserts against what is
     inside it. Every such window closes the moment somebody writes a
     comment above the code being watched, and the failure is the
     worst kind: the check reports that working code is broken.

     - `checktextnote`'s placement slice ran into the section mark's
       branch and accused the note of snapping.
     - `checkautoservice` took 2600 characters and its three cases
       reported that Auto Lay had stopped placing service joints — on
       the day the joint code was fixed.
     - `checkoverridecarry` took 30000 from the start of
       `buildLvNetwork`. The first call it looks for is at offset
       **30064**. Sixty-four characters. Both its cases said a rebuild
       loses hand-set cable sizes, and somebody asked whether theirs
       would survive: the suite's answer was no, and the truth was
       yes. It had been on the standing-failures list long enough to
       be treated as furniture.

     All three are bounded by the thing that ends the block now — the
     next statement, the next function. **A window in a source check
     should be bounded by syntax, never by a character count.** If
     this pattern appears again, it is the same fault.

161. **An enquiry takes a document (0230).** A `file` question used
     to say "Documents cannot be attached here yet. Send this enquiry
     and we will ask you for it" — honest while there was nowhere to
     put one, and a round trip on every enquiry that needed a drawing.

     **The file does not travel in the enquiry.** It goes straight to
     storage the moment it is chosen, on a signed slot from
     `/portal/enquiry-upload`, and the answer keeps the path. A
     browser cannot hold a file across a reload, and a sheet with
     five drawings in its body would not arrive.

     **The upload happens before the submission exists**, so there is
     no submission id to key the path on. It is keyed on the BRANCH,
     taken from the signed-in account, with a random segment per
     file. The client hands the path back at submit time, and the
     server accepts it only if it begins with that account's own
     branch folder — `mineOrNull` in portal.js. Without that test an
     enquiry could claim another company's document by naming its
     path. A path that fails is DROPPED rather than refused: losing a
     sheet somebody has just spent ten minutes on is worse than an
     answer that arrives without its document.

     **Answered means landed.** The answer is `{ fileName, path }`
     and the path arrives when the upload finishes, so a file chosen
     but still going up does not satisfy a required question — both
     `missingAnswers` and the Next button test the path, not the
     name. A failed upload clears the answer outright, because one
     holding a name and no path reads as attached and arrives empty.

     The answer is stored as the FILE NAME, so an enquiry reads
     without opening anything. Staff open it from the enquiry panel
     through a signed link minted per click from the answer row —
     never from a path in the query, which would let any signed-in
     member of staff mint a link to anything in the bucket.

     One file per question, deliberately. A `file` question asks for a
     document, singular, and choosing again replaces it, the way the
     portal's own document requests work. A set of files is a
     different question type and can have its own table then.

     Note on 0230: `Enquiry_Answer` was built in the SQL editor and
     the only migration naming it is 0226, which describes the
     DUPLICATE design written by mistake (fault 150). 0230 is
     therefore additive and guarded and asserts nothing about the
     rest of the table. `enquiries.js` already selected `Storage_Path`
     before this, so the column may already exist — the guard covers
     both cases.

162. **Four items taken off Tools & Reporting.** Asked for: Electric
     build order, Build the Whole Design, Build All Mains and Lay All
     Services. That menu is where a design is read and reported on,
     and the four of them ran it instead — each doing at a stroke
     what the utility menus do a utility at a time.

     `runWholeDesign`, `runAllMains` and `runAllServices` and the
     build-order panel are still in GISCanvasPage and still work.
     Nothing but those items called them, so they are now unreachable
     from the interface. Left rather than deleted: putting one back
     on a menu is a line, and rewriting `runWholeDesign` is not. If
     they are still unreachable in six months, that is when to take
     them out. `checkdead.py` does not flag them, which is worth
     knowing — it finds unreachable statements, not unreachable
     functions.

     `checkcalloffroutes` failed on the removal, wrongly. It counted
     `!callOffOnly` inside the tools menu and wanted at least two;
     the remaining items now fall under a single gate, which is
     tidier and reads the same to a visitor. **A count is a proxy for
     a rule, not the rule.** It tests the rule by position now: every
     item before the gate must be a call-off item, and the gate must
     not close before the last item. Same family as the three stale
     window slices in fault 160 — a check that measures the shape of
     the source instead of what the source does.

     **And Place Text Note moved onto this menu, with the Annotation
     menu removed.** Asked for in the same breath. Annotation held one
     item, which is a menu somebody opens to find out there is nothing
     else in it. What mattered about it is unchanged and is what
     `checktextnote` now tests: the note is not asked for from a
     utility's menu, because it belongs to none of them and a note on
     a gas drawing should not be reached through Electric. The LAYER
     is still `annotation`, which is the part that must never drift —
     it is what keeps a note visible when a utility is hidden, and
     what Print to Scale relies on.

     The cross-section mark stays on Trench: that one goes ON a trench
     and reports what the trench holds. 0215's other annotation —
     north points, revision clouds, detail bubbles — belongs beside
     Place Text Note when it is built, rather than reviving a menu.

163. **Two switches on the Layers menu, and a name that lied.**

     "Span node levels" was renamed **"Node levels"**. It governs the
     level labels at feeder end points as well, and naming one of the
     two kinds read as though the other had a switch somewhere else.

     **Feeder end points had no switch at all.** Span Nodes did not
     cover them — a span node belongs to the trench and a feeder end
     point to the cable, they carry different roles and are placed by
     different routines — so the only way to clear them off a busy
     drawing was to hide the whole electric layer. They have their own
     now, stepped in under Electric, which is where somebody looks for
     it.

     Worth remembering how little it took: `classKeys` already gives
     every feature a `role:` key and hide, show and solo all work on
     those, so the switch needed no plumbing whatever. It simply had
     never been offered. The next thing that looks like it needs
     building is worth checking against that first.

     `MenuLayer` gained an `indent` prop for the stepped-in row. A
     prop passed to a component that drops it is a step-in that looks
     right in the source and does nothing on the screen, so
     `checklayerswitches` asserts the component takes it.

     **The picker now says what a thing IS, then what it is called.**
     Selecting near a feeder point listed "Point A5" over
     "feederpoint": the name line printed whatever the Label happened
     to be, and the kind line printed a role KEY — a database value,
     fine in a status line and wrong on the one dialog whose whole
     job is telling four overlapping things apart.

     `featureName` in snapping.js puts the kind first and the
     identifier after: "Feeder End Point A5", "Electric Main A2". The
     line beneath carries only what QUALIFIES the thing — circuit,
     which output of a box, whether the end was clicked — and is not
     drawn at all when there is nothing to qualify.

     Three cases it has to get right, all on that one screenshot: a
     feeder point's number comes from `Span_Label`, because its Label
     is already "Point A5" and pasting the kind in front gives
     "Feeder End Point Point A5"; something already named for what it
     is, like a joint called "Service Joint", is left alone; and a
     feature with no label of its own is the kind alone rather than
     the kind and a trailing space.

     `roleName` beside it turns a role key into a name. Listed, not
     derived, for the reason the bill's own list records: nothing
     turns `feederpoint` into "Feeder End Point" and `poc` into "POC"
     by rule. Anything unlisted falls back to the key capitalised, so
     a role added tomorrow reads as something and shows up as the odd
     one out.

     **The picker says what a thing IS, then what it is called.** It
     read "Point A5" over "feederpoint" — a Label that says almost
     nothing over a role KEY, which is a database value and fine in a
     status line but wrong on the one dialog whose whole job is
     telling four overlapping things apart. Now: "Feeder End Point
     A5", "Electric Main A2", with only what QUALIFIES the thing
     underneath — circuit, box output, whether it was the end that
     was clicked — and no second line at all where there is nothing
     to qualify.

     `featureName` and `roleName` in snapping.js, beside `classLabel`
     because the three are read together. The role names are LISTED,
     for the reason the bill's own list records: there is no rule
     that turns `feederpoint` into "Feeder End Point" and `poc` into
     "POC".

     Three cases that are not "kind then label": a feeder point's
     Label is already "Point A5", so its number comes from
     `Span_Label` or the name reads "Feeder End Point Point A5";
     anything already named for what it is ("Service Joint") is left
     alone; and a joint says **who it feeds** — "Service Joint Plot
     54" — because every service joint on a drawing has the same name
     and the plot is the only thing that tells them apart.

     **`servedPlots` answered "no plots" for 84 of project 20's 85
     service joints.** It followed the service cable's own `Plot_ID`
     or its `Seed_Feature_ID`, and a cable laid by Auto Lay Service
     Cable carries neither — it is drawn between two points and told
     nothing about who it feeds. The METER at the far end knows,
     which is the link `serviceFor` follows from the other direction.
     With that route it resolves 82. It also names a non-residential
     supply now, which has an `NRS_ID` and no plot number at all;
     `checknrs`'s call-site count caught the missing `nrsById` the
     moment the picker started asking.

     **And the Notes layer is not the Annotation layer**, which was
     asked and is worth writing down. `note` is the fallback layer for
     a free-drawn line whose line type names no layer — sketch lines,
     a scribbled route. `annotation` is what 0215 made for things that
     describe the drawing rather than sit in the ground: cross-section
     marks and text notes. Separate so that hiding a utility, or Print
     to Scale hiding the trench, cannot take the annotation with it.

164. **Five ways the printed sheet was not the drawing.** All reported
     off one issued PDF, and four of them the same fault: the sheet
     decided something the screen had already decided.

     - **Every MSDB printed as a solid black block.** There was no
       board branch, so it fell through to the symbol cascade and got
       a square filled in the default slate, with no letters. The
       screen draws a white square with DB in it. Now so does the
       sheet.
     - **Joints and heavy duty cut-outs printed hollow.** The sheet
       carried an extra unfill for `joint`, `hdcutout` and
       `openpoint`, on the argument that a hollow diamond reads as a
       joint on a plan. It may — but the screen fills them, and a
       sheet drawing a fitting differently from the drawing it came
       from is one somebody has to learn to read twice. `STROKE_ONLY`
       and nothing else now, as on screen. If hollow fittings ARE
       wanted on paper, that is a style choice and belongs in the
       style table where both surfaces honour it.
     - **Every cable was labelled with one letter.** Not the same
       fault: here the sheet was missing a fact rather than inventing
       one. A cable's size is a `VD_Cable_Size_ID` pointing at a
       catalogue the print was never given, so `lineLabelText` could
       only return the tag — "D" on a drawing somebody digs from.
       lineLabel.js's own note asked for exactly the fix: the
       catalogue is PASSED IN as `cableName`, from the map the canvas
       labels with, so the two say the same words. A caller with no
       catalogue still gets the tag.
     - **A stack of filled meters sat on every board.**
       `withAssumedMeters` invents one per flat so the build, the
       levels and the circuit report have a load to work from. They
       have no Feature_ID, are never saved, and the CANVAS DOES NOT
       DRAW THEM — the print was handed them and did, all at the
       board's own anchor. Skipped in `pageDrawList` rather than by
       not passing them, since a later pass may want to count them.

     Reported as "feeder end points are printing though they are
     switched off", and they were not: Print to Scale hides
     `role:feederpoint` and the filter works. The circles were the
     assumed meters. Worth remembering that a symbol somewhere
     unexpected is not evidence about which feature it is.

     **And the board's name then printed twice**, reported straight
     back. The board branch writes its own, because it alone knows
     how wide its box came out and therefore where the name clears
     it; the label pass wrote it again at the symbol radius the
     cascade would have given a board that uses no symbol — a
     millimetre or two apart, which reads as a smudge rather than as
     two labels. The pass skips `msdb` now, the same rule the note
     and the wash out either side of it follow: whoever draws the
     symbol writes the words that belong to it.

     A fix that adds a second writer of the same thing is worth
     looking for the first writer before shipping. All three of the
     roles around it in that pass are there for this exact reason.

     **Then the cut-out printed as a solid slate square.** It has a
     BESPOKE symbol on screen — a white body lying along the cable
     with two fuse ways in it — and no branch on paper, so it took
     the symbol cascade. Correcting the fill rule turned it from a
     hollow square into a solid one: both wrong, and the second more
     obviously. It has its own branch now.

     **Seven more are in the same position**, and this is the thing
     to act on rather than the cut-out itself. The canvas draws ten
     roles with bespoke symbols; the sheet now draws three of them.
     Still taking the cascade on paper: `reducer`, `hvtt`,
     `sectionmark`, `primary`, `ringsub`, `openpoint` and `linkbox`.
     Each will print as a plain filled shape in the layer's colour
     where the screen shows something particular, and each will be
     reported the first time one appears on an issued drawing. A
     command that lists them is in the check's own comment.

     The general lesson: a bespoke symbol on screen is a bespoke
     symbol needed on paper. `printVector.js` calls itself a SECOND
     renderer at the top of the file and that is exactly the cost —
     every shape has to be drawn twice, and the cascade cannot
     produce what the canvas hand-draws.

     `checkprintsymbols.mjs` holds all five. Its first fixture used a
     tile shaped `{x, y, wMm, hMm}`; a tile is a rectangle of GROUND
     — `minX/minY/maxX/maxY` — so every feature fell outside the page
     and the whole check passed on an empty list. A fixture that makes
     a check pass by producing nothing is the worst kind.

165. **Print to Scale turned the service labels back on.** Somebody
     switched them off, pressed Print to Scale, and got them back —
     every time, with no way to issue a sheet without them. Reported
     from use, and fairly.

     It was not doing it by accident. Both label switches default to
     OFF, and a sheet issued with anonymous cables is the fault the
     print's label pass was written to fix, so setting them up for
     issue is right. The mistake was not telling a DEFAULT from a
     DECISION: "off" means different things when it is the factory
     setting and when somebody has just set it.

     A switch nobody has touched now takes the issue default; a
     switch somebody has set keeps what they set, whichever way.
     `labelKindSet` is the record — a ref, because nothing renders
     from it.

     Two traps either side of this, both live:

     - Turning a switch on FOR issue must not count as touching it,
       or the first Print to Scale marks both and every later one
       skips the default. Hence `setLabelKinds` directly there rather
       than `setLabelKind`, which is the recorder.
     - The app turning labels off is not a person deciding. The
       call-off flow quiets them while plots are being picked and
       restores them after; those calls stay raw, or raising one
       call-off would stop every later sheet being labelled.

     And the status line says what it actually changed rather than
     claiming both kinds went on — a drawing that reports turning on
     something it left alone is the drawing lying to the person who
     just turned it off.

     `checkprintsetup` asserted the two literal calls and failed. Its
     intent — both kinds considered, both switched on where nobody
     has decided — is what it tests now. Third check this month whose
     case pinned the line rather than the rule.

166. **The circuit letter is off the line label.** It led every one:
     "D" above the cable and its length, from `Circuit_Letter`, which
     the build writes on each main. `lineTag` put it there and both
     the canvas and the sheet showed it.

     Asked for, and it reverses a deliberate decision — the comment
     beside the canvas's composition argued that "1B is how a circuit
     is spoken about on site, and dropping it to make room for the
     cable would trade one fact for another". The counter-argument
     that won: the label is for what is IN THE GROUND, and which
     circuit a run belongs to is already said three other ways — by
     its colour, by the letters drawn along the run itself, and by
     the picker.

     Taken off BOTH surfaces in the same change. A label that reads
     one way on screen and another on paper is the fault this whole
     stretch of work has been about.

     **Kept as the last resort.** A run with no size set has nothing
     else to say, and a blank label reads as a cable nobody has
     looked at rather than one whose size is not set. So the order is
     now: the cable and its length, else the size and its length,
     else the tag, else the run's own name.

     Where somebody asks for it to go entirely, that is the `if (tag)
     return tag;` line and the canvas's `: tag || ""`.

## Decisions worth knowing

**Project replaced Tender and Contract.** Stage is derived from
`Project_Status.Stage`. `Project_Scope` holds one row per utility and
carries both commercial and outline-design fields. The UI says "Outline
Designs"; the schema still says `Project_Scope` — deliberate, since
renaming is a migration plus a dozen files for no user-visible gain.

**A project has many developers.** `Project_Developer` links project to
customer branch; `Plot.Project_Developer_ID` says whose plot it is.
Developer codes prefix plot numbers only when a site has more than one
developer, so `2607.014-12` becomes `2607.014-AH-12`.

`Project.Customer_ID` and `Branch_ID` are a **cached copy** of the main
developer, maintained by `sync_project_main_developer()`. They exist only
so older screens keep working and should be dropped — the statements are
at the foot of `0048`.

**GIS geometry is metres from the site origin**, stored as JSON, not
lat/lng. The canvas converts to pixels at draw time, so zoom never
touches the data.

Two snapping tolerances, doing different jobs:
`SNAP_PX = 12` is a drawing aid measured in pixels, constant at any zoom;
`CONNECT_M = 0.25` is a fact about the network measured in metres,
because two cable ends either meet or they don't. Network tracing reads
the metre one. Keeping them separate is why tracing is trustworthy.

**PDF basemaps render as tiles of the visible region** at view
resolution (`usePdfPage.js`). Rendering a whole A0 sheet at 1000% hits
the canvas pixel cap and silently degrades to a blurry enlargement.
`Metres_Per_Pixel` means metres per PDF *point* for vector plans.

**AV invoicing is driven by `IDNO_Source_Mapping.Config`**, not by
guessing at headings. GTC exports put several plots in one free-text
cell with a single payment covering all of them (`plots_from_text`), so
the value counts once per row, not once per plot. Getting that wrong
multiplies an invoice by its plot count.

**Organisations replace the five parallel tables.** Roles are
many-to-many because ESP is both an IDNO and a supplier. Contacts belong
to a branch, never directly to a company, and every organisation always
has at least one branch.

**A non-residential supply is a seed, like a plot.** The triangle marks
where the supply is; its meters are placed against it, up to one per
utility, linked by a shared `NRS_ID` rather than by the seed's
`Feature_ID` — which is not known while the seed is still an optimistic
row, and would not survive the seed being re-placed. Which utilities a
supply takes is `NRS_Utility`, a set, because the answer is a set. Only
the ones mapping to a drawing layer get a meter: a supply can be scoped
to Section 278 Off Site, which is a commercial fact with nothing metered
about it.

**Bulk work names categories rather than selecting features.** Bulk
delete always did; the bulk editor does now, through the same
`bulkDeleteCategories` list and the same `CategoryPicker`. The rule that
makes it safe: **a category can be narrower than the class of the things
in it** — "service joints" are a category, "electric joints" is their
class, and that class is also the breeches and the straights. So
`planBulkEditOn` writes to a settled set of features, and classes only
decide which fields to offer. Planning from the class would edit four
times what was ticked and look right doing it.

The cable field is deliberately not drawn in bulk, and the panel says so
on screen rather than leaving it absent: a run's size is held again on
the span node that feeds the volt drop sum, which is fault 13, and only
the canvas can write both.

## The HV ring

How the substation is fed, upstream of the POC. The standard
arrangement is not a dedicated way at the primary: the substation is
**looped in and out of a shared 11 kV circuit** through its RMU, one of
several substations in series on one way's cable, the far end running
back to a second way of the same primary (or another) with a
**normally open point** along the route. In normal running the ring is
split at that point, so each substation sits on a radial chain. The
RMU's ring switches are load-break switches and cannot clear a cable
fault — only the feed way's breaker at the primary can, and it takes
every substation on the chain when it does. Supply comes back by
sectionalising and closing the open point.

Each fact has its own feature, and the split of duties is the same as
everywhere else on the canvas:

- **`primary`** — the 33/11 kV primary. `Feed_Way` and `Return_Way` on
  its attributes name the ways of its board this circuit uses. Placed
  flat at the click, usually off the site entirely.
- **`ringsub`** — another secondary substation on the same circuit.
  Snaps onto the HV run; drawn as a dashed grey square, because it is
  the same object as the site's substation and somebody else's.
- **`openpoint`** — the split. Snaps onto the HV run and takes the
  cable's bearing (an `Angle_Deg` like the valve's); drawn as an open
  switch blade with "NO" beside it, on a white disc so the circuit's
  dashes do not close it by eye.
- **`elec_hv_existing`** — the incumbent's circuit cable, dashed, in
  the 0197 family: the `_existing` suffix defaults `Build_Status` to
  `existing`, digEstimate charges nothing, `mainsOnLayer` never offers
  it a joint, and 0208 (once recovered and run) keeps it off the bill.
  The site's own loop-in tails stay `elec_hv`.
- The site's substation (and any `ringsub`) carries **`HV_Connection`**
  — looped / teed / dedicated — and, when looped or teed,
  `RMU_Tee_Protection` (fuse switch or circuit breaker) and
  `RMU_Tee_Fuse_A`: the one device whose operation takes out that
  substation alone.

All three plant roles are written with `Build_Status: "existing"` at
placement, which is the field 0208 reads. **They are in none of the LV
walks' role lists** — not an origin, not a fitting, not a trace source
except `primary`, which was added to `traceSources` so the token can
run the ring — so the chain is a record the LV network sits under, not
a participant in it. `metredSeedsInside`, `buildFeederModel` and the
bill know nothing of them, deliberately.

**`hvRing.js` is the model**, pure and tested where it lives:
`hvRingModel` attaches plant to the runs (five metres, the upstream.js
rule for a symbol placed beside a cable), stitches lengths end to end
(three quarters of a metre) **and through shared plant** — two lengths
drawn TO the substation symbol rather than to each other are one
circuit, because the RMU is the splice — then walks from each primary
in cable order, stopping at an open point or another primary.
`feedSummary` says the result: fed from which primary and way, how far
up the chain, back-feed via the open point. `faultCompany` counts what
shares the leg. Findings: a ring drawn closed (fed from both
directions with no open point placed), HV cable with no primary, a
substation the run does not pass (unless `HV_Connection` is
`dedicated`, which is the one arrangement where being off the chain is
the point), an open point standing on no cable, a feed way nobody
recorded, and a branch in what should be a chain.

The editor reads the model rather than working the feed out for
itself — the words the panel says are the words `checkhvring.mjs`
tests. The walk is only computed when the opened feature is HV plant
or the substation, because it is a whole-drawing pass.

One wrinkle earned in the walk: a leg **skips its own starting
primary**. The in and out cables both stand on the primary, so a walk
hopping between them passes its own start — which is the walk getting
clear of the board, not the ring closing. A ring genuinely closing is
caught by the double feed (every station reached from both directions)
or by meeting a *different* primary along the last line.

## The substation editor

Four changes asked for together, all in FeatureEditor:

- **Header.** `Feature_Role === "substation"` gives "Substation".
  Added POC and MSDB beside it, since the same argument applies and
  the map they sit in is one expression.
- **Width.** `.fe.fe-station` at `min(504px, 94vw)` against the base
  420 — a fifth wider, for the board's five columns. Named
  `fe-station` and NOT `fe-sub`, which already exists as the small
  grey line under a header; a class name meaning two things is how one
  of them stops working when somebody edits the other.
- **The board-wide fuse control removed.** The attribute is kept and
  `fuseForWay` still falls back to it, so every board saved before
  this shows its old rating on every way until somebody changes one.
  Worth being explicit: removing the control does not remove the
  value, and nothing writes it away — a board opened and saved keeps
  its `Way_Fuse_A` untouched.
- **Rating, output and ways on one row**, a third each. `.fe-row` is
  flex with `flex: 1` children, so three fields in a row IS a third
  each — no width is set and none should be. The check asserts the
  three labels fall inside one row's markup rather than looking for a
  percentage, because a percentage is not what makes it true. The
  second row disappeared with the board-wide fuse control that had
  been sharing it with LV ways.
- **The per-way fuse is a select**: `WAY_FUSES` = 160, 200, 315, 400,
  500. The options are that list UNION the way's current effective
  rating, so a board carrying 250 keeps it and keeps it selected.
  Without the union a select silently snaps to its first option and
  somebody's design changes because a panel was opened.

The CSS lives in a template literal, and a backtick in a comment
closed it mid-file — **second time this session**, same trap, same
symptom (a parse error a hundred lines below the edit). If a build
fails in the styles with "Expected ; but found", look for a backtick
in a comment before anything else.

## A \u2014 on screen

Reported from a screenshot of the breech dialog: "One cable, with the
joint held on it \u2014 it bends with the joint". A `\uXXXX` escape is
an escape inside a JavaScript STRING. In JSX text it is six literal
characters, and the build has nothing to say about it because the
markup is valid either way.

The trap is that the same sequence one line up, inside quotes, is
correct and used everywhere in this file. The eye slides over it.

Two instances, both from this session: the breech dialog and the ohm
symbol in the cut-out's loop impedance. Both are HTML entities now
(`&mdash;`, `&#937;`), and the fix was confirmed by rendering the
editor and reading the text back — a real Ω, no backslash-u anywhere.

**The scanner took three attempts, and that is the part worth
keeping.** A per-line version reported 503 faults, because this
codebase writes block comments without leading asterisks and every
continuation line ABOUT an escape looked like markup. A
character-level state machine over code/comment/string cut it to
eleven — of which nine were `${ }` holes inside template literals,
where the nested backtick read as the closing one. A stack for those
holes leaves two, both real.

A checker that cries wolf five hundred times is worse than no checker:
it gets silenced, and it makes every future reader distrust the suite.
**Getting the false positives to zero mattered more than finding the
true ones**, and both intermediate versions would have "passed
review" while being useless.

## The click that threw

Reported twice as "nothing is happening", and it was mine.
`snapTargets` returns entries shaped
`{ point, featureId, vertex, kind, ... }`. The snap loop I added to
the click handler read `t.at`. `undefined[0]` throws, so the handler
died at that line: no joint, no dialog, no error banner, nothing in
the UI at all. It took the straight joint down with it, because the
snap runs before the kind is looked at.

**The check asserted the call, not the result.** It tested that
`snapTargets([chosen.line], { includeMidpoints: true })` appeared in
the file — which it did, being the very line that threw. That is the
whole lesson: a grep over an inline loop can only confirm that the
code was typed, never that it works. The snap is now
`pointOnLineNear(line, point, reach)` in snapping.js, returning
`{ d, at, kind }` or null, and the check runs it against a real line
for an end, a corner, a midpoint, an out-of-reach click, a one-point
line and a missing line. Restoring `t.at` fails three of them.

**Three rounds of wrong diagnosis before it.** A stale build, then a
cable type, then — worst — I analysed drawing 27 from hours earlier
and reported "877 service cables" about a small test drawing the user
had never sent me. The evidence that would have found it in one step
was there the whole time: an exception in the click handler is the
only thing that produces silence in a handler that otherwise always
either acts or calls setError. **When an armed mode does nothing at
all — no act, no message — suspect a throw before suspecting the
data.**

## Four readers of one drawing

Worth collecting, because it has now happened four times in one
session and each time cost a round trip with the user.

`circuitsFrom` was taught that a circuit can be held by something
other than a drawn meter. Every OTHER reader of the same drawing had
to be told separately, and each was found only when a user hit it:

1. **The levels check** walked the raw drawing, so a circuit fed
   through MSDBs "had no supplies on it".
2. **The build's blockers and the steps** counted flats as plots
   wanting seeds and services they must not have.
3. **The circuit report** grouped by drawn meters, so a circuit held
   by boards and a cut-out did not appear \u2014 and could not be deleted.
4. **The circuit report again**, for a circuit held by nothing at all:
   one started by hand on a spare way, which could not be moved to
   because it was not listed.

The shape is always the same: one place learns what a circuit's
membership means, and the others carry an older, narrower idea of it
while looking perfectly correct. None of them fails loudly. Each says
something confident and wrong \u2014 "no supplies on it", "0 of 65 seeded",
an empty list.

**Before adding a fifth kind of member, grep for the readers first.**
The membership questions are: which meters, which boards, which
cut-outs, which way allocations. `circuitsFrom`, `circuitChoices`,
`circuitReport`, `circuitMembership`, `buildBlockers`, `electricSteps`
and `runLevelsCheck` all ask a version of it.

## A miss that turned the tool off

Reported: "it is not asking me if I want to break the cable, and it is
not even showing the joint."

`placeAt`'s armed-joint block called `setJointFor(null)` on its first
line, before looking for a cable under the click. So:

1. Arm the mode. The menu item changes to "Click the cable…".
2. Click a few pixels off the line. The mode ends, and the only
   feedback is "click on an LV feeder cable".
3. Click again, on the cable this time. **Nothing happens at all** —
   no joint, no question, no error — because nothing is armed.

The report is of step 3, and step 3 is silent, which is why it reads
as the feature not working rather than as a miss. Disarming now
happens once a cable is found, and the miss message says the tool is
still placing.

Worth generalising: **every armed mode in this file that clears its
own state before validating the click has this fault.** The pattern to
look for is `setXFor(null)` as the first statement of the block. The
symptom is always the same and always describes the SECOND click, so
it never points at the real cause.

Two of `checkjointonline`'s four failures were also text-pinned
assertions of this same session's making —
`|| !!trenchEndFor || !!jointFor;` and
`if (drawing || placing || jointFor) {` — both pinned to expressions
that have since grown another clause, while the routing and the
snapping they test are both in place and working. They are two of the
remaining standing failures and are worth an hour with the rest of
that list.

## The breech that did not break the cable

Reported one turn after the placement work shipped: **"it did not
break the cable."** Correct, and in the commonest case rather than an
edge of one.

`splitPolylineAt` returns null at the END of a cable — a split needs a
length either side — and a breech is most naturally placed exactly
there, at the end of the run it terminates. `breakLineAt` set an error
and returned nothing, and `placeJointOnCable` carried on, placed the
joint, and recorded `Breaks_Cable: true` about a cable it had not
touched. The snapping work made it more likely, not less: ends became
a preferred snap target, so the click lands on the one point where
breaking is impossible.

Three separate faults, and only the first was the reported one:

1. **The choice was offered where it could not be honoured.**
   `canBreakAt` (snapping.js) now answers first, and the dialog drops
   the break button at a cable end and says why. It asks
   `splitPolylineAt` rather than reimplementing its conditions, so the
   button and the act cannot disagree about what is possible.
2. **A refused break still placed the joint.** A locked cable now
   aborts the placement rather than leaving a fitting claiming a break
   the drawing does not have.
3. **`breakLineAt` returned nothing at all, including on success.**
   Found while fixing the other two, and older than both. Its only
   caller that asks is the joint recording what it holds:
   `halves ? [headId, tailId] : [lineId]` therefore ALWAYS took the
   fallback, so every joint ever placed on a break recorded the
   original cable and never the far half. The half beyond the joint
   was held by nothing — which shows up not as an error but as that
   half failing to follow when the joint is dragged. It returns both
   ids now.

The third is worth dwelling on. It was invisible because the fallback
is a real id and the drawing looks right; the only symptom is a drag
behaving oddly, which reads as a drag bug rather than as a placement
one. **A ternary whose condition is always false is not a branch, it
is dead code with a comment describing what it would do.**

`checkscope` earned its place here too. Rewriting the block left
`whole = ins.geometry` assigned with its `let whole` declaration
deleted — the build passed, and choosing "leave the cable whole" would
have thrown `whole is not defined` at runtime. That is exactly the
fault checkscope was written for, and it caught it in the same run.

And two more spelling-pinned assertions surfaced in
`checkjointonline`: `setJointFor(jointFor ? null : "straight")` and
`const halves = await breakLineAt(...)`, both of which changed shape
while the rules they test held. **Fourth and fifth of this class this
session.** Both now match the rule.

## Placing a breech joint

Three things asked together, and the third is a consequence of the
second rather than a separate piece of work.

**Clicked onto a point of a cable.** `placeJoint("breech")` dropped
one at the centre of the view and snapped it to the nearest feeder
anywhere on the drawing; the breech now arms `jointFor` like the
straight joint and waits for a click. The click snaps through
`snapTargets(..., { includeMidpoints: true })` — ends, corners,
midpoints — falling back to the nearest point on the line, so a
deliberate click mid-straight lands where it was aimed.

While doing that: the straight joint's menu item read
`active={!!jointFor}`, which lit it up whenever ANY kind was armed.
With one kind that was indistinguishable from correct. Both items now
test their own kind.

**Break or not, asked.** `placeJointOnCable` takes `{ breakLine }`,
defaulting to true so every existing caller is unchanged. The dialog
offers two statements about the cable rather than a checkbox, and the
answer is written to the joint as `Breaks_Cable` — after the fact a
breech on an unbroken cable and a breech where two cables meet are
indistinguishable, so the intent has to be recorded when it is known.
Both routes reach the question: where several cables lie under the
pointer the "which cable?" dialog asks first and hands on.

**The rubber-band, and why it is not separate work.** Leaving the
cable whole INSERTS a vertex at the point — `insertVertexAt` in
snapping.js, the other half of `splitPolylineAt`. Without it the
fitting is a symbol lying on a line: nothing records the meeting, and
the first drag slides it off, because the follow machinery moves
vertices and there is none to move. With it, the chain that already
exists carries the rest: `Joint_Cables` names the line → `told` makes
every vertex of it a candidate → the vertex under the joint is within
reach → it goes into `drag.current.rubber` → the apply step moves that
index alone, so the run stretches rather than sliding.

Two existing rules had to be checked rather than assumed, and both
already held: the two-cables-only narrowing is limited to
`Joint_Type === "straight"`, so a breech is not cut down to two
arbitrary cables; and the `told` clause in the candidate rule does not
exclude `joinsEnds`, so a breech that NAMES a cable gets all of its
vertices. `checkbreechplace` asserts both, because either would break
the rubber-band silently and neither is near the code that placed the
joint.

Worth knowing: `checkbreechdrag` already covers the broken case (three
cables meeting at one breech all follow it) and is still green. The
new check covers the unbroken one.

**Verified how far:** the pure pieces by test (`insertVertexAt` against
mid-segment, corner, end, off-line, hairpin and non-mutation), and the
drag chain by asserting each link of it in place. A live drag was not
simulated — that needs the whole canvas mounted against a project —
so if the rubber-band misbehaves on a real drawing, the chain above is
the order to check it in.

## A fuse rating per way

Asked for: a fuse rating per circuit at the substation. The board had
one `Way_Fuse_A` for all its ways, and `assignWay` judged every
circuit's "over" against it.

`fuseForWay(substation, way)` is the single rule: the way's own
rating, else the board's, else `SUB_DEFAULTS.Way_Fuse_A`. The map is
`Way_Fuses`, keyed by way, sitting beside `Way_Circuits` and
`Circuit_Names` — the third map on that board keyed the same way, so
it reads and clears the same way too.

**`Way_Fuse_A` is deliberately kept as the board default rather than
migrated into the map.** Every existing drawing has it, a board whose
ways really are all the same should say so once, and the fallback
means a database full of drawings reads identically on the day this
ships. That case is first in `checkwayfuse` for exactly that reason —
it is the only one that applies to any existing project.

Two details worth keeping:

- **Cleared means "follow the board", never "no fuse".** An empty box
  passes through `""` before it passes nothing, and a zero would read
  as unprotected — so `""`, `0` and `null` all fall back. There is a
  case for each.
- **Keys are compared as string and number both.** jsonb returns the
  map with string keys and the editor writes whatever the row's `way`
  is; assuming one shape is a rating that silently reverts to the
  board's, which is the kind of fault nobody reports because it looks
  like they mistyped.

Note the name collision, which is pre-existing and was left alone: on
a LINK BOX, `Way_Fuse_A` is already a map of way to rating (see
CircuitReport and the box's editor). On a substation the same key is a
scalar. Two roles, two shapes, one name. Renaming either would touch
live data, so the substation's per-way map took a new name instead —
but anyone reading `Way_Fuse_A` should check which role they have in
their hand first.

## Checks live at the root

Asked, looking at the folder: should these check files be in
`src/features/gis` or at the root? At the root — `checkall` reads the
root directory only, and the five sitting in `src/features/gis` had
therefore never run. They could not have if they had been tried: their
imports are written relative to the root, so each one crashes with
ERR_MODULE_NOT_FOUND where it lives.

Four were earlier generations of a root check of the same name, and
the root versions cover the same rules with their own later fixtures
(377 lines against 101, 1,509 against 148). Harmless enough.

**The fifth had a fix in it.** `checkoverridecarry` was repaired on 9
September — `canvas.slice(at, at + 30000)` replaced by a slice to the
end of the function, with a comment naming it the fifth outing of
fault 33 — and the repair went into the stranded copy. The root copy
kept the fixed window, kept failing, and sat in the standing failure
list looking like a known problem nobody had got to. Applying the
stranded fix to the root copy makes it pass. **Standing failures:
nineteen to eighteen.**

That is the thing to take from this. A stale duplicate that fails is
noise. A stale duplicate that receives a FIX is worse than noise: the
work is done, the benefit is invisible, and the failure it was meant
to clear goes on being explained away as known. Both of the session's
earlier notes about `src/features/gis/checkbuildblockers.mjs` said
"noticed, not touched" — the right instinct about someone else's file,
and it left a working fix stranded for two days next to it.

`checkdupes` now walks `src` and fails on any `check*.mjs` outside the
root, so the next one is caught the day it appears. The five are
deleted; they are tracked in git if anything is wanted back.

**Worth a look with the same eye:** the standing failure list has
eighteen entries that have been treated as known for weeks. At least
one of them was not a real failure at all. It would be worth an hour
going through the rest before assuming any of them is understood.

## A self-lay plot is on nobody's circuit

Reported: "Link the meters to circuits: 214 of 231 meter(s) on a
circuit" on a 231-plot site, with the build asking to be run anyway
every time. The seventeen were exactly the seventeen self-lay plots —
verified against the drawing, the set of meters with no `Circuit_ID`
and the set of plots with a self-lay service trench matched with no
difference in either direction.

A self-lay plot takes its supply from the incumbent's network: we dig
to their tee and lay nothing past it. It is on no circuit of ours by
design, so this was a step that could never be completed and a warning
that could never be cleared — the worst kind, because the only way
past it is to learn to ignore a warning, and then the real ones go
unread too.

`electricSteps` and `buildBlockers` both take an `isSelfLay` predicate
and drop those meters from the count. The canvas passes
`isSelfLayMeter`, which already existed: the fact lives in
`Plot_Utility.Self_Lay_Provider` and neither module loads tables, so it
is handed in rather than looked up — the same shape as `plotLabel`
beside it.

Both default to `() => false`, so a caller that has not been told
reads exactly as before; there is a case for that in each check,
because a default that quietly changes behaviour for everyone is how a
"safe" addition stops being safe.

**The exemption is self-lay, not "has no circuit".** An ordinary plot
genuinely missing its circuit is still caught, and both checks assert
it. Worth stating because the easy version of this fix — skipping any
meter with no `Circuit_ID` — makes the gate unable to report the fault
it exists for.

Same shape as the flats-only refusals above: a gate written when every
plot was one of ours, meeting a plot that is not. **That is now four
of them** (the circuit lasso, the service blocker, the seeds step, and
this). If another turns up, look for the same assumption before
treating it as new.

## Auto Service re-lays only what moved

Asked for: run Auto Lay Service Trench and have it skip the plots
nothing has changed about, laying only the new and the moved.

The machinery was half there. `alreadyLaid` skips a seed that has a
service trench; `mismatched` re-lays one whose self-lay flag no longer
matches what is drawn; `refill` puts back a cable that was deleted
from a trench that survived. What none of them asked was whether the
GEOMETRY still agreed — so a boundary point dragged after the service
was laid left a stale trench that every subsequent run skipped as done.

**It applies to every plot that has a service trench**, self-lay or
not. The only gate is `alreadyLaid`. `selfLayOnly` chooses which MAINS
the tee is measured to — a self-lay plot tees off the incumbent's, so
measuring to ours would call every one of them moved — and is not a
test of whether to ask the question. That distinction was easy to
misread from the code, so `checkservicemoved` states it twice: an
ordinary-plot case with no self-lay anywhere on the fixture, and a
guard on the loop that fails if a self-lay test ever becomes the thing
deciding whether to ask. Proved by adding `if (!allSelfLay) continue;`
and watching it go red.

`serviceMoved` (pure, in autoService.js) answers the narrow question:
given the drawing as it is now, would this seed's dig be laid
somewhere else? It compares the drawn trench against the three facts
the route is built from, in the order `planSeed` decides them — the
tee foot on the nearest mains TO THE BOUNDARY, the stop
(`Trench_End_At` where the seed carries one, else the boundary point),
and the boundary vertex, which matters on its own because it is where
the on-site and off-site lengths are split.

**Compared against the drawn geometry, not against a fresh plan.**
That is the trap worth remembering: `planSeed` follows an existing
service trench where one is there (`onService`, so a cable is laid in
the dig rather than across it), so a re-plan agrees with the drawing by
construction and nothing would ever look changed. The comparison has
to be against the facts, not against the planner's output.

**The hard half is not re-laying.** A test that says "changed" too
readily re-digs the site on every run: it churns geometry somebody has
adjusted by hand and makes the summary meaningless. Four cases exist
only to hold that line, and each states why the thing it describes is
not a move:

- a dig drawn from the plot back to the main (an end swap)
- a round trip through the database (hence `tol`, a centimetre —
  finer than anything anybody drags, coarser than any rounding)
- a route with no middle vertex because the boundary IS the stop,
  which the planner drops deliberately
- a self-lay plot, which tees off the incumbent's main — asking the
  wrong list of mains would call every one of them moved, so the
  caller passes `selfLayOnly` after checking the plot's utilities

The tolerance and the end-swap guards were proved by removing them one
at a time and watching the suite fail. Both are the kind of thing that
looks like defensive noise until it is deleted.

## Levels at the cut-out, and a circuit fed through boards

Reported with the drawing: no levels at either cut-out, **"Circuit 1
has no supplies on it — nothing to trace"** about a circuit feeding 65
flats through four MSDBs, and Circuit 2 absent from the report
entirely. Two faults, both in the levels check.

**`runLevelsCheck` walked the raw drawing.** A board's flats live in
`MSDB_Plot_IDs` and are not meters on the canvas, so `circuitMembership`
found nothing for a circuit whose only members are boards, and the
trace refused it. `withAssumedMeters` is what the BUILD has always used
and what the node labels use; this was the third reader of the same
drawing and the one that had not been told — **recurring fault 27
exactly**, and the third instance of it in this file. The reader that
was not told sees a circuit with fewer things on it and says so with
confidence.

**And the trace pruned the run to a cut-out.** `spanTrace` drops
branches carrying no load, with one exception: a branch holding a STOP
is kept, which is what saves a span node at the end of a dead trench.
Neither saved this. A cut-out's stop stands at the FAR end of the run,
and the nodes between the origin and it hold no load and no stop — so
the walk was cut at the first of them and the whole leg vanished. One
leg of 11.9 m for a circuit with two supplies and two cut-outs on it,
and no figure at either cut-out.

The walk now asks `carriesCable`, which is the rule the build's own
walk uses. Demand is per-walk, so an output of a link box is unaffected:
a cut-out on another output is not in this walk's set and its branch is
not demanded here.

**The build knew about demand and the trace did not — same tree, two
readers, one told.** That is the second time in this session's work on
the cut-out that a rule was taught to the router and not to the thing
that reports on it; `carriesCable` exists precisely so there is one
place to teach, and both these faults are readers that were not routed
through it. If a third turns up, look for a `cum[i] > 0` that should be
`carriesCable`.

**A fixture that proved nothing, again.** The first levels case ran the
trench straight from the plot to the cut-out, so the cut-out's own stop
was the very next node and the stop exception saved the branch by
accident: the case passed with the fix removed. It now has bare
vertices between the last load and the cut-out, which is what the real
drawing has eighteen of. Second time this session — see the cut-out
section for the first — and the same lesson: **when a fixture is
simpler than the drawing, the rule it tests is not the rule that
broke.**

## One circuit's cut-out is not every circuit's

Reported with the drawing: two heavy duty cut-outs, both set to
Circuit 2, **two LV cables to each** and two feeder end points at each
(A8/A9 from circuit 1, B8/B9 from circuit 2).

The cut-outs made it visible; the fault is older and wider.
`buildFeederModel` takes `msdbIds` and `hdcoIds`, and absent means
"count every one of them" — which is right for a whole-drawing trace
and was never true of a build. **The build has never passed either.**
It passes `circuitId`, and only `spanTrace` derives the sets. So every
circuit's walk counted every board and every cut-out on the drawing:
two circuits over one dig came out as two identical sets of nine runs,
each carrying the other's boards.

Worth sitting with, because it had been shipping for a while and
looked like a working feature. Two circuits over separate digs never
show it — each walk only reaches its own trenches, so the extra
membership costs nothing. It needs a shared dig to become visible, and
then it shows up as duplicated geometry that reads as a routing quirk
rather than as membership.

The model now derives both sets from `circuitId` when the caller hands
in neither. An explicit set still wins: the link box walk narrows by
output as well, which the circuit alone cannot express. Absent both,
everything counts, which is what the defaults were written for.

On the reported drawing: circuit 1 drops from nine runs to five and
touches neither cut-out; circuit 2 keeps three and reaches both.

**Levels at the cut-out.** Its editor shows "At the cut-out" — volt
drop and loop impedance — through `levelsAtBoard`, which is named for
the board because that is what wanted it first and is exactly the same
rule: a fitting standing on the run reads the figure of the stop it
stands on, resolved by reach because the stop is a separate feature a
metre or so away at the trench end. Blank with "Run the levels check"
until one has run, never a zero: an uncomputed figure and a genuine
nought read the same on screen.

The trace already handles a load-less terminal — `spanTrace` keeps a
branch that holds a STOP even when it carries no load, for the span
node case — so no change was needed there.

## A flat on a board has no seed

Reported with the drawing: **"Place the plot seeds first — 0 seed(s)
for 65 plot(s)"** on a project whose every dwelling is a flat on one of
four MSDBs.

`electricSteps` counted the whole plot schedule and wanted a seed for
each. A flat fed from a board has none and must not: the dwellings are
a TABLE on the board (0205/0206), their meters are assumed for the
length of a build, and there is nothing on the ground to seed. The
build was refused for not doing something it is not supposed to do.

The seeds step now measures against the plots that still want one —
the schedule less every flat a board has claimed, via `plotsOnBoards`,
which is the same reader `buildBlockers` uses, so the two cannot
disagree about which dwellings are on a board. Where none want one the
step is done, and the detail SAYS why: "every plot is a flat on an
MSDB — 65 need no seed". A silent subtraction reading "0 of 0" with 65
plots on the project is a fault report of its own.

**And the same fault one step along.** A service is dug to a seed, so
a drawing whose dwellings are all on boards has nothing to run one to;
`service` had no `enough` at all, which makes it a hard block, and it
would have been the next thing hit after the seeds were fixed. It is
now done when there is genuinely nothing on the ground to serve — no
plot seeds and no `nrs` supplies. One seed with no service is still a
step in progress and still says so.

Worth noticing as a pattern rather than as two bugs: **every gate in
the electric flow was written when a plot meant a house with a seed
on the ground.** A flats-only design walks through those gates and
each one refuses it for a different reason — the circuit lasso (no
seeds to draw round), the build blockers (no service trench), and now
these two. If another flats-only refusal turns up, look for the same
assumption rather than treating it as new.

Note also that steps carrying no `enough` block hard by construction
(`allows` refuses anything not `enough`): `mains`, `nodes` and `build`
are still in that position. That is correct for `mains` — no dig, no
route — and worth a thought for the others if a drawing ever legitimately
has none.

## A cut-out at the end of the line

0209 gave the heavy duty cut-out one behaviour and defended it: a
fitting spliced into an LV feeder, the conductor continuous through
it, ending no section and creating no feeder end point. `checkhdcutout`
holds that silence.

It is half of what a cut-out is for. The other half is one placed at
the **end of a mains trench** — before any cable exists — as the thing
the run terminates in. **Nothing is assigned to it**, and that is
exactly why the build could not see it: the router follows load, a
branch with no meters is worth nothing, and the cable stopped at the
last plot with the trench past it empty.

**The rule added is one idea.** A branch holding a cut-out is worth
cabling even with no load on it. The cut-out *demands* a cable; it
does not pretend to be load. `demand` sits beside `meterCount` and
`meterKva` in the model, accumulates upward as `cumDemand`, and is
deliberately NOT folded in as a phantom meter — every figure those two
feed (cable counts, way loading, the bill, the levels, the service-tail
walk) would then be reporting a customer that does not exist.

**`carriesCable` is one rule with one name**, because three readers ask
it: the section walk, `junctionNodes` and `endOfLineNodes`. Three
separate spellings of `cum[i] > 0` is how a branch would come to be
cabled by the router and then ignored by the thing that numbers its
stops. It tolerates a model built before demand existed — an absent
array reads as no demand, which is what those models meant.

**The feeder end point is not special-cased.** At the end of a dig the
cut-out is the last node the walk reaches, so the section ends there,
so the end-of-line pass marks it, so a point lands on it: the same
three steps as any other end. The only extra is `cablesAt`, a floor of
one cable on a demanded run — `cablesFor(0)` is none, and a section
carrying zero cables is a route the build walks and lays nothing along.

**What must not change, and how it is held.** A cut-out spliced
mid-run stays passive. Nothing adds the role to `breakAt`, and that is
a decision rather than an omission: 0209's passivity is a promise
about a fitting a cable runs through, and reaching one must never
become a second way of saying "stop here". `checkhdcoterminal` case 5
holds it, and it was proved by wiring the leak in (`|| cumDemand[u] >
0` on `isBreak`) and watching the case fail.

**Two faults in the check itself, worth reading.** The first pass at
that proof passed while testing nothing: the spliced cut-out stood
thirty metres from the nearest trench vertex, so the model never
attached it, and a fitting that is skipped breaks nothing whatever the
rule says. The fixture now puts a vertex under it and the case asserts
the attachment before asserting the behaviour. **A passivity test on
an object the model never saw is a green light for anything.**

And `checkhdcutout` needed repairing on the way through. It extracted
the placement branch as `canvas.slice(at, at + 3000)` — a fixed window
— so adding comments to that branch pushed the code past the 3,000th
character and four assertions failed at once with nothing wrong: the
check reporting its own window in the voice of a broken cut-out. It
now slices to the branch's own end. Three more assertions were pinned
to the variable name `hit`, which had to become `onLine` when the same
code learned to serve a bare trench as well as a cable; they match the
rule now. **That is the third brittle assertion of this kind this
session** — see the blocker section — and they share a shape: a check
written against the text of an implementation rather than against what
it does.

**Placement and editing.** `mainsTrenchAt` finds the dig under a
click; the LV feeder is tried first so splicing still wins where there
is a cable, and service trenches are excluded (a cut-out on one is the
plot's own, and feeders are not routed down service spurs). A
trench-placed cut-out gets no `On_Cable_ID` — naming a trench as the
cable it is spliced into would be a lie the next reader cannot catch —
and no circuit, so its editor asks: Circuit (offering the way-only
circuits, since a terminal on a run of its own is exactly the case
with no members to have made one) and Supply (kVA), zero by default
and counted as load when stated.

**No migration.** 0209's role and style already cover the feature; the
new facts are attributes.

## The build refused a drawing it could build

Reported with the drawing attached: three MSDBs of flats, four
non-residential supplies, no ordinary plots to speak of, and Auto
Build LV Network refusing with **"2 plots with no service trench: ,
."** — a count, a comma, and nothing else.

Two separate faults behind one line, and both are worth keeping:

**The rule was wrong for a supply in the mains dig.** The two flagged
features were EV charge points drawn ON the mains route, 0.1 m off it.
`buildBlockers` asked only whether a *service* trench was within eight
metres; a supply teed off the main where it already runs has no
service trench to find, and never will have. Running the drawing
through `buildFeederModel` settled it: both meters attached, nothing
skipped — **the build could have run**. That is the blocker crying
wolf, which its own notes call the worst way for it to be wrong.

It now also passes a meter standing in the mains dig, at two metres
rather than eight: in it, not beside it. The two facts are different —
a service trench near a plot is somebody's intent to serve it, a mains
trench passing nearby is not — and the check holds that line with a
plot six metres off the mains route still being refused.

**A supply is not a plot, and the message could not name one.** Labels
came through `plotLabel(plot)` with `plot` null, so the list rendered
as two commas. `buildBlockers` now names a supply from its `nrs` seed,
or from the meter's own label less the "Electric Meter" prefix it is
built from, and marks it `isSupply`; the canvas counts plots and
supplies apart so neither is called the other. The comment saying "an
NRS supply is not a plot and has no plot number to show" was already
in the file, one line above the code that labelled it as a plot
anyway.

**A brittle assertion, fixed while passing through.**
`checkbuildblockers` pinned the message-building line by its exact
text and failed the moment a `.filter(Boolean)` was added to it. An
assertion that tests the spelling of a line rather than what it does
fails for no fault, and whoever edits it to pass has quietly stopped
testing anything — it now matches the rule.

**Noticed, not touched:** `src/features/gis/checkbuildblockers.mjs` is
a stale duplicate of the root check and differs from it. `checkall`
reads the root directory only, so it never runs — the same shape as
fault 22, left alone because deleting somebody's file is not this
session's business.

## Circuits without a lasso

Link to Circuit works by drawing round plot seeds that carry meters,
and membership is written on those meters. A design that is just flats
fed from an MSDB has neither: the dwellings are a TABLE on the board
(0205/0206), their meters are ASSUMED for the length of a build by
`withAssumedMeters`, and `circuitsFrom` counted drawn meters alone —
so on a flats-only drawing no circuit could ever exist. The build
stayed gated off ("No circuits yet — draw round the plot seeds"), the
board's Circuit picker was empty, and there was no door out.

The flow now, in the order somebody uses it:

1. **Substation editor, spare way row → + New circuit.** Writes the
   way map on the DRAFT — like the "free" button beside it, and for
   the reason recorded there: written straight to the database the row
   does not move, and Save puts the old map back. The circuit exists
   from the save, holding nothing, on the way it will occupy — **and
   named from the moment it exists**.

   The number is `nextCircuitNumber`: max + 1 across every number in
   use (member ids, way allocations, and any "Circuit N" name), NOT
   `nextCircuitId`'s lowest free gap. The gap rule is right for the
   lasso, where the number is machinery and reusing a freed one keeps
   the numbering tight. It is wrong for a button somebody presses
   while reading a board: on a drawing carrying Circuit 2 and Circuit
   3 it named the new one **Circuit 1** and listed it under them —
   a row that reads as though the board were being counted backwards.
   Reported from the screenshots, and the reason this rule is separate
   from that one rather than a change to it.

   One number serves as id, name and letter, which is the point of
   taking max + 1: it is always free, so `Circuit_ID`, "Circuit N" and
   `circuitLetter(N)` cannot drift apart, and the cable labels that
   read way-then-letter still agree with the schedule.

   The name lives in a `Circuit_Names` map on the substation's
   attributes, because a memberless circuit has no member to carry it
   and `renameCircuits` writes members; the way row edits it,
   `circuitChoices` reads it, the board pick carries it onto the first
   member, and clearing the way clears it too.

   **And the name box has to be wide enough to read it in.** Reported
   as "the name still isn't appearing", and it was there the whole
   time: `.fe-cwrap` is a flex row, `.fe-cname` was `width: 100%` with
   nothing to stop it shrinking, and a MEMBERLESS circuit puts two
   more things in that cell — "nothing linked" and "Clear this way".
   The input was the only shrinkable thing there, so it collapsed to
   about thirty pixels and showed no character of the name. The cell
   wraps now and the input keeps a 110px floor.

   Worth reading twice, because the fault survived three rounds of
   looking for it in the logic: a value test cannot see this. The
   jsdom harness that clicked the button reported the box's value as
   "Circuit 4" — correct, and unreadable on screen. jsdom computes no
   layout, so **a check that reads values will pass while the screen
   is wrong**; the guard is a style assertion, which is what
   `checkboardcircuit` now carries.

   It was invisible until a memberless circuit became ordinary. One
   only existed before when somebody emptied a circuit; a circuit born
   on a spare way is memberless from birth, so this became the first
   thing seen after pressing the button.
2. **The board's Circuit picker** reads `circuitChoices(features)`:
   `circuitsFrom` plus every way allocation on an electric origin that
   no member answers to. A way-only entry names its way and the origin
   whose board holds it; picking it on a drawing with more than one
   origin writes `Circuit_Origin_ID`, because whichever substation's
   board the way was taken on IS the answer to "fed from".
3. **Saving the board is the membership.** `circuitsFrom` now counts
   an msdb carrying `Circuit_ID` as a member in its own right (a
   `boards` array beside `meters`, meters first so a named circuit
   keeps its name). Everything downstream follows from that one
   change: the menu gate opens, the report lists it, and
   `withAssumedMeters` turns the flats into meters on the circuit for
   the build exactly as before.
4. **The save completes the canvas's half.** `saveFeature` on a board
   with a circuit ensures node A0 stands on the origin and the LV way
   is booked — the same two acts `createCircuitFrom` performs when the
   lasso makes a circuit, ENSURED rather than made, so a board joining
   a lasso-born circuit finds both there and changes nothing.
   `assignWay` reuses a way the circuit already holds, so no second
   way is taken.

Honest numbers where they were silently short: the substation's way
rows add each board's `MSDB_Total_kVA` and read "⚡ 2 meters + 45
flats · N kVA" — the count through `boardFlatCount`, which reads the
picked plots (`MSDB_Plot_IDs`) first and the manual apartment table as
fallback, because the first cut counted the table alone and a board of
one picked plot showed "0 meters" against its real 1.5 kVA on the same
line; a lasso joining a board-borne circuit counts the board's load in
the way figure; and `nextCircuitId` counts way
allocations, so the number a newborn circuit holds cannot be reissued
to the next lasso — two circuits behind one id, told apart by nothing,
is the fault that rule prevents.

What was deliberately NOT done: memberless way-only circuits are
invisible to `circuitsFrom` on purpose — the build, the report and the
gate all want circuits that hold something, and only the pickers read
`circuitChoices`. A way-only circuit that never gains a member shows
on the substation board as "nothing linked" with the existing free
button, which is the honest state of it. No migration: everything
here is attributes the schema already carries.

## What's built

26 screens across 8 areas.

**Business Development** — Customers & Projects, Organisations.

**Tendering & Design** — Projects list (burger menu, column
sort/filter/resize, priority and hidden toggles, utility chips, points)
and project tabs: Details, Stakeholders, Plots, Non-Res Supplies, POC
Applications, Outline Designs, Asset Value, History, Comments, Invoices.
Revisions at Tender stage with per-design carry-forward and Resurrect.
Plus the **GIS Canvas**: basemap import and calibration, drawing with
snapping, vertex editing, plot seeds with per-plot meters, joints,
network tracing, undo/redo, trenching and routing, auto-service, feeder
cables, gas and water networks, span nodes, volt drop, BOM, circuit
report, bulk edit and delete, the HV ring (primary, chain substations,
normally open point, existing HV cable), and annotation — cross-section
marks, and text notes with leaders.

**Operations** — Call-offs (phases, team assignment, work days,
energisation per utility), Planning (timeline, dependencies, lag,
weekend working, PM colours, cross-team moves), Plot Connections.

**Commercial** — Asset Value register and Generate AV Invoices
(source-mapping driven, preview with per-row status, numbering, bulk
XLSX upload).

**Human Resources** — all sixteen modules. See the README: it is the
former standalone portal mounted into the shell, still vanilla JS, still
pointed at its own Supabase project, and **still has no sign-in**.

**Admin** — Organisations, Customers & Branches, People & Roles, Sub
Region, Status Workflow, Points Configuration, Electric Specs, Property
Config, IDNO Source Mapping, Teams, GIS Styles, pipe sizes, admin menu,
plus generic table editors.

## Open work, roughly in priority order

1. **Human Resources has no authentication.** The portal bypassed its
   own login and uses the anon key as the bearer token, against a second
   Supabase project, direct from the browser. Anyone who can open
   Aptus360 can open payroll and sickness records. This is the only item
   on this list that is a disclosure risk rather than a missing feature.

2. **Recover the missing migrations from Supabase.** `0138_project_tabs`,
   `0163_bom_bottle_end_name` and `0182` were pasted into the SQL editor
   and never committed. About twenty numbers are absent across 0001–0187
   and those three are the ones something reads. With no migration
   runner, that folder is the only record of the schema there is — so
   every absent file is a change nobody can reapply to a fresh database,
   and a rebuild would silently come up short.

   Get them out of the live project (`pg_dump --schema-only`, or the
   Supabase dashboard's migration history) rather than writing them from
   the checks that read them: 0138 encodes decisions about what each
   part of the business sees, 0163 replaces a function whose body is not
   in the repo, and a plausible guess in that folder is worse than a gap,
   because a gap is visible. Two checks fail until this is done.

   `checkmigrations.mjs` exists now and holds the folder to a baseline
   of what is absent, failing on a new gap and on a recorded one that
   gets filled. It also corrects the count: **eighty-five numbers are
   absent across 0001–0195**, not "about twenty" — 0002–0049 as one
   block and thirty-six singly. Only three are understood. That is the
   size of what a rebuild from this folder would come up short by.

3. **Move the pickers to `Organisation_ID`.** Columns and views exist
   (`0048`), lookups are served (`orgIdnos`, `orgDnos`,
   `orgFireAuthorities`, `orgSubcontractors`, `orgSuppliers`,
   `customerBranches`) — and are currently referenced by **nothing** in
   `src/features/`. Seven screens still read `lookups.idnos`,
   `lookups.dnos` or `lookups.customers`: Outline Designs
   (`DesignEditModal`), Non-Res supplies, POC applications, AV invoices
   (`GenerateAvInvoices`, `AssetValueTab`) and Customers & Projects.
   Each swaps its lookup key and the column it writes. Then retire the
   Customer / IDNO / DNO / Fire Service admin screens and run the drop
   statements at the foot of `0048`.

4. **Four navigation decisions left open** by the landing-page change,
   all one-line edits in `navigation.js`:
   - **Organisations** sits under Business Development. It isn't in the
     original brief for that area; it went there rather than be
     orphaned. Admin is the alternative.
   - **"Asset Value"** maps to `av-invoices`, the built register. An
     unbuilt `asset-value-invoices` carried the same label in the old
     nav — confirm which one is meant.
   - **Finance** was invented: Invoice Log plus the four Credit Control
     screens. Nothing in it is built.
   - **Equipment absorbed Generator Hire.** Says so on the placeholder.

5. **`GISCanvasPage.jsx` is 23,779 lines** and 685 kB built — the
   largest chunk in the app by a wide margin, and where most new work
   lands. Not a bug, but it is now the biggest structural risk in the
   repo. The extracted modules beside it (`feeder.js`, `gasNetwork.js`,
   `routing.js`, and now `feederPoints.js` and `anchorFollow.js`) are
   the pattern to keep pulling on.

   The line count above said 12,169 and was about half the truth. Worth
   reading as a measure of how fast this file grows rather than as a
   figure to trust: check it before quoting it. Faults 29 and 30 are
   both cases of a rule that could not be tested because of where it
   lived, so the argument for pulling on this is not tidiness.

6. **Contract Designs tab** is still a placeholder pending a modelling
   decision: `CD_*` columns on `Project_Scope` versus a separate
   `Detailed_Design` table. The tab itself sets out both options and
   when each is right. Needs an answer from whoever runs design, not a
   developer.

7. **AV invoicing: PDF generation and email drafts** were deliberately
   not built. The original uses jsPDF and a `mailto:` draft; no PDF
   library is in `package.json`.

8. `Carried_Forward` on designs means "copied from the previous revision
   rather than redrawn" — set by the revision flow, read by nothing.
   Decide whether it should affect points.

9. `Manual_Total_Points` exists; nothing writes to it.

10. **Three pickers still filter operators to `["dno", "idno"]`.**
    `orgOperators` in `netlify/functions/lookups.js` keeps the two-role
    list that 0172 widened to six everywhere else, and it feeds Drawing
    Standard on the GIS canvas, GIS Styles and Raise Invoice. So Cadent
    can now record that it works in gas — that was fixed in
    `OrganisationsAdmin.jsx` this session — and still cannot be chosen
    as a drawing standard.

    Left alone deliberately: widening it changes what appears in three
    pickers including AV invoicing, and whether a gas transporter should
    be selectable there is a question for whoever runs commercial, not a
    one-line edit. `checkrolefilter.mjs` covers the admin screen and the
    view; it does not cover this lookup.

11. **The bill counts cross-section marks.** "Sectionmark 2 no." on
    every project where one was placed, since 0214. One line to fix and
    not fixed, because it removes rows from bills that have been issued
    — see fault 153, and the head of 0229 for the change and the query
    for what it would affect. Needs an answer from whoever owns
    commercial, not a developer.

12. **`checkbuttons.py`: 36 house-style deviations.** It said 30 and was
    counted again this session; nothing in between added to it. `.row-edit` and
    `.row-del` where the house set wants `btn edit sm` / `btn delete sm`,
    bare `×` buttons that remove things, and a duplicate `.row-del`
    rule in `OrganisationsAdmin.jsx` that the shared stylesheet already
    defines. All cosmetic and all pre-existing — the Python checks never
    gated anything before this session, because the old `check` script
    ran them in a shell loop that discarded their exit codes.
