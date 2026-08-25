# Aptus360 — electric levels, complete drop, 25 Aug 2026

Everything from today in one package. Paths mirror the repo, so it
unzips over a checkout as it is.

`0189` is REVISED — it no longer seeds transformers. If you have the
earlier copy in the repo, replace it, or a re-run undoes `0193`.

---

## Running order

| # | File | Note |
|---|------|------|
| 1 | `0189_electric_catalogue_seed.sql` | Revised. Already run on live — for the repo |
| 2 | `0190_joint_equivalent_length.sql` | Already run on live |
| 3 | `0193_undo_duplicate_transformers.sql` | **Run first if you re-ran 0189** |
| 4 | `0191_service_cable_specs.sql` | |
| 5 | `0192_default_service_cable.sql` | |
| 6 | `0194_non_residential_supply.sql` | New |

Then the six source files, then a hard refresh — `getLookups()` caches
for the session.

`status_check.sql` reports where everything stands, any time. It only
reads. One row per thing worth knowing, expected against actual.

---

## Placing a non-residential supply

Create the record on the project as now. Then on the drawing:

**Electric menu → Non-residential supplies → Place {ref}**, then click
the plan. The hint shows the requested kVA, or warns when the record
has none. Esc cancels. A supply already placed drops off the list.

It draws as a **black triangle**, against the plot seed's house.

From there it is a meter: Auto Lay Services connects it, it counts in
the joints and the BOM, and it appears in the levels check with its own
`Requested_kVA` as terminal load.

### Why it carries Feature_Role 'meter'

Fifty places in the code ask whether something is a meter. A separate
role would have needed every one audited, and anything missed would
have surfaced as a quietly wrong number rather than an error. Two
attributes set it apart: `NRS_ID` for the load, `Supply_Type: 'nrs'`
for the symbol.

`Supply_Type` is a new `GIS_Style` match column, above `Feature_Role`
in specificity and below `Site`. Existing style rows are null there and
behave exactly as before.

### The one thing to be careful with

`buildFeederModel` defaults `nrsById` to a function returning null, so
a call site that forgets to pass it does not fail — it reports a supply
carrying no load, on a drawing that shows the supply plainly. All ten
sites are wired, and `checknrs` counts them against the `plotById`
sites so the two cannot drift. That assertion was tested by breaking a
site on purpose; it caught it.

---

## What else is in here

**Three drifted context objects, fixed.** The canvas labels and
`runScenario` built their own transformer lookup instead of calling
`sourceImpedance()`, so on a POC-fed scheme they started at zero ohms.
Node A3 on 2608/006 read `0.032 Ω` on the drawing and `0.0709 Ω` in the
export — the difference being the POC's declared 0.039. `scenario.js`
never received `startPct` at all, so it could call a node cleared that
the levels check still failed.

**Service tails.** The check stopped at the span node, which is a point
on the main where nobody is connected. Five new export columns:
`Service (m)`, `Service ohms`, `Service volt drop (%)`,
`At cut-out (ohms)`, `At cut-out (%)`. Reported alongside the existing
figures, not folded into them.

No unbalanced correction on a tail (K=1 would multiply it by 5.14, and
the workbook's `I37` has no correction term), no joint allowance (the
tee is charged on the leg it tees into), all load terminal.

**The joint allowance now exists.** `Joint_Equivalent_M` was read in
three places and created by nothing, so it had silently been 0 since
the code went in.

**The impedance matrix was mislabelled.** `Volt_Drop_Factor` /
`Volt_Drop_Pct` is neither — `regulat.xls!L9` calls it "Mx impedance
value for selected fuse (ohms)", and the values run 0.045 to 0.337.
`0189` loads it into `Loop_Impedance_Ohms` and leaves the percentage
null. Nothing reads the table yet; circuits are still checked against a
flat 0.28 Ω.

---

## Still open

**Balanced/unbalanced is global.** Re-running `0189` reset it and
halved every volt drop on every project, with nothing on screen to say
so. The workbook sets it per scheme at `regulat.xls!J5`. It would sit
naturally on the POC or substation beside `Source_Loop_Impedance_Ohm`.
This is the one I would do next.

**Block load and small-group diversity are not modelled.** The workbook
adds both to every section. Reproducing section 1 of the sample sheet:
workbook 1.9416%, app 1.7372% — 10.5% low, in the best case.

**One volt drop limit, not two.** The workbook splits it 5% to end of
main + 2% service. The service figure now exists; nothing checks it.

**Nothing reads the fuse limits.** 0.28 Ω is a single conservative
number standing in for a table spanning 0.045 to 0.337. On a 630 A fuse
it would pass a circuit the real limit fails by a factor of six.

**Data, not code:**

- The 200 kVA transformer (ID 1) has no loop impedance. Workbook says
  0.04013, but confirm against whatever source rows 2 and 4 came from
- `Output_V` is 240 on POCs 27802 and 33040; this app reads it as a
  LINE voltage, so every phase current there is 67% high
- POC 2774 (project 1) has no declared impedance; substation 10299
  (project 9) has no transformer
- Project 16 has 48 service TRENCHES and no service cables — run Auto
  Lay Services, or the tails stay blank
- Cable 50, single phase 25mm, still needs a rating and volt drop base
  from a data sheet. Loop Z is 1.2. And `0191` may have put that same
  1.2 on cable 52 wrongly — see the note in that file

---

## Verification

Every migration was run against PostgreSQL 16 on a schema built from
the running code, and each is idempotent and was re-run to confirm.
`0193` was tested by replaying the duplicate state it undoes.

Six check scripts pass: `checknrs`, `checkservicetail`,
`checkcablesizes`, `checkelectricsteps`, `checksourceimpedance`,
`checkspannodes`. Both new ones count call sites rather than trusting
them, because the day's two worst bugs were both one call site drifting
from another.
