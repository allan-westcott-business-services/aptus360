/* Putting a joint where it goes, by pointing at the cable.

   The menu's + Service Joint drops one in the middle of the view and
   snaps it to the nearest feeder. That answers "I need a joint
   somewhere on this circuit". It does not answer "I need one HERE", and
   a fitting whose position is the whole point should be placed by
   pointing at it.

   ── And the cable breaks there ──

   A joint IS a break in the cable: two lengths of conductor come into a
   fitting and are joined inside it. Placing the fitting and leaving one
   unbroken run through it draws something that does not exist, and
   every reader downstream believes the run — the levels walk it as one
   leg, the bill counts its whole length as one cable, the schedule
   quotes one drum. So the two happen together, through the same
   `breakLineAt` that breaking a line by hand uses, which recomputes
   Connects for both halves and for everything that touched them. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* Armed, and the click routed to the placement. A mode that draws a
   prompt over a click that does nothing is the fault the awaitingClick
   comment already records. */
{
  if (!/const \[jointFor, setJointFor\] = useState\(null\);/.test(canvas)) {
    fail("there is no armed mode for placing a joint on a cable");
  }
  if (!/\|\| !!trenchEndFor \|\| !!jointFor;/.test(canvas)) {
    fail("the click is not routed to placeAt, so the prompt draws over a "
      + "click that does nothing");
  }
  /* Snapping while armed is what makes the cable say ON LINE, which is
     the whole instruction for this mode. */
  if (!/if \(drawing \|\| placing \|\| jointFor\) \{/.test(canvas)) {
    fail("no snap while armed, so the cable never says ON LINE");
  }
}

/* The placement itself. */
{
  const at = canvas.indexOf("async function placeAt(point) {");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("if (nrsFor) {", at));
  if (!fn) fail("placeAt has gone");
  else {
    if (!/Feature_Role: "joint"/.test(fn)) fail("no joint is created");
    /* Feeders only: a joint on a trench or a service is a fitting in a
       place no main runs, and the levels check reads joints off the
       feeders. */
    if (!/Line_Type === "elec_main"/.test(fn)) {
      fail("the joint can land on a trench or a service cable");
    }
    /* Within reach, or nothing. A joint dropped where the click landed
       joins nothing, and this mode exists to put one ON a cable. */
    if (!/best\.d > reach/.test(fn)) {
      fail("a click that missed every cable still places a joint");
    }
    if (!/await breakLineAt\(best\.line, best\.q\)/.test(fn)) {
      fail("the cable is not broken where the joint went \u2014 the drawing "
        + "then shows one unbroken run through a fitting that joins two");
    }
    /* The circuit comes from the cable, not from a guess. */
    if (!/Circuit_ID: best\.line\.Attributes\?\.Circuit_ID/.test(fn)) {
      fail("the joint does not take the circuit of the cable it sits on");
    }
  }
}

/* And a way out. An armed placement with no escape is a canvas that
   will not let go. */
if (!/e\.key === "Escape" && jointFor/.test(canvas)) {
  fail("Escape does not stop placing joints");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Joint-on-a-cable behaves (clicked onto the feeder, and the cable "
  + "broken there).");
process.exit(bad ? 1 : 0);
