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

console.log(bad ? `\n${bad} problem(s)`
  : "Distances behave (measured from the drawing when nothing is stored).");
process.exit(bad ? 1 : 0);
