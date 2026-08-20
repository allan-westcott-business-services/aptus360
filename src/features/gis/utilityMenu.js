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
