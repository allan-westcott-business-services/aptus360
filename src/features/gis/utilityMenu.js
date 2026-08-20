/* What pressing a utility menu button means.

   The button carries two jobs and they were run together: opening the
   Electric menu isolated electric *and* showed the menu, in one press.
   That is right when electric is already what you are looking at and
   wrong the rest of the time — the menu opened over a canvas that had
   become something else in the same instant, so the first thing under
   the cursor described a drawing you had not seen yet.

   Split in two, in the order somebody actually works:

     press once   the drawing becomes that utility, and nothing opens
     press again  the menu opens, over the drawing you are already on

   So a press is never both a change of subject and a menu at once. The
   second press is not a repeat of the first: it happens with the
   isolate already in force, which is the condition this function reads.

   `open` is deliberately not "was this menu the last one pressed" —
   that would be a second record of a fact the drawing already holds,
   and the two would drift the moment the utility was isolated some
   other way. Isolating electric from the Layers menu's I button and
   then pressing Electric opens the menu on the first press, because by
   then the drawing is already electric and there is nothing to isolate.

   Kept out of the canvas so it can be tested without a browser, and so
   the check imports the rule rather than restating it. */

/* Is this class the one and only thing the drawing is showing?

   Both halves matter. `solo` alone is not enough: the show list holds
   more than one key, and `solo` is only set when exactly one is lit —
   but reading it without the length would let a stale value through if
   that ever stopped being true. This is the same test soloClass makes
   before it toggles, and they have to agree or the menu would open on a
   press that also cleared the isolate. */
export function isIsolatedTo(key, { solo, shownOnly = [] }) {
  return solo === key && shownOnly.length === 1;
}

/* "open" or "isolate" — a verb rather than a boolean, because the two
   outcomes are different acts and not two settings of one. A caller
   reading `if (utilityMenuPress(...) === "open")` says what it does;
   `if (shouldOpen)` says only that something was decided. */
export function utilityMenuPress(key, state) {
  return isIsolatedTo(key, state) ? "open" : "isolate";
}

/* ── The colour a utility is known by ──

   The menu button for the design you are in is shaded in it, so the bar
   answers "which drawing am I looking at" without being read.

   Taken off the layer, which is the colour the drawing is rendered in,
   so the button and the lines under it cannot disagree. The layer no
   longer stores one: 0183 deleted the stale palette and the endpoint
   hands over the utility's, which is now the only record of it. That is
   why there is no table of hexes here. There was one, briefly, holding
   the four colours because no single field yielded all four — and it
   was a fourth copy of a fact three tables already held, which is the
   fault that made 0183 necessary. Do not put it back: if a utility
   comes out the wrong colour the row is wrong, and Admin is where to
   fix it.

   Electric and street lighting share an amber. Only one utility is ever
   isolated at a time, so which button is shaded is what distinguishes
   them, not the shade. */

/* The colour to shade a menu button in, or null for no shading.

   `layers` is the list the canvas already holds. A key with no layer on
   this drawing shades nothing rather than guessing — an empty utility
   is still a real answer, and a button shaded in a colour invented here
   would be the copy this just got rid of.

   Keyed on the same condition that decides whether the button opens its
   menu, so the shaded button and the two-press button cannot disagree:
   the drawing is the one record both read. A button that looked active
   but still demanded a first press would be the worse half of both
   behaviours. */
export function utilityTint(key, state, layers = []) {
  if (!isIsolatedTo(key, state)) return null;
  return layers.find((l) => l.Layer_Key === key)?.Colour ?? null;
}
