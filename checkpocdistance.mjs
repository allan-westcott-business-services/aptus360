/* Distances traced from a POC.

   ── What was wrong ──

   The circuit report showed a column of dashes on every POC-fed design.
   Not a wrong distance — no distance at all, every meter, every time.

   `lvOrigin` was widened to accept an electric POC, because a
   connection to an existing network has no new transformer and the
   site's electricity comes from the point of connection to the DNO's
   cable. The reach in `distancesFrom` was never revisited, so the POC
   inherited the rule written for plant: join within CONNECT_M — a
   quarter of a metre — or not at all.

   That rule is right for a substation. A feeder leaving one starts on
   it, and a gap there is a drawing that has not been joined up;
   checkdistances.mjs §8 pins that deliberately and it still holds.

   It is wrong for a POC, which is not something the designer draws the
   cable out of. It marks where somebody else's cable already is —
   across a footway, at an existing joint bay, the far side of a
   boundary — and the site cable starts near it rather than on it. Over
   0.25 m, `joinAt` returned null, `distancesFrom` returned an empty
   Map, and the report had nothing to show.

   ── And the gap counts ──

   A meter's gap does not: the service ends at the plot boundary and the
   tails to the box are not network. Between a POC and the start of the
   site cable there is cable, and it is cable this job lays. Dropping it
   understated every distance by the width of the road — and moving the
   POC marker changed nothing on the report, which is the part that
   would have made this hard to believe. */
import { circuitReport, distancesFrom, lvOrigin } from "./src/features/gis/electric.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const CABLE = {
  Feature_ID: 2, Feature_Role: "shape", Layer_Key: "electric",
  Feature_Type: "line", Geometry: [[0, 0], [50, 0], [100, 0]],
};
const M18 = {
  Feature_ID: 3, Feature_Role: "meter", Layer_Key: "electric",
  Plot_ID: 18, Geometry: [[50, 3]],
};
const M19 = {
  Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
  Plot_ID: 19, Geometry: [[100, 3]],
};
const origin = (role, at) => ({
  Feature_ID: 1, Feature_Role: role, Layer_Key: "electric", Geometry: [at],
});
const plotById = (id) => ({ plot_number: id, kva_load: 2 });

const distances = (r) => (r.circuits || []).flatMap((c) => c.meters).map((m) => m.distM);
const report = (role, at) =>
  circuitReport([origin(role, at), CABLE, M18, M19], { plotById });

// 1. A POC off the cable still reports distances.
//
//    The fault as reported: "the circuit report is continually not
//    picking up the distance to the POC". Every one of these gaps is
//    ordinary on a real drawing.
{
  for (const gap of [0.3, 1, 3, 8, 15]) {
    const d = distances(report("poc", [0, gap]));
    if (!d.length || d.some((x) => x == null)) {
      fail(`a POC ${gap} m from the cable reported no distances`);
    }
  }
}

// 2. The gap is in the number, not thrown away.
//
//    Moving the POC marker has to move the distances, or the report
//    cannot be checked against the drawing.
{
  const flush = distances(report("poc", [0, 0]));
  if (flush[0] !== 50 || flush[1] !== 100) {
    fail(`a POC on the cable should read 50 and 100, got ${flush.join(", ")}`);
  }
  const across = distances(report("poc", [0, 6]));
  if (across[0] !== 56 || across[1] !== 106) {
    fail(`a POC 6 m off should add 6 to every distance, got ${across.join(", ")}`);
  }
  /* Behind the marker, not just beside it — the gap is a length, and a
     length has no sign. */
  const behind = distances(report("poc", [-4, 0]));
  if (behind[0] !== 54) fail(`a POC 4 m back along the line should read 54, got ${behind[0]}`);
}

// 3. Past the reach it still refuses.
//
//    The point of a bounded reach: wide enough to cross a road, short
//    enough that it cannot cross to the next one. A POC in the wrong
//    place should read as unreachable rather than snap to whatever
//    cable happened to be nearest.
{
  const far = report("poc", [0, 40]);
  if (distances(far).some((x) => x != null)) {
    fail("a POC 40 m from any cable was joined to the network anyway");
  }
  if (!far.circuits?.some((c) => c.unreached > 0) && !far.unreachable?.length) {
    fail("a POC out of reach did not report its meters as unreachable");
  }
}

// 4. The substation rule is untouched.
//
//    This is the half that must NOT move. checkdistances.mjs §8 says a
//    cable starting three metres from the substation is a drawing not
//    joined up, and widening the POC's reach must not widen that.
{
  const on = distances(report("substation", [0, 0]));
  if (on[0] !== 50 || on[1] !== 100) {
    fail(`a substation on the cable should read 50 and 100, got ${on.join(", ")}`);
  }
  for (const gap of [0.3, 1, 3]) {
    if (distances(report("substation", [0, gap])).some((x) => x != null)) {
      fail(`a substation ${gap} m from the cable was treated as joined`);
    }
  }
}

// 5. Where both are drawn, the substation still wins.
//
//    lvOrigin's rule, and this must not have quietly become "whichever
//    can reach": a site with a transformer starts at the transformer,
//    and a POC beside it is where the incomer arrives.
{
  const both = [origin("substation", [0, 0]),
    { ...origin("poc", [0, 5]), Feature_ID: 9 }, CABLE, M18, M19];
  if (lvOrigin(both)?.Feature_Role !== "substation") {
    fail("the POC was taken as the origin over a substation");
  }
  const r = circuitReport(both, { plotById });
  if (r.stationRole !== "substation") fail("the report traced from the POC, not the substation");
  if (distances(r)[0] !== 50) {
    fail(`with both drawn the distance should be 50, got ${distances(r)[0]}`);
  }
}

// 6. The gap is reported, not absorbed silently.
//
//    A reach wide enough to cross a road is wide enough to cross to the
//    wrong road. The number is on the report so a designer can disagree
//    with it.
{
  const r = report("poc", [0, 6]);
  if (r.stationGapM !== 6) fail(`the origin gap was reported as ${r.stationGapM}, not 6`);
  if (report("poc", [0, 0]).stationGapM !== 0) {
    fail("a POC on the cable reported a gap");
  }

  const ui = (await import("node:fs")).readFileSync(
    "./src/features/gis/CircuitReport.jsx", "utf8");
  if (!/stationGapM/.test(ui)) fail("the report screen never shows the origin gap");
}

// 7. The origin is zero from itself.
//
//    Whatever the walk made of the node it joined at — otherwise the
//    POC's own row would carry the gap twice.
{
  const d = distancesFrom([origin("poc", [0, 6]), CABLE, M18], 1);
  if (d.get(1) !== 0) fail(`the origin reported ${d.get(1)} m from itself, not 0`);
}

/* ── A substation joins its trench, before any cable is drawn ──

   §4 above holds the other half of this and must keep holding it: a
   CABLE starting three metres from the substation is a drawing that has
   not been joined up, and absorbing that gap would hide the fault and
   put those metres into every distance on the site.

   A trench is a different thing to be near. A substation sits beside
   its trench rather than on it, and until the LV cable is drawn the
   trench is the only route there is.

   Two metres off, with no cable yet, and joinAt returned null,
   distancesFrom returned an empty Map, and every distance on the
   drawing was blank — the column, not a row. The same shape as the POC
   fault this file was written for: a rule written for the finished
   drawing, applied to the drawing being made.

   What was missing was the distinction, not a bigger number. */
{
  const line = (id, pts, layer, type) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: layer,
    Geometry: pts, Attributes: { Line_Type: type },
  });
  const at = (g) => ({
    Feature_ID: 1, Feature_Role: "substation", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [g], Attributes: {},
  });
  const meter = {
    Feature_ID: 5, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: 41, Geometry: [[50, 10]],
    Attributes: { Circuit_ID: 1 },
  };
  /* Trenches and a service cable. No LV main: that is the point. */
  const dug = [
    line(2, [[0, 0], [100, 0]], "trench", "trench_main"),
    line(3, [[50, 0], [50, 10]], "trench", "trench_service"),
    line(4, [[50, 0], [50, 10]], "electric", "elec_service"),
  ];

  // 1. On the trench, and beside it, both measure.
  for (const [gap, want] of [[0, 60], [2, 62], [8, 68]]) {
    const d = distancesFrom([at([0, gap]), ...dug, meter], 1);
    const got = d.get(5);
    if (got == null) {
      fail(`a substation ${gap} m from its trench blanks every distance on the drawing`);
    } else if (Math.abs(got - want) > 0.01) {
      fail(`a substation ${gap} m from its trench measured ${got}, expected ${want}`);
    }
  }

  /* 2. And the gap is counted, not swallowed.

     Two metres off reads 62, not 60. Absorbing it would understate
     every distance on the site by the width of the verge, and moving
     the substation would change nothing on the report — which is the
     part that makes such a fault hard to believe. */
  {
    const near = distancesFrom([at([0, 0]), ...dug, meter], 1).get(5);
    const off = distancesFrom([at([0, 2]), ...dug, meter], 1).get(5);
    if (!(off > near)) {
      fail("moving the substation off its trench changed no distance");
    }
  }

  /* 3. Far enough out is still out.

     Generous against a trench is not unlimited: a substation on the
     next street is a mistake, and should read as one. */
  {
    const d = distancesFrom([at([0, 40]), ...dug, meter], 1);
    if (d.size) fail("a substation 40 m from any trench was joined to the network");
  }

  /* 4. The cable rule is untouched, said again here.

     §4 asserts it through the report; this asserts it through
     distancesFrom, because the two reaches now live in one function and
     a change to either could move the other. */
  {
    const stray = line(6, [[3, 0], [53, 0]], "electric", "elec_main");
    const far = {
      Feature_ID: 7, Feature_Role: "meter", Feature_Type: "point",
      Layer_Key: "electric", Geometry: [[53, 0]], Attributes: { Circuit_ID: 1 },
    };
    if (distancesFrom([at([0, 0]), stray, far], 1).get(7) != null) {
      fail("a cable starting three metres from the substation was treated as joined");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Distances trace from a POC (across the gap, and the gap is counted).");
process.exit(bad ? 1 : 0);
