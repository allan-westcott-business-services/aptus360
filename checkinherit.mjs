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
      /* A cable is told from a circuit outline by what it CARRIES: every
         line on a real drawing has Feature_Role "shape", so the role
         says nothing. */
      const isMain = f.Feature_Type === "line"
        && /main/i.test(String(f.Attributes?.Line_Type ?? ""))
        && (f.Attributes?.VD_Cable_Size_ID != null
          || f.Attributes?.Manual_VD_Cable_Size_ID != null);
      if (!isFitting && !isMain) continue;
      const a = f.Attributes || {};
      if (a.Circuit_ID == null) continue;
      /* Anywhere ALONG a cable: teeing off mid-span is how a cable is
         usually drawn from another, and a run can have fifty metres
         between corners. */
      let hit = false;
      let hitD = Infinity;
      if (f.Feature_Type === "point") {
        const q = a.Span_Anchor ?? f.Geometry?.[0];
        if (Array.isArray(q)) hitD = Math.hypot(q[0] - e[0], q[1] - e[1]);
        hit = hitD <= reach;
      } else {
        const g = f.Geometry || [];
        for (let i = 1; i < g.length && !hit; i++) {
          const p0 = g[i - 1];
          const p1 = g[i];
          const vx = p1[0] - p0[0];
          const vy = p1[1] - p0[1];
          const l2 = vx * vx + vy * vy;
          let t = l2 ? ((e[0] - p0[0]) * vx + (e[1] - p0[1]) * vy) / l2 : 0;
          t = Math.max(0, Math.min(1, t));
          hitD = Math.min(hitD,
            Math.hypot(e[0] - (p0[0] + vx * t), e[1] - (p0[1] + vy * t)));
          hit = hitD <= reach;
        }
      }
      if (!hit) continue;
      const k = Number(a.Circuit_ID);
      const cand = { Circuit_ID: k, d: hitD, rank: isFitting ? 0 : 1 };
      const prev = seen.get(k);
      if (!prev || cand.rank < prev.rank
        || (cand.rank === prev.rank && cand.d < prev.d)) seen.set(k, cand);
    }
  }
  if (!seen.size) return {};
  const ranked = [...seen.values()].sort((x, y) => (x.rank - y.rank) || (x.d - y.d));
  if (ranked.length > 1 && ranked[0].rank === ranked[1].rank
    && Math.abs(ranked[0].d - ranked[1].d) < 0.05) return {};
  const { d, rank, ...winner } = ranked[0];
  return winner;
};

const joint = (id, cid, at) => ({ Feature_ID: id, Feature_Type: "point",
  Feature_Role: "joint", Layer_Key: "electric", Geometry: [at],
  Attributes: { Joint_Type: "breech", Circuit_ID: cid } });
/* ── A cable and an outline are both "shape" ──

   Every line on these drawings carries `Feature_Role: "shape"` \u2014
   trenches, services, cables and circuit outlines alike. It says what a
   line IS, not what it is for, and an earlier version of this check
   encoded the opposite: it built a lasso with a role and a cable
   without one, so it passed while the real drawing matched nothing.

   A cable is told from an outline by what it CARRIES. The build stamps
   a cable with the size it laid; an outline has no conductor. */
const lasso = (id, cid, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Feature_Role: "shape", Layer_Key: "electric", Geometry: pts,
  Attributes: { Line_Type: "elec_main", Circuit_ID: cid } });
const cable = (id, cid, pts) => ({ Feature_ID: id, Feature_Type: "line",
  Feature_Role: "shape", Layer_Key: "electric", Geometry: pts,
  Attributes: { Line_Type: "elec_main", Circuit_ID: cid, VD_Cable_Size_ID: 1 } });

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

  /* And a real cable IS a source, outline or not. */
  const fromCable = inherited([cable(4, 5, [[100, 0], [140, 0]])],
    [[120, 0], [150, 30]], "elec_main");
  if (fromCable.Circuit_ID !== 5) {
    fail("a cable drawn from an existing cable inherits nothing");
  }
}

// 3. The nearest thing wins; a genuine tie refuses.
//
//    Refusing whenever two circuits were within reach refused
//    EVERYWHERE on a real drawing: where circuits share a trench,
//    almost any point has two. What somebody drew from is the thing
//    closest to where they started.
{
  /* Two fittings, one nearer. */
  const world = [joint(1, 2, [10, 10]), joint(2, 3, [11.5, 10])];
  if (inherited(world, [[10, 10], [40, 20]], "elec_main").Circuit_ID !== 2) {
    fail("the nearer fitting did not win");
  }
  /* Two of the same kind at the same distance: nobody can resolve that
     from the drawing. */
  const tied = [joint(1, 2, [10, 10]), joint(2, 3, [10, 10])];
  if (inherited(tied, [[10, 10], [40, 20]], "elec_main").Circuit_ID != null) {
    fail("a cable started exactly between two fittings picked one");
  }
  /* ── A fitting beats a cable at the same distance ──
     On a shared trench another circuit's cable passes exactly through a
     joint, so both are nought metres away. The joint is a stated thing
     at that point; the cable is merely passing. This is the case that
     made every joint on the live drawing inherit nothing. */
  const both = [joint(1, 2, [10, 10]), cable(2, 3, [[0, 10], [40, 10]])];
  if (inherited(both, [[10, 10], [40, 20]], "elec_main").Circuit_ID !== 2) {
    fail("a cable passing through a joint outranked the joint itself");
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
    /* A cable is told from an outline by what it carries, not by its
       role: every line on a real drawing has role "shape". */
    if (/Feature_Type === "line" && !role/.test(fn)) {
      fail("a cable is identified by having no Feature_Role, and every line "
        + "on a real drawing has one \u2014 so nothing ever matches");
    }
    /* Along a cable, not only at its corners. */
    if (!/t = Math\.max\(0, Math\.min\(1, t\)\)/.test(fn)) {
      fail("only a cable's corners are matched, so a cable teed off mid-span "
        + "inherits nothing");
    }
    if (!/VD_Cable_Size_ID != null/.test(fn)) {
      fail("a circuit's outline is treated as a cable: both are elec_main "
        + "lines, and only the conductor tells them apart");
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
    /* Nearest wins, and a fitting outranks a passing cable. */
    if (!/rank: isFitting \? 0 : 1/.test(fn)) {
      fail("a cable passing through a joint can outrank the joint, which "
        + "makes every joint on a shared trench inherit nothing");
    }
    if (!/ranked\[0\]\.rank === ranked\[1\]\.rank/.test(fn)) {
      fail("a genuine tie is resolved rather than refused");
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
