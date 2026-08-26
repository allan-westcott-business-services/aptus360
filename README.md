# Trench contents show the size that will be pulled — 26 Aug 2026

One file. Applies on top of the earlier drops.

`src/features/gis/FeatureEditor.jsx` — the trench contents list now
honours a manual cable size.

---

## What was wrong

Trench #34026 listed a 95 where a 300 runs.

The trench stores no size of its own — `contentsOf()` derives it from
the cable lines lying in it. That part was working. What it read was:

    x.Attributes?.Cable_Size_ID ?? x.Attributes?.VD_Cable_Size_ID

`VD_Cable_Size_ID` is the CALCULATED size. A run set by hand stores the
override in `Manual_VD_Cable_Size_ID`, and this never looked at it.

Project 16 has five mains lines with an override set — A1, A2, A5, A8
and A9 all hold `VD_Cable_Size_ID = 1` (95) with a manual size beside
it. Every other reader in the app honours the override: `cableIdOf`,
`sizeIdFor`, the BOM, the levels check. The trench was the single place
showing the calculated size, which reads as the trench being wrong
rather than as one reader being out of step.

## The fix

`sizeIdFor(x, "electric", "manual")` — the same precedence, in the same
form, that the rest of the app already uses. Manual where set, calculated
everywhere else.

An overridden size now reads **`300 (set)`**, because a size somebody
chose is a decision, and a decision that looks identical to a calculation
is one nobody revisits. `isOverridden` was already there for exactly
this.

Scoped to electric lines. A gas or water size id indexes a different
catalogue, and looking one up in `cableSizes` would either find nothing
or find the electric cable that happens to share the number — labelling
a gas pipe with a cable size. Those keep the string size as before.

## Why not sync the trench on build

That was the first reading of it, and it would have been wrong.

`carryCableToNode` and `syncNodeCables` both treat the cable LINE as
authoritative and correct the span NODE to match — "a cable set by hand
is the one that will be pulled, so it is the one the node has to carry."
Making the build write the line from the node reverses an ordering the
codebase states deliberately, and would have propagated calculated sizes
over manual ones across every trench on every project, silently.

The line was already right. Only the display was reading the wrong
field.

## Worth knowing

The "N cables out of step — fix" button on the levels panel resolves a
genuine line/node disagreement, and it moves the NODE to the LINE. It
is unrelated to this, and still correct.

Nine of project 16's mains lines hold `VD_Cable_Size_ID = 1` while the
span nodes were rebuilt onto the same 95. If the calculated sizes are
themselves stale — the levels export shows 300s and 185s on legs whose
lines say 95 — that is a separate question about when the build last
sized the runs, and worth a look once this display fix is in.

## Verification

`FeatureEditor.jsx` compiles under esbuild. All six check scripts still
pass — `checknrs`, `checkservicetail`, `checkcablesizes`,
`checkelectricsteps`, `checksourceimpedance`, `checkspannodes`.
