/* Auto Service lays a cable in the dig, not across it.

   Where a service trench is already drawn, the cable follows it. It
   used to run straight from the tee to the boundary whatever was on the
   drawing, so on any trench that is not a straight line the cable came
   out shorter than the dig it sits in — and every quantity taken off it
   was wrong in the cheap direction. */
import { planSeed } from "./src/features/gis/autoService.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const len = (g) => g.slice(1)
  .reduce((t, p, i) => t + Math.hypot(p[0] - g[i][0], p[1] - g[i][1]), 0);

const MAINS = [{ Geometry: [[0, 0], [200, 0]] }];
const SEED = {
  Feature_ID: 1, Geometry: [[100, 40]],
  Attributes: { Boundary_At: [100, 25] },
};
/* A service trench that doglegs round something, as they do. */
const SERVICE = [{ Geometry: [[100, 0], [100, 12], [112, 12], [112, 25], [100, 25]] }];
const utils = () => ["electric"];

// 1. With no trench drawn, the straight line is still the answer.
{
  const p = planSeed(SEED, MAINS, utils, {});
  if (p.trench.length !== 2) fail("a plot with no service trench got a bent route");
}

// 2. With one drawn, the route follows it.
{
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: SERVICE });
  if (p.trench.length < 4) fail("the route did not follow the service trench");
  /* It starts where the main is joined and stops at the boundary,
     whatever the drawn trench's own ends are. */
  const a = p.trench[0];
  const z = p.trench[p.trench.length - 1];
  if (Math.hypot(a[0] - 100, a[1] - 0) > 0.01) fail("the route does not start at the tee");
  if (Math.hypot(z[0] - 100, z[1] - 25) > 0.01) fail("the route does not stop at the boundary");

  /* And the cable follows the trench, then leaves it for the meter, so
     it is never shorter than the dig. */
  const cable = p.cables[0].geometry;
  if (len(cable) < len(p.trench)) {
    fail(`the cable is ${len(cable).toFixed(1)}m in a ${len(p.trench).toFixed(1)}m trench`);
  }
}

// 3. Following the dig is longer than cutting across it — which is the
//    whole point, and the number somebody prices from.
{
  const straight = planSeed(SEED, MAINS, utils, {});
  const along = planSeed(SEED, MAINS, utils, { serviceTrenches: SERVICE });
  if (!(len(along.trench) > len(straight.trench))) {
    fail("following the service trench did not lengthen the route");
  }
}

// 4. Somebody else's trench is not followed. Matching on one end alone
//    would route this plot's service through a neighbour's garden.
{
  const elsewhere = [{ Geometry: [[10, 0], [10, 25]] }];
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: elsewhere });
  if (p.trench.length !== 2) fail("a service trench belonging to another plot was followed");
}

// 5. Drawn the other way round is the same trench.
{
  const reversed = [{ Geometry: [...SERVICE[0].Geometry].reverse() }];
  const p = planSeed(SEED, MAINS, utils, { serviceTrenches: reversed });
  if (p.trench.length < 4) fail("a trench drawn boundary-first was not followed");
  if (Math.hypot(p.trench[0][0] - 100, p.trench[0][1] - 0) > 0.01) {
    fail("a reversed trench produced a route starting at the wrong end");
  }
}

/* What a trench offers to lay, from the configured line types.

   Mains types in a mains trench and service types in a service trench.
   A service cable in a mains trench is not a mistake the drawing should
   help somebody make, and reading the split off the type keys means a
   line type added in Admin appears without editing this. */
{
  const lineTypes = [
    { Type_Key: "trench_main", Layer_Key: "trench", Label: "Mains Trench" },
    { Type_Key: "trench_service", Layer_Key: "trench", Label: "Service Trench" },
    { Type_Key: "hv_main", Layer_Key: "electric", Label: "HV Cable" },
    { Type_Key: "elec_service", Layer_Key: "electric", Label: "Service Cable" },
    { Type_Key: "gas_main", Layer_Key: "gas", Label: "Gas Main" },
    { Type_Key: "gas_service", Layer_Key: "gas", Label: "Gas Service" },
    { Type_Key: "water_main", Layer_Key: "water", Label: "Water Main" },
    { Type_Key: "water_service", Layer_Key: "water", Label: "Water Service" },
  ];
  const offered = (trenchKey) => {
    const isService = /service/i.test(trenchKey);
    return lineTypes
      .filter((t) => t.Layer_Key !== "trench"
        && /service/i.test(t.Type_Key) === isService)
      .map((t) => t.Label);
  };

  const mains = offered("trench_main");
  const svc = offered("trench_service");

  for (const want of ["HV Cable", "Gas Main", "Water Main"]) {
    if (!mains.includes(want)) fail(`a mains trench does not offer ${want}`);
  }
  for (const want of ["Service Cable", "Gas Service", "Water Service"]) {
    if (!svc.includes(want)) fail(`a service trench does not offer ${want}`);
  }
  /* And neither offers the other's. */
  if (mains.some((x) => /service/i.test(x))) {
    fail("a mains trench offered a service to be laid in it");
  }
  if (svc.some((x) => /main/i.test(x))) {
    fail("a service trench offered a main to be laid in it");
  }
}

/* Every cable turns at the boundary point.

   The dig runs from the main to the boundary, and the cable is laid in
   it — so the boundary is a vertex on every cable, not a place the line
   happens to pass near. Without it the cable is a straight run from the
   main to a meter, which is not where the trench goes. */
{
  const seed = {
    Feature_ID: 1, Geometry: [[100, 40]],
    Attributes: { Boundary_At: [100, 25] },
  };
  const p = planSeed(seed, MAINS, () => ["electric", "gas"], {});
  if (p.skipped) fail(`a plot with a boundary point was skipped: ${p.skipped}`);
  else {
    for (const c of p.cables) {
      const hasBoundary = c.geometry.some((q) =>
        Math.hypot(q[0] - 100, q[1] - 25) < 0.01);
      if (!hasBoundary) {
        fail(`a cable runs ${JSON.stringify(c.geometry)} without turning at the boundary`);
      }
      /* And it starts on the main, not at the plot. */
      if (Math.abs(c.geometry[0][1]) > 0.01) {
        fail("a cable does not start where the trench meets the main");
      }
    }
  }

  /* A plot with no boundary point is reported, not guessed at. Falling
     back to the furthest meter made the dig run to somebody's meter
     rather than to their boundary, and every cable followed it. */
  const none = planSeed(
    { Feature_ID: 2, Geometry: [[100, 40]], Attributes: {} },
    MAINS, () => ["electric"], {},
  );
  if (!none.skipped) fail("a plot with no boundary point was serviced anyway");
  if (none.trench) fail("a plot with no boundary point still got a dig");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Auto Service behaves (the cable follows the dig it is laid in).");
process.exit(bad ? 1 : 0);
