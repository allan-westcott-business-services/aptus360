# Utility menus: isolate first, menu second

4 files, no migrations. Copy the whole tree over `aptus360/` — the paths
match. Nothing here deletes anything.

Kept separate from `RELEASE.md` deliberately: that file is the cumulative
drop the repo was already carrying, and overwriting it would lose its
list for anyone who has not applied it yet. Fold this in when that one is
next rewritten.

    src/features/gis/utilityMenu.js       new
    src/features/gis/GisMenus.jsx
    src/features/gis/GISCanvasPage.jsx
    checkutilitymenus.mjs

## What changed

The Electric, Gas and Water buttons carried two jobs and ran them in one
press: opening the menu isolated the utility *and* showed the menu. That
is right when you are already looking at that utility and wrong the rest
of the time — the menu appeared over a canvas that had become something
else in the same instant, so the first thing under the cursor described a
drawing nobody had seen yet.

Split in two, in the order somebody works:

    press once   the drawing becomes that utility, nothing opens
    press again  the menu opens, over the drawing you are already on

The second press is not a repeat of the first: it happens with the
isolate already in force, and that is the condition being read.

## Three things worth knowing before editing this

**The condition is the drawing, not the button.** `utilityMenuPress` asks
whether the drawing is isolated to that layer — `solo === key &&
shownOnly.length === 1`. It does not ask "was this button pressed last".
Reading the button would be a second record of a fact the drawing already
holds, and the two would drift the moment a utility was isolated some
other way. As it stands, isolating gas from the Layers menu's `I` button
and then pressing Gas opens the menu on the first press, because there is
nothing left for a first press to do. That is correct, not a loophole.

**A refusal closes whatever was open.** Pressing Electric with the Gas
menu open changes the drawing, so the gas menu must not be left standing
over it — that is the same mismatch this change exists to stop, arrived
at from the other side. Handled in `Menu`, not at the call sites.

**Closing is never refused.** Only a press that would *open* is put to
the handler. A menu that will not dismiss is a trap, and the check counts
handler calls (3 from 4 clicks) to keep it that way.

## The refusal says so

The first press sets the status line: *Showing Gas only — press Gas again
for its menu*. The drawing does visibly change, but nothing on screen
says a second press is what opens the menu, and nobody guesses that. This
is the same fault as the old isolate-only-if-it-has-something guard,
which was removed for refusing silently. Remove the two `setStatus` lines
in `utilityMenuOpen` if it is not wanted.

## Street Lighting is unchanged

It still isolates and opens in one press. Three utilities were asked for
and this is a fourth menu on the same bar, so the old behaviour is
**pinned** in `checkutilitymenus.mjs` rather than left to drift into
whatever the next edit gives it. To bring it into line:

    onOpen={() => utilityMenuOpen("lighting", "Street Lighting")}

and change the pinning assertion in the check to match the electric one
above it. Do not simply delete that assertion.

## Testing

    node checkutilitymenus.mjs

Now does three things instead of reading the source three ways:

1. the source greps it already had, updated for the new handler;
2. the press rule, **imported** from `utilityMenu.js` and driven as a
   sequence — gas up, press Electric, press Electric again — because the
   fault was never in one press, it was in what the second did after the
   first;
3. a jsdom mount of `MenuBar`/`Menu` that clicks the real buttons.

Reverting the `onClick` in `GisMenus.jsx` makes it fail with four named
errors, so it is not a check that cannot fail. `vite build` is clean, and
all 88 `check*.mjs` give byte-identical output before and after.

## Not fixed by this, but seen while in here

- **`checklighting.mjs` fails on the baseline**, before any of this:
  *reducer is written by the app but missing from the role constraint*.
  Looks like the missing `0182` below.
- **`RELEASE.md` asks you to run `0182_bom_gas_tees.sql`, which is not in
  `supabase/migrations/`.** Migrations run to 0181. Since they are pasted
  in by hand, that folder is the only record there is — worth chasing.
- **`HANDOVER.md` says migrations run to 0157.** They run to 0181.
  `checkimports.mjs` and `checkprojecttabs.mjs` are present again, but
  `checklazy.mjs` is still missing and `0138_project_tabs.sql` still is
  too, so `npm test` still dies partway.
- **`GISCanvasPage.jsx` is 19,518 lines**, not the 12,169 the handover
  records — up about 60% since that was written.
