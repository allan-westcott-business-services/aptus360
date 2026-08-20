# Utility menus: isolate first, menu second — and shaded

7 files and **one migration to run**. Copy the whole tree over
`aptus360/` — the paths match. Nothing here deletes a file.

## Run this first

    supabase/migrations/0183_utility_colour_once.sql

It makes `Utility.Colour` the only record of a utility's colour, and
deletes the stale copies in `GIS_Layer.Colour` and `GIS_Line_Type.Colour`.
Run the file whole; it carries a query at the top to run before and four
checks at the foot to run after.

**Order matters inside it.** Step 4 clears the line types before the
layers, because whether a line type's colour is a copy is decided by
comparing it against its layer's — clear the layers first and the
comparison finds nothing, every mains type keeps its stale colour, and
since a line type colour is an override, gas draws green for good. This
is called out in the file; do not reorder it.

**Honest about testing:** the migration parses clean against the real
PostgreSQL grammar (`pglast`), and step 4's ordering was simulated
against the seeded palette both ways to confirm the trap above is real.
It has **not** been executed against a live PostgreSQL, unlike 0181/0182
— there was no instance to run it on. Run the before-query and the four
after-checks rather than trusting it.

Kept separate from `RELEASE.md` deliberately: that file is the cumulative
drop the repo was already carrying, and overwriting it would lose its
list for anyone who has not applied it yet. Fold this in when that one is
next rewritten.

    supabase/migrations/0183_utility_colour_once.sql   new — run it
    src/features/gis/utilityMenu.js                    new
    src/features/gis/GisMenus.jsx
    src/features/gis/GISCanvasPage.jsx
    src/api/gis.js                     mock fixtures recoloured
    netlify/functions/gis.js           comment only — no behaviour change
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

## The live design's button is shaded

The bar now answers "which drawing am I looking at" without being read.
The button for the utility currently on screen is shaded in that
utility's colour, over the same area that greys on hover.

    Electric          #ffbb00
    Gas               #ff0000
    Water             #2ccc00
    Street Lighting   #ffbb00

Shading follows the **drawing**, not the button: it is keyed on the same
`isIsolatedTo` that decides the two-press behaviour, so the shaded button
and the open-on-first-press button are the same button by construction.
Isolate gas from the Layers menu's `I` and the Gas button shades itself.

Tints are eight-digit hex built in JS via `alpha()` from
`src/lib/colour.js` — 16% at rest, 30% on hover and while open, 45% on
the border. `color-mix()` is deliberately not used; see fault 12.

Hover survives, in the utility's own colour rather than the grey — a
button that stopped answering the mouse would read as disabled. The open
state keeps the shading rather than handing the button to the accent:
the accent says "this menu is open", which the open menu already says,
and it would hide the one thing the shading exists to say at exactly the
moment somebody is working in that utility. Text stays dark throughout;
white on a 30% red is unreadable.

### The colour is recorded once now

The previous drop shaded the buttons from a table of four hexes written
into `utilityMenu.js`, and flagged it as a fourth copy of a fact three
tables already held. 0183 settles it. That table is **deleted**;
`utilityTint` reads the colour off the layer, which is the same colour
the lines under the button are drawn in, so the two cannot disagree.

What the three tables said before:

    GIS_Layer.Colour       electric #f59e0b  gas #10b981  water #3b82f6  lighting #eab308
    GIS_Line_Type.Colour   same palette
    Utility.Colour         electric #ffbb00  gas #ff0000  water #2ccc00

Gas was green on the drawing and red in the utility table; water was blue
on the drawing and green in the utility table. Both wrong on the drawing,
and wrong in the way that matters — red and green are the trade's
colours, and a plan showing gas in green is not one to dig to.

They drifted because the layer palette was seeded in 0051, before the
utilities carried colours, and **nothing in the application can edit
either colour**, so nothing ever corrected them. `netlify/functions/gis.js`
began overlaying the utility's colour at read time, which made the canvas
draw correctly while leaving the wrong values in the rows — a cover, not
a fix. Its comment said as much, justifying read-time work "because
Colour is NOT NULL on both tables". 0183 makes the column nullable and
NULL wherever a utility owns it, so that overlay is now an inheritance
with nothing left to correct. The comment is corrected too (fault 17).

**Where a colour is now set:** `Utility.Colour`, via Admin. Change it
there and the drawing, the line types, the layer menus, the legend, the
feature swatches and the shaded button all follow. Deliberate exceptions
survive — HV keeps its deeper red, because a line type coloured
differently from its layer was somebody drawing a distinction. Layers
that are not utilities (trench, boundary, plot, note) keep their own
colours and always will.

Street lighting shares electric's amber, set on the utility row by the
migration. A lighting cable is an electric cable to anyone reading a
drawing, and the two are never both isolated, so which button is shaded
distinguishes them rather than the shade. The migration also ties the
lighting layer to its utility — 0072 did that only where a row was named
exactly 'Private Street Lighting', so on other instances the layer had no
utility and would have inherited nothing.

`checkutilitymenus.mjs` now fails if any utility hex is written anywhere
under `src/` outside the mock fixtures, so the copy cannot come back.

## Street Lighting is unchanged

It is shaded like the rest, but still isolates and opens in one press. Three utilities were asked for
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
3. a jsdom mount of `MenuBar`/`Menu` that clicks the real buttons and
   reads the shading off them;
4. the stylesheet, for three hazards the classes cannot show. jsdom does
   not resolve custom properties — the computed background of a
   `var(--gm-tint)` rule comes back transparent, so a test reading it
   would pass on anything. Instead the rules are read: that `.gm-btn.util`
   is written **after** `.gm-btn.on` (equal specificity, so source order
   decides), that a `.gm-btn.util.on` rule exists and takes back `.on`'s
   white text, and that hover survives.

Every assertion was confirmed to fail against a deliberately broken
version: reverting the `onClick` gives four named errors; dropping the
`util` class, the `.util.on` rule, the hover rule, or reordering the
cascade each trip their own. `vite build` is clean, and
all 88 `check*.mjs` give byte-identical output before and after.

## Mock fixtures

`src/api/gis.js` stands in for the endpoint's *response*, which has the
utility's colour already applied — so the fixtures carry resolved
colours rather than a NULL and a `Utility_ID` for something to resolve.
Mocking the raw rows would mean mocking the inheritance as well, which
is a second implementation of it. These four hexes are the one copy that
cannot be avoided, since mock data has no database behind it, and only
`VITE_USE_MOCKS` sees them. A `lighting` layer and its two line types
were missing from the mocks entirely and are added, so the Street
Lighting menu shades under mocks too.

## Not fixed by this, but seen while in here

- **`checklighting.mjs` fails on the baseline**, before any of this:
  *reducer is written by the app but missing from the role constraint*.
  Looks like the missing `0182` below. Still failing — not touched here.
- **`checkadmin.py` reports `Craft_Utility` missing from the allowlist**,
  also pre-existing and unrelated.
- **`RELEASE.md` asks you to run `0182_bom_gas_tees.sql`, which is not in
  `supabase/migrations/`.** Migrations run to 0181. Since they are pasted
  in by hand, that folder is the only record there is — worth chasing.
- **`HANDOVER.md` says migrations run to 0157.** They run to 0181.
  `checkimports.mjs` and `checkprojecttabs.mjs` are present again, but
  `checklazy.mjs` is still missing and `0138_project_tabs.sql` still is
  too, so `npm test` still dies partway.
- **`GISCanvasPage.jsx` is 19,518 lines**, not the 12,169 the handover
  records — up about 60% since that was written.
