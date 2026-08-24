# Applying this change set

Files are delivered as zips and copied into the repo by hand, so this
folder mirrors the repo layout — copy it over the top and the seventeen
files below land where they belong.

**A zip cannot express a deletion, and four files have to go.** They are
the whole point of two of the fixes: both are stale duplicates that were
receiving edits nobody was running. If you copy the files and skip step
2, `node checkroutes.mjs` and `node checkorphans.mjs` will still fail
and one of the two call-off endpoints will still be live.

---

## 1. Copy these over the repo

```
.gitignore                                    (new)
HANDOVER.md
README.md
checkall.mjs                                  (new — the check runner)
checkdefs.py
checklazy.mjs                                 (new — was missing)
checkprojecttabs.mjs
checkservicesizes.mjs
netlify/functions/admin.js
netlify/functions/calloffs-all.js
package.json
src/features/admin/OrganisationsAdmin.jsx
src/features/gis/GISCanvasPage.jsx
src/features/planning/AssignmentModal.jsx
src/features/poc/POCApplicationsTab.jsx
supabase/migrations/0180_energisation.sql     (amended — see step 3)
supabase/migrations/0187_reducer_role.sql     (new — see step 3)
```

## 2. Delete these four

```bash
git rm netlify/functions/calloffs-FUNCTION.js
git rm src/api/calloffs-API.js
git rm src/features/poc/forms/openForm.js
git rm src/features/poc/forms/submissions.js
```

The first two are stale copies of `calloffs.js` that both declared the
same route and the same API surface. Netlify serves one and the other
sits there looking maintained. The stale function was missing
`Needs_Energisation`, `Dig_Rate_ID`, `Estimated_Half_Days`, the
per-utility energisation rows and the whole PATCH date-invalidation
block — a day's work that had gone into the copy that does not run.

The last two are the superseded popup mechanism. `prepareForm.js` and
`FormPreview.jsx` replaced them and say so in their own headers.

## 3. Untrack the `.DS_Store` files

Eleven are committed. The new `.gitignore` stops more arriving; this
removes the ones already in:

```bash
git rm --cached .DS_Store netlify/.DS_Store src/.DS_Store \
  src/features/.DS_Store src/features/av/.DS_Store \
  src/features/connections/.DS_Store src/features/gis/.DS_Store \
  src/features/poc/.DS_Store src/features/projects/.DS_Store \
  src/lib/.DS_Store supabase/.DS_Store
```

---

## SQL — two migrations, run in the Supabase SQL editor

There is no migration runner, so neither of these exists until it has
been pasted in and run.

### `0187_reducer_role.sql` — run this one

**This is a live bug.** `placeReducers` in `GISCanvasPage.jsx` writes
`Feature_Role: "reducer"`, and `reducer` was never added to the
`GIS_Feature` role constraint. Every insert is rejected, so Place
Reducers has failed on its first write since the feature shipped and
every gas take-off is short one fitting per size change.

The file has a "run this first" query at the top and verification
queries at the foot, including one that lists the projects whose gas
drawings are missing their reducers. Placing them is not automatic —
it is **Place Reducers** on the gas menu, per project.

### `0180_energisation.sql` — amended, safe to re-run

It seeded the Energisation phase at `Display_Order` 40, which put it
after reinstatement: the substation reading as energised once the ground
was closed. It is 15 now, between excavate-and-lay and jointing.

**Re-running the file is the fix.** The insert is guarded on the phase
name, so on a database where 0180 has already been applied it does
nothing and the phase stays where the fault put it. A separate `UPDATE`
does the correction, and it sets the value rather than adjusting it, so
running it twice changes nothing the second time.

The other half of that fault is in `calloffs-all.js`, which never
selected the `Display_Order` the page sorts on. Both halves are needed.

---

## Then

```bash
npm test          # 81 of 83 — the two failures are the missing migrations
npm run check     # 89 of 92 — adds checkbuttons.py, 30 cosmetic items
```

Both now run through `checkall.mjs`, which reports every check rather
than stopping at the first failure. `npm test` did not run at all
before.

The remaining failures and what to do about them are in `HANDOVER.md` →
**Testing** → *The three that still fail*. The short version: two need
migrations recovering out of Supabase (`0138`, `0163`), and the third is
pre-existing house-style debt.
