# The developer, not a copy of it, 26 Aug 2026

Two faults, one cause. The Customer Branch dropdown on a new project
offered every organisation in the register, and the Details tab then
said **Developers 0** on a project that plainly had one.

Underneath both: `Project.Branch_ID` and `Customer_ID` are a **cached
copy of the main developer**, kept by `sync_project_main_developer()`.
Creating a project wrote the cache and never the record.

## The database, already done

Run against the live project on 26 Aug, one statement at a time:

1. `Project_Developer.Organisation_Branch_ID` — already existed, from
   one of the eighty-five migrations run and never committed
2. the one-branch check constraint — **refused**, and rightly: five of
   ten rows had both columns set
3. every developer repointed from `Customer_Branch` 1/2/3 to
   `Organisation_Branch` 17/18/19
4. every project repointed the same way
5. `Project_Developer.Customer_ID` made nullable, then cleared
6. `Customer_Branch` and `Customer` emptied and their rows deleted
7. `Organisation_Branch.Developer_Code` added

The old customer model is out of the data. `Project_Developer` still
carries `Customer_ID` and `Branch_ID`; both are null on every row and
written by nothing. Dropping them is a separate decision.

## What the constraint told us

It failed, and that was the useful part. The five rows with both columns
set were the **older** ones — everything created since 2 August had only
`Branch_ID`. So the organisation columns had been added and back-filled
once, and the code that writes developers was never updated. The columns
were drifting out of use, not into it. A migration that had stalled
eight months ago and looked, from the data, like one in progress.

## The role

`customer`, labelled "Customer (Housing Developer)". The other ten roles
are IDNOs, DNOs, transporters, undertakers, suppliers, subcontractors,
fire and local authorities, and none of them is whose site this is.

Named directly now the catalogue has been read. The first draft matched
`/developer/i` against the label, because `Organisation_Type` is seeded
by an uncommitted migration and nothing in the repo could say what the
keys were. That match does find this row — the label ends in "(Housing
Developer)" — but by accident, and a rename in Admin would have emptied
the dropdown silently.

The catalogue is still read, so a reseeded database gets an explicit
error rather than an empty list. "No such role" and "no developer has a
branch yet" look identical in a dropdown and need different people to
fix them.

## The developer code

**Off the branch, not the customer.** It was defaulted from the
customer, so every branch of one housebuilder got the same code — Anwyl
Lancashire and Anwyl Wales both came out `AH`, which was live in the
data. The code prefixes plot numbers where a site has more than one
developer (`2607.014-AH-12`), so two branches of one company on one site
produced identical prefixes and no way to tell whose plot was whose.

Both routes read it from the branch — the Stakeholders tab and the
project form — so adding a developer either way produces the same code.
Two routes to one record that disagree is fault 13.

Left **editable**. The branch's code fills the box, but the code exists
to tell developers apart on a particular site, and a scheme with two
branches of one company needs whatever distinguishes them there. Where
the branch has no code the field says so rather than leaving an empty
box for one to be invented in — which is how `AH` came to mean two
branches.

## Files

| File | Change |
|------|--------|
| `netlify/functions/lookups.js` | Serves `developerBranches`, role-scoped, with each branch's code |
| `netlify/functions/projects.js` | Creating a project creates its main developer |
| `netlify/functions/developers.js` | The organisation columns, on the select list |
| `src/features/stakeholders/developerBranch.js` | **New.** Which branch table, once |
| `src/features/stakeholders/DevelopersSection.jsx` | Organisation branches; code off the branch |
| `src/features/projects/AddProjectForm.jsx` | Developer branches only |
| `src/features/projects/ProjectDetailsForm.jsx` | Names a developer on either table |
| `checkdevelopers.mjs` | **New** |

`supabase/migrations/0198_developer_organisation_branch.sql` is in the
folder as the record of what was run. **Do not run it as it stands** —
its check constraint is the one the data refused, and it is kept for the
column and the comments rather than to be executed.

## Still reading the empty tables

Four screens still resolve names through `lookups.branches` or
`lookups.customers`, both of which now return nothing: the Plots tab,
Call-offs, Customers & Projects, and the GIS canvas in two places. They
guard with `|| []` so nothing throws — they will show a blank where a
name goes, which is what an empty table already does.

Both lookups stay served for one release, named in a comment in
`lookups.js` so the next person can see what is left to move.

## The suite

**93 of 96.** The three failures are pre-existing: `checkbottleends` and
`checkprojecttabs` need migrations 0163 and 0138 recovering from
Supabase, and `checkaslaidplan` is the re-take that refuses without
saying why.
