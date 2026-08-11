/* Measuring a trench section from the drawing.

   A section can run plot to plot, plot to span node, node to node or
   node to plot, and its length should come off the drawing rather than
   be typed. Three things went wrong building it, all of which produced
   the same symptom — an empty length box — and none of which the build
   or any type check would have caught:

     The line types come back with the drawing, not from lookups. Read
     from the wrong place, every line failed the trench test and there
     was nothing to route over.

     routeBetween resolves span node Feature_IDs. An end of a section is
     often a plot, or a bare trench end with no node on it, so the route
     has to go over the graph's own adjacency instead.

     A graph point is { at, node }, not a coordinate pair. Read as an
     array it gave NaN for every distance, so both ends resolved to the
     first point and the length came out as zero.

   Hence a test that walks the whole path rather than any one piece. */
import { trenchGraph } from "./src/features/gis/mainsCallOff.js";
import { isTrenchFeature } from "./src/features/gis/snapping.js";
import { toItems } from "./src/features/calloffs/rules.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LINE_TYPES = [{ Type_Key: "trench_main", Layer_Key: "trench" }];

/* A trench that turns a corner: 100m east, then 80m south. The two
   ends are 128m apart in a straight line and 180m along the dig, and
   the difference is the reason for routing at all. */
const features = [
  {
    Feature_ID: 1, Feature_Type: "line",
    Attributes: { Line_Type: "trench_main" },
    Geometry: [[0, 0], [100, 0], [100, 80]],
  },
  {
    Feature_ID: 2, Feature_Type: "point", Feature_Role: "spannode",
    Attributes: { Span_Label: "E0" }, Geometry: [[0, 0]],
  },
  /* The plot's seed sits just off the trench, as they do. */
  { Feature_ID: 3, Feature_Type: "point", Feature_Role: "plot", Plot_ID: 28, Geometry: [[100, 82]] },
];

const trenches = features.filter((f) => f.Feature_Type === "line"
  && isTrenchFeature(f, LINE_TYPES));
if (trenches.length !== 1) fail(`${trenches.length} trenches found, wanted 1`);

const graph = trenchGraph(trenches, features.filter((f) => f.Feature_Role === "spannode"));

const nearest = (pt) => {
  let best = null;
  graph.points.forEach((q, i) => {
    const d = Math.hypot(q.at[0] - pt[0], q.at[1] - pt[1]);
    if (!best || d < best.d) best = { i, d };
  });
  return best;
};

const from = nearest([0, 0]);
const to = nearest([100, 82]);
if (!Number.isFinite(from?.d)) fail("distance to a graph point was not a number");
if (from.i === to.i) fail("both ends resolved to the same graph point");

const best = new Map([[from.i, 0]]);
const queue = [from.i];
while (queue.length) {
  const at = queue.shift();
  for (const e of graph.adj.get(at) || []) {
    const next = best.get(at) + e.len;
    if (best.has(e.to) && best.get(e.to) <= next) continue;
    best.set(e.to, next);
    queue.push(e.to);
  }
}
const m = best.get(to.i);

if (m == null) fail("no route between the two ends");
else if (Math.abs(m - 180) > 0.5) {
  fail(`the section measured ${m.toFixed(1)}m; along the trench it is 180m`);
}
/* And specifically not the straight line, which is the mistake this
   whole approach exists to avoid. */
if (m != null && Math.abs(m - Math.hypot(100, 80)) < 1) {
  fail("the section was measured as the straight line, not along the dig");
}

/* How a section reads once saved.

   "27 \u2013 23" is a range that runs backwards and does not say whether
   27 is a plot or a node \u2014 plot 12 and node A12 are different points.
   Both ends are named, and plots put in order. */
{
  const text = (from, fromKind, to, toKind) => toItems(
    [{ From_Plot: from, From_Kind: fromKind, To_Plot: to, To_Kind: toKind }],
    "Span",
  )[0].Plots;

  for (const [a, b] of [["27", "23"], ["23", "27"]]) {
    const got = text(a, "plot", b, "plot");
    if (got !== "Plot 23 to Plot 27") {
      fail(`plots ${a} and ${b} read as "${got}"`);
    }
  }
  if (text("E0", "node", "27", "plot") !== "Span Node E0 to Plot 27") {
    fail(`node to plot reads as "${text("E0", "node", "27", "plot")}"`);
  }
  /* A section from a node to a plot runs the way it was drawn. Swapping
     its ends because one is numerically smaller would describe a
     different piece of trench. */
  if (text("A8", "node", "A3", "node") !== "Span Node A8 to Span Node A3") {
    fail("a node-to-node section was reordered");
  }
  /* Plots compared as numbers, not as text: "9" before "10". */
  if (text("10", "plot", "9", "plot") !== "Plot 9 to Plot 10") {
    fail(`plots 10 and 9 read as "${text("10", "plot", "9", "plot")}"`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Trench section measurement behaves (${m.toFixed(1)}m along the dig, `
    + `${Math.hypot(100, 80).toFixed(1)}m across it).`);
process.exit(bad ? 1 : 0);
