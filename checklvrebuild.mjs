/* What a rebuild of the LV network is allowed to delete.

   Build LV Network replaces the feeders it drew last time. To do that
   it deletes the generated electric mains and lays them again — and
   generated electric mains are not the only generated electric
   features. Auto Lay Services draws the service cables on the same
   layer with the same flag.

   That fault has now been found twice. The first time it was gas and
   water services vanishing, and the fix went into the list that counts
   the features for the confirmation box. The list that actually deletes
   them was a second, separate filter a hundred and fifty lines further
   down, and it kept the old rule. So the question said "this redraws 12
   existing feeder cable(s)" and the build then removed every generated
   electric feature on the drawing.

   Two lists describing the same set is the fault, not the filter on
   either of them. */
import { readFileSync } from "node:fs";
import { isMainType } from "./src/features/gis/buildStatus.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "elec_main", Label: "LV cable", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
];

// 1. The rule itself: a service is never a main, on any layer.
{
  for (const key of ["elec_service", "gas_service", "water_service"]) {
    if (isMainType(key, LT)) fail(`${key} counts as a main and would be deleted`);
  }
  for (const key of ["elec_main", "gas_main"]) {
    if (!isMainType(key, LT)) fail(`${key} does not count as a main`);
  }
  /* A generated cable can reach here with no type at all — the lookup
     that names it returns null where no service type is configured. It
     must not be swept up on the strength of having none. */
  if (isMainType(null, LT)) fail("a cable with no type counts as a main");
  if (isMainType("", LT)) fail("a cable with an empty type counts as a main");
}

// 2. One list, used for both the question and the deletion.
//
//    This is the part that failed. Both filters were correct when
//    written; they simply stopped being the same filter, and nothing
//    said so — the confirmation counted one set and the build removed
//    another.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function buildLvNetwork");
  if (at < 0) { fail("buildLvNetwork has gone"); }
  else {
    /* To the end of the function, not a fixed number of characters.
       buildLvNetwork has grown past twenty thousand, so the window
       stopped short of the deletion and reported it missing. */
    const ends = canvas.indexOf("\n  async function ", at + 10);
    const body = canvas.slice(at, ends > at ? ends : at + 60000);

    /* Every filter for generated electric features inside the build has
       to carry the mains test. */
    const filters = [...body.matchAll(
      /Attributes\?\.Generated\s*\n?\s*&&\s*f\.Layer_Key === "electric"([\s\S]{0,120}?)[;)]/g,
    )];
    if (!filters.length) fail("nothing selects the features to be replaced");
    for (const m of filters) {
      if (!/isMainType/.test(m[1])) {
        fail("a filter takes every generated electric feature, services included");
      }
    }

    /* And the deletion uses the list the question counted, rather than
       building its own. */
    if (!/const old = doomedFeeders;/.test(body)) {
      fail("the deletion computes its own list again");
    }
    if (!/deleteFeatures\(projectId, old\.map/.test(body)) {
      fail("the deletion no longer runs on that list");
    }
  }
}

// 3. What a rebuild would take, on a drawing with both.
{
  const world = [
    { Feature_ID: 1, Layer_Key: "electric", Attributes: { Generated: true, Line_Type: "elec_main" } },
    { Feature_ID: 2, Layer_Key: "electric", Attributes: { Generated: true, Line_Type: "elec_service" } },
    { Feature_ID: 3, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 4, Layer_Key: "gas", Attributes: { Generated: true, Line_Type: "gas_main" } },
    { Feature_ID: 5, Layer_Key: "electric", Attributes: { Generated: true } },
  ];

  const doomed = world.filter((f) => f.Attributes?.Generated
    && f.Layer_Key === "electric"
    && isMainType(f.Attributes?.Line_Type, LT)).map((f) => f.Feature_ID);

  if (doomed.join(",") !== "1") {
    fail(`a rebuild would delete ${doomed.join(",")}, wanted only the generated feeder`);
  }
  /* Named individually, because each is a different way of getting this
     wrong and each has happened. */
  if (doomed.includes(2)) fail("the service cables go with the feeders");
  if (doomed.includes(3)) fail("a feeder drawn by hand is replaced");
  if (doomed.includes(4)) fail("the gas main goes with the LV feeders");
  if (doomed.includes(5)) fail("a generated feature with no type is swept up");
}

console.log(bad ? `\n${bad} problem(s)`
  : "The LV rebuild behaves (it replaces its own feeders and nothing else).");
process.exit(bad ? 1 : 0);
