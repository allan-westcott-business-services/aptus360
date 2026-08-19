/* Making a service meet the main it leaves.

   A service cable drawn to a main crosses it. The two touch on screen
   and, to anything that walks the network, do not meet: what joins them
   is a vertex on the main at the point the service starts.

   Auto Service always added one. Auto Lay Services never did, so a
   service laid that way ran to a feeder it was not attached to — and
   Place Feeder Joints, which marks a service joint at any node where a
   service leaves the run, found no node there and placed none. Some
   services had a joint and others did not, which read as the routine
   being unreliable rather than as a missing vertex. */
import { readFileSync } from "node:fs";
import {
  teeVertexInto, teeInto, mainsOnLayer,
} from "./src/features/gis/teeInto.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const main = (id, geom) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "electric", Geometry: geom,
  Attributes: { Line_Type: "elec_main" },
});

// 1. A vertex appears where the service meets the run.
{
  const got = teeVertexInto([[0, 0], [100, 0]], [40, 0]);
  if (JSON.stringify(got) !== "[[0,0],[40,0],[100,0]]") {
    fail(`teeing at 40 gave ${JSON.stringify(got)}`);
  }
  /* In the right place in the list, not appended \\u2014 a vertex added at
     the end reverses the far half of the main. */
  if (got[1][0] !== 40) fail("the vertex was not inserted along the line");
}

// 2. Nothing where there is nothing to do.
//
//    Null rather than the unchanged line, so a caller can tell "already
//    joined" from "needs writing" without comparing coordinates.
//    Re-running a repair that changes nothing must write nothing.
{
  if (teeVertexInto([[0, 0], [100, 0]], [0, 0]) !== null) {
    fail("a service starting on an existing vertex added another");
  }
  if (teeVertexInto([[0, 0], [100, 0]], [50, 9]) !== null) {
    fail("a service nowhere near the main was teed into it anyway");
  }
  if (teeVertexInto([[0, 0]], [0, 0]) !== null) fail("a one-point line was teed");
  if (teeVertexInto([], [0, 0]) !== null) fail("an empty line was teed");
  if (teeVertexInto([[0, 0], [1, 0]], null) !== null) fail("a missing point was teed");
}

// 3. It joins the main it touches, not the nearest of several.
{
  const near = main(1, [[0, 0], [100, 0]]);
  const far = main(2, [[0, 40], [100, 40]]);
  const hit = teeInto([near, far], [30, 0.05]);
  if (hit?.feature.Feature_ID !== 1) fail(`the service teed into ${hit?.feature.Feature_ID}`);

  /* And into nothing where it reaches nothing: a service stopping short
     of every main is attached to none, and inventing a vertex on the
     closest would join it to a main it was never drawn to. */
  if (teeInto([near, far], [30, 20]) !== null) {
    fail("a service reaching no main was teed into one");
  }
}

// 4. Two services into one main both land.
//
//    The second has to see the vertex the first added, or the pair are
//    computed against the original line and one insert is lost. This is
//    why the caller accumulates into a map and passes its own geomOf.
{
  const m = main(1, [[0, 0], [100, 0]]);
  const acc = new Map();
  const liveGeom = (f) => acc.get(Number(f.Feature_ID)) || f.Geometry;

  for (const at of [[30, 0], [60, 0]]) {
    const hit = teeInto([m], at, { geomOf: liveGeom });
    if (hit) acc.set(Number(hit.feature.Feature_ID), hit.geometry);
  }

  const got = acc.get(1);
  if (JSON.stringify(got) !== "[[0,0],[30,0],[60,0],[100,0]]") {
    fail(`two services gave ${JSON.stringify(got)}`);
  }
}

// 5. Mains only, and the right utility's.
{
  const world = [
    main(1, [[0, 0], [100, 0]]),
    { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
      Geometry: [[0, 0], [1, 1]], Attributes: { Line_Type: "elec_service" } },
    { Feature_ID: 3, Feature_Type: "line", Layer_Key: "gas",
      Geometry: [[0, 0], [9, 0]], Attributes: { Line_Type: "gas_main" } },
  ];
  const ids = mainsOnLayer(world, "electric").map((f) => f.Feature_ID);
  if (ids.join(",") !== "1") fail(`the electric mains came back as ${ids.join(",")}`);
  if (mainsOnLayer(world, "gas").map((f) => f.Feature_ID).join(",") !== "3") {
    fail("the gas main was not found on its own layer");
  }
}

// 6. Both routines that lay services do it, and the joints repair it.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  const fn = (name) => {
    const at = canvas.indexOf(`async function ${name}`);
    return at < 0 ? "" : canvas.slice(at, at + 14000);
  };

  if (!/teeInto\(/.test(fn("autoLayServices"))) {
    fail("Auto Lay Services still leaves its cables touching the main");
  }
  /* And Place Feeder Joints repairs what was laid before the fix, so a
     drawing already called off does not have to be re-laid \\u2014 re-laying
     replaces cable that is correct to fix a vertex that is missing. */
  if (!/teeInto\(/.test(fn("placeFeederJoints"))) {
    fail("the joints pass does not attach services laid earlier");
  }
  /* Planned from the repaired drawing, or the model finds the same
     missing nodes it was just fixed for. */
  if (!/if \(repairs\.size\)/.test(fn("placeFeederJoints"))) {
    fail("the joints are planned from the drawing as it was read");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Service tees behave (a laid service meets its main, and older ones are attached).");
process.exit(bad ? 1 : 0);
