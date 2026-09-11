# Aptus360 — handover notes

The migrations folder now runs to **0211**. Three numbers are absent
and READ or REQUIRED by something: **0198** (`checkdevelopers` reads it
and throws), and **0208 / 0210** — both written and described in this
file, both "not yet run" at the time, and neither committed. 0209 was
found sitting in `supabase/` rather than `supabase/migrations/` and
moved in (which is what was crashing `checkhdcutout`); `checkmigrations`
now names all three absences. Recover them from the live project rather
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
| `node checkboardcircuit.mjs` | A circuit born on a spare way, membered by a board |
| `node checkhdcoterminal.mjs` | The build runs out to a cut-out at the end of the dig |
| `node checkservicemoved.mjs` | Auto Service re-lays the plots whose ground moved, and only those |
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

### The nine that still fail

Two are **migrations that were pasted into Supabase by hand and never
committed.** The folder has 110 files across 0001–0195 and eighty-five
numbers are absent — see `checkmigrations.mjs`, which holds that set as
a baseline. Since there is no migration runner, that folder is the only
record there is.

- `checkprojecttabs.mjs` — needs `0138_project_tabs.sql`, the seed
  saying which tabs each area hides.
- `checkbottleends.mjs` — needs `0163_bom_bottle_end_name.sql`, the
  bill's joint-name `CASE`.

`0182` is missing the same way and nothing reads it yet. **Do not
reconstruct these from the checks.** 0138 encodes decisions about what
each part of the business sees, and 0163 replaces a function whose body
is not in the repo; inventing either writes a guess into the only record
the schema has. They want recovering from the Supabase project.

Both checks now degrade to a **named failure** rather than throwing, so
they no longer take the rest of the suite down with them. That pattern —
`try` the read, `fail("... is missing")`, skip the section — is the one
to copy for any check that reads a file it does not own.

`checkdevelopers.mjs` fails the same way and was not recorded: it needs
`0198_developer_organisation_branch.sql`, and it still THROWS rather
than degrading to a named failure, so it takes its own report down. It
wants the same `try`/`fail`/skip treatment as the two above — left
alone this session because the fix is a check nobody has read against a
migration nobody has recovered, and guessing at either is how the two
above got their warning.

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
 The
attribute was maintained by `gis_length_trg` AND written by hand from
the Feature Editor. Closed — see recurring fault 44, which splits it
into two columns and takes the client off the trigger's one entirely.

**A seed is three points.** The symbol, the boundary position, then
where the service trench ends — and only then its meters. The boundary
and the end of the dig were one point until 26 Aug, which made every
service stop at the property line when on the ground it crosses the line
and runs on. The boundary is a vertex ALONG the route now, which is also
what the on-site and off-site lengths are split at. The tee is still
worked out from the boundary rather than from the end: it is where the
service crosses the line, so it decides where the dig leaves the main.
Seeds carrying only a boundary point still dig to it, and `planSeed`
reports which shape each was on.

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
report, bulk edit and delete, and the HV ring (primary, chain
substations, normally open point, existing HV cable).

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

11. **`checkbuttons.py`: 30 house-style deviations.** `.row-edit` and
    `.row-del` where the house set wants `btn edit sm` / `btn delete sm`,
    bare `×` buttons that remove things, and a duplicate `.row-del`
    rule in `OrganisationsAdmin.jsx` that the shared stylesheet already
    defines. All cosmetic and all pre-existing — the Python checks never
    gated anything before this session, because the old `check` script
    ran them in a shell loop that discarded their exit codes.
