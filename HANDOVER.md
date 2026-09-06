# Aptus360 — handover notes

The migrations folder now runs to **0203**. The line here said 0195 and
0196-not-yet-run, which was true when it was written; 0196 to 0203 have
landed since, and **0198 is absent** — `checkdevelopers` reads it and
throws. Whether 0196 onwards have been pasted into Supabase is not
something this file can know, since there is no migration runner: check
the SQL editor's history before assuming the schema matches the folder.

**Last session was a GIS session.** Three faults in Build LV Network
and the link box are fixed and written up as recurring faults 28, 29
and 30: cable size overrides lost on every rebuild, a link box's label
and sequence not following the walk, and a `Span_Anchor` left behind
when its point is dragged. Two modules came out of `GISCanvasPage.jsx`
in the process — `feederPoints.js` and `anchorFollow.js` — because in
both cases the rule could not be tested where it lived. Three checks
were added. Nothing in the schema changed; no migration was written.

**The session before was a test-suite session**, not a feature one. `npm test`
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
| `node checkprogress.mjs` | A routine that takes seconds says what it is doing |
| `node checkcutout.mjs` | The cut-out figure sits at the meter it belongs to |
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
report, bulk edit and delete.

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
