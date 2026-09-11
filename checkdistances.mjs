/* How far each meter is from the substation.

   The circuit report showed a column of dashes on every generated
   drawing. Two reasons, and each would have been enough on its own:

     The graph was built only from Connects, an attribute written when
     somebody draws one feature onto another. The routing lays cables
     from a graph of its own and never fills it in, so a built network
     had no edges at all.

     And lengthOf read a stored Measured_Length_m, which a built cable has none
     of — so even once connected, the walk added nothing at each step
     and every distance came out as zero.

   Both now fall back to the geometry, which is the thing that is always
   there. */
import { readFileSync } from "node:fs";
import { distancesFrom, whyUnreached } from "./src/features/gis/electric.js";

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

// 1. A built network, with no Connects and no Measured_Length_m anywhere.
{
  const d = distancesFrom([SUB, CABLE, SERVICE, METER], 1);
  if (d.get(4) == null) fail("a meter on a built network has no distance");
  else if (Math.abs(d.get(4) - 120) > 0.01) {
    fail(`the meter is ${d.get(4)} m from the substation, wanted 120`);
  }
  /* A line's own distance is how far its *nearest* end is, which is
     what "how far is this cable from the substation" means. It used to
     be the far end, because arriving at a feature charged its whole
     length \u2014 the thing that made two meters six metres apart report
     sixty metres apart. */
  if (Math.abs(d.get(2) - 0) > 0.01) fail("the cable's own distance is wrong");
}

// 2. A stored length still wins. Somebody who has measured a run and
//    entered it has said something the geometry does not know — a
//    trench dug round an obstruction, say.
{
  const measured = { ...CABLE, Attributes: { Measured_Length_m: 150 } };
  const d = distancesFrom([SUB, measured, SERVICE, METER], 1);
  if (Math.abs(d.get(4) - 170) > 0.01) {
    fail(`a stored length was ignored (${d.get(4)} m, wanted 170)`);
  }
}

// 3. A meter is measured to where it joins, not to the end of the cable
//    it joins. A meter twenty metres along a service is twenty metres
//    further than the service's start, and no further than its end.
{
  const d = distancesFrom([SUB, CABLE, SERVICE, METER], 1);
  if (Math.abs(d.get(4) - 120) > 0.01) {
    fail(`the meter is ${d.get(4)} m along the run, wanted 120`);
  }
  /* The service starts at the main, so its own distance is 100. */
  if (Math.abs(d.get(3) - 100) > 0.01) {
    fail(`the service is ${d.get(3)} m from the substation, wanted 100`);
  }
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

// 5. A meter does not sit exactly on the end of its cable.
//
//    That was the third reason the column was blank, and the one that
//    survived the first two fixes. Cable to cable is a joint: they
//    either meet or they do not. A meter to the cable serving it is not
//    a joint — the meter is a box on a wall and the cable ends at the
//    plot boundary, so they are metres apart on every drawing ever
//    made. At a quarter of a metre the meter was joined to nothing.
{
  const at = (x, y) => ({
    Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[x, y]],
  });

  for (const [what, m] of [
    ["exactly on the cable end", at(100, 20)],
    ["a metre past it", at(100, 21)],
    ["five metres past it", at(100, 25)],
  ]) {
    const d = distancesFrom([SUB, CABLE, SERVICE, m], 1);
    if (d.get(4) == null) fail(`a meter ${what} has no distance`);
  }

  /* And not so far that a meter is adopted by a cable serving somebody
     else \u2014 that would report a plausible distance down the wrong run,
     which is worse than a dash. */
  const adrift = distancesFrom([SUB, CABLE, SERVICE, at(100, 60)], 1);
  if (adrift.get(4) != null) fail("a meter forty metres away was measured");
}

// 6. Two meters off the same main are as far apart as their services.
//
//    A meter within reach of several lines was linked to all of them,
//    so the walk took whichever gave the shortest route — usually
//    straight to the main, skipping the service cable that actually
//    feeds it. Two plots then reported the same distance however far
//    apart their services ran, which is what a drawing showing 6.3 m
//    between them plainly did not say.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Geometry: [[0, 0], [100, 0]] };
  /* Plot 23 comes off the main; plot 24 is 6.3 m further along. */
  const svc23 = { Feature_ID: 3, Feature_Type: "line", Geometry: [[100, 0], [100, 5]] };
  const svc24 = { Feature_ID: 4, Feature_Type: "line", Geometry: [[100, 5], [100, 11.3]] };
  const m23 = { Feature_ID: 5, Feature_Role: "meter", Geometry: [[100, 5]] };
  const m24 = { Feature_ID: 6, Feature_Role: "meter", Geometry: [[100, 11.3]] };

  const d = distancesFrom([SUB, main, svc23, svc24, m23, m24], 1);
  const a = d.get(5);
  const b = d.get(6);

  if (a == null || b == null) fail("a meter on a service run has no distance");
  else {
    if (Math.abs(a - b) < 0.01) {
      fail(`both meters report ${a} m, though their services differ by 6.3`);
    }
    if (Math.abs((b - a) - 6.3) > 0.01) {
      fail(`the meters are ${(b - a).toFixed(1)} m apart, wanted 6.3`);
    }
    /* And by the route, not as the crow flies: the run goes out along
       the main and back down the services. */
    if (Math.abs(a - 105) > 0.01) fail(`the nearer meter is ${a} m, wanted 105`);
  }
}

// 7. The shortest route, not the one with fewest cables in it.
//
//    The walk was breadth first and took the first arrival as final,
//    which finds the route with the fewest features — not the shortest.
//    Three long cables beat ten short ones, so a meter fifty metres
//    away reported a hundred and thirty: whichever way round the walk
//    happened to reach it first.
{
  /* The drawing: E0 to A1 is 25.6 m, A1 to A5 is 25.4 m, then a 4 m
     service to the meter. */
  const e0a1 = { Feature_ID: 2, Feature_Type: "line", Geometry: [[0, 0], [25.6, 0]] };
  const a1a5 = { Feature_ID: 3, Feature_Type: "line", Geometry: [[25.6, 0], [51, 0]] };
  const svc = { Feature_ID: 4, Feature_Type: "line", Geometry: [[51, 0], [51, 4]] };
  const meter = { Feature_ID: 5, Feature_Role: "meter", Geometry: [[51, 4]] };

  const d = distancesFrom([SUB, e0a1, a1a5, svc, meter], 1);
  if (Math.abs(d.get(5) - 55) > 0.01) {
    fail(`the meter is ${d.get(5)} m along the run, wanted 55`);
  }

  /* And where two routes exist, the shorter wins — which is what
     breadth first could not do. */
  const detour = { Feature_ID: 6, Feature_Type: "line", Geometry: [[0, 0], [0, 300]] };
  const back = { Feature_ID: 7, Feature_Type: "line", Geometry: [[0, 300], [51, 0]] };
  const both = distancesFrom([SUB, e0a1, a1a5, svc, meter, detour, back], 1);
  if (Math.abs(both.get(5) - 55) > 0.01) {
    fail(`with a longer route present the meter reads ${both.get(5)} m, wanted 55`);
  }
}

// 8. Plant joins every cable leaving it; a meter joins one.
//
//    A substation is a point too, and limiting it to its nearest cable
//    made the whole network hang off a single run — everything was then
//    reached the long way round.
{
  const left = { Feature_ID: 2, Feature_Type: "line", Geometry: [[0, 0], [-50, 0]] };
  const right = { Feature_ID: 3, Feature_Type: "line", Geometry: [[0, 0], [50, 0]] };
  const mLeft = { Feature_ID: 4, Feature_Role: "meter", Geometry: [[-50, 0]] };
  const mRight = { Feature_ID: 5, Feature_Role: "meter", Geometry: [[50, 0]] };

  const d = distancesFrom([SUB, left, right, mLeft, mRight], 1);
  if (d.get(4) == null || d.get(5) == null) {
    fail("a substation fed only one of the two cables leaving it");
  }

  /* And a feeder must start *on* the substation.

     A meter is allowed to sit metres from its service, because a meter
     is a box on a wall. A feeder is not: it leaves the substation, and
     a gap there is a drawing that has not been joined up rather than a
     tolerance to widen. Absorbing it would hide the fault and put a few
     metres of nothing into every distance on the site.

     So this must NOT be reached — and the report says how many meters
     it could not get to, rather than showing a column of dashes. */
  const offset = { Feature_ID: 6, Feature_Type: "line", Geometry: [[3, 0], [53, 0]] };
  const far = { Feature_ID: 7, Feature_Role: "meter", Geometry: [[53, 0]] };
  const gap = distancesFrom([SUB, offset, far], 1);
  if (gap.get(7) != null) {
    fail("a cable starting three metres away was treated as joined");
  }
}

// 9. Two services teeing off one long main.
//
//    The case from the drawing, and the one the old model could not
//    do. Arriving at a cable charged its whole length, so a meter
//    joining a 200 m main paid 200 m however far along it teed in —
//    two plots six metres apart reported sixty metres apart.
//
//    The graph is now the points the lines are drawn through, with an
//    edge per segment, and a meter joins at the place it actually tees
//    in.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Geometry: [[0, 0], [200, 0]] };
  const svc23 = { Feature_ID: 3, Feature_Type: "line", Geometry: [[60, 0], [60, 4]] };
  const svc24 = { Feature_ID: 4, Feature_Type: "line", Geometry: [[66, 0], [66, 4]] };
  const m23 = { Feature_ID: 5, Feature_Role: "meter", Geometry: [[60, 4]] };
  const m24 = { Feature_ID: 6, Feature_Role: "meter", Geometry: [[66, 4]] };

  const d = distancesFrom([SUB, main, svc23, svc24, m23, m24], 1);

  if (Math.abs(d.get(5) - 64) > 0.01) fail(`plot 23 is ${d.get(5)} m, wanted 64`);
  if (Math.abs(d.get(6) - 70) > 0.01) fail(`plot 24 is ${d.get(6)} m, wanted 70`);
  /* And the difference is the distance between the plots, not the
     length of the main. */
  if (Math.abs((d.get(6) - d.get(5)) - 6) > 0.01) {
    fail(`the plots report ${(d.get(6) - d.get(5)).toFixed(1)} m apart, wanted 6`);
  }
}

// 10. A meter beside its service, not at the end of it.
//
//    Reported from a circuit report with four dashes among a hundred and
//    fifty distances: plots 88, 126, 128 and 129, each between neighbours
//    that reached. A meter joins the nearest point on the nearest line.
//    Where that point is a vertex \u2014 the end of the service, which is
//    where Auto Service puts the meter \u2014 the walk had settled it. Where
//    it is part way along a segment the join spliced a new point in
//    AFTER the walk had run, under a comment saying its distance was
//    "the nearer settled end plus the bit along the segment", and then
//    nobody worked that out. The point had no entry; the meter had no
//    distance.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]] };
  /* The service runs up the side of the plot and along its front; the
     meter is on the front wall, beside the run rather than at its end. */
  const svc = { Feature_ID: 3, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[50, 0], [50, 8], [56, 8]] };
  const beside = { Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[53, 9]] };
  const onMain = { Feature_ID: 5, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[70, 2]] };
  const d = distancesFrom([SUB, main, svc, beside, onMain], 1);
  if (d.get(4) == null) {
    fail("a meter beside the body of its service has no distance");
  } else if (Math.abs(d.get(4) - 61) > 0.01) {
    fail(`the meter beside its service reads ${d.get(4)} m, wanted 61`);
  }
  if (d.get(5) == null) fail("a meter beside the main, part way along, has no distance");
  else if (Math.abs(d.get(5) - 70) > 0.01) fail(`the meter on the main reads ${d.get(5)} m, wanted 70`);
  /* And no reason is offered for a meter that reaches. */
  if (whyUnreached([SUB, main, svc, beside, onMain], 1, 4) != null) {
    fail("a reached meter was given a reason for not reaching");
  }
}

// 11. Only cables and trenches carry a meter back to the origin.
//
//    Every line on the drawing was in the graph, and a meter took the
//    nearest. A meter is a box on the front wall and the boundary is
//    drawn along it, so a meter a metre from its boundary and four from
//    its service joined the boundary \u2014 which runs back to nothing.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]] };
  const svc = { Feature_ID: 3, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[50, 0], [50, 8]] };
  const boundary = { Feature_ID: 6, Feature_Type: "line", Layer_Key: "boundary",
    Geometry: [[40, 10], [60, 10]] };
  const meter = { Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[50, 11] ] };
  const d = distancesFrom([SUB, main, svc, boundary, meter], 1);
  if (d.get(4) == null) fail("a meter nearer its boundary than its service has no distance");
  else if (Math.abs(d.get(4) - 58) > 0.01) {
    fail(`the meter reads ${d.get(4)} m; it should reach along its service, 58 m`);
  }
  /* A gas service ending short of its main must not carry the fault
     over to the electric meter beside it either. */
  const gas = { Feature_ID: 7, Feature_Type: "line", Layer_Key: "gas",
    Geometry: [[50.5, 1], [50.5, 8.5]] };
  const g = distancesFrom([SUB, main, svc, gas, meter], 1);
  if (g.get(4) == null) fail("a gas service beside the electric one took the meter with it");
  /* A trench still counts: the report is read before the cables are
     laid, and the trench is where they will go. */
  const trench = { Feature_ID: 8, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [100, 0]] };
  const t = distancesFrom([SUB, trench, svc, meter], 1);
  if (t.get(4) == null) fail("a meter on the trench network before the build has no distance");
}

// 12. Why a meter did not reach, in metres, from the same graph.
{
  const main = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_main" }, Geometry: [[0, 0], [100, 0]] };
  /* A service stopping 0.6 m short of the main: over CONNECT_M, so not
     joined. The meter at its end is on an island. */
  const short = { Feature_ID: 3, Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_service" }, Geometry: [[50, 0.6], [50, 8]] };
  const meter = { Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[50, 8]] };
  const all = [SUB, main, short, meter];
  if (distancesFrom(all, 1).get(4) != null) {
    fail("a service 0.6 m short of the main was read as joined to it");
  }
  const why = whyUnreached(all, 1, 4) || "";
  /* Names the line by its id, and says how far short of what. Not by
     the type KEY: the reason now calls a `trench_service` a service
     trench, which is what the drawing calls it, and these were pinned
     to the database's word. The rule is that the row points at one
     thing on the drawing \u2014 which it still does. */
  if (!/#3\b/.test(why)) fail(`the reason does not name the line joined: "${why}"`);
  if (!/0\.6 m short of [^#]*#2/.test(why)) {
    fail(`the reason does not say how far short, or of what: "${why}"`);
  }
  /* And the fault leads, because the column that shows this truncates:
     the first words have to be the diagnosis. */
  if (!/^Gap of 0\.6 m/.test(why)) {
    fail(`the reason buries the fault at the end, where the column cuts `
      + `it off: "${why}"`);
  }

  /* Nothing near it at all. */
  const adrift = { Feature_ID: 5, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[50, 60]] };
  const far = whyUnreached([SUB, main, adrift], 1, 5) || "";
  if (!/within 30 m/.test(far) || !/60 m away/.test(far)) {
    fail(`a meter with nothing near it is not told so: "${far}"`);
  }

  /* The origin adrift: one fault, every meter. */
  const off = { Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 3], [100, 3]] };
  const m2 = { Feature_ID: 4, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[100, 3]] };
  const origin = whyUnreached([SUB, off, m2], 1, 4) || "";
  /* By what it blames \u2014 the substation, not the meter \u2014 rather than
     by the word "origin", which the sentence no longer uses because a
     reader of the report is looking at a substation. */
  if (!/substation is not on the network/i.test(origin)) {
    fail(`a feeder 3 m off the substation is blamed on the meter: "${origin}"`);
  }
}

/* ── The reason has to be readable where it is shown ──

   Reported from a screenshot: the Why column read "trench_service
   #49998, 1.6 m from\u2026" and the rest was cut off. Two faults in one
   cell.

   The sentence led with the database's word for the line and put the
   actual fault \u2014 that there is a gap, and how wide \u2014 at the end,
   where the truncation fell. And the shared table clips every cell
   with an ellipsis, which is right for a name and wrong for prose. */
{
  const sub = { Feature_ID: 1, Feature_Role: "substation", Layer_Key: "electric",
    Geometry: [[0, 0]], Attributes: {} };
  const main = { Feature_ID: 10, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [50, 0]], Attributes: { Line_Type: "trench_main" } };
  const svc = { Feature_ID: 49998, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[20, 0.4], [20, 8]], Attributes: { Line_Type: "trench_service" } };
  const meter = { Feature_ID: 99, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[20.05, 8]] };
  const why = whyUnreached([sub, main, svc, meter], 1, 99) || "";

  /* Said in the words the drawing uses. */
  if (/trench_service|trench_main|elec_main|elec_service/.test(why)) {
    fail(`the reason quotes a database type key at somebody reading a `
      + `drawing: "${why}"`);
  }
  if (!/service trench #49998/.test(why)) {
    fail(`the service trench is not named as one: "${why}"`);
  }
  if (!/mains trench #10/.test(why)) {
    fail(`the trench it falls short of is not named as one: "${why}"`);
  }

  /* The first words carry the fault, because they are the ones that
     survive a narrow column. */
  /* Up to the colon. Splitting on a full stop too cut "0.4 m" in half
     and tested "Gap of 0", which is the check finding its own bug. */
  const firstWords = why.split(":")[0];
  if (!/gap of/i.test(firstWords) || !/0\.4 m/.test(firstWords)) {
    fail(`the first words do not say what is wrong and how far: "${firstWords}"`);
  }

  /* And the cell wraps rather than clipping. The shared table sets
     nowrap and an ellipsis on every cell; this column overrides it,
     and the override has to be more specific than the rule it beats
     or nothing changes on screen. */
  const report = readFileSync("./src/features/gis/CircuitReport.jsx", "utf8");
  if (!/\.dt\.cr-tbl td\.cr-why \{[^}]*white-space: normal/.test(report)) {
    fail("the Why column still clips its sentence with an ellipsis, so the "
      + "reason can only be read through a tooltip");
  }
  if (!/className="cr-gap cr-why"/.test(report)) {
    fail("the Why cell does not carry the class that lets it wrap");
  }
}

/* ── A dig that is there and refuses LV ──

   Reported, correcting an earlier answer of mine: "the actual reason
   is that there is no continuous trench route to a substation \u2014 in
   this case there are 2 sections of trench that are not configured to
   carry LV."

   `networkFrom` leaves out any trench with `Carries_LV` off, because
   that flag is deliberate isolation and the routing honours it. So the
   trench is not in the graph at all, and the gap analysis \u2014 which
   reasons about the lines that ARE in it \u2014 described a hole in a
   drawing that is continuous. Two faults with different fixes, and
   the wrong one sends somebody hunting for a break that is not there.

   The dig here runs unbroken from the substation to the meter's spur.
   Only the flags stop it. */
{
  const sub = { Feature_ID: 1, Feature_Role: "substation", Layer_Key: "electric",
    Geometry: [[0, 0]], Attributes: {} };
  const t = (id, geometry, attrs = {}) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "trench", Geometry: geometry,
    Attributes: { Line_Type: "trench_main", ...attrs } });
  const near = t(10, [[0, 0], [20, 0]]);
  const shutA = t(11, [[20, 0], [40, 0]], { Carries_LV: false });
  const shutB = t(12, [[40, 0], [60, 0]], { Carries_LV: false });
  const spur = t(13, [[60, 0], [60, 8]], { Line_Type: "trench_service" });
  const meter = { Feature_ID: 99, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[60, 8]] };
  const all = [sub, near, shutA, shutB, spur, meter];

  /* It is genuinely unreachable \u2014 the flags do isolate it. */
  if (distancesFrom(all, 1).get(99) != null) {
    fail("a trench with Carries LV off is walked over by the distances");
  }

  const why = whyUnreached(all, 1, 99) || "";
  if (!/not set to carry LV/i.test(why)) {
    fail(`the reason does not say the trench refuses LV: "${why}"`);
  }
  /* No invented gap: the dig is continuous and saying otherwise sends
     somebody to close a break that does not exist. */
  if (/^Gap of/.test(why) || /stops .* short of/.test(why)) {
    fail(`a continuous dig is reported as a gap: "${why}"`);
  }
  /* BOTH sections, not just the one touching the meter's spur.
     Naming one has somebody set a flag, rebuild, and meet the same
     fault one trench further on. */
  if (!/#11/.test(why) || !/#12/.test(why)) {
    fail(`only part of the blocked run is named: "${why}"`);
  }
  /* And what to do about it. */
  if (!/Set Carries LV/i.test(why)) {
    fail(`the reason does not say how to fix it: "${why}"`);
  }

  /* With the flags cleared, the same drawing reaches. */
  const open = [sub, near, t(11, [[20, 0], [40, 0]]), t(12, [[40, 0], [60, 0]]),
    spur, meter];
  if (distancesFrom(open, 1).get(99) == null) {
    fail("the same dig does not reach once the trenches carry LV, so the "
      + "fixture is not testing the flag");
  }
  if (whyUnreached(open, 1, 99) != null) {
    fail("a reachable meter is still given a reason");
  }

  /* And a meter whose ONLY trench in reach refuses LV: it is standing
     on a dig, so "nothing within 30 m" would be the report calling a
     deliberate setting an absence. */
  const lone = { Feature_ID: 98, Feature_Role: "meter", Layer_Key: "electric",
    Geometry: [[300, 8]] };
  const far = t(20, [[300, 0], [300, 10]], { Carries_LV: false });
  const w2 = whyUnreached([sub, near, far, lone], 1, 98) || "";
  if (!/not set to carry LV/i.test(w2)) {
    fail(`a meter standing on a trench that refuses LV is told there is `
      + `nothing near it: "${w2}"`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Distances behave (measured from the drawing when nothing is stored).");
process.exit(bad ? 1 : 0);
