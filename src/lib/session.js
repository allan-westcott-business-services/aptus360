/* Where the user was, kept across a refresh.

   A reload took everyone back to the projects list, whatever they had
   open. On a page that is slow to get back to — a project four tabs in,
   a drawing on a particular site — that is the whole navigation done
   again for the sake of pressing F5.

   Session storage rather than local: per tab, and gone when the tab
   closes. Two drawings open in two tabs should not fight over one
   remembered position, and next week's session should start at the
   beginning rather than wherever last week ended.

   Everything here tolerates storage being unavailable. Private windows,
   locked-down browsers and quota failures all throw on access, and
   remembering where someone was is not worth a blank page. */

const PREFIX = "aptus.where.";

export function remember(key, value) {
  try {
    if (value == null) sessionStorage.removeItem(PREFIX + key);
    else sessionStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch { /* not remembering is not a failure worth showing */ }
}

/* The remembered value, or the fallback.

   Anything unparseable is treated as absent rather than thrown: a value
   left by an older build of the app is not something to crash on, and
   the fallback is always a working state. */
export function recall(key, fallback = null) {
  try {
    const raw = sessionStorage.getItem(PREFIX + key);
    if (raw == null) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/* Only if it is one of the states the caller knows how to render.

   A view name from an older build, or one behind a flag that has since
   gone, would leave the shell rendering nothing with no way back. */
export function recallOneOf(key, allowed, fallback) {
  const v = recall(key, null);
  return allowed.includes(v) ? v : fallback;
}
