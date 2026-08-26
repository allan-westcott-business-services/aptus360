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


## Three fixes on top

**Placing a supply put down a seed and then stopped.** Mine, and the
same fault as everything else in this thread: `utilitiesOf` filtered the
project's utilities on a `Utility_ID` column that
`gis_project_utilities` does not return — that function is one of the
eighty-five migrations run and never committed, so what it returns
cannot be read anywhere in this repo. Every supply resolved to no
utilities, and a filter finding nothing looks exactly like a supply that
takes nothing.

The join is now `utilitiesTakenBy` in `lib/utilities.js`, matching on
the id where a row carries one and on the name otherwise — and it is
there rather than inline in the canvas so there is something to run a
check against, which is the only reason the fault was invisible.

**A supply's label sits under its triangle.** A triangle is widest at
its foot and points into the space above it, so a name set over one
falls into the gap the symbol makes and reads as belonging to whatever
is further up. A plot number over a house has no such gap, so plots are
unchanged.

**The supplies tab offers only the metered utilities.** Section 38 On
Site, Section 278 Off Site and Private Street Lighting are design scopes
for the site, not connections to a building: no meter, no MPAN, nothing
to place. From `RESIDENTIAL_UTILITIES`, which is already derived from
the group in `lib/utilities.js`, so a fourth metered utility would
appear without anyone remembering to add it.


## Auto Service reaches supplies

It was serving plots only, because under 0194 a supply was a meter and
there was no seed here to serve. Serving one by hand while every
dwelling beside it is done automatically is a distinction with nothing
behind it, so Auto Service now gathers both roles.

Two things had to follow.

**Placing a supply asks where its dig stops**, as the second click,
exactly as a plot seed does. `planSeed` refuses any seed with no
`Boundary_At` and says so — deliberately, because with no boundary
vertex to turn at, the "trench" is a line from the main straight to
somebody's meter and every cable then follows it. A supply that could
not say where its dig stops could not be auto-serviced at all.

Supplies already placed have no boundary point and will be reported as
skipped by name rather than silently passed over. Re-place them, or the
next thing to build is setting the point on an existing seed.

**The meters it lays carry the supply's `NRS_ID`.** `meterBelongsTo`
now asks for it on both sides, so without it a supply serviced
automatically would drop off its own circuit while looking entirely
correct on the drawing — its kVA quietly missing from the way. A meter
carrying only the older `Seed_Feature_ID` link still belongs to its
supply, which is what keeps any drawing serviced in between working.

Which utilities get laid comes from the supply's own record, not from
the plot heat-source rule: whether a unit takes gas is something it
says, not something worked out from a heat source it hasn't got.


## A meter the model cannot reach is now named

Found by a supply that was placed, metered, on a circuit, and absent
from every volt drop and ELI figure.

The data was right — seed, meter, matching `NRS_ID`, `Circuit_ID` 1.
What was wrong is that `buildFeederModel` could not attach the meter to
the network: it is more than `SNAP_TOL` (12 m) from any node, because no
service has been dug to it yet. The model has always gathered those in
`skipped`, and `runLevelsCheck` has always thrown them away.

So the load simply was not in the figures, and nothing said so. **That
is the one direction a wrong number is dangerous in** — a load left out
reads as headroom on the way, and a marginal run reads as passing. An
unqualified pass is worse than no check at all.

The levels panel now says "N meters not on the network" beside the
voltage note, with the labels on hover. Named rather than counted: a
count is a number to go looking for.

It is not a supply-specific fault. A plot meter placed before its dig
reaches it has been silently absent from the levels check in exactly
the same way, for as long as the check has existed.


## The circuit report showed no load on any supply

Reported as "3 with no load recorded" against three supplies with 10, 10
and 20 kVA on their records, so the circuit total was 40 kVA light and
the POC capacity comparison underneath it with it.

`circuitReport` read `plotById` and nothing else. A supply has no plot,
so `plotById` cannot answer for it — and the function had no other way
to ask. `buildFeederModel` has had that branch since the supply work
started, which is why the levels check was counting them correctly all
along: **two answers to one question about one circuit.**

`plotById` was a positional argument and `nrsById` arrived later in the
options, so a call site could pass one and forget the other — and
forgetting `nrsById` does not fail. It reports no load. Both lookups are
in the options now and travel together, and `checknrs` counts the call
sites so neither can go without the other.

A supply's row also says what it is in the House type column, rather
than leaving every column but its name blank.

A record with no kVA is still shown as missing rather than as zero. A
supply drawing nothing and a supply nobody has filled in are different
problems that look identical as "0.0 kVA".


## Placing a seed is three points now, then its meters

Both kinds, the same sequence:

1. **The symbol** — the house, or the triangle.
2. **The boundary position** — where the A-in-a-circle goes.
3. **Where the service trench ends** — the far end from the main.
4. **A meter per utility**, one to three clicks.

The boundary point and the end of the dig were **one point** until now,
which made every service stop at the property line. On the ground it
crosses the line and runs on to wherever the supply is brought up — so a
service ended short of where it is actually dug, and every length taken
off it was short by the same amount.

So the boundary becomes a **vertex along** the route rather than its
end. That matters beyond the length: the dig across the verge and the
dig inside the plot are billed apart, and the split needs a point on the
line to split at.

**The tee is still worked out from the boundary**, not from the new end.
The boundary is where the service crosses the property line, so it is
what decides where the dig should leave the main — square to it, across
the verge. Measuring from the end would let a meter position several
metres inside the plot drag the tee sideways along the main, which is a
longer dig to the same place.

Nothing is written until all three points are known, as before — a seed
abandoned part-way leaves nothing behind. Esc still cancels the whole
thing.

**Seeds placed before this still work.** A seed with only a boundary
point digs to it exactly as it did, and `planSeed` reports which shape
it was on, so a run can say how many are still on the old one rather
than quietly mixing the two.

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
