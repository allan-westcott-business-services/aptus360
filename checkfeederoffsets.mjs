/* Cables sharing a trench are drawn apart.

   Two circuits down one trench store the same route: the separation on
   screen is a few pixels of offset, applied at draw time and nowhere
   near the stored geometry. Each member of a group gets its own slot,
   spread about the true line so the pair straddles the trench rather
   than one being drawn as though it left.

   The fault this holds against, from project 2202.043: a run's side was
   chosen by comparing the WHOLE polylines end to end. Two cables that
   share a trench and then part company — one carrying on south-east,
   the other turning south-west — have end-to-end vectors pointing away
   from each other, so a run drawn the same way along the shared stretch
   was called reversed, its slot was flipped onto its neighbour's, and
   the two were drawn on precisely the same line. Measured: 0.00 px
   apart, dashes interleaving, and no amount of zoom separated them.

   The shapes below are that drawing's: a long run heading south-east,
   and a second sharing its corridor before turning away south-west. */
import { feederRenderPlan, offsetPolyline, alignSign }
  from "./src/features/gis/feederColour.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* Along the shared corridor both run south-east; then A carries on and
   B turns south-west. Coordinates in metres, as stored. */
const shared = [[168.7, 106.1], [175, 115], [182, 124], [190, 133]];
const runA = [...shared, [205, 138], [223, 144.3]];
const runB = [...shared.map(([x, y]) => [x + 1.8, y + 0.9]),
  [150, 170], [110, 205], [77, 232.5]];

const line = (id, cid, geometry) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
  Geometry: geometry, Attributes: { Line_Type: "elec_main", Circuit_ID: cid },
});

const world = [line(1, 1, runA), line(2, 2, runB)];
const plan = feederRenderPlan(world, {});

/* Sides are chosen where the runs are alongside each other. */
if (alignSign(runA, runB) !== 1) {
  fail("a run drawn the same way along the shared stretch is called reversed");
}

const a = plan.get(1);
const b = plan.get(2);
if (!a || !b) {
  fail("the two mains are not in the render plan at all");
} else {
  if (a.offsetPx === b.offsetPx) {
    fail(`both runs were given the same offset (${a.offsetPx})`);
  }

  /* The measurement that matters is where they are DRAWN. Pixels per
     metre is arbitrary here; the separation must simply not be zero. */
  const S = 5;
  const px = (g, off) => offsetPolyline(g.map((m) => ({ x: m[0] * S, y: m[1] * S })), off);
  const A = px(runA, a.offsetPx);
  const B = px(runB, b.offsetPx);
  const gap = (p, g) => Math.min(...g.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));
  for (let i = 1; i < shared.length; i++) {
    const d = gap(A[i], B);
    if (d < 1) {
      fail(`along the shared trench the two runs are ${d.toFixed(2)} px apart`);
      break;
    }
  }
}

/* And a group of several keeps every member on its own slot. */
{
  const many = [
    line(11, 1, runA),
    line(12, 2, runB),
    line(13, 3, shared.map(([x, y]) => [x + 3.4, y + 1.7])),
  ];
  const p3 = feederRenderPlan(many, {});
  const offs = [11, 12, 13].map((id) => p3.get(id)?.offsetPx);
  if (new Set(offs).size !== offs.length) {
    fail(`three runs in one trench share slots: ${offs.join(", ")}`);
  }
}

/* A genuinely reversed run still gets its side flipped, or it would be
   drawn on the wrong side of the trench — the reason alignSign exists. */
{
  const back = [...runA].reverse();
  if (alignSign(runA, back) !== -1) {
    fail("a run drawn back to front is no longer recognised as reversed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Feeder offsets behave (shared trenches draw apart, reversed runs keep their side).");
process.exit(bad ? 1 : 0);
