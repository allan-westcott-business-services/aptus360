# Aptus360 — handover notes

Written at the end of the session that built migrations 0001–0048.
Accurate as of that point — check `supabase/migrations/` for anything later.
Upload this alongside a zip of `src`, `netlify`, `supabase`, `package.json`,
`vite.config.js` and `netlify.toml`.

## How the project is worked on

Files are delivered as zips, copied into the repo by hand, committed via
GitHub Desktop; Netlify builds automatically. SQL migrations are run by
hand in the Supabase SQL editor — **there is no automatic migration
runner**, so a schema change only exists once it's been pasted and run.

Migrations live in `supabase/migrations/`. Highest run: **0048**.

## Architecture

- React + Vite, deployed to Netlify
- Netlify Functions under `netlify/functions/`, one file per endpoint
- Supabase (Postgres) with the service-role key in the functions only
- `src/api/*` wraps every endpoint; components never call `fetch` directly
- `VITE_USE_MOCKS` switches the API layer to in-memory fixtures

**Calculations live in the database**, deliberately. Points, plot refs,
invoice totals, status promotion, network tracing and line lengths are
triggers or functions, so they hold however the data is changed —
including by hand in the SQL editor.

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
   is neither saved nor returned. Hit three times. `checkcols.py` at the
   repo root compares the two.

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

**Projects list** — burger menu (Edit, Revision, Plots, Non-Res, POC,
Outline Designs, Asset Value, Stakeholders, History, Comments, Progress
Report [disabled], Priority, Delete, Resurrect), column sort/filter/
resize, Priority and Show Hidden toggles, utility filter chips, points
column.

**Project tabs** — Details, Stakeholders, Plots, Non-Res Supplies, POC
Applications, Outline Designs, Asset Value, Contract Designs
[placeholder], History, Comments, Invoices [placeholder].

**Revisions** — Tender stage only, per-design carry-forward choice, the
previous revision superseded, and Resurrect to unlock one.

**Admin** — Organisations, Customers & Branches, People & Roles, Sub
Region, Status Workflow, Points Configuration, Electric Specs (8 tabs),
Property Config, IDNO Source Mapping, plus generic table editors.

**Plot Connections** — standalone cross-project page under Operations,
with inline editing, bulk date setting and a New Schedule modal.

**GIS Canvas** — under Commercial. Basemap import (PDF or image),
calibration with a zoomable loupe, grid reference tie point, drawing
tools with snapping, vertex editing, plot seeds placed individually with
per-plot meters, joints, network tracing, meter assignment, right-click
feature editor.

**Generate AV Invoices** — under Commercial. Source-mapping driven,
preview with per-row status, invoice numbering, bulk upload XLSX.

## Open work, roughly in priority order

1. **Move the pickers to `Organisation_ID`.** Columns and views exist
   (`0048`), lookups are served (`orgIdnos`, `orgDnos`,
   `orgFireAuthorities`, `orgSubcontractors`, `orgSuppliers`,
   `customerBranches`). Each screen swaps its lookup key and the column
   it writes: Outline Designs operator, POC applications, AV invoices,
   Non-Res supplies, Plot connections, Stakeholders fire authority, the
   developer picker. Then retire the Customer / IDNO / DNO / Fire
   Service admin screens and run the drop statements at the foot of 0048.

2. **GIS undo/redo — missing entirely.** The original has six functions
   for it. A drawing tool without undo means every misplaced click is a
   delete-and-redraw. The largest usability gap in the app.

3. **GIS trenching.** ~50 functions in the original: auto-generating the
   trench carrying a set of cables, lane allocation, quantities. This is
   where the commercial value sits, since trench metres drive cost.

4. **Contract Designs tab** is a placeholder pending a modelling
   decision: `CD_*` columns on `Project_Scope` versus a separate
   `Contract_Design` table.

5. **Project Invoices tab** is a placeholder — needs `Invoice_Line` and
   an Audacia CVR import matching column B against `Contract_Number`,
   done as a Postgres RPC rather than a Netlify function.

6. **AV invoicing: PDF generation and email drafts** were deliberately
   not built. The original uses jsPDF and a `mailto:` draft.

7. `Carried_Forward` on designs means "copied from the previous revision
   rather than redrawn" — set by the revision flow, read by nothing.
   Decide whether it should affect points.

8. `Manual_Total_Points` exists; nothing writes to it.

## Scale of the GIS gap

The original has **485 GIS functions**; roughly 25 equivalents are
built — about 5%. What exists: basemap import with calibration and
georeferencing, pan/zoom/select, layers, drawing with snapping, vertex
editing, plot seeds with per-plot meters, joints, network tracing, meter
assignment, a feature editor. What doesn't: undo/redo, trenching, lane
allocation, auto-service-trench, the audit view, and most of the
electrical symbol work.
