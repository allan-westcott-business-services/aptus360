# A new plot gets its utilities, 26 Aug 2026

The back-fill gave all 1,132 existing plots a `Plot_Utility` row per
utility their project is scoped for. A plot added afterwards got none —
and a plot with no rows cannot be marked self-lay, cannot be scheduled
and appears on no connections list. It looks exactly like a plot nobody
has got to yet.

| File | Change |
|------|--------|
| `netlify/functions/plots.js` | Adding plots creates their utility rows |
| `src/features/plots/AddPlotsForm.jsx` | The plot-level self-lay toggle is gone |
| `checkselflay.mjs` | Three assertions added |

No SQL.

## The rule

One row per new plot per utility on `Project_Scope` — the same rule the
1,714 were back-filled by. `Self_Lay_Provider` defaults to false, so a
new plot is ours until somebody says otherwise. That is the safe
direction: the other one takes work off a call-off nobody decided to
give away.

Distinct utilities, because `Project_Scope` holds a row per utility and
there is no unique index on `(Plot_ID, Utility_ID)` to catch a duplicate
pair.

## A failure is reported, not thrown

The plots are inserted first and there is no transaction across the two.
Throwing would report failure on work that succeeded and leave somebody
adding them twice; swallowing would leave a plot that looks complete and
takes part in nothing, which is fault 22.

So the response carries `utility_error` and the form says the plots went
in and what did not follow — which is what somebody needs to put it
right. Generate connections on the Plots tab fills the gap.

## The toggle is gone

`AddPlotsForm` had a "Self lay provider" switch beside PV, writing one
boolean for the whole plot. It marked every utility from one tick, which
is the thing this change has been undoing all day.

Self-lay is set per utility on the Plots tab now, against the plots this
form has just created — where the bulk bar can do a phase at a time and
the column shows which utilities each plot's answer covers. The field
says so rather than the control vanishing without explanation.

## What this unblocks

`Plot.Self_Lay_Provider` has one reader left: `PlotAssignment`, the POC
plot picker, which filters on it and does not know which utility its
application is for — that has to be threaded down from
`POCApplicationsTab` through `OptionsPanel`.

After that the column can be dropped: off the `plots.js` select list,
then one `ALTER TABLE`.

## The suite

**93 of 96.** The three failures are pre-existing: `checkbottleends` and
`checkprojecttabs` need migrations 0163 and 0138 recovering from
Supabase, and `checkaslaidplan` is the re-take that refuses without
saying why.
