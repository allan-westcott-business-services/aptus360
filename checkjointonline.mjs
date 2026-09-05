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
  /* The placement moved into placeJointOnCable when the cable stopped
     being guessed at: placeAt now gathers the candidates and either
     places or asks. */
  const at = canvas.indexOf("async function placeJointOnCable");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("async function placeAt(point)", at));
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
    if (!/Line_Type === "elec_main"/.test(canvas)) {
      fail("the joint can land on a trench or a service cable");
    }
    /* Within reach, or nothing. A joint dropped where the click landed
       joins nothing, and this mode exists to put one ON a cable. */
    if (!/if \(!near\.length\) \{/.test(canvas)) {
      fail("a click that missed every cable still places a joint");
    }
    if (!/await breakLineAt\(line, at\)/.test(fn)) {
      fail("the cable is not broken where the joint went \u2014 the drawing "
        + "then shows one unbroken run through a fitting that joins two");
    }
    /* The circuit comes from the cable, not from a guess. */
    if (!/Circuit_ID: line\.Attributes\?\.Circuit_ID/.test(fn)) {
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
  /* The placement moved into placeJointOnCable when the cable stopped
     being guessed at: placeAt now gathers the candidates and either
     places or asks. */
  const at = canvas.indexOf("async function placeJointOnCable");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("async function placeAt(point)", at));
  if (!/const tempId = addOptimistic\(draftJoint\);/.test(fn)) {
    fail("the joint is not drawn until the server answers, so the click "
      + "looks ignored");
  }
  /* The saved row is kept, because its id is needed afterwards to
     write the joint's Connects — so the reconcile is two statements
     now rather than one. */
  if (!/reconcile\(tempId, await addFeature\(draftJoint\)\);/.test(fn)) {
    fail("the drawn joint is never replaced by the saved one");
  }
  /* And taken away again if the save fails. A joint that was never
     stored must not sit on the drawing looking as though it was. */
  if (!/rollback\(tempId\);/.test(fn)) {
    fail("a failed save leaves a joint on the drawing that does not exist");
  }
}

/* ── The joint is told which cables it holds ──

   `Joint_Cables` is written when the joint is placed, from the cable
   that was CHOSEN and the half that came out of breaking it. Both were
   known at that moment and nothing recomputes them.

   `Connects` is not that: the relink pass derives it from geometry, and
   connectedTo takes anything with a vertex within a quarter of a metre.
   On a shared trench it lists cables the joint has nothing to do with,
   and four attempts at this failed by reading it. */
{
  const fn = canvas.slice(canvas.indexOf("async function placeJointOnCable"),
    canvas.indexOf("async function placeAt(point)"));
  if (!fn) fail("placeJointOnCable has gone");
  else {
    if (!/const halves = await breakLineAt\(line, at\);/.test(fn)) {
      fail("the cable is not broken before the joint records what it holds");
    }
    if (!/Joint_Cables: halves/.test(fn)) {
      fail("the joint does not record the two cables it holds, so the drag "
        + "falls back to geometry and takes whatever ends nearby");
    }
    /* And the point on the run, made now rather than at the next build:
       the levels belong to the break and the break has just happened. */
    if (!/Feature_Role: "feederpoint"/.test(fn)) {
      fail("no feeder end point is made beside the joint, so there are no "
        + "levels until somebody rebuilds");
    }
    /* Its circle wears the output's colour where there is one. */
    if (!/Link_Box_ID: line\.Attributes\.Link_Box_ID/.test(fn)
      || !/Link_Way: line\.Attributes\.Link_Way/.test(fn)) {
      fail("the point does not take the cable's link box output, so its "
        + "circle cannot wear the output's colour");
    }
  }

  /* The drag prefers what the joint was told. */
  if (!/const told = new Set\(\(pt\.Attributes\?\.Joint_Cables \|\| \[\]\)\.map\(Number\)\);/.test(canvas)) {
    fail("the drag does not read what the joint was told it holds");
  }
  if (!/if \(told\.size\) \{\n\s*if \(!told\.has\(Number\(line\.Feature_ID\)\)\) continue;/.test(canvas)) {
    fail("a joint that was told its cables still falls through to geometry");
  }
}

/* ── Which cable, where several lie under the pointer ──

   Downstream of a link box, and wherever two circuits share a trench,
   the drawn separation is display offset rather than distance. Taking
   the nearest is a coin toss, and a joint on the wrong cable breaks the
   wrong run. */
{
  if (!/if \(near\.length > 1\) \{/.test(canvas)) {
    fail("with several cables under the pointer the nearest is taken, which "
      + "is a guess at which run to break");
  }
  if (!/\{jointPick && \(/.test(canvas)) {
    fail("nothing asks which cable");
  }
  /* Named by what tells them apart on screen, not by a feature id. */
  for (const field of ["colour", "circuit", "way", "metres"]) {
    if (!new RegExp(`${field}:`).test(canvas)) {
      fail(`the choice does not offer the ${field}, which is how a designer `
        + "tells two cables on one route apart");
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
