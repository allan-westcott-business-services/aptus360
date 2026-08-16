/* The picture of a span that goes on the work instruction.

   A gang arriving on a road needs to recognise which length of it they
   are digging. That is the trench highlighted, the nodes at each end so
   the labels on the paper match something on the ground, the plot seeds
   around it, and the plan underneath so it is a place rather than a
   diagram.

   The drawing is checked here through a recording context — what was
   drawn, and in what order — because the order is most of the
   correctness: a seed over the highlight hides the thing the picture is
   of, and a plan over everything hides the lot. */
import { readFileSync } from "node:fs";
import { spanBounds, fitView, drawSpan, PAD_M } from "./src/features/gis/spanImage.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* A context that records rather than draws. */
function recorder() {
  const calls = [];
  const ctx = new Proxy({}, {
    get: (_t, k) => (...a) => { calls.push({ op: String(k), args: a }); },
    set: (_t, k, v) => { calls.push({ op: `${String(k)}=`, args: [v] }); return true; },
  });
  return { ctx, calls };
}

// 1. Twenty metres of room around the span.
//
//    Its own extent tells somebody nothing: a thirteen-metre run fills
//    the frame and could be anywhere. Twenty metres brings in the plots
//    either side and the junction it comes off.
{
  const b = spanBounds([[[100, 100], [113, 100]]]);
  if (!b) fail("a straight span has no bounds");
  else {
    if (b.minX !== 80 || b.maxX !== 133) fail(`the box runs ${b.minX}..${b.maxX}, wanted 80..133`);
    if (b.maxY - b.minY !== 2 * PAD_M) fail("a flat span gets no height");
  }

  /* From the geometry, not the two ends. A run that bends round a
     corner is not contained by the box its ends make, and the bend is
     the bit somebody needs to see. */
  /* The bend is the extreme, not an endpoint — otherwise reading only
     the ends gives the same answer and the check proves nothing, which
     is what the first version of this did. */
  const bent = spanBounds([[[0, 0], [50, 40], [100, 0]]]);
  if (bent.maxY !== 60) {
    fail(`a bend outside the end-to-end box is cropped: maxY ${bent.maxY}, wanted 60`);
  }

  if (spanBounds([]) !== null) fail("nothing to draw does not say so");
  if (spanBounds([[]]) !== null) fail("an empty geometry does not say so");
}

// 2. One scale for both axes.
//
//    Squaring the box to the image would stretch a long thin span
//    sideways, and a picture with a different scale each way cannot be
//    measured by eye.
{
  const v = fitView({ minX: 0, minY: 0, maxX: 100, maxY: 10 }, 640, 420);
  const drawnW = 100 * v.scale;
  const drawnH = 10 * v.scale;
  if (drawnW > 640.5 || drawnH > 420.5) fail("the span is drawn outside the image");
  if (Math.abs(drawnW - 640) > 1) fail("the wider axis does not fill the image");
  /* Centred, so the slack is split rather than left at one end. */
  const top = (420 - drawnH) / 2;
  if (Math.abs((0 * v.scale + v.y) - top) > 1) fail("the span is not centred");

  if (fitView(null, 640, 420) !== null) fail("no bounds does not say so");
}

// 3. What is drawn, and in what order.
{
  const { ctx, calls } = recorder();
  let planDrew = false;
  const out = drawSpan(ctx, {
    trenches: [{ Geometry: [[100, 100], [113, 100]] }],
    nodes: [{ Geometry: [[100, 100]], Label: "A15" },
      { Geometry: [[113, 100]], Label: "A16" }],
    seeds: [{ Geometry: [[105, 90]], Label: "12" }],
    plan: { opacity: 0.6, draw: () => { planDrew = true; } },
  });
  if (!out) fail("a span with a trench drew nothing");

  if (!planDrew) fail("the background plan is not drawn");

  const text = calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0]));
  for (const want of ["A15", "A16", "12"]) {
    if (!text.includes(want)) fail(`${want} is not labelled on the picture`);
  }

  /* The plan under everything: it is context, and at full strength it
     competes with the trench drawn over it. */
  const planAt = calls.findIndex((c) => c.op === "globalAlpha=");
  const firstArc = calls.findIndex((c) => c.op === "arc");
  if (planAt < 0 || planAt > firstArc) fail("the plan is drawn over the work");

  /* Highlight, then the dark core over it. A highlight alone is hard to
     follow where it crosses other work. */
  const strokes = calls.filter((c) => c.op === "strokeStyle=")
    .map((c) => String(c.args[0]));
  const hi = strokes.indexOf("#facc15");
  const core = strokes.indexOf("#78350f");
  if (hi < 0) fail("the trench is not highlighted");
  if (core < 0 || core < hi) fail("the highlight is drawn over its own trench");

  /* Nodes last, because their labels are what the paperwork names the
     run by. */
  const lastNode = calls.map((c) => c.op === "fillText" && String(c.args[0]) === "A16")
    .lastIndexOf(true);
  const lastTrench = calls.map((c) => c.op === "strokeStyle="
    && String(c.args[0]) === "#78350f").lastIndexOf(true);
  if (lastNode < lastTrench) fail("a node label can be covered by the trench");
}

// 4. Only what is in frame.
//
//    A seed two streets away would be drawn at the edge of the picture
//    as though it were on this span. Nodes were not filtered at all, so
//    a picture of a thirteen-metre run had three of them in its corners
//    with no trench near any of them.
{
  const { ctx, calls } = recorder();
  drawSpan(ctx, {
    trenches: [{ Geometry: [[100, 100], [113, 100]] }],
    seeds: [{ Geometry: [[105, 90]], Label: "near" },
      { Geometry: [[900, 900]], Label: "far" }],
    nodes: [{ Geometry: [[100, 100]], label: "A15" },
      { Geometry: [[900, 900]], label: "A99" }],
  });
  const text = calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0]));
  if (!text.includes("near")) fail("a seed beside the span is not drawn");
  if (text.includes("far")) fail("a seed outside the frame is drawn");
  if (!text.includes("A15")) fail("a node on the span is not drawn");
  if (text.includes("A99")) fail("a node outside the frame is drawn");
}

// 4b. Nodes carry the name the call-off uses.
//
//     A span node's own Label is whatever it was called when it was
//     placed — every node in the first pictures drew "nt". The name a
//     call-off names a run by is Span_Label, which is what labelOf in
//     mainsCallOff reads first.
{
  const { ctx, calls } = recorder();
  drawSpan(ctx, {
    trenches: [{ Geometry: [[100, 100], [113, 100]] }],
    nodes: [
      { Geometry: [[100, 100]], label: "A15", Label: "nt" },
      { Geometry: [[113, 100]], Label: "nt", Attributes: { Span_Label: "A16" } },
    ],
  });
  const text = calls.filter((c) => c.op === "fillText").map((c) => String(c.args[0]));
  if (!text.includes("A15")) fail("the label worked out by the caller is ignored");
  if (!text.includes("A16")) fail("Span_Label is not read where no label was passed");
  if (text.includes("nt")) fail("the feature's own Label is drawn on a node");

  /* And the canvas hands the worked-out name in rather than leaving
     this to guess — an older node has no Span_Label and needs its
     circuit and sequence computing, which labelOf knows and this does
     not. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/label: spanNodeLabel\(f\)/.test(canvas)) {
    fail("the canvas does not name the nodes it sends");
  }
}

// 5. A plan that will not draw must not lose the span.
{
  const { ctx, calls } = recorder();
  let threw = false;
  try {
    drawSpan(ctx, {
      trenches: [{ Geometry: [[0, 0], [10, 0]] }],
      plan: { draw: () => { throw new Error("no"); } },
    });
  } catch { threw = true; }
  if (threw) fail("a broken plan throws instead of being skipped");
  if (!calls.some((c) => c.op === "strokeStyle=" && c.args[0] === "#facc15")) {
    fail("a broken plan takes the trench with it");
  }
}

// 6. The PDF plan is asked for by extent, not taken from the screen.
//
//    usePdfPage keeps one tile for whatever is on screen and grows it
//    for panning. Both are wrong for a picture: the answer has to be
//    this extent, and several in a row without each replacing the last.
{
  const hook = readFileSync("./src/features/gis/usePdfPage.js", "utf8");
  if (!/const renderRegion = useCallback/.test(hook)) {
    fail("there is no way to render one region on demand");
  }
  const fn = hook.slice(hook.indexOf("const renderRegion"));
  const body = fn.slice(0, fn.indexOf("}, [size, pageNumber])"));
  /* Returns rather than setting state, or capturing a call-off would
     replace the tile on screen. */
  if (/setTile\(/.test(body)) fail("rendering a span's extent disturbs the drawing");
  if (!/return \{ canvas: cv/.test(body)) fail("the rendered region is not returned");
  /* And keeps the same ceiling, or a span at a high zoom asks for a
     canvas the browser refuses to make and comes back blank. */
  if (!/MAX_PIXELS/.test(body)) fail("a span at a high zoom can ask for too large a canvas");

  const layer = readFileSync("./src/features/gis/planLayer.js", "utf8");
  if (!/Math\.min\(a\[0\], b\[0\]\)/.test(layer)) {
    fail("a mirrored calibration gives a negative page rectangle");
  }
}

// 7. The picture is stored through a function, not from the browser.
//
//    Everything here reaches the database through a function holding
//    the service-role key; the browser's key has no policies and can
//    write nothing. Storage is no different.
{
  const api = readFileSync("./netlify/functions/call-off-span-image.js", "utf8");
  const client = readFileSync("./src/api/calloffs.js", "utf8");

  if (!/withAuth\(/.test(api)) fail("the image endpoint is open");
  /* The call spans several lines with a comment inside it, so this
     looks for the pieces rather than a span of characters. */
  if (!/db\.storage/.test(api) || !/\.upload\(path, bytes/.test(api)) {
    fail("the endpoint does not store the file");
  }
  if (!/http\.post\("\/call-off-span-image"/.test(client)) {
    fail("the browser does not send the image to the endpoint");
  }
  /* Not uploaded from the browser, which would need bucket policies
     that this application deliberately does not have. */
  if (/storage\.from\(/.test(client)) {
    fail("the browser uploads to storage directly");
  }

  /* Only a PNG the canvas made. Decoding whatever arrives is how a
     bucket becomes a file host. */
  if (!/0x89, 0x50, 0x4e, 0x47/.test(api)) {
    fail("anything base64 can be stored as a span picture");
  }
  if (!/2 \* 1024 \* 1024/.test(api)) fail("there is no size ceiling");

  /* The file first, the row second. A file with no row is invisible and
     can be swept up; a row pointing at nothing is a broken picture in a
     work instruction. */
  const upAt = api.indexOf(".upload(");
  const rowAt = api.indexOf("Span_Image_Path: path");
  if (upAt < 0 || rowAt < 0 || upAt > rowAt) {
    fail("the row is written before the file it points at");
  }
  /* Overwrites, so a retry replaces rather than accumulating. */
  if (!/upsert: true/.test(api)) fail("retrying a capture leaves the old file behind");
}

// 8. Capturing cannot lose the call-off.
//
//    A picture that fails to draw or upload must not take the call-off
//    with it: the span keeps a null path and the work instruction says
//    the picture is missing, which is recoverable. A call-off that
//    failed to save because of an image is not.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fn = canvas.slice(canvas.indexOf("async function captureSpans"));
  const body = fn.slice(0, fn.indexOf("\n  async function"));

  if (!/catch \{ failed \+= 1; \}/.test(body)) {
    fail("one span failing stops the rest");
  }
  /* Started after the call-off is saved, and not awaited into it. */
  /* The call site, not the definition — indexOf finds the function
     first, and slicing from there checks the wrong text. */
  if (!/captureSpans\(created\)\.catch\(/.test(canvas)) {
    fail("a failed capture can fail the call-off");
  }
  if (/await captureSpans\(/.test(canvas)) {
    fail("the call-off waits on its pictures before finishing");
  }
  /* Matched by position: two runs between the same pair of nodes are
     two rows with identical labels, and a join on the label would put
     both pictures on one of them. */
  if (!/rows\[i\]/.test(body) || !/spans\[i\]/.test(body)) {
    fail("spans and rows are matched by something other than order");
  }
  /* And a failure is said, or a missing picture is silent until
     somebody opens the instruction on a road. */
  if (!/setStatus\(/.test(body)) fail("a failed capture says nothing");
}

console.log(bad ? `\n${bad} problem(s)`
  : "The span picture behaves (plan under, trench highlighted, nodes on top).");
process.exit(bad ? 1 : 0);
