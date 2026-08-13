/* How far each meter is from the substation.

   The circuit report showed a column of dashes on every generated
   drawing. Two reasons, and each would have been enough on its own:

     The graph was built only from Connects, an attribute written when
     somebody draws one feature onto another. The routing lays cables
     from a graph of its own and never fills it in, so a built network
     had no edges at all.

     And lengthOf read a stored Length_m, which a built cable has none
     of — so even once connected, the walk added nothing at each step
     and every distance came out as zero.

   Both now fall back to the geometry, which is the thing that is always
   there. */
import { distancesFrom } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const SUB = { Feature_ID: 1, Feature_Role: "substation", Geometry: [[0, 0]] };
const CABLE = {
  Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
  Geometry: [[0, 0], [100, 0]],
};
const SERVICE = {
  Feature_ID: 3, Feature_Type: "line", Layer_Key: "electric",
  Geometry: [[100, 0], [100, 20]],
};
const METER = {
  Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
  Geometry: [[100, 20]],
};

// 1. A built network, with no Connects and no Length_m anywhere.
{
  const d = distancesFrom([SUB, CABLE, SERVICE, METER], 1);
  if (d.get(4) == null) fail("a meter on a built network has no distance");
  else if (Math.abs(d.get(4) - 120) > 0.01) {
    fail(`the meter is ${d.get(4)} m from the substation, wanted 120`);
  }
  /* Each step counts once: the cable, then the service beyond it. */
  if (Math.abs(d.get(2) - 100) > 0.01) fail("the cable's own distance is wrong");
}

// 2. A stored length still wins. Somebody who has measured a run and
//    entered it has said something the geometry does not know — a
//    trench dug round an obstruction, say.
{
  const measured = { ...CABLE, Attributes: { Length_m: 150 } };
  const d = distancesFrom([SUB, measured, SERVICE, METER], 1);
  if (Math.abs(d.get(4) - 170) > 0.01) {
    fail(`a stored length was ignored (${d.get(4)} m, wanted 170)`);
  }
}

// 3. A point adds nothing. A meter is a place on the run, not more run.
{
  const d = distancesFrom([SUB, CABLE, SERVICE, METER], 1);
  if (d.get(4) !== d.get(3)) fail("a meter added length to the run reaching it");
}

// 4. Something not joined to anything has no distance, rather than
//    zero — "not connected" and "at the substation" are different.
{
  const adrift = {
    Feature_ID: 9, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[900, 900]],
  };
  const d = distancesFrom([SUB, CABLE, SERVICE, METER, adrift], 1);
  if (d.get(9) != null) fail("a meter joined to nothing was given a distance");
}

// 5. A meter does not sit exactly on the end of its cable.
//
//    That was the third reason the column was blank, and the one that
//    survived the first two fixes. Cable to cable is a joint: they
//    either meet or they do not. A meter to the cable serving it is not
//    a joint — the meter is a box on a wall and the cable ends at the
//    plot boundary, so they are metres apart on every drawing ever
//    made. At a quarter of a metre the meter was joined to nothing.
{
  const at = (x, y) => ({
    Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[x, y]],
  });

  for (const [what, m] of [
    ["exactly on the cable end", at(100, 20)],
    ["a metre past it", at(100, 21)],
    ["five metres past it", at(100, 25)],
  ]) {
    const d = distancesFrom([SUB, CABLE, SERVICE, m], 1);
    if (d.get(4) == null) fail(`a meter ${what} has no distance`);
  }

  /* And not so far that a meter is adopted by a cable serving somebody
     else \u2014 that would report a plausible distance down the wrong run,
     which is worse than a dash. */
  const adrift = distancesFrom([SUB, CABLE, SERVICE, at(100, 60)], 1);
  if (adrift.get(4) != null) fail("a meter forty metres away was measured");
}

// 6. Two meters off the same main are as far apart as their services.
//
//    A meter within reach of several lines was linked to all of them,
//    so the walk took whichever gave the shortest route — usually
//    straight to the main, skipping the service cable that actually
//    feeds it. Two plots then reported the same distance however far
//    apart their services ran, which is what a drawing showing 6.3 m
//    between them plainly did not say.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Geometry: [[0, 0], [100, 0]] };
  /* Plot 23 comes off the main; plot 24 is 6.3 m further along. */
  const svc23 = { Feature_ID: 3, Feature_Type: "line", Geometry: [[100, 0], [100, 5]] };
  const svc24 = { Feature_ID: 4, Feature_Type: "line", Geometry: [[100, 5], [100, 11.3]] };
  const m23 = { Feature_ID: 5, Feature_Role: "meter", Geometry: [[100, 5]] };
  const m24 = { Feature_ID: 6, Feature_Role: "meter", Geometry: [[100, 11.3]] };

  const d = distancesFrom([SUB, main, svc23, svc24, m23, m24], 1);
  const a = d.get(5);
  const b = d.get(6);

  if (a == null || b == null) fail("a meter on a service run has no distance");
  else {
    if (Math.abs(a - b) < 0.01) {
      fail(`both meters report ${a} m, though their services differ by 6.3`);
    }
    if (Math.abs((b - a) - 6.3) > 0.01) {
      fail(`the meters are ${(b - a).toFixed(1)} m apart, wanted 6.3`);
    }
    /* And by the route, not as the crow flies: the run goes out along
       the main and back down the services. */
    if (Math.abs(a - 105) > 0.01) fail(`the nearer meter is ${a} m, wanted 105`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Distances behave (measured from the drawing when nothing is stored).");
process.exit(bad ? 1 : 0);
