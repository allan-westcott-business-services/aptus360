# Service cable in the levels check — 25 Aug 2026

Four files. Paths mirror the repo. Apply on top of the earlier
`aptus360-electric-fixes-20260825.zip`, which these build on.

| File | Change |
|------|--------|
| `src/features/gis/voltDrop.js` | New `serviceVoltDrop()` |
| `src/features/gis/feeder.js` | Model returns `metersAt` |
| `src/features/gis/GISCanvasPage.jsx` | Tails computed in `legExtras`, five new export columns |
| `checkservicetail.mjs` | Eight assertions, including a cross-check against the workbook |

---

## What it does

Every figure the levels check reported stopped at the span node — a
point on the MAIN, where nobody is connected. The customer is at the end
of a service that tees off it, and the INA limit is measured to the
cut-out. A main-only figure was being compared against a limit for a
quantity it does not describe, always in the lenient direction.

Each leg now also carries the service tail hanging off its end node.

## Reported alongside, not folded in

The existing `Loop impedance (ohms)` and `Volt drop (%)` columns are
UNCHANGED. Five new ones sit beside them:

    Service (m) · Service ohms · Service volt drop (%)
    At cut-out (ohms) · At cut-out (%)

Two reasons for keeping them apart. A designer changing a cable needs to
see what the main is doing on its own, and burying the service in the
total would hide it. And silently moving every figure a scheme has
already been checked on is not a change anyone can audit.

`At cut-out` is the compliance number. The two original columns are the
main's own contribution to it.

## The worst customer, where a node feeds several

A node feeding six plots is judged on the worst of the six — the longest
or thinnest service. Compliance is about the customer who fares worst,
not the average, and the other five are inside it by definition. The
export names which meter and plot it was.

## Three deliberate differences from a leg of main

**No unbalanced correction.** The correction is 1 + 4.14/√K, and one
service has K = 1, which would multiply its drop by 5.14. The workbook
does not apply it either — `I37` has no correction term while `P15`
applies one to every leg of main. That is deliberate, not an omission:
the correction models how unevenly a GROUP of single phase customers
lands across three phases, and one customer is not a group.

**No joint allowance.** The tee is already charged, on the leg of main
it tees into. Charging it here would count the same joint twice.

**All load terminal.** One customer at the end, nothing tapped along it.

## Length comes from the drawn trench

`serviceFor()` walks the service trench actually drawn, from the meter
to where it meets a main. Where no service trench has been drawn the
tail is left NULL rather than estimated — a straight line from meter to
main is not the run that gets dug, and the perpendicular is what made
service lengths wrong elsewhere in this file.

## One deviation from the workbook, on purpose

The workbook uses a notional load for every single phase service —
`O36 = (2 × ADMD) + diversity`, about 18 kVA — because it has no
per-plot figure to hand. This uses the plot's OWN kVA, which the app
knows from its house type.

Better data, but it means the two will differ where a plot is not close
to twice ADMD. Worth knowing before comparing a scheme against a sheet.

---

## Expect most tails to read blank at first

Only two service cables have electrical figures — `0191` filled in
`3 Phase Service 25` and `Single Phase Service CNE 35`, and two more
rows are still awaiting a decision:

- `3c25 SCNE` (116 A, 699) has no matching type in the catalogue
- `35 SCNE - Cu` (174 A, 2201) is copper, and neither candidate row
  matches on both material and construction

Everything else — the 4mm and 16mm services, the SNE range, LSZH —
came across from the original with nothing recorded. A service on one of
those reports blank, not zero: a cable that contributes nothing and a
cable nobody has specified must not read alike.

So the columns will be sparse until the catalogue is filled in. That is
the data, not the code.

---

## Verification

`node checkservicetail.mjs` — eight assertions:

1. Arithmetic matches `regulat!N38` exactly (10 m of 35mm = 0.009785 Ω)
2. No unbalanced correction, checked against a leg that does take one
3. No joint allowance, checked against a leg that does charge one
4. An unfigured cable reports `missingSpec` and invents no figure
5. Zero length charges nothing
6. Longer and thinner both cost more
7. `metersAt` agrees with `meterCount`, and carries meter and kVA
8. BOTH ctx objects pass the service geometry

Assertion 8 exists because the bug that started this was one context
object drifting from another — three call sites had their own copy of a
lookup and two were wrong. A check that counts the call sites is the
thing that would have caught it.

`checksourceimpedance`, `checkcablesizes` and `checkelectricsteps` all
still pass. `GISCanvasPage.jsx` compiles under esbuild.

## Still open

- Block load and small-group diversity are not modelled (~10% low)
- One 7% limit on the main, where the workbook splits it 5% main + 2%
  service. The service figure now exists to check the 2% against, but
  nothing does it yet
- Balanced/unbalanced is global rather than per scheme
- The `Electric_Impedance` fuse limits are read by nothing; circuits are
  checked against a flat 0.28 Ω standing in for a table spanning 0.045
  to 0.337
- `Output_V` is 240 on the POC of 2608/006 and should be 400
