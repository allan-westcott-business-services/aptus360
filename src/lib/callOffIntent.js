/* Opening the call-offs page from somewhere else, with one call-off
   already expanded.

   The same shape as gisIntent.js, for the same reason and deliberately
   not generalised with it. The planning board wants to hand somebody
   over to where a booking is edited; the shell decides which page is
   showing and the call-offs page holds its own open row, and the board
   has neither in scope.

   Two channels rather than one "navigate anywhere" mechanism, because a
   general one would carry an arbitrary payload to an arbitrary page and
   nothing would say what any page expects. These say what they carry.

   Consumed once. An intent left lying around would fire again the next
   time somebody opened call-offs from the sidebar, expanding a row they
   had not asked for with no clue why. */

let pending = null;
const listeners = new Set();

/* Ask for the call-offs page.

     submissionId — which call-off to expand on arrival

   The payload is set before anyone is told, so a listener that switches
   the view synchronously still finds it waiting. */
export function openCallOff(intent) {
  pending = intent || null;
  listeners.forEach((fn) => {
    try { fn(pending); } catch { /* one bad listener must not stop the rest */ }
  });
}

/* Take the intent, if there is one, and clear it. */
export function takeCallOffIntent() {
  const out = pending;
  pending = null;
  return out;
}

export function onOpenCallOff(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
