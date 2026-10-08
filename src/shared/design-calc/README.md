# design-calc

The calculations both the GIS canvas and the business app need.

Fifteen modules, no React, no API client, no lookups — nothing but
functions over the data they are handed. `checkdesigncalc.mjs` asserts
that, and fails if any file here imports anything outside this folder.

## Why it is separate

These produce figures that get invoiced. `digRate` and `trenchSize`
decide how many dig days a trench is worth; `jointRate` prices the
joints; `trenchContents` says what is in the ground. The GIS canvas
needs them to draw, and call-offs, the field queue and the Dig Rates
admin screen need them to cost the work.

When GIS becomes its own application those two needs land in two
repositories. If these modules are copied into both, they drift — and a
GIS app and a business app disagreeing about dig days is a fault nobody
notices until a customer does. One copy, one owner.

## What is here

Trench: `trenchContents`, `trenchSize`, `trenchCarries`, `snapping`
Rates: `digRate`, `jointRate`
Electric: `electric`, `feeder`, `hdCutout`, `joints`, `serviceBreech`,
`mainsCallOff`
Other: `lengths`, `buildStatus`, `dxfLayerMap`

The last five arrived as dependencies rather than by choice: `electric`
needs `lengths` and `trenchCarries`, `serviceBreech` needs `joints`,
and so on. The set is the transitive closure of what is used from
outside GIS, which is what makes it liftable.

## Keeping it liftable

Anything this folder imports has to come with it. So a function that
needs a lookup table takes it as an argument rather than fetching it,
and a function that needs a React hook belongs in the caller, not here.

If you genuinely need an outside dependency, add it to
`ALLOWED_PACKAGES` in `checkdesigncalc.mjs` — deliberately, in a commit
that says why. The check exists so that becomes a decision rather than
something discovered on the day of the split.

## Where it is going

In its own repository this folder becomes a package both applications
depend on — `@aptus/design-calc` or similar. Nothing here needs to
change for that; the imports are already sibling-relative. See the
"Separating the GIS Module" plan for the rest.
