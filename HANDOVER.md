# Aptus360 — handover notes

Rewritten at the end of the session that added the landing page and
area-scoped navigation. Migrations run to **0157**.

The body below still describes the state at 0136 and has not been
re-checked against everything that landed since — call-off utility,
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

Run these after touching the relevant area. They exist because each one
caught a fault that had already shipped at least once.

| Script | What it checks |
|---|---|
| `node checknav.mjs` | Every rendered view sits in an area; no view in two areas; area colours distinct; areas open on a built screen |
| `node checkhome.mjs` | Mounts the shell in jsdom and drives it — landing page, per-area menus, back navigation, reload restore |
| `node checkhr.mjs` | Mounts all sixteen HR modules; icons, modals, sidebar bridge |
| `node checkspannodes.mjs` | Span node origins, and which node a cable run feeds |
| `node checkspaneditor.mjs` | Mounts the span node editor; both sizes shown, override read |
| `node checkbottleends.mjs` | Bottle ends at feeder ends only, not on every dead end |
| `python3 checkdefs.py` | Calls with no definition, state set with no `useState` |
| `python3 checkcols.py` | Explicit column lists against the schema |
| `python3 checkorder.py` | Use before declaration (heuristic — read the hits, see fault 2) |
| `python3 checkescapes.py` | `\uXXXX` in JSX attribute strings |
| `python3 checkmodals.py` | Modals rendered inside the clipped canvas wrapper |
| `python3 checklocks.py` | Geometry writes behind a lock check |
| `python3 checkadmin.py` | Table names the admin endpoint will accept |
| `python3 checkbuttons.py` | Button classes against the house set |
| `python3 checkdead.py` | Unreachable statements |

`checkorder.py` currently reports two hits, `rollback` and
`zoomToPoints`. Both are false positives: each is referenced inside a
`function` body that only runs on user action, by which time the `const`
is initialised. Don't "fix" them.

**`npm test` does not currently run.** Its first step is
`checkimports.mjs`, which is not in the repo and is not in git history
either; `checklazy.mjs` is missing the same way, and
`checkprojecttabs.mjs` reads `supabase/migrations/0138_project_tabs.sql`,
which is also absent. The suite dies on step one, so anyone who has been
running `npm test` and seeing it stop has been reading a missing-file
error as a pass. Run the scripts individually until those three are
restored. Related: the migrations folder has 78 files but 0002-0049 and
a scatter of later numbers are missing — since migrations are pasted in
by hand, that folder is the only record there is.

**A check that re-implements the thing it tests proves nothing.**
`checkspannodes.mjs` carried local copies of `nodeFedBy` and the node
sync and went on passing through every fault listed under 13 below,
because the copies were right and the functions they stood for had
moved. It imports them now. When adding a check, import the real
function or move the logic somewhere it can be imported from.

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

2. **Move the pickers to `Organisation_ID`.** Columns and views exist
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

3. **Four navigation decisions left open** by the landing-page change,
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

4. **`GISCanvasPage.jsx` is 12,169 lines** and 806 kB built — the
   largest chunk in the app by a wide margin, and where most new work
   lands. Not a bug, but it is now the biggest structural risk in the
   repo. The extracted modules beside it (`feeder.js`, `gasNetwork.js`,
   `routing.js`) are the pattern to keep pulling on.

5. **Contract Designs tab** is still a placeholder pending a modelling
   decision: `CD_*` columns on `Project_Scope` versus a separate
   `Detailed_Design` table. The tab itself sets out both options and
   when each is right. Needs an answer from whoever runs design, not a
   developer.

6. **AV invoicing: PDF generation and email drafts** were deliberately
   not built. The original uses jsPDF and a `mailto:` draft; no PDF
   library is in `package.json`.

7. `Carried_Forward` on designs means "copied from the previous revision
   rather than redrawn" — set by the revision flow, read by nothing.
   Decide whether it should affect points.

8. `Manual_Total_Points` exists; nothing writes to it.
