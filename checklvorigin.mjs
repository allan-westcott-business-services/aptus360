/* Where the LV network starts.

   The build required a substation, because on a scheme we build the
   feeders run back to one. They do not always: on a connection to an
   existing network there is no new transformer, and the point of
   connection to the DNO's cable is where the site's electricity comes
   from. The drawing had the POC on it and the build refused to use it,
   so the only way through was to place a substation nobody would
   build. */
import { readFileSync } from "node:fs";
import { lvOrigin } from "./src/features/gis/feeder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const sub = { Feature_ID: 1, Feature_Role: "substation", Geometry: [[0, 0]] };
const elecPoc = {
  Feature_ID: 2, Feature_Role: "poc", Layer_Key: "electric", Geometry: [[50, 0]],
};
const gasPoc = {
  Feature_ID: 3, Feature_Role: "poc", Layer_Key: "gas", Geometry: [[9, 0]],
};

// 1. A substation is still the origin where there is one.
{
  if (lvOrigin([sub])?.Feature_ID !== 1) fail("a substation was not the origin");
}

// 2. An electric POC will do on its own.
{
  if (lvOrigin([elecPoc])?.Feature_ID !== 2) {
    fail("an electric POC was not accepted as the origin");
  }
}

// 3. The substation wins where both are drawn.
//
//    A site with a transformer starts at the transformer; the POC
//    beside it is where the incomer arrives rather than where the
//    feeders begin. The same order originsOf takes between plant and a
//    POC.
{
  for (const world of [[sub, elecPoc], [elecPoc, sub]]) {
    if (lvOrigin(world)?.Feature_Role !== "substation") {
      fail("the POC won over the substation");
    }
  }
}

// 4. Only an electric POC.
//
//    A gas POC is on the drawing of nearly every scheme and has nothing
//    to say about where a cable routes back to.
{
  if (lvOrigin([gasPoc]) !== null) fail("a gas POC was taken as the LV origin");
  if (lvOrigin([gasPoc, elecPoc])?.Feature_ID !== 2) {
    fail("the gas POC was picked ahead of the electric one");
  }
}

// 5. Nothing usable gives nothing.
//
//    Including a feature of the right role with no geometry: an origin
//    the router cannot find a position for is worse than none, because
//    the refusal then comes from somewhere further in.
{
  if (lvOrigin([]) !== null) fail("an origin appeared on an empty drawing");
  if (lvOrigin() !== null) fail("an absent drawing produced an origin");
  if (lvOrigin([{ Feature_ID: 9, Feature_Role: "substation" }]) !== null) {
    fail("a substation with no geometry was taken as the origin");
  }
  if (lvOrigin([{ Feature_ID: 9, Feature_Role: "poc", Layer_Key: "electric",
    Geometry: [] }]) !== null) {
    fail("a POC with no geometry was taken as the origin");
  }
}

// 6. Every gate on the way to a built network asks the same question.
//
//    The build needs circuits, and creating a circuit had its own
//    substation gate. Relaxing the build alone would refuse the same
//    drawing one step earlier, which reads as the change not having
//    worked.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const feeder = readFileSync("./src/features/gis/feeder.js", "utf8");

  if (/Feature_Role === "substation"\);\s*\n\s*if \(!sub\)/.test(canvas)) {
    fail("a circuit gate still looks for a substation directly");
  }
  if ((canvas.match(/lvOrigin\(/g) || []).length < 3) {
    fail("not every gate on the way to a built network uses the rule");
  }
  /* And the router roots the tree on it, so the guard and the routing
     cannot disagree about what counts. */
  /* Plural now: the model roots each circuit at the origin on its own
     network, chosen from lvOrigins \u2014 the same list, so the gates and
     the routing still cannot disagree about what counts as an origin. */
  if (!/const origins = lvOrigins\(features\)/.test(feeder)) {
    fail("the feeder model does not root on the same origin list");
  }

  /* The refusal names both, or somebody with a POC on the drawing is
     told to place the thing they deliberately have not got. */
  if (!/electric POC/.test(canvas)) {
    fail("the message still asks only for a substation");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "LV origin behaves (a substation, or an electric POC where there is no transformer).");
process.exit(bad ? 1 : 0);
