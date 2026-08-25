# Aptus360 — electric levels fixes, 25 Aug 2026

Five files. The paths in this zip mirror the repo, so they can be copied
over the top of a checkout as they are.

Apply the two migrations first, then the three source files, then hard
refresh. `getLookups()` caches for the whole session, so a tab that has
been open since before the migrations will still hold the old catalogue.

---

## Order

| # | File | What it does |
|---|------|--------------|
| 1 | `supabase/migrations/0189_electric_catalogue_seed.sql` | Loads the cable catalogue, transformers and impedance matrix |
| 2 | `supabase/migrations/0190_joint_equivalent_length.sql` | Creates `Electric_VD_Setting.Joint_Equivalent_M` |
| 3 | `src/features/admin/ElectricSpecsAdmin.jsx` | Exposes that setting in Admin |
| 4 | `src/features/gis/GISCanvasPage.jsx` | Source impedance on the node labels and the scenario search |
| 5 | `src/features/gis/scenario.js` | Upstream volt drop in the clearance test |

---

## 1 — `0189_electric_catalogue_seed.sql`

Carries the original app's catalogue across. The two apps read tables of
the same NAME with different column names inside them, so every key and
three value columns are renamed on the way in.

IDs are preserved deliberately: every span node stores its cable in
`GIS_Feature.Attributes.VD_Cable_Size_ID`, and letting the sequence
allocate fresh ones would leave each drawing pointing at a different
cable — which reports a wrong number rather than an error.

Idempotent throughout. Re-run it after a correction to the source data.

**Two things to read before running.**

`Electric_Impedance.Volt_Drop_Factor` is **not a volt drop figure**. The
workbook settles it — `regulat.xls!L9` labels the pivot's result "Mx
impedance value for selected fuse (ohms)", and the values run 0.045 to
0.337, which is the range of a loop impedance limit and nothing like a
percentage. It loads into `Loop_Impedance_Ohms`, and `Volt_Drop_Pct` is
left null rather than filled with a number that is not a percentage.

The transformer rows were recovered from the workbook, not exported.
Each ID's set of fuse ratings matches a pivot column block one for one,
and the highest fuse against each matches that transformer's Max Fuse
(315, 400, 630, 630). One judgement call is flagged in the file: the
workbook lists `315` and `300/315` separately, and `800` and `750/800`
separately; the slash variants are used because that is what the
selectable list at `data!C39:C43` offers. Two `UPDATE`s in the file
switch them.

**Only 6 of the 37 cables can be calculated on.** The 3c and 4c WAVE in
95, 185 and 300 carry figures. Every service, HV, LSZH, pilot and earth
cable has neither, so a span node set to one reports "cable not set".
That is the original's data as it stands, not a fault in the import. A
query at the foot of the file lists the affected span nodes.

## 2 — `0190_joint_equivalent_length.sql`

`GISCanvasPage.jsx` reads `Joint_Equivalent_M` in three places and
`voltDrop.js` charges it, but nothing created the column — so
`Number(vs.Joint_Equivalent_M) || 0` has resolved to 0 since the code
went in, and the allowance has never fired.

**The default is 3, and that changes existing figures.** Loop impedance
and volt drop both move upward the first time a drawing is opened, in
proportion to how many plot connections are on the route. The direction
is the safe one — readings become more pessimistic — but it is a change
to numbers that may already have been submitted. The file carries the
one-line way to default it to 0 instead, and a query showing how much
length each circuit will gain.

## 3 — `ElectricSpecsAdmin.jsx`

Adds the field to Admin › Electric Specs › Volt Drop Limits. `.vd-grid`
changes from `align-items: end` to `start`, because the new field
carries a line of hint text and bottom-alignment pushed its input out of
line with the rest of the row.

Run migration 2 first or the field renders empty and saving errors.

## 4 — `GISCanvasPage.jsx`

Two separate bugs, both the same shape: a context object built by hand
instead of calling `sourceImpedance()`.

**The node labels** (~line 1284) read `VD_Transformer_Size_ID` off the
station directly, which only a substation carries. On a POC-fed scheme
the lookup found nothing, the cascade started at zero, and every label
was low by exactly the declared loop impedance — while the levels check
beside it showed the right figure. Two numbers for the same node.

Observed on 2608/006: node A3 read `0.032 Ω` on the drawing and
`0.0709 Ω` in the export. The difference, 0.0389, is the POC's declared
0.039.

`startPct` had precisely this problem on this same object and was fixed
one release earlier, which is why the volt drop matched while the
impedance did not.

**`runScenario`** (~line 877) was worse: it searched for
`Feature_Role === "substation"` and found nothing at all on a POC-fed
scheme, so suggestions were worked out with no source impedance, no
upstream volt drop, and the fallback voltage.

All four call sites now use `sourceImpedance()` and carry `startPct`.

## 5 — `scenario.js`

`suggestCableChanges` never accepted `startPct`, so `clears()` judged a
node on the design's own volt drop while the levels check that flagged
it judged the cumulative figure. On a POC-fed scheme the two differ by
the declared percentage, and the search could call a node cleared that
the check still fails — a suggestion that does not work, offered with a
cost against it.

---

## Verification

Both migrations were run against PostgreSQL 16 on a schema built from
`lookups.js`, `admin.js` and `ElectricSpecsAdmin.jsx`; both are
idempotent and were re-run to confirm. Row counts land at 4 / 13 / 4 /
37 / 66 / 1. The negative-value guard on `Joint_Equivalent_M` was tested
and rejects.

Both source files compile under esbuild. `checksourceimpedance.mjs`,
`checkcablesizes.mjs` and `checkelectricsteps.mjs` all pass.

Worth knowing: `checksourceimpedance.mjs` passed **before** these fixes
too. It asserts that `sourceImpedance` behaves, not that every caller
uses it, which is how three call sites drifted apart. A check that
counted the callers would have caught this.

---

## Not fixed — still open

**Output voltage is set to 240 on the POC.** This app treats `Output_V`
as a LINE voltage and computes amps as `kVA × 1000 ÷ (√3 × V)`. The
workbook's 240 is a PHASE voltage. Every current on 2608/006 is inflated
by 67% — E0→A1 reads 328.4 A where 400 V gives 197 A. This is a data
change, not a code one: set it to 400 or clear it. A validation warning
on the field would be worth adding.

**The service cable is not in the ELI.** `voltDrop.js` walks span nodes
on the main only and never adds the service from the main to the
cut-out. The workbook does — `SUBMIT` row 27 is a separate Services
line, and the total at `E30` is mains + service + POC. The INA standard
measures its 250 mΩ limit to the end of the service, so a mains-only
figure is being compared against the limit in the lenient direction. A
15–25 m service adds roughly 0.015–0.030 Ω.

**Block load and small-group diversity are not modelled.** The workbook
adds both to every section's weighted load. Reproducing section 1 of the
sample sheet: workbook 1.9416%, app 1.7372% — 10.5% low, and that is the
best case where per-plot kVA equals the 5.01 ADMD.

**One volt drop limit, not two.** The workbook splits it 5% to end of
main + 2% service. The app applies a single 7% to the main alone.

**Balanced/unbalanced is global, not per scheme.** The workbook sets it
per calculation at `regulat.xls!J5`. Here it is one row in
`Electric_VD_Setting` applied to every project, so a mixed portfolio
cannot be represented and no record survives of which setting a given
design was checked under. It would sit naturally on the POC or
substation, beside `Source_Loop_Impedance_Ohm`.

**Migration `0082` contradicts the running code.** It creates
`Electric_Cable_Size_ID` where `lookups.js` reads `Cable_Size_ID`, and
notes the column names are "0027's" — a migration not present in the
repo. Stale and misleading against a fresh database.
