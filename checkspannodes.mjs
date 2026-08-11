/* Where span nodes go, and what the origins are called.

   The rule, as the designers state it:

     a junction of mains          gets a node
     the end of a mains trench    gets one
     where a service joins        does not — a span runs through it
     at the plant                 does not — that is E0, G0 or W0

   And the origin per utility:

     electric   the substation                            E0
     gas        the governor, or the POC without one      G0
     water      the pumping station, or the POC           W0

   Gas and water fell through: PLANT only matched governor and pumping
   station, so a site fed at low pressure from an existing main — no
   governor — left its gas POC unmatched, and it took a generic
   A-number. The origin of the gas network ended up numbered as an
   ordinary span, and the levels check had nothing to count from. */
import { originsOf, planSpanNodes, plantLabel } from "./src/features/gis/spanNodes.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const T = (id, pts, type = "trench_main") => ({
  Feature_ID: id, Feature_Type: "line", Attributes: { Line_Type: type }, Geometry: pts,
});
const SERVICES = { serviceTypes: new Set(["trench_service"]) };

// 1. A POC stands in where the plant is not drawn.
{
  const o = originsOf([{ Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] }]);
  if (o.get("gas")?.label !== "G0") fail("a gas POC with no governor is not G0");
  if (!o.get("gas")?.standingIn) fail("a gas POC was not marked as standing in");

  const w = originsOf([{ Feature_Role: "poc", Layer_Key: "water", Geometry: [[0, 0]] }]);
  if (w.get("water")?.label !== "W0") fail("a water POC with no pumping station is not W0");
}

// 2. The plant wins where both are drawn — they are two different points.
{
  const o = originsOf([
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[0, 0]] },
    { Feature_Role: "governor", Layer_Key: "gas", Geometry: [[9, 9]] },
  ]);
  if (o.get("gas")?.standingIn) fail("the POC stood in although a governor is drawn");
  if (o.get("gas")?.feature.Feature_Role !== "governor") {
    fail("gas is measured from the POC rather than the governor");
  }
}

// 3. An electric POC is not an origin: the incomer runs POC to
//    substation and the network starts at the substation.
{
  const o = originsOf([{ Feature_Role: "poc", Layer_Key: "electric", Geometry: [[0, 0]] }]);
  if (o.has("electric")) fail("an electric POC was treated as E0");
}

// 4. Every utility gets its own origin. Taking the first plant found
//    gave one utility an origin and left the rest as spans.
{
  const o = originsOf([
    { Feature_Role: "substation", Layer_Key: "electric", Geometry: [[0, 0]] },
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[50, 0]] },
    { Feature_Role: "poc", Layer_Key: "water", Geometry: [[80, 0]] },
  ]);
  for (const [layer, label] of [["electric", "E0"], ["gas", "G0"], ["water", "W0"]]) {
    if (o.get(layer)?.label !== label) fail(`${layer} did not get ${label}`);
  }
}

// 5. And no A-number lands on an origin.
{
  const trenches = [
    T(1, [[50, 0], [100, 0]]),
    T(2, [[100, 0], [160, 0]]),
    T(3, [[100, 0], [100, 60]]),
    T(4, [[130, 0], [130, 10]], "trench_service"),
  ];
  const origins = [...originsOf([
    { Feature_Role: "poc", Layer_Key: "gas", Geometry: [[50, 0]] },
  ]).values()].map((x) => x.feature);
  const plan = planSpanNodes(trenches, origins, SERVICES);

  const at = (x, y) => plan.nodes.some((n) => Math.hypot(n.at[0] - x, n.at[1] - y) < 1);
  if (at(50, 0)) fail("a generic span node was placed on the gas POC");
  if (at(130, 0)) fail("a span node was placed where a service joins the main");
  if (!at(100, 0)) fail("the junction of two mains got no node");
  if (!at(160, 0) || !at(100, 60)) fail("a mains end got no node");
  if (plan.nodes.some((n) => !/^A\d+$/.test(n.label))) {
    fail("a span node is not labelled A followed by a number");
  }
}

// 6. plantLabel still answers for real plant, which the drawing uses.
for (const [role, label] of [["substation", "E0"], ["governor", "G0"], ["pumping", "W0"]]) {
  if (plantLabel({ Feature_Role: role }) !== label) fail(`${role} is not ${label}`);
}
if (plantLabel({ Feature_Role: "poc" })) fail("a bare POC returned a plant label");

console.log(bad ? `\n${bad} problem(s)`
  : "Span node origins behave (E0/G0/W0, POC standing in, none on plant).");
process.exit(bad ? 1 : 0);
