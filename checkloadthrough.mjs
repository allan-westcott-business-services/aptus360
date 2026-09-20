/* The load a feeder end point carries.

   Every plot, board and supply at it or beyond it, shown on the
   point itself. The first question anybody asks of a point on a
   network, and the one it could not answer: the figure was in the
   levels check, the circuit report and the calc sheet, and not on
   the thing.

   ── The whole of it is that the figure is DERIVED ──

   A number written onto the point when the build ran would be right
   until the next thing anybody did, and would then sit there looking
   authoritative and be wrong. The calc sheet's stored meter count
   did exactly that: the canvas recounted and the sheet did not, one
   drawing gave two answers, and it took a rebuild to notice.

   So there is no copy. The three things asked for — a load changed
   at a plot, a supply disconnected, a cable unplugged from the main
   — are not three features here. They are one: the answer is read
   from the drawing every time, so anything that changes the drawing
   changes the answer with nothing to keep in step. */
import { loadThrough, suppliesThrough } from "./src/features/gis/loadThrough.js";
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench", Label: "Trench", Layer_Key: "trench" },
  { Type_Key: "service_trench", Label: "Service trench", Layer_Key: "trench" },
];
let id = 1;
const trench = (pts, key = "trench") => ({
  Feature_ID: id++, Feature_Type: "line", Layer_Key: "trench",
  Geometry: pts, Attributes: { Line_Type: key },
});
const sub = {
  Feature_ID: id++, Feature_Role: "substation", Feature_Type: "point",
  Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {},
};

/* A run with three plots along it and a point two thirds of the way
   out, so there is load in front of the point and load behind it. */
function scheme({ loads = [3, 3, 3], drop = [] } = {}) {
  const out = [sub, trench([[0, 0], [30, 0], [60, 0], [90, 0]])];
  const plots = [];
  loads.forEach((kva, i) => {
    const x = 30 * (i + 1);
    const pid = 500 + i;
    const p = {
      Feature_ID: id++, Feature_Role: "plot", Feature_Type: "point",
      Plot_ID: pid, Geometry: [[x, 25]], Attributes: {},
    };
    if (drop.includes(i)) { plots.push({ pid, kva }); return; }
    /* Well clear of the main, so removing the service trench really
       does strand the meter. At ten metres the model still reaches
       it and the case proved nothing. */
    out.push(trench([[x, 0], [x, 25]], "service_trench"), p, {
      Feature_ID: id++, Feature_Role: "meter", Feature_Type: "point",
      Layer_Key: "electric", Plot_ID: pid, Geometry: [[x, 25]],
      Attributes: { Seed_Feature_ID: p.Feature_ID },
    });
    plots.push({ pid, kva });
  });
  /* The point in question: on the dig at 60 m, so the plot at 90 is
     beyond it and the two before it are not. */
  const fep = {
    Feature_ID: id++, Feature_Role: "feederpoint", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[60, 0]],
    Attributes: { Span_Label: "A2", Span_Seq: 2, Span_Anchor: [60, 0] },
  };
  out.push(fep);
  return {
    features: out, fep,
    opts: {
      lineTypes,
      plotById: (pid) => plots.find((x) => x.pid === pid) && {
        kva_load: plots.find((x) => x.pid === pid).kva,
      },
    },
  };
}

// 1. It reports what PASSES the point.
{
  /* Three plots at 30, 60 and 90; the point is at 60. Two of them
     count: the one at 90, which is beyond it, and the one at 60,
     whose current still travels through the node on its way to the
     tee. The plot at 30 came off before the point and does not.

     That distinction is the reason this is read off the model rather
     than counted by hand — "downstream" is a question about the tree
     and not about which side of the point something is drawn on. */
  const s = scheme();
  const kva = loadThrough(s.fep, s.features, s.opts);
  if (kva == null) fail("a point on a built network reports no load");
  else if (Math.abs(kva - 6) > 0.01) {
    fail(`the point reports ${kva} kVA \u2014 the plot beyond it and the one `
      + "teeing off at it both pass through, so 6 is the answer");
  }
  if (suppliesThrough(s.fep, s.features, s.opts) !== 2) {
    fail("the count of supplies through the point is wrong");
  }
}

// 2. A load changed at a plot changes it, with nothing to update.
{
  const before = scheme();
  const after = scheme({ loads: [3, 3, 11] });
  const a = loadThrough(before.fep, before.features, before.opts);
  const b = loadThrough(after.fep, after.features, after.opts);
  if (!(b > a)) {
    fail(`the point still reports ${b} kVA after the plot beyond it went from `
      + "3 to 11 \u2014 the figure is being remembered rather than worked out");
  }
  if (Math.abs(b - 14) > 0.01) {
    fail(`wanted 14 kVA \u2014 3 at the point and 11 beyond it \u2014 got ${b}`);
  }
}

// 3. A supply disconnected drops out of it.
{
  const s = scheme();
  /* The meter beyond the point removed, as disconnecting it does. */
  const without = s.features.filter((f) =>
    !(f.Feature_Role === "meter" && f.Geometry[0][0] === 90));
  const kva = loadThrough(s.fep, without, s.opts);
  if (Math.abs(kva - 3) > 0.01) {
    fail(`the point reports ${kva} kVA after the supply beyond it was `
      + "disconnected \u2014 3 is left, the one teeing off at the point itself");
  }
}

// 4. A cable unplugged from the main drops out of it.
{
  const s = scheme();
  /* The service trench out to the far plot removed: the meter is
     still drawn, but nothing routes to it any more. */
  const cut = s.features.filter((f) =>
    !(f.Attributes?.Line_Type === "service_trench"
      && f.Geometry[0][0] === 90));
  const kva = loadThrough(s.fep, cut, s.opts);
  if (Math.abs(kva - 3) > 0.01) {
    fail(`the point reports ${kva} kVA after the supply beyond it was `
      + "unplugged from the main \u2014 its meter is still drawn, but nothing "
      + "routes to it, and a load the network cannot reach is not a load "
      + "this cable carries");
  }
}

// 5. Cannot say is not zero.
{
  /* Zero means the cable carries nothing. Null means the drawing
     cannot answer — nothing built, or the point off the dig. A panel
     showing 0.0 kVA for the second tells somebody their design is
     empty. */
  if (loadThrough(null, [], {}) !== null) fail("a missing point reports a load");

  const s = scheme();
  const adrift = {
    ...s.fep,
    Attributes: { ...s.fep.Attributes, Span_Anchor: [60, 400] },
  };
  if (loadThrough(adrift, s.features, s.opts) !== null) {
    fail("a point four hundred metres off the dig reports the load of the "
      + "nearest node, which is somebody else's cable");
  }

  if (loadThrough(s.fep, [sub], s.opts) !== null) {
    fail("a drawing with no network reports a load rather than saying it "
      + "cannot yet");
  }
}

// 6. One walk, not two.
{
  /* The figure is the model's own `cumKva`, so the panel and the
     levels check cannot disagree about what a cable carries. A second
     accumulation here would be a second answer. */
  const s = scheme();
  const model = buildFeederModel(s.features, s.opts);
  const direct = loadThrough(s.fep, s.features, { ...s.opts, model });
  const built = loadThrough(s.fep, s.features, s.opts);
  if (direct !== built) {
    fail("the answer depends on whether the model is passed in, so it is not "
      + "simply reading the model's own figure");
  }

  const src = readFileSync("./src/features/gis/loadThrough.js", "utf8");
  if (!/model\.cumKva/.test(src)) {
    fail("the load is accumulated here rather than read from the model, so "
      + "the panel can disagree with the levels check");
  }
}

// 7. It is shown on the point, and derived where it is shown.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/loadThrough\(feature, allFeatures/.test(editor)) {
    fail("the feeder end point panel does not show the load through it");
  }
  /* From the live drawing, not from an attribute. An attribute would
     be the stored copy this exists to avoid. */
  if (/Attributes\.(Downstream_|Load_Through)/.test(editor)) {
    fail("the panel reads a stored load off the feature \u2014 the figure has to "
      + "be worked out, or it goes stale the moment anything changes");
  }
}

// 8. And it is on the label, in front of the figures it explains.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const carried = loadAt.get");
  const block = at < 0 ? "" : canvas.slice(at, canvas.indexOf(";", canvas.indexOf("const text =", at)));
  if (!block) fail("the levels label does not show what the point carries");
  else {
    if (!/carried != null \? `\$\{carried\.toFixed\(1\)\} kVA/.test(block)) {
      fail("the load is not written in front of the volt drop and the "
        + "impedance \u2014 both are consequences of it");
    }
    /* Left off rather than shown as zero where it cannot be said: a
       point off the dig has no answer, and 0.0 kVA in front of a
       volt drop reads as a cable carrying nothing. */
    if (!/carried != null \?/.test(block)) {
      fail("a point with no answer shows 0.0 kVA rather than nothing");
    }
  }

  /* One model for the drawing, not one per label. The levels labels
     are drawn every frame, and building the routing graph per node
     per frame is a redraw nobody can pan through. */
  const memo = canvas.indexOf("const loadAt = useMemo");
  const body = memo < 0 ? "" : canvas.slice(memo, memo + 1600);
  if (!body) fail("nothing works out the load for the labels");
  else {
    if ((body.match(/buildFeederModel\(/g) || []).length !== 1) {
      fail("the routing graph is built more than once for the labels");
    }
    if (!/loadThrough\(p, features, \{ model \}\)/.test(body)) {
      fail("each label builds its own model rather than sharing one");
    }
    /* Rebuilt when a plot's load changes, or the figure on the
       drawing is the one from before the edit. */
    if (!/\[elecLevelsAt, features, lineTypes, plotList, nrsList\]/.test(body)) {
      fail("the load map does not follow a plot's load or a supply's, so a "
        + "figure edited in the plot tab leaves the drawing showing the old "
        + "one");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A feeder end point says what it carries, worked out each time.");
process.exit(bad ? 1 : 0);
