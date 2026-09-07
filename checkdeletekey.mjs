/* Delete removes what is selected.

   Where hands already go for it, and through the same path the button
   uses \u2014 a shortcut that skipped the plot-marker warning or the service
   cascade would delete a service nobody picked. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

// 1. The key is bound, and to the same action as the button.
{
  if (!/e\.key === "Delete" \|\| e\.key === "Backspace"/.test(canvas)) {
    fail("Delete does nothing to a selection");
  }
  /* Backspace as well: a Mac keyboard's large key is Backspace and
     reaching for it is the same gesture. */
  if (!/removeSelected\(now\)/.test(canvas)) {
    fail("the key does not go through removeSelected, so the plot-marker "
      + "warning and the service cascade are skipped");
  }
}

// 2. Never while typing.
//
//    Delete and Backspace are how a field is edited. Taking them would
//    make the notes box unusable and delete the drawing instead.
{
  const at = canvas.indexOf('e.key === "Delete"');
  const line = canvas.slice(canvas.lastIndexOf("if (", at), at + 60);
  if (!/!typing/.test(line)) {
    fail("Delete is taken while somebody is typing, so editing a label "
      + "deletes the feature");
  }
}

// 3. Read live, not from the closure.
//
//    The listener is bound once per change of `features`, so everything
//    it closes over is as it was then. A selection changes on every
//    click, and deleting whatever was selected when the drawing last
//    loaded is the worst possible way to be wrong about this.
{
  if (!/const liveSelected = useRef\(\[\]\);/.test(canvas)
    || !/liveSelected\.current = selected;/.test(canvas)) {
    fail("the shortcut has no live view of the selection");
  }
  if (!/const now = liveSelected\.current;/.test(canvas)) {
    fail("the shortcut reads the selection from its closure, which is as "
      + "stale as the last time the drawing loaded");
  }
}

// 4. Nothing selected, nothing taken.
//
//    Backspace on a page with no selection is the browser's Back on
//    some setups, and swallowing it silently would be its own surprise.
{
  const at = canvas.indexOf("const now = liveSelected.current;");
  const body = canvas.slice(at, at + 200);
  if (!/if \(!now\.length\) return;\s*\n\s*e\.preventDefault\(\);/.test(body)) {
    fail("preventDefault fires even with nothing selected, so Backspace "
      + "stops doing what the browser does");
  }
}

// 5. The button and the key reach it by different doors.
//
//    An onClick hands the handler a MouseEvent, which is not a
//    selection.
{
  if (!/const selected = Array\.isArray\(only\) \? only : liveSelected\.current;/
    .test(canvas)) {
    fail("removeSelected takes its argument on trust, so the button's click "
      + "event is treated as a list of features to delete");
  }
  if (!/onClick=\{removeSelected\}/.test(canvas)) {
    fail("the button no longer calls removeSelected directly");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Delete removes the selection (and only when there is one).");
process.exit(bad ? 1 : 0);
