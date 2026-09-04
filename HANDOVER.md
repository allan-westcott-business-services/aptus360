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

**Length_m has two writers and one meaning too few — OPEN.** The
attribute is maintained by `gis_length_trg`, a database trigger that
recomputes it from the geometry (see the comments in `0050` and
`0056`), AND it is written by hand from the Feature Editor's "Measured
length" field, which exists precisely so a run that rises through ducts
can say it is longer than it is drawn. Those are opposite meanings for
one column, and neither writer knows about the other.

The visible symptom is a line label reading "12.4 m entered" after the
trench has been re-routed — `lengthLabel` prefers `Length_m` and marks
it as entered, so a trigger-written figure is indistinguishable from a
measurement somebody took, and a stale one is indistinguishable from a
current one.

**The trigger's body is not in the repo** — it is one of the
eighty-five absent migrations — so which of these is happening cannot
be settled from the folder:

- the trigger fires on geometry change and the browser simply does not
  re-read (the move handler saves and does not reload), so the value is
  right in the database and stale on screen; or
- the trigger does not fire on the paths a re-route uses, and the
  stored figure really is stale; or
- the trigger fires and silently destroys hand-entered measurements
  whenever anything is dragged.

The fix differs completely between the three, and the third is a data
loss nobody has reported yet. **Get the trigger out of Supabase before
touching this** (`pg_dump --schema-only`, or the dashboard's function
list) — this is the same instruction as recovering 0138 and 0163 and
for the same reason. The likely end state is two attributes rather than
one, a derived drawn length and a `Measured_Length_m` nobody but a
person writes, but splitting them means deciding what every existing
`Length_m` value MEANS, and that cannot be guessed per row.

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
