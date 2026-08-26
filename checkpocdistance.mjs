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

console.log(bad ? `\n${bad} problem(s)`
  : "Distances trace from a POC (across the gap, and the gap is counted).");
process.exit(bad ? 1 : 0);
