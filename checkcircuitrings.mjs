/* Which meters are already spoken for.

   A meter on a circuit is drawn with a ring in that circuit's colour.
   The ring is a setting — `circuitRings`, off by default, reachable
   from the Layers menu and the Circuit Report — and the one moment it
   is indispensable is the moment nobody has turned it on: drawing round
   plots to link them to a circuit.

   Unringed, an assigned meter looks exactly like a free one, so the same
   plots get lassoed twice. The dialog does refuse them ("N already on a
   circuit were left alone"), so no work is lost — but that is a count in
   a paragraph after the fact, not something visible on the drawing while
   the outline is being drawn.

   So the rings show whenever the circuit lasso is up, whatever the
   setting says. One setting, temporarily overridden by the job in
   hand — NOT a second switch, which would be two controls for one thing
   and would drift. */
import { readFileSync } from "node:fs";
import { circuitColours } from "./src/features/gis/feederColour.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

if (!/if \(isMeter && \(circuitRings \|\| tool === "circuit"\)\) \{/.test(canvas)) {
  fail("the rings no longer show while the circuit lasso is armed \u2014 an "
    + "assigned meter looks free at exactly the moment that matters");
}

/* The draw effect has to watch the tool, or arming it repaints nothing
   until something else happens to change. */
{
  const at = canvas.indexOf("}, [visible, selected, view, toPx");
  const deps = at < 0 ? "" : canvas.slice(at, at + 1400);
  if (!/circuitRings, tool,/.test(deps)) {
    fail("the canvas does not repaint when the tool changes, so the rings "
      + "appear late or not at all");
  }
}

/* Still one SWITCH. `setCircuitRings(true)` is also called when a
   proposed circuit grouping is put on screen — the rings are what shows
   the proposal, so turning them on is part of showing it rather than a
   second control for the setting. Held to that: one toggle, and any
   other call may only turn them ON. A second thing that could turn them
   off would leave two controls disagreeing about one setting. */
{
  const toggles = (canvas.match(/setCircuitRings\(!/g) || []).length;
  if (toggles !== 1) {
    fail(`${toggles} controls toggle the rings — one setting, one switch`);
  }
  const off = (canvas.match(/setCircuitRings\(false\)/g) || []).length;
  if (off) {
    fail("something turns the rings off behind the setting");
  }
}

/* And the menu says the rings appear, so they do not read as the
   drawing changing on its own. */
if (!/meters already on a circuit are ringed/.test(canvas)) {
  fail("Link to Circuit does not say that assigned meters are ringed");
}

/* Every circuit has a colour to ring with, including one linked but not
   yet built — which is exactly the state the lasso is used in. A ring
   that resolves to nothing draws nothing, silently. */
{
  const meters = [
    { Feature_ID: 1, Feature_Role: "meter", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[0, 0]], Attributes: { Circuit_ID: 1 } },
    { Feature_ID: 2, Feature_Role: "meter", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[10, 0]], Attributes: { Circuit_ID: 2 } },
  ];
  const ink = circuitColours(meters, {});
  /* circuitColours works from the feeder mains; with none drawn it
     returns nothing, and the canvas fills the gap from circuitsFrom.
     Asserted so that if circuitColours ever starts answering here, the
     two are not both filling it. */
  if (ink.size && !ink.get(1)) {
    fail("a circuit with no feeder drawn resolves to a colour for some "
      + "circuits and not others");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Circuit rings behave (shown while the lasso is up, one setting).");
process.exit(bad ? 1 : 0);
