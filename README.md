# A supply is a seed, not a meter, 26 Aug 2026

0194 made a non-residential supply **be** its own meter. That could only
ever describe an electric one — which is why placement hard-coded the
electric layer, and why the record took a single utility. A supply is a
plot seed with a different symbol, and this makes it one.

| File | Change |
|------|--------|
| `supabase/migrations/0196_nrs_is_a_seed.sql` | **New. Read the warning before running.** |
| `src/features/gis/electric.js` | `metredSuppliesInside` replaces `nrsInside`; `meterBelongsTo` matches on `NRS_ID` |
| `src/features/gis/GISCanvasPage.jsx` | Placement writes a seed then chains its meters |
| `src/features/nrs/NonResidentialTab.jsx` | Utilities, plural |
| `netlify/functions/nrs.js` | Serves and saves the set |
| `src/features/gis/bulkDelete.js`, `find.js`, `GisStylesAdmin.jsx` | The new role, in the three lists that need it |
| `checknrs.mjs` | Rewritten around the seed |

---

## Do not run 0196 before this code is deployed

It creates features with a role the canvas draws nothing for until then,
and a supply nobody can see is where this whole thread started.

## What changed

```
the supply    Feature_Role 'nrs', black triangle, NRS_ID on it
its meters    Feature_Role 'meter', one per utility, NRS_ID on each
```

Placing one is now the plot flow: click to put the seed down, then a
click per utility it takes, with the same preview and the same running
label. The menu hint says how many clicks are coming before it starts,
because a chain nobody expected reads as the canvas having gone wrong.

Only utilities that map to a drawing layer get a meter. Your dropdown
offers Section 38 On Site and Section 278 Off Site alongside the three
that are metered; those are commercial facts about a supply, and the
canvas places nothing for them.

## The load did not move

Worth saying plainly, because this is the part that could have gone
badly. `circuitKva` already read `NRS_ID` off the **meter**:

```js
const kva = m.Attributes?.NRS_ID != null
  ? nrsById(m.Attributes.NRS_ID)?.Requested_kVA : ...plot lookup
```

And `meterBelongsTo` already had a fallback for a seed with no plot
behind it. So the volt drop, the way-fuse comparison and the levels
check are untouched. The model was built for this shape; only the
placement was not.

A supply's meters are linked by the shared `NRS_ID`, not by the seed's
`Feature_ID` — that is not known while the seed is still an optimistic
row on the canvas, and a link through the record survives the seed being
deleted and re-placed.

## Pump 1, Pump 2 and TBS1

Deleted and re-placed, rather than converted. An earlier draft of 0196
turned them into seeds in place, kept the two carrying load as meters,
and put a seed three metres from each — it worked, and it guessed. Three
metres east and three south is not where a pump is, so both would have
needed dragging anyway.

The migration now leaves the drawings alone and asks you to clear them
first. The query is at the top of the file; the records themselves are
untouched, so all three come straight back on the Place menu.

**Look before you delete.** Expect three rows, all with a null
`Connects`. If any has one, stop and delete that one through the canvas
instead, so the seed cascade gets asked about the service running to it.

Once they're back: Pump 1 and Pump 2 were on Circuit 1 and won't be
until you re-place them, run their service and put them back on it.
Don't read a levels check in between — twenty kVA missing from a way
reads as headroom, which is the one direction a wrong number is
dangerous in.

## Utilities, plural

`NRS_Utility`, seeded from the single `Utility_ID` every supply already
names. The column is left standing and read by nothing, so a deploy can
be rolled back without losing which utility each supply named; the drop
statement is at the foot of 0196 with a query to run first.

The tab reads the set where a record has one and falls back to the old
column where it does not, so a supply saved before 0196 and not touched
since still shows its utility. That fallback goes when the column does.

## The check

Rewritten around the seed rather than patched. `metredSuppliesInside`
mirrors `metredSeedsInside` — supplies inside the outline **that have a
meter** — and a new section covers `meterBelongsTo`: a meter belongs to
its own supply, not to another one, and a dwelling's meter is not swept
up by either.

Two assertions are about what must NOT be true, since this whole change
is undoing a shape that worked: placement must not write the supply as
an electric meter, and the supply's own meter must still resolve to the
plain meter style. A triangle sitting where a meter goes is what the
drawing showed before and what was wrong with it.

Verified by putting the old placement back — both assertions fired.

---

## The suite

**88 of 93**, the five failures all pre-existing and described in
HANDOVER.

## Still to do

Auto Service, the BOM and the call-offs walk plot seeds by
`Feature_Role === "plot"`. A supply seed is not one, so it takes no part
in any of them — correct for now, since a supply's service is drawn by
hand, but worth deciding deliberately rather than by omission the first
time somebody expects Auto Service to reach a pumping station.
