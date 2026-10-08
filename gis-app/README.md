# gis-app

The GIS application's own database, built here before it gets a
repository of its own. The schema is the thing that is hardest to
change later, so it is written and proved first.

## Why it lives in this repository for now

Nothing here is loaded by Aptus360 — no import reaches into it, and the
build does not see it. It sits here so it is in version control and
reviewable alongside the plan it comes from, and it moves to the GIS
repository whole when that exists.

## What is here

`migrations/0001_accounts_and_gis.sql` — accounts, sites, plots, and
the ten GIS tables, with row-level security.

`test/run.sh` — builds a scratch database, applies 0001, and tries nine
ways to get at another account's drawings.

## The two walls

**Row-level security** stops a signed-in person reading or writing
another account's rows. Every policy goes through `account_ids()`,
which turns the signed-in user into the set of accounts they belong to.
Write policies carry `WITH CHECK` as well as `USING`, which is the half
that is easy to miss: `USING` says which rows you may touch, `WITH
CHECK` says what you may leave behind. Without it you could update your
own feature and set its account to somebody else's.

**Composite foreign keys** stop a row naming an account its parent does
not belong to. `GIS_Feature` points at `(Project_ID, Account_ID)`
together, so a feature on another account's project is not something
the database will store. This one matters most, because it holds even
for the service key, which bypasses RLS entirely by design.

Aptus360 has neither today: no policies anywhere, and every endpoint on
the service key. For one customer that is defensible — `_access.js`
argues it well. For several it is not.

## Running the test

    ./gis-app/test/run.sh

Read the output rather than the exit code. Blocks 4, 5, 7 and 8 are
supposed to print `ERROR` — that is the wall holding. Block 9 checks
that none of them wrote anything.

The first version of that test was wrong in a way worth recording: it
used `SET LOCAL ROLE`, which outside a transaction only warns and does
nothing, so every block ran as the table owner. An owner bypasses RLS,
so it reported that all nine walls held without having tested one.

## The functions

`migrations/0002_gis_functions.sql` brings the ten GIS functions
recovered from Aptus360. Seven come across as they stand. Three could
not:

- `gis_place_joints` INSERTS into `GIS_Feature`, which now has a NOT
  NULL `Account_ID`. It takes the account from the project it is
  drawing on rather than from a caller who could pass the wrong one.
- `gis_project_utilities` read `Project_Scope`, a tender concept that
  does not exist here. It reads `Project_Utility` now, returning the
  same shape so the canvas needs no change.
- `gis_set_length` is unchanged, but its trigger had to be re-created
  — a trigger belongs to a table, and these are new tables. That one
  matters: it maintains `Length_m`, which the bill of materials reads.

All ten are SECURITY INVOKER, so row-level security applies inside
them. `gis_trace_network` walking a network can only walk one the
caller may see. A SECURITY DEFINER function here would be a hole
straight through 0001's policies.

`test/functions.sql` runs each of them on real geometry. Two results
are worth knowing:

**`gis_assign_meters` measures to vertices, not to segments.** A plot
5m from the middle of a long straight cable reads as however far it is
from that cable's nearest *corner*. Carried across as it behaves
today; changing it is a decision, not a port.

**It is also slow by construction** — plots x lines x vertices, nested
in plpgsql. Fine at current sizes, slow on a large site.

## Not here yet Three are self-contained.
Two read tables that do not exist on this side — `gis_project_utilities`
read `Project_Scope`, `gis_seed_reference` read Aptus360's
`Project."Eastings"`/`"Northings"` — and both need rework rather than
copying. `Project_Utility` and `Project.Eastings`/`Northings` are in
0001 ready for them.

Also outstanding: what happens to `copy_project_drawing`, whose the
bill of materials is, and whether `GIS_Surface_Type` moves. None of
them block this migration. See the "Separating the GIS Module" plan.
