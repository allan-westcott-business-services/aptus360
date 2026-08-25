/* The site plan behind the as-laid drawing.

   Every jointing sketch is drawn over a PNG of the electric design,
   rendered when the call-off is raised. The site plan — the calibrated
   PDF the whole drawing is set out on — goes under it, faded, so a gang
   marking a joint is marking it against the map.

   ── The fault this pins ──

   The plan was silently optional. planLayer returns null in six
   different circumstances and says which in none of them, every caller
   wrapped it in `.catch(() => null)`, and drawAsLaid carries on happily
   without a plan. So a drawing captured before the plan was set up, or
   while the PDF was still loading, came out as cable on white — and
   looked exactly like one captured correctly.

   Worse, saveAsLaidImage had exactly one call site: the raise. There
   was no way to take the drawing again, so a call-off captured without
   its plan was wrong permanently — while the message on the failure
   path told people it "can be taken again from the call-off".

   Fault 22: a tolerant fallback that made a permanent failure look like
   a decision. */
import { readFileSync } from "node:fs";
import { drawAsLaid } from "./src/features/gis/asLaidImage.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const planSrc = readFileSync("./src/features/gis/planLayer.js", "utf8");

/* planReason is pure arithmetic on its arguments and pulling the module
   in would drag pdfjs with it, which will not initialise outside a
   browser. Read out and evaluated on its own — the real function, not a
   copy of it. */
const planReason = (() => {
  const from = planSrc.indexOf("export function planReason");
  const to = planSrc.indexOf("export async function planLayer");
  if (from < 0 || to < 0) { fail("planReason is not exported from planLayer.js"); return () => null; }
  const body = planSrc.slice(from, to).replace("export function", "function");
  // eslint-disable-next-line no-new-func
  return new Function(`${body}; return planReason;`)();
})();

// 1. Every way of having no plan says which.
{
  const cases = [
    ["nothing set up", {}, /no background plan/i],
    ["no scale", { basemap: {}, bounds: {} }, /scale/i],
    ["PDF not ready", { basemap: { Metres_Per_Pixel: 0.12 }, bounds: {}, isPdf: true }, /PDF/i],
    ["raster loading", { basemap: { Metres_Per_Pixel: 0.12 }, bounds: {} }, /loading/i],
    ["no extent", { basemap: { Metres_Per_Pixel: 0.12 } }, /extent/i],
  ];
  for (const [name, args, want] of cases) {
    const why = planReason(args);
    if (!why) fail(`"${name}" reports nothing wrong`);
    else if (!want.test(why)) fail(`"${name}" says "${why}"`);
  }

  /* And says nothing where a plan is expected — a reason that is always
     given is a reason nobody reads. */
  const ok = planReason({
    basemap: { Metres_Per_Pixel: 0.12 }, bounds: {}, isPdf: true, renderRegion: () => {},
  });
  if (ok) fail(`a correctly set up PDF plan reports "${ok}"`);

  const raster = planReason({ basemap: { Metres_Per_Pixel: 0.12 }, bounds: {}, image: {} });
  if (raster) fail(`a loaded raster plan reports "${raster}"`);
}

// 2. The raise asks, and says so.
//
//    Not `.catch(() => null)` on its own, which is what made this
//    invisible for as long as it was.
{
  /* Scoped to the raise. A bare search for planReason(planArgs) also
     matched the one inside retakeAsLaid, so removing the raise's call
     entirely left this passing — the check found the wrong function's
     use and was satisfied by it. */
  const raise = canvas.slice(0, canvas.indexOf("async function retakeAsLaid("));
  if (!/let planWhy = planReason\(planArgs\)/.test(raise)) {
    fail("the raise does not ask why the plan is missing");
  }
  if (!/if \(!plan && !planWhy\)/.test(raise)) {
    fail("the raise does not notice a plan that rendered nothing");
  }
  if (!/without the site plan behind it/.test(canvas)) {
    fail("the raise does not tell anybody the plan was missing");
  }
  /* And still saves the drawing. A picture of the cable with no plan
     under it is worth more than no picture. */
  if (!/if \(dataUrl\) \{\s*\n\s*await saveAsLaidImage/.test(canvas)) {
    fail("a missing plan now stops the drawing being saved at all");
  }
}

// 3. The drawing can be taken again.
//
//    saveAsLaidImage had one call site. A call-off captured without its
//    plan was wrong permanently, and the failure message promised a
//    re-take that did not exist.
{
  const sites = (canvas.match(/saveAsLaidImage\(/g) || []).length;
  if (sites < 2) fail(`saveAsLaidImage has ${sites} call site(s) — there is no way to re-take`);
  if (!/async function retakeAsLaid\(/.test(canvas)) fail("there is no re-take");

  /* It refuses rather than overwriting a good drawing with a worse one.
     Replacing a picture that has the plan with one that does not is the
     single outcome worse than leaving it alone. */
  const fn = canvas.slice(canvas.indexOf("async function retakeAsLaid("));
  const body = fn.slice(0, fn.indexOf("\n  /* Applying a build status"));
  if (!/planReason\(planArgs\)/.test(body)) fail("the re-take does not check for a plan first");
  const guard = body.indexOf("planReason(planArgs)");
  const write = body.indexOf("saveAsLaidImage(");
  if (guard < 0 || write < 0 || guard > write) {
    fail("the re-take saves before it checks there is a plan");
  }
  if (!/not re-taken/.test(body)) fail("the re-take does not say why it refused");
}

// 4. The renderer puts the plan under the design, and still draws
//    without one.
{
  const ctx = new Proxy({}, {
    get: (t, p) => (typeof p === "string" ? () => {} : undefined),
    set: () => true,
  });
  const electric = [{
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [50, 0]],
  }];

  let drew = false;
  const withPlan = drawAsLaid(ctx, {
    electric, seeds: [], joints: [],
    plan: { opacity: 0.6, draw: () => { drew = true; } },
  });
  if (!withPlan) fail("a design with a plan did not draw");
  if (!drew) fail("the plan was handed over and never drawn");

  /* Without one it still draws the cable. The plan is context; the
     design is the subject, and losing the subject to a missing
     background would be the worse trade. */
  if (!drawAsLaid(ctx, { electric, seeds: [], joints: [], plan: null })) {
    fail("a design with no plan produced no drawing at all");
  }

  /* A plan that throws must not take the design with it. */
  const angry = drawAsLaid(ctx, {
    electric, seeds: [], joints: [],
    plan: { draw: () => { throw new Error("no"); } },
  });
  if (!angry) fail("a plan that throws lost the whole drawing");
}

// 5. The plan lands in the picture, at real coordinates.
//
//    ── The fault ──
//
//    asLaidImage's `at` returned an array and spanImage's near-copy
//    returned an object. Nothing in asLaidImage noticed: every use
//    there destructures `const [x, y] = at(...)` and an array obliges.
//
//    planLayer does not. It hands drawTile a mapper and reads `p.x` and
//    `p.y` off the result — so from asLaidImage it read undefined, drew
//    the site plan at NaN, and threw nothing. The as-laid drawing came
//    out as cable on white, indistinguishable from one captured before
//    a plan was ever set up. spanImage, with the object form, had been
//    putting its plan in correctly the whole time.
//
//    Drawn here the way planLayer draws it, and the numbers checked.
//    Asserting that `at` returns an object would pass on a module that
//    returns the right shape and the wrong numbers.
{
  let drawn = null;
  const ctx = new Proxy({}, {
    get: (t, p) => (p === "drawImage"
      ? ((...a) => { drawn = a.slice(1); })
      : (typeof p === "string" ? () => {} : undefined)),
    set: () => true,
  });
  const electric = [{
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [50, 0]],
  }];

  /* planLayer's own call: drawTile reads p.x and p.y off the mapper. */
  const plan = {
    opacity: 0.6,
    draw: (c, mapper, viewScale) => {
      const q = mapper([0, 0]);
      c.drawImage({}, q.x, q.y, 100 * viewScale, 80 * viewScale);
    },
  };
  drawAsLaid(ctx, { electric, seeds: [], joints: [], plan });

  if (!drawn) fail("the plan was never drawn into the picture");
  else if (!drawn.slice(0, 2).every(Number.isFinite)) {
    fail(`the plan was drawn at ${drawn[0]}, ${drawn[1]} — it is invisible`);
  }

  /* And the two modules answer alike, which is what stops this coming
     back the next time one of them is edited. */
  const a = readFileSync("./src/features/gis/asLaidImage.js", "utf8");
  const b = readFileSync("./src/features/gis/spanImage.js", "utf8");
  const shapeOf = (src) => (/const at = \(view, p\) => \(\{/.test(src) ? "object"
    : /const at = \(view, p\) => \[/.test(src) ? "array" : "unknown");
  if (shapeOf(a) !== "object") {
    fail(`asLaidImage's at() returns ${shapeOf(a)} — planLayer reads .x and .y`);
  }
  if (shapeOf(a) !== shapeOf(b)) {
    fail(`asLaidImage's at() returns ${shapeOf(a)} and spanImage's ${shapeOf(b)}`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The as-laid drawing carries its site plan (or says why not, and can be re-taken).");
process.exit(bad ? 1 : 0);
