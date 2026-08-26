# Scheduling, fixed; self-lay judged per utility, 26 Aug 2026

The 1,714-row back-fill that made per-utility self-lay possible broke
booking a connection. This fixes that, and moves the three screens that
filtered self-lay per plot onto the flag that can actually say it.

| File | Change |
|------|--------|
| `netlify/functions/connections.js` | Scheduling updates as well as inserts; refuses self-lay pairs |
| `netlify/functions/connections-all.js` | The row's flag, not the plot's |
| `src/features/connections/NewScheduleModal.jsx` | Eligibility per utility; honest counts |
| `src/features/plots/PlotsTab.jsx` | Generate connections no longer filters per plot |
| `checkselflay.mjs` | Six assertions added |

No SQL.

## What broke, and why it was silent

`generateConnections` was asked for two things and did one. A
plot-utility pair has to **exist**, and it has to carry a
**Programmed_Date**. It only ever inserted, skipping pairs already
present — which worked for exactly as long as rows came into being
nowhere else.

The back-fill ended that. Every pair now exists, so the insert found
nothing to do and every booking came back *"those connections already
exist — nothing new was scheduled"* with no date written. Nothing
errored. The form simply stopped working, and the message it showed was
one it had always been able to show.

It now does the job it is named for: the pair ends up scheduled, whether
that took an insert or an update.

**It will not overwrite a booking.** A pair with a Programmed_Date or a
Connection_Date is left alone and reported back. Moving a visit already
in the diary has a gang and a customer behind it and belongs on the page
that shows the existing date, not as a side effect of ticking a plot in
a bulk form.

**And never an upsert.** Supabase's upsert is `ON CONFLICT DO UPDATE`
with exactly the fields supplied — everything else on the row becomes
null, including the meter number, the as-laid date and the adopter.
Recurring fault 5.

## Self-lay is refused once, on the server

Three screens called this and each filtered its own way, per plot. A
plot-level boolean cannot say that a plot is self-lay for water and ours
for electric, so all three were wrong in the same direction.

The rule now sits on the row that holds the fact. The endpoint reports
what it left out — self-lay and already-booked counted apart, because
they are different answers to "why is this plot not on my list" and each
needs a different thing doing about it.

A comment on that function has claimed it skipped self-lay plots for
months. The code never did.

## The schedule form judges against the utilities you ticked

A plot is only out of reach when **every** utility being scheduled is
somebody else's. With electric and gas ticked, a plot whose water is
self-lay is perfectly schedulable — it was greyed out entirely before.

Before any utility is ticked there is nothing to judge against, so every
plot is offered.

## One line of fault 13

`connections-all.js` fed the Plot Connections page `_slp` from
`Plot.Self_Lay_Provider`. Every row on that page **is** a plot-utility
pair, and `Plot_Utility` carries the flag for exactly that pair. So one
plot self-lay for water alone had all three of its rows ticked, with no
way to see which it really was.

Two records of one fact and a reader looking at the wrong one, in a
single line.

## Still to do

**`Plot.Self_Lay_Provider` is not dropped yet**, and two things stand in
the way:

- `PlotAssignment` (POC plot picker) still filters on it, and neither it
  nor `OptionsPanel` above it is given the POC's `Utility_ID` — it has
  to be threaded down from `POCApplicationsTab`.
- `AddPlotsForm` has an SLP checkbox writing that column. Once it goes,
  a newly added plot has no `Plot_Utility` rows and no way to be marked
  self-lay at all. **Creating rows when plots are added is now the
  blocker**, not an optional tidy-up.

## The suite

**93 of 96.** The three failures are pre-existing: `checkbottleends` and
`checkprojecttabs` need migrations 0163 and 0138 recovering from
Supabase, and `checkaslaidplan` is the re-take that refuses without
saying why.
