/* A cable drawn from a fitting is on that fitting's circuit.

   A hand-drawn LV cable arrived with no circuit at all: its editor
   showed none of the circuit fields a built cable has, and the levels
   never saw it. Somebody had drawn a cable onto a circuit and it was
   not on it.

   The joint knows. So does a feeder point, a link box, and the cable
   already there. */
import { readFileSync } from "node:fs";
import { JOIN_REACH_M } from "./src/features/gis/joints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The rule, as the canvas applies it. Kept in step by the source checks
   below rather than by hope. */
const inherited = (features, geometry, lineType) => {
  /* A mains CABLE, not a mains trench: `trench_mains` contains the word
     and is not a cable. The canvas asks isTrenchType; here the key is
     enough, and the source check below holds the canvas to the proper
     test. */
  if (/^trench/i.test(String(lineType ?? ""))) return {};
  if (!/main/i.test(String(lineType ?? ""))) return {};
  const ends = [geometry[0], geometry[geometry.length - 1]].filter(Boolean);
  const seen = new Map();
  /* Two metres, not the third of a metre at which two things are
     CONNECTED. Drawing is not that precise: a joint's symbol is several
     metres wide on screen, and somebody starting a cable at it clicks
     the symbol rather than the point it occupies. */
  const reach = Math.max(JOIN_REACH_M, 2);
  for (const e of ends) {
    for (const f of features) {
      if (f.Layer_Key !== "electric") continue;
      const role = String(f.Feature_Role ?? "");
      const isFitting = ["joint", "feederpoint", "linkbox", "spannode",
        "poc", "substation", "msdb"].includes(role);
      const isMain = f.Feature_Type === "line" && !role
        && /main/i.test(String(f.Attributes?.Line_Type ?? ""));
      if (!isFitting && !isMain) continue;
      const a = f.Attributes || {};
      if (a.Circuit_ID == null) continue;
      const near = f.Feature_Type === "point"
        ? [(a.Span_Anchor ?? f.Geometry?.[0])] : (f.Geometry || []);
      if (!near.some((q) => Array.isArray(q)
        && Math.hypot(q[0] - e[0], q[1] - e[1]) <= reach)) continue;
      seen.set(Number(a.Circuit_ID), { Circuit_ID: Number(a.Circuit_ID) });
    }
  }
  return seen.size === 1 ? [...seen.values()][0] : {};
};

const joint = (id, cid, at) => ({ Feature_ID: id, Feature_Type: "point",
  Feature_Role: "joint", Layer_Key: "electric", Geometry: [at],
  Attributes: { Joint_Type: "breech", Circuit_ID: cid } });
/* A circuit's lasso: stored as a LINE with Line_Type elec_main, exactly
   like the cable it encloses. Only its ROLE says otherwise. */
const lasso = (id, cid, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Feature_Role: "shape", Layer_Key: "electric", Geometry: pts,
  Attributes: { Line_Type: "elec_main", Circuit_ID: cid } });

// 1. From a fitting, the fitting's circuit.
//
//    Including from NEAR it. A joint's symbol is several metres wide on
//    screen and somebody starting a cable at it clicks the symbol: at a
//    third of a metre the reported case inherited nothing, because the
//    drawn end landed a metre from the point the joint occupies.
{
  const world = [joint(1, 2, [10, 10])];
  for (const off of [0, 0.5, 1.5]) {
    const got = inherited(world, [[10 + off, 10], [40, 20]], "elec_main");
    if (got.Circuit_ID !== 2) {
      fail(`a cable started ${off} m from a breech joint does not take its `
        + "circuit");
    }
  }
  /* But not from across the road. */
  if (inherited(world, [[40, 10], [70, 20]], "elec_main").Circuit_ID != null) {
    fail("a cable thirty metres from the joint took its circuit");
  }
}

// 2. A lasso is not a cable.
//
//    Three overlapping outlines round one joint looked like three
//    circuits meeting, and the cable inherited nothing at all. This is
//    the case that was actually reported.
{
  const world = [
    joint(1, 2, [10, 10]),
    lasso(2, 3, [[0, 0], [20, 0], [20, 20], [0, 20]]),
    lasso(3, 3, [[9.9, 9.9], [30, 30]]),
  ];
  const got = inherited(world, [[10, 10], [40, 20]], "elec_main");
  if (got.Circuit_ID !== 2) {
    fail("a circuit outline lying over the joint is counted as a second "
      + "circuit, so the cable inherits nothing");
  }
}

// 3. Two real circuits meeting is a thing to be told about, not guessed.
{
  const world = [joint(1, 2, [10, 10]), joint(2, 3, [40, 20])];
  if (inherited(world, [[10, 10], [40, 20]], "elec_main").Circuit_ID != null) {
    fail("a cable touching two different circuits picked one at random");
  }
}

// 4. Nothing to inherit from, and nothing that should inherit.
{
  if (inherited([], [[0, 0], [10, 0]], "elec_main").Circuit_ID != null) {
    fail("a cable in open ground was given a circuit");
  }
  /* A trench belongs to no circuit; a service takes its circuit from
     the main it tees into rather than from whatever its far end
     touches. */
  const world = [joint(1, 2, [10, 10])];
  for (const t of ["trench_mains", "elec_service"]) {
    if (inherited(world, [[10, 10], [40, 20]], t).Circuit_ID != null) {
      fail(`a ${t} drawn from a joint was given the joint's circuit`);
    }
  }
}

// 5. And the canvas applies it where a line is made.
{
  if (!/\.\.\.inheritedCircuit\(run\.geometry, lineType\)/.test(canvas)) {
    fail("a hand-drawn line does not inherit anything");
  }
  const at = canvas.indexOf("const inheritedCircuit = useCallback");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [features]);", at));
  if (!fn) fail("nothing works out what a drawn cable should inherit");
  else {
    if (!/Feature_Type === "line" && !role/.test(fn)) {
      fail("a circuit's lasso is treated as a cable, because both are lines "
        + "with Line_Type elec_main and only the role differs");
    }
    /* A trench is not a cable, and `trench_mains` contains the word. */
    if (!/isTrenchType\(lineType, lineTypes\)/.test(fn)) {
      fail("a mains trench matches the word main and would be given a "
        + "circuit, which puts a dig on a network");
    }
    /* The reach is a drawing tolerance, not a connection one, and it is
       fixed: a reach that varied with the zoom made the same drawing
       behave differently depending on how far in somebody was. */
    if (!/const reach = Math\.max\(JOIN_REACH_M, 2\)/.test(fn)) {
      fail("the reach is the connection tolerance, which is a third of a "
        + "metre \u2014 too tight for a cable drawn at a symbol");
    }
    if (!/seen\.size !== 1/.test(fn)) {
      fail("a cable touching two circuits is given one of them");
    }
    /* The output travels with the circuit: a cable leaving a box's
       output is on that output, not merely on the circuit. */
    if (!/Link_Way: a\.Link_Way/.test(fn)) {
      fail("the link box output is not inherited, so the run is on the "
        + "circuit but on no particular way");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A drawn cable inherits the circuit it was drawn from.");
process.exit(bad ? 1 : 0);
