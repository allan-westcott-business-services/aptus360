/* A hand-set cable size survives Build LV Network.

   A rebuild deletes the generated mains and lays them again, so the
   override a designer put on a run has to be carried across. It was
   carried by GEOMETRY — the override remembered against every vertex of
   the old run, put back on a new run laid along exactly the same
   points. But the points are not exactly the same: a plot added breaks
   the run somewhere new, a trench nudged moves an interior vertex, and
   either way the key changes and the override is gone. Sizes were being
   lost on every build for anyone whose drawing had moved at all, which
   is every drawing being worked on.

   What is stable across builds is where the run ARRIVES. Runs break at
   the substation, at junctions, at leaf ends and where the cable count
   changes — and each break is a feeder end point standing on a trench
   junction that does not move when the interior of the run does. So an
   override is remembered against the run's arrival point, per circuit:
   the same length of main arrives at the same place however it got
   there, and two circuits ending at one junction each keep their own.

   The functions are imported from feeder.js — a local copy proving
   itself is the checkspannodes fault — and the build is held to using
   them rather than a geometry key of its own. */
import { readFileSync } from "node:fs";
import * as feeder from "./src/features/gis/feeder.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const { carriedOverrides, carriedOverrideFor } = feeder;

if (typeof carriedOverrides !== "function" || typeof carriedOverrideFor !== "function") {
  fail("feeder.js does not export the override carry — run sizes are "
    + "still keyed by geometry and lost on every rebuild");
} else {
  const run = (cid, pts, manual = null) => ({
    Feature_ID: Math.random(), Feature_Type: "line", Layer_Key: "electric",
    Geometry: pts,
    Attributes: { Line_Type: "elec_main", Circuit_ID: cid, Generated: true,
      VD_Cable_Size_ID: 1,
      ...(manual != null ? { Manual_VD_Cable_Size_ID: manual } : {}) },
  });

  // 1. The fault itself: same arrival, different interior geometry.
  //    A geometry key loses this one; the arrival key keeps it.
  {
    const old = [run(1, [[0, 0], [100, 0], [200, 0]], 7)];
    const m = carriedOverrides(old);
    const kept = carriedOverrideFor(m, 1, [200, 0]);
    if (kept !== 7) {
      fail(`a run redrawn through different interior points lost its size (got ${kept})`);
    }
  }

  // 2. A run that breaks somewhere new: the far half still arrives where
  //    the old run did and keeps the size; the new mid-run arrival is a
  //    new run and starts on the default, which is the honest answer for
  //    a length whose load has changed.
  {
    const m = carriedOverrides([run(1, [[0, 0], [100, 0], [200, 0]], 7)]);
    if (carriedOverrideFor(m, 1, [100, 0]) != null) {
      fail("a new break mid-run inherited the whole run's override");
    }
    if (carriedOverrideFor(m, 1, [200, 0]) !== 7) {
      fail("the half still arriving at the old end lost the override");
    }
  }

  // 3. Two circuits ending at one junction each keep their own — the
  //    reason the key carries the circuit and not just the point.
  {
    const m = carriedOverrides([
      run(1, [[0, 0], [200, 0]], 7),
      run(2, [[200, 50], [200, 0]], 9),
    ]);
    if (carriedOverrideFor(m, 1, [200, 0]) !== 7
      || carriedOverrideFor(m, 2, [200, 0]) !== 9) {
      fail("two circuits arriving at one junction do not keep their own sizes");
    }
  }

  // 4. Nothing invented: a run with no override contributes nothing, and
  //    an arrival nobody overrode reads null.
  {
    const m = carriedOverrides([run(1, [[0, 0], [200, 0]])]);
    if (carriedOverrideFor(m, 1, [200, 0]) != null) {
      fail("a run with no override came back with one");
    }
    if (carriedOverrideFor(m, 1, [999, 999]) != null) {
      fail("an arrival nobody overrode came back with a size");
    }
  }

  // 5. The arrival comes back a few centimetres off, which is what a
  //    rebuild actually does.
  //
  //    This was keyed on the arrival quantised to centimetres and looked
  //    up exactly, and on a live drawing two of five hand-set sizes were
  //    lost to it: one run re-routed to 286.484 where it had ended at
  //    286.46, dropping a cable size over 24 mm, and the trunk's
  //    terminus moved 0.55 m when the link box became the end of the run
  //    and took a 300 with it. "The same place" means the same place on
  //    the ground, not the same string.
  {
    const m = carriedOverrides([run(1, [[0, 0], [286.46, 126.54]], 7)]);
    if (carriedOverrideFor(m, 1, [286.484, 126.532]) !== 7) {
      fail("a run re-routed 24 mm from where it ended lost its size");
    }
    if (carriedOverrideFor(m, 1, [286.46 + 0.55, 126.54]) !== 7) {
      fail("a terminus that moved half a metre lost its size");
    }
    /* And not so loose that it claims the next stop along. */
    if (carriedOverrideFor(m, 1, [289.5, 126.54]) != null) {
      fail("an arrival three metres away claimed another run's override");
    }
  }

  // 6. Nearest wins where two arrivals are close enough that both are in
  //    reach — the one actually at this point is nearer.
  {
    const m = carriedOverrides([
      run(1, [[0, 0], [100, 0]], 7),
      run(1, [[0, 50], [101.2, 0]], 9),
    ]);
    if (carriedOverrideFor(m, 1, [100, 0]) !== 7) {
      fail("a nearby arrival's override was taken instead of this one's");
    }
    if (carriedOverrideFor(m, 1, [101.2, 0]) !== 9) {
      fail("the nearer of two close arrivals did not win");
    }
  }
}

/* And the build actually uses it. The last version of this carry read
   the GAS field on an electric cable and nothing ever read the map
   back — the sentence saying what a rebuild must not do sat directly
   above the code doing it. So the source is held to the imported
   functions, and to having no geometry key of its own left behind. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function buildLvNetwork");
  if (at < 0) fail("buildLvNetwork has gone");
  else {
    const body = canvas.slice(at, at + 30000);
    if (!/carriedOverrides\(/.test(body)) {
      fail("Build LV Network does not build the carry from the runs it deletes");
    }
    if (!/carriedOverrideFor\(/.test(body)) {
      fail("Build LV Network never reads the carried sizes back");
    }
    if (/overrides\.set\(geomKey\(/.test(body)
      || /overrides\.get\(geomKey\(/.test(body)) {
      fail("run overrides are still keyed by geometry — the key changes "
        + "whenever the drawing does, and the size goes with it");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Override carry behaves (a hand-set size survives the rebuild, keyed "
  + "to where the run arrives).");
process.exit(bad ? 1 : 0);
