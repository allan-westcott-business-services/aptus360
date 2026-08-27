# The developer's dig is drawn, and it is not ours, 26 Aug 2026

A self-lay plot's service trench exists — the developer lays it. It was
not being drawn at all, on the reasoning that we do not dig it. That
gave the right bill and a drawing with a cable running through
undisturbed ground: a service nobody can set out or check the cover
depth of.

It is drawn now, with **Build_Status `existing`** — the drawing's own
word for a length not dug by this job.

| File | Change |
|------|--------|
| `src/features/gis/autoService.js` | `planSeed` returns the developer's dig as `slpTrench` |
| `src/features/gis/GISCanvasPage.jsx` | Writes both digs, each with its own status |
| `src/features/gis/buildStatus.js` | An `_existing` line type starts as Existing |
| `checkselflay.mjs` | Five assertions added |

No SQL.

## Why the status does the work

`digEstimate` already takes an `existing` flag and charges no
excavation for it — `bomLabour` has read `Build_Status === "existing"`
all along. So marking the trench Existing gives exactly the right bill:
the cable, the laying, and none of the dig.

Nothing new had to be taught to the bill. The concept was already
there; the trench just had to say it.

## A mixed plot gets two digs

Ours to our main, the developer's to the incumbent's, from the same
seed. They are different digs to different mains and each is measured
on its own. A plot that is self-lay throughout has only the second.

They are kept apart in the plan rather than flagged inside one list,
because they are written with different statuses — and a caller that
forgot to look would bill for excavating the wrong one.

## The incumbent's own trench, drawn by hand

`defaultStatusOf` gave every trench "planned", including one drawn with
`trench_main_existing`. `digEstimate` would then have charged its whole
length as ground to open — **a price with no visible reason, for a dig
done years ago.** That was the open item flagged when 0197 was written,
and it is closed.

Read from the type key rather than asked of whoever draws it: a default
somebody has to remember to change is one they will forget, and the
consequence of forgetting is money. A length drawn as existing and then
deliberately marked otherwise still keeps its choice.

**Every default has to be a value the feature's own list offers.** The
worry was that a main's stages are planned, as-laid and live, with no
`existing` among them. It does not arise — `isMainFeature` matches a key
*ending* `_main`, and `elec_main_existing` does not end there, so
`statusesFor` hands the incumbent's main the trench list, the same one
its trench gets. That is coherent rather than lucky: `mainsOnLayer`
excludes these by the same test, so nothing tees into their main and no
joint is placed on it. The check asserts the default is in the list, not
just that it is the right word.

## Also fixed: running Auto Service twice

Found by asking whether this works at all. `isServed` decides a seed is
done by finding a *trench* stamped with it — and until this change a
self-lay plot had none, so every run laid another cable on top of the
last. The drawing gained a cable per run and the bill counted every one;
the second draws exactly along the first, so it would only have shown up
in the money.

A self-lay cable now counts as work laid. Kept even though the trench
makes it unnecessary, because a drawing serviced before this change has
the cables and no trench.

And the incumbent's trench is no longer counted among our service
trenches, which would have made a plot standing beside one read as
already dug.

## Before this works on a drawing

**0197 has not been run.** Without it there are no `_existing` line
types, so there is nothing to draw the incumbent's trench and main with,
and nothing here has anything to find.

## The suite

**93 of 96.** The three failures are pre-existing: `checkbottleends` and
`checkprojecttabs` need migrations 0163 and 0138 recovering from
Supabase, and `checkaslaidplan` is the re-take that refuses without
saying why.
