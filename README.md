# Link to Circuit finds non-residential supplies — 25 Aug 2026

Applies on top of `aptus360-complete-20260825.zip`. Only
`electric.js` is genuinely new; `GISCanvasPage.jsx` is included because
it calls the two changed functions, and shipping one without the other
would break the build.

| File | Change |
|------|--------|
| `src/features/gis/electric.js` | **New here.** `nrsInside()`, and `circuitKva` counts supplies |
| `src/features/gis/GISCanvasPage.jsx` | Calls both — same file as in the complete zip plus these two call sites |
| `checknrs.mjs` | Ten assertions, three of them new |
| `nrs_counted_check.sql` | Reports YES / PARTLY / NO per supply |

---

## The lasso

`metredSeedsInside` looks for plot points and keeps the ones with a
meter on them. A supply is a meter with nothing behind it, so it fell
through both halves — lassoed round and left off the circuit, which the
trace then pruned out entirely. Placed, drawn, contributing nothing.

`nrsInside` finds them on their own terms, and the two sets are
deduplicated by Feature_ID. A supply is already a meter, so a future
change to `metersOfSeeds` that started matching them would otherwise put
one on a circuit twice — and a load counted twice is worse than one
counted not at all, because it reads as a failing design rather than a
missing one.

A circuit made of supplies and no dwellings now works. It used to be
refused for having "no plot seeds", which was the wrong reason.

## The way-fuse load

`circuitKva` had the same blind spot and it feeds the fuse comparison at
the substation. It read load through `plotById` only, so every supply
fell to the fallback of zero — a commercial unit missing from a way's
load reads as headroom on the fuse.

It now takes `nrsById` as a fourth argument. Existing callers that omit
it behave exactly as before.

---

## Verification

`node checknrs.mjs` — ten assertions. Three are new here:

- `nrsInside` finds a supply inside the outline and not one outside it
- `circuitKva` returns 90 for a 5 kVA dwelling and an 85 kVA supply
- the lasso and the way-fuse load both reach supplies in
  `GISCanvasPage.jsx`

The last one is a source check rather than a behaviour one, on purpose.
The two worst bugs today were both a lookup passed to some call sites
and not others, failing silently at the ones that were missed. Counting
the call sites is the thing that catches that; assertion 7 was tested by
breaking a site deliberately, and it caught it.

`checkservicetail`, `checkcablesizes`, `checkelectricsteps`,
`checksourceimpedance` and `checkspannodes` all still pass.

---

## Confirming a supply is counted

`nrs_counted_check.sql` gives YES / PARTLY / NO per supply with the
reason.

**PARTLY is the one to watch.** A supply with no `Requested_kVA` still
counts as a customer for the unbalanced correction, which is keyed on
how MANY are on a section. So it raises K, which lowers
`1 + 4.14/sqrt(K)`, and the figures come out slightly LOWER than without
it — silently better rather than worse.

**Loop impedance does not move when a supply is counted.** A supply adds
load, not length or cable, and impedance is length x ohms/km only. Only
the volt drop and the phase current change.

To prove it rather than trust the query: note the phase current at E0,
remove the supply's `Circuit_ID`, re-run. It should fall by exactly
`Requested_kVA x 1000 / (sqrt(3) x Output_V)`. Amps is the honest column
— it uses the unweighted load, so it moves by the whole of the supply's
kVA where the volt drop moves by a weighted share.
