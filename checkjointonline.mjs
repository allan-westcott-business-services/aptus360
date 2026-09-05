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
    /* A STRAIGHT joint: two cable ends brought into one fitting, which
       is exactly what breaking a run and joining it there is. A service
       joint is a fitting let into a run to take a service off it — a
       different thing, and what this placed at first. */
    if (!/setJointFor\(jointFor \? null : "straight"\)/.test(canvas)) {
      fail("the mode places something other than a straight joint");
    }
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

/* Drawn on the click, not when the server answers.

   The joint went in with `addFeature` and then `breakLineAt` did its
   own save, two reads and a Connects rewrite. Nothing appeared until
   all of that came back, so the click looked ignored and the fitting
   arrived seconds later — long enough to click again and place two.

   Every other placement here already draws optimistically for exactly
   this reason; this one did not, because it was written as a call to
   the API rather than as a placement. */
{
  const at = canvas.indexOf("async function placeAt(point) {");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("if (nrsFor) {", at));
  if (!/const tempId = addOptimistic\(draftJoint\);/.test(fn)) {
    fail("the joint is not drawn until the server answers, so the click "
      + "looks ignored");
  }
  /* The saved row is kept, because its id is needed afterwards to
     write the joint's Connects — so the reconcile is two statements
     now rather than one. */
  if (!/const savedJoint = await addFeature\(draftJoint\);/.test(fn)
    || !/reconcile\(tempId, savedJoint\);/.test(fn)) {
    fail("the drawn joint is never replaced by the saved one");
  }
  /* And taken away again if the save fails. A joint that was never
     stored must not sit on the drawing looking as though it was. */
  if (!/rollback\(tempId\);/.test(fn)) {
    fail("a failed save leaves a joint on the drawing that does not exist");
  }
}

/* ── The joint records what it holds ──

   `breakLineAt` recomputes Connects for both halves and for everything
   that ALREADY referenced them. A joint created a moment earlier
   references nothing, so it was not in that set and came out of the
   break holding no record of what it joins — and the drag, finding
   nothing to read, fell back to geometry and took a cable that merely
   passes.

   Written at placement from the drawing as it then stands. And the
   relink pass now covers joints, which repairs every one already
   placed: it filtered to lines and meters, so no joint on any drawing
   had ever carried a Connects of its own. */
{
  const at = canvas.indexOf("async function placeAt(point) {");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("if (nrsFor) {", at));
  if (!/Connects: linksFor\(jf, all\)/.test(fn)) {
    fail("the joint does not record the two halves it holds, so dragging it "
      + "falls back to geometry and takes whatever ends nearby");
  }
  if (!/f\.Feature_Role === "meter"\n\s*\|\| f\.Feature_Role === "joint"\)/.test(canvas)) {
    fail("the relink pass still skips joints, so a joint placed before this "
      + "never gains a Connects and goes on dragging the wrong cable");
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
