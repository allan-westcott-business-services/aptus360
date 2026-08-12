/* Upstream pipes must be at least as large as what they feed.

   A length of main cannot be fed through something narrower than
   itself, so upsizing one by hand makes every smaller pipe between it
   and the POC wrong — and wrong in the direction that looks fine on the
   drawing. */
import { upstreamChain, upstreamTooSmall } from "./src/features/gis/upstreamSize.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const P = (id, pts, bore) => ({ Feature_ID: id, Geometry: pts, bore });
const boreOf = (p) => p.bore;
const POC = [0, 0];

// 1. Everything narrower on the way back is reported, nearest first.
{
  const pipes = [
    P(1, [[0, 0], [100, 0]], 52),
    P(2, [[100, 0], [200, 0]], 52),
    P(3, [[200, 0], [300, 0]], 52),
  ];
  const r = upstreamTooSmall(pipes, pipes[2], POC, 114, { boreOf });
  if (!r.reachedPoc) fail("a straight run did not reach the POC");
  if (r.changes.length !== 2) fail(`${r.changes.length} pipes to grow, wanted 2`);
  if (r.changes[0]?.feature.Feature_ID !== 2) {
    fail("the chain is not ordered from the edited pipe outwards");
  }
  if (r.changes.some((c) => c.toBore !== 114)) fail("a pipe was not brought to size");
}

// 2. A pipe already larger is left alone. The rule is a floor, not an
//    equality — 180mm feeding a 90mm leg is correct, and levelling it
//    down would undo a deliberate decision.
{
  const pipes = [
    P(1, [[0, 0], [100, 0]], 169),
    P(2, [[100, 0], [200, 0]], 52),
    P(3, [[200, 0], [300, 0]], 52),
  ];
  const r = upstreamTooSmall(pipes, pipes[2], POC, 114, { boreOf });
  if (r.changes.some((c) => c.feature.Feature_ID === 1)) {
    fail("a larger upstream main was shrunk to match");
  }
  if (r.changes.length !== 1) fail("the smaller upstream main was not caught");
}

// 3. Downstream is untouched: a spine feeding smaller legs is ordinary.
{
  const pipes = [
    P(1, [[0, 0], [100, 0]], 169),
    P(2, [[100, 0], [200, 0]], 52),
  ];
  const r = upstreamTooSmall(pipes, pipes[0], POC, 169, { boreOf });
  if (r.changes.length) fail("a downstream leg was widened");
}

// 4. A junction is traced through, not stopped at.
//
//    The first version followed the pipes while each step had exactly
//    one way onward and gave up at anything else — which is most points
//    on a real network, so it refused to answer almost every time. A
//    junction is not ambiguous: one branch leads to the POC and the
//    others lead away, and finding out which is what a trace is for.
{
  const pipes = [
    P(1, [[0, 0], [100, 0]], 52),
    P(2, [[100, 0], [200, 0]], 52),
    P(3, [[200, 0], [300, 0]], 52),
    /* Legs coming off the spine, which is what makes the junctions. */
    P(4, [[100, 0], [100, 80]], 52),
    P(5, [[200, 0], [200, 80]], 52),
  ];

  const r = upstreamTooSmall(pipes, pipes[2], POC, 114, { boreOf });
  if (!r.reachedPoc) fail("a spine with legs off it did not reach the POC");
  if (r.changes.map((c) => c.feature.Feature_ID).join() !== "2,1") {
    fail(`the feed traced as ${r.changes.map((c) => c.feature.Feature_ID).join() || "nothing"}, wanted 2,1`);
  }

  /* Upsizing a leg walks the spine back, and does not touch the other
     leg — which is beside it, not upstream of it. */
  const leg = upstreamTooSmall(pipes, pipes[4], POC, 114, { boreOf });
  if (!leg.reachedPoc) fail("a leg did not trace back to the POC");
  if (leg.changes.some((c) => c.feature.Feature_ID === 4)) {
    fail("a sibling leg was treated as upstream");
  }
}

// 4b. The shorter route is the feed. A second, longer way round is not
//     ambiguity — gas takes both, but the short way is what feeds it.
{
  const ring = [
    P(1, [[0, 0], [100, 0]], 52),
    P(2, [[100, 0], [100, 100]], 52),
    P(3, [[100, 100], [0, 100]], 52),
    P(4, [[0, 100], [0, 0]], 52),
  ];
  const r = upstreamChain(ring, ring[1], POC);
  if (!r.reachedPoc) fail("a ring could not be traced at all");
  if (r.chain.length !== 1) {
    fail(`the long way round was taken (${r.chain.length} pipes, wanted 1)`);
  }
}

// 5. A pipe drawn the other way round is the same pipe. Which direction
//    somebody drew it is not a fact about where the gas comes from.
{
  const pipes = [
    P(1, [[100, 0], [0, 0]], 52),
    P(2, [[200, 0], [100, 0]], 52),
  ];
  const r = upstreamChain(pipes, pipes[1], POC);
  if (!r.reachedPoc) fail("a run drawn away from the POC was not followed");
}

// 6. Nothing sensible to do on nothing.
if (upstreamChain([], null, POC).reachedPoc) fail("an empty drawing reached the POC");
if (upstreamChain([], { Geometry: [[0, 0], [1, 0]] }, null).reachedPoc) {
  fail("a missing POC was reached");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Upstream sizing behaves (a floor to the POC, never downstream).");
process.exit(bad ? 1 : 0);
