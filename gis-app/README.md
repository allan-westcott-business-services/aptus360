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

## Not here yet

The five recovered GIS functions (`0002`). Three are self-contained.
Two read tables that do not exist on this side — `gis_project_utilities`
read `Project_Scope`, `gis_seed_reference` read Aptus360's
`Project."Eastings"`/`"Northings"` — and both need rework rather than
copying. `Project_Utility` and `Project.Eastings`/`Northings` are in
0001 ready for them.

Also outstanding: what happens to `copy_project_drawing`, whose the
bill of materials is, and whether `GIS_Surface_Type` moves. None of
them block this migration. See the "Separating the GIS Module" plan.
