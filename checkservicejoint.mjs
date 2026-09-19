/* One service, one joint.

   Auto Lay Service Cable places the fitting that joins a service to
   the main it leaves. It was placing a second one beside the first on
   plot after plot: three reported by name on project 16, twelve on
   the drawing when it was counted.

   ── Why a radius could not do it ──

   The tee is computed twice. Place Feeder Joints puts the fitting on
   the feeder model's node; Auto Lay puts it where the cable was
   snapped to the main. The two answers differ, and on the drawing
   that showed the fault they differed by 0.251 to 0.467 m — outside
   the 0.25 m the routine treated as "already jointed", every time.

   Widening it is the trap. The nearest GENUINE pair on that same
   drawing is 0.605 m: 56024 and 56025, two adjacent plots each
   properly jointed to main 55981. A threshold that catches a 0.467 m
   duplicate and spares a 0.605 m neighbour is fitted to one estate,
   and the next one with tighter frontages loses a joint — which is
   the worse fault, because a missing fitting is one nobody orders and
   nobody digs.

   So the cables decide and the distance only draws the shortlist.
   Every figure below is from `drawing-16-2026-09-19__3_.json`. */
import {
  serviceJointHere, JOINT_SEARCH_M,
} from "./src/features/gis/autoService.js";
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const MAIN = 55975;
const SERVICE = 56088;
const OTHER_SERVICE = 56101;
const serviceIds = new Set([SERVICE, OTHER_SERVICE, 56083, 56090]);

const jointAt = (at, cables) => ({
  Feature_ID: 900 + cables.length, Feature_Role: "joint",
  Layer_Key: "electric", Geometry: [at],
  Attributes: { Joint_Type: "service", Joint_Cables: cables },
});

/* The real tee, and the real quarter metre between the two answers. */
const START = [47.64442339736408, 72.11104992718143];
const FEEDER_JOINT = [47.89539562723424, 72.10918850891125];

// 1. The fault as reported: a joint holding this very service.
{
  const found = serviceJointHere({
    start: START, serviceId: SERVICE, serviceIds,
    joints: [jointAt(FEEDER_JOINT, [MAIN, SERVICE])],
  });
  if (!found) {
    fail("a joint already holding this service is not recognised, so a "
      + "second one is placed a quarter of a metre away \u2014 56112 beside "
      + "56044, and two more like it");
  }
}

// 2. The other half of it: a joint that holds only the main.
{
  /* Place Feeder Joints marks the tee before the cable has an id, so
     its Joint_Cables is the main alone. 56030, 56001, 56022, 56018,
     56021, 56020 and 56026 were all in that state and all got a twin.
     An unclaimed fitting at this tee is this service's. */
  const found = serviceJointHere({
    start: START, serviceId: SERVICE, serviceIds,
    joints: [jointAt(FEEDER_JOINT, [MAIN])],
  });
  if (!found) {
    fail("an unclaimed joint at this tee is not taken, so the service gets "
      + "a second fitting beside a fitting that was waiting for it");
  }
}

// 3. And the case widening the radius would have broken.
{
  /* 56043 and 56044 sit 0.692 m apart on main 55975 and hold
     different services. Two plots, two joints, and the second is not
     a duplicate of the first however near it is. */
  const found = serviceJointHere({
    start: START, serviceId: SERVICE, serviceIds,
    joints: [jointAt([47.6, 72.8], [MAIN, OTHER_SERVICE])],
  });
  if (found) {
    fail("a joint that already serves ANOTHER plot is taken for this one, so "
      + "this service gets no fitting at all \u2014 a joint nobody orders and "
      + "nobody digs, which is worse than the duplicate this replaced");
  }
}

// 4. Distance still bounds it.
{
  const far = serviceJointHere({
    start: START, serviceId: SERVICE, serviceIds,
    joints: [jointAt([START[0] + 40, START[1]], [MAIN])],
  });
  if (far) {
    fail("a joint forty metres up the main is taken for this tee");
  }
  if (!(JOINT_SEARCH_M > 0.605)) {
    fail(`the shortlist radius is ${JOINT_SEARCH_M} m, which is inside the `
      + "0.605 m between two genuinely separate joints on project 16 \u2014 the "
      + "radius is meant to be wide, because the cables do the deciding");
  }
}

// 5. Nothing there: the service needs its own.
{
  if (serviceJointHere({ start: START, serviceId: SERVICE, serviceIds, joints: [] })) {
    fail("a joint is found where there are none");
  }
  if (serviceJointHere({ start: null, serviceId: SERVICE, serviceIds,
    joints: [jointAt(FEEDER_JOINT, [MAIN])] })) {
    fail("a service with no start point matches a joint");
  }
}

// 6. The routine asks this question rather than measuring for itself.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("Joint_Reasons: [\"service\"],");
  if (at < 0) fail("Auto Lay Service Cable no longer places a service joint");
  else {
    const block = canvas.slice(Math.max(0, at - 4000), at);
    if (!/serviceJointHere\(/.test(block)) {
      fail("the routine decides for itself whether a tee is jointed, rather "
        + "than through serviceJointHere \u2014 which is where the reasoning and "
        + "the cases live");
    }
    if (/<= 0\.25\)/.test(block)) {
      fail("the 0.25 m radius is back");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "One service, one joint (the cables decide, the distance shortlists).");
process.exit(bad ? 1 : 0);
