# Cumulative release

Everything changed since the working copy this started from. 29 files:
27 to copy over the repo, 2 migrations to run.

Copy the whole tree over `aptus360/` — the paths match. Nothing here
deletes anything, so a file you already have is simply overwritten with
the current version.

## Run these first, in order

    supabase/migrations/0181_top_tees.sql
    supabase/migrations/0182_bom_gas_tees.sql

0181 adds `hvtt` to the `Feature_Role` check constraint. Without it the
database rejects every tee and the placing routines fail on their first
write.

0182 reissues `gis_bom` so the two kinds of gas tee are named and
itemised by size. Safe to re-run — it is `CREATE OR REPLACE` and changes
no stored data.

Both carry a query at the top to run before and checks at the foot to run
after. Run each file whole: 0182 is one `CREATE OR REPLACE FUNCTION`
statement spanning most of the file, and part of it is not valid on its
own.

Both were executed against a real PostgreSQL 16 before release, with the
before-and-after totals compared.

## What is in it

**Label switches.** Mains, service, joint and span node level labels each
switch separately, under the master Labels switch, on all five menus that
offer it. Mains, services and joints start off; levels start on.

**Call-off day plots.** A plot can no longer be booked on two days of one
booking. The pill greys with the day that holds it, and a save that
would do it anyway is refused by name.

**Deleting a plot seed** takes its meters, service cables and pipes,
service trench, service joint and gas top tee with it. Found by the seed
stamp where there is one, and by position where the work was drawn by
hand. Asked before it happens, and one undo puts the plot back whole.

**Build the Whole Design** on Tools & Reporting: service trenches,
meters, span nodes, mains, services and joints in dependency order,
skipping utilities that are not contracted and reporting what it did.
**Build All Mains** and **Lay All Services** do the same for one step
each. A progress bar names the stage; Stop stops the run.

**Everything drawn starts as Planned.** Trenches and mains get a build
status at creation instead of the editor displaying one that was never
stored.

**Bulk Delete** splits joints into service, breech, straight and bottle
end under Electric only, and the two gas tees under Gas only.

**Gas tees.** A high volume top tee wherever a service meets a main, and
a main tee wherever one main branches off another — placed automatically
after the services are laid and after the gas network is built, with
backfill buttons in the Gas menu. Sized from the main they are clamped
to, editable from a dropdown of configured pipe sizes.

**A step part-way done no longer blocks the next one.** Seeds on 69 of 72
plots asks whether to carry on rather than refusing.

## Checks

`checkimports.mjs` is new and was missing from the repo entirely, though
`npm test` has always referenced it. It resolves every local import
against the exporting file, which is the check that would have caught the
deploy that failed on a renamed export.

`npm test` still stops at the first `&&` because `checklazy.mjs` does not
exist either. Until that is written or removed from the chain, run the
checks individually. 58 pass; 14 fail, all of which failed the same way
before any of this work.

`checkseedlive.mjs` is a tool rather than a check — it reads an exported
drawing and reports why a seed's service was or was not found. It takes
arguments, so it is not in `npm test`.
