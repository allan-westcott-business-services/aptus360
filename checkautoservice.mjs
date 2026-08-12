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

console.log(bad ? `\n${bad} problem(s)`
  : "Auto Service behaves (the cable follows the dig it is laid in).");
process.exit(bad ? 1 : 0);
