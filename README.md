# Nothing reads the plot-level self-lay flag, 26 Aug 2026

The last screen filtering on `Plot.Self_Lay_Provider` was the POC plot
picker. It now judges per utility like the rest, and the column is out
of every select list — so it can be dropped.

| File | Change |
|------|--------|
| `src/features/poc/PlotAssignment.jsx` | Self-lay judged for the application's own utility |
| `src/features/poc/OptionsPanel.jsx` | Passes the utility down |
| `src/features/poc/POCApplicationsTab.jsx` | Gives it the application's `Utility_ID` |
| `netlify/functions/plots.js` | Off `PLOT_COLUMNS` |
| `netlify/functions/connections.js` | Off the plot select |
| `netlify/functions/connections-all.js` | Off the join |
| `checkselflay.mjs` | Two assertions added |

## A quotation is for one utility

A plot whose water is self-lay is still ours to connect for electric,
and belongs on an electric application. The plot-level flag could only
say "keep it off all of them", so it kept plots off applications they
should have been on.

The utility comes from the application row, threaded down through
`OptionsPanel` rather than fetched again — a second read is a second
answer to one question. Where no utility is passed, nothing is excluded
on that ground: guessing would be the plot-level flag back by another
route.

The count and the hover name the utility now. *"3 self-lay plots
excluded"* on a water application, about plots whose gas is somebody
else's, sends somebody looking in the wrong place.

## The check missed the fault first time

Worth recording. Assertion 30 tests that no endpoint selects the
plot-level column, and the first version scanned `.select(...)` strings
only. `plots.js` holds its columns in a `PLOT_COLUMNS` array joined with
a comma — which is exactly where the column was — so putting it back
produced a clean run.

**A check that cannot see the place the fault lives is worse than no
check**, because it reports all clear. It reads the column-list
constants as well now, and was verified by restoring the column: it
fired.

## Then this, and the column is gone

Nothing reads it. Run:

```sql
ALTER TABLE "Plot" DROP COLUMN "Self_Lay_Provider";
```

Two plots carried it — 41 and 42 on project 16 — and both were carried
across to their electric `Plot_Utility` rows earlier today, so nothing
is lost.

Check first, if you want to see it go from something rather than
nothing:

```sql
SELECT count(*) FILTER (WHERE "Self_Lay_Provider") AS still_true,
       count(*)                                    AS plots
  FROM "Plot";
```

## Where self-lay now lives

`Plot_Utility.Self_Lay_Provider`, one row per plot per utility, set on
the Plots tab. Everything reads that one: the SLP chips, the bulk bar,
scheduling, Plot Connections, the POC picker, the black crosses on the
meters, and Auto Service routing those cables to the incumbent's main
instead of ours.

## The suite

**93 of 96.** The three failures are pre-existing: `checkbottleends` and
`checkprojecttabs` need migrations 0163 and 0138 recovering from
Supabase, and `checkaslaidplan` is the re-take that refuses without
saying why.
