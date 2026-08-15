/* Cutting a trench at its span nodes.

   A span node marks a point the network is measured between, and until
   this existed placing one drew a marker and left the trench alone — so
   a length drawn as one continuous line past three junctions stayed one
   feature, and everything asking a question about "a trench" got the
   answer for all three sections at once.

   Cutting rewrites somebody's drawing, so what is checked here is
   mostly that it does not lose anything: the shape, the length, the
   attributes, and the property that running it twice does nothing the
   second time. */
import {
  planTrenchSplit, planTrenchSplits, lengthOf,
} from "./src/features/gis/splitTrenches.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const trench = (g, attrs = {}) => ({
  Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench",
  Label: "Mains Trench",
  Geometry: g,
  Attributes: { Line_Type: "trench_main", ...attrs },
});

const straight = trench([[0, 0], [100, 0]]);

// 1. A node in the middle cuts it in two; two nodes cut it in three.
{
  const one = planTrenchSplit(straight, [[40, 0]]);
  if (!one) fail("a node in the middle of a trench cut nothing");
  else if (one.pieces.length !== 2) {
    fail(`one node made ${one.pieces.length} pieces, wanted 2`);
  }

  const two = planTrenchSplit(straight, [[30, 0], [70, 0]]);
  if (two?.pieces.length !== 3) fail(`two nodes made ${two?.pieces.length} pieces, wanted 3`);
}

// 2. Nothing is lost: the pieces come to the length of the trench.
{
  const r = planTrenchSplit(straight, [[30, 0], [70, 0]]);
  const total = r.pieces.reduce((t, p) => t + lengthOf(p.Geometry), 0);
  if (Math.abs(total - 100) > 0.01) {
    fail(`the pieces come to ${total.toFixed(2)}m of a 100m trench`);
  }
  /* And they join end to end, in order, with no gap and no overlap. */
  for (let i = 0; i + 1 < r.pieces.length; i++) {
    const end = r.pieces[i].Geometry.at(-1);
    const start = r.pieces[i + 1].Geometry[0];
    if (Math.hypot(end[0] - start[0], end[1] - start[1]) > 0.01) {
      fail(`piece ${i + 1} does not meet piece ${i + 2}`);
    }
  }
}

// 3. A trench that bends keeps its shape.
//
//    A cut is a cut, not a redraw. Losing the vertices would straighten
//    a length of trench somebody surveyed round an obstruction.
{
  const bent = trench([[0, 0], [50, 0], [50, 50], [100, 50]]);
  const r = planTrenchSplit(bent, [[50, 25]]);
  if (!r) fail("a node on the bend of a trench cut nothing");
  const total = (r?.pieces ?? []).reduce((t, p) => t + lengthOf(p.Geometry), 0);
  if (r && Math.abs(total - lengthOf(bent.Geometry)) > 0.01) {
    fail("a bent trench lost length when it was cut");
  }
  /* The corner at [50,0] has to survive in the first piece, or that
     piece is a straight line across ground the trench went round. */
  const corner = (r?.pieces?.[0]?.Geometry ?? [])
    .some((p) => Math.hypot(p[0] - 50, p[1] - 0) < 0.01);
  if (r && !corner) fail("a corner was dropped when the trench was cut");
}

// 4. Everything the trench carried comes with every piece.
//
//    Copied whole rather than named one by one, so an attribute added
//    later carries across without this knowing what it is. A named list
//    is right until somebody adds a field and does not think of this
//    file — and then a build status or an easement is dropped silently
//    from every trench on every drawing.
{
  const rich = trench([[0, 0], [100, 0]], {
    Surface_Type: "carriageway_34",
    Build_Status: "complete",
    Carries_Gas: true, Carries_LV: false,
    Easement: true,
    Site: "Phase 2",
    Notes: "Round the oak",
    /* Something nobody has invented yet. */
    Future_Field: "kept",
  });
  const r = planTrenchSplit(rich, [[50, 0]]);
  for (const p of r.pieces) {
    for (const k of ["Surface_Type", "Build_Status", "Carries_Gas", "Carries_LV",
      "Easement", "Site", "Notes", "Future_Field", "Line_Type"]) {
      if (p.Attributes[k] !== rich.Attributes[k]) {
        fail(`${k} was not carried onto a piece`);
      }
    }
    if (p.Label !== rich.Label) fail("the label was not carried onto a piece");
    if (p.Layer_Key !== rich.Layer_Key) fail("the layer was not carried onto a piece");
  }

  /* Connects is the exception, and has to be. Each piece has different
     ends from the line it came from, so the old list is wrong for all
     of them — the caller recomputes it from the geometry. */
  const linked = trench([[0, 0], [100, 0]], { Connects: [7, 8, 9] });
  const lr = planTrenchSplit(linked, [[50, 0]]);
  for (const p of lr.pieces) {
    if ((p.Attributes.Connects || []).length) {
      fail("a piece kept the links of the trench it came from");
    }
  }
}

// 5. A node at either end is not a cut.
//
//    This is what makes a second run do nothing. Once a trench has been
//    split, every node on it is at the end of a piece, so there is
//    nothing interior left and the drawing stops changing.
{
  if (planTrenchSplit(straight, [[0, 0]])) fail("a node at the start cut the trench");
  if (planTrenchSplit(straight, [[100, 0]])) fail("a node at the end cut the trench");
  if (planTrenchSplit(straight, [[0, 0], [100, 0]])) fail("nodes at both ends cut the trench");

  /* Run it, then run it again over the pieces: the second pass finds
     nothing. */
  const first = planTrenchSplit(straight, [[40, 0]]);
  const again = planTrenchSplits(
    first.pieces.map((p, i) => ({ ...p, Feature_ID: 100 + i })),
    [[40, 0]],
  );
  if (again.trenches) fail("running it a second time cut the pieces again");
}

// 6. A node that is not on this trench does not cut it.
{
  if (planTrenchSplit(straight, [[50, 40]])) {
    fail("a node forty metres off the trench cut it");
  }
  /* But one a few centimetres off does — a junction is found within a
     quarter of a metre, and a node anchored to it may sit just off the
     line it was projected onto. */
  if (!planTrenchSplit(straight, [[50, 0.2]])) {
    fail("a node just off the line did not cut it");
  }
}

// 7. Two nodes at effectively the same place make one cut, not a stub
//    between them.
{
  const r = planTrenchSplit(straight, [[50, 0], [50.1, 0]]);
  if (r.pieces.length !== 2) fail(`two coincident nodes made ${r.pieces.length} pieces`);
}

// 8. Over a set of trenches, only those needing a cut come back.
//
//    A trench replaced by an identical copy of itself is a new row id
//    for no reason — it would break every Connects pointing at it and
//    churn the drawing on every run.
{
  const a = { ...straight, Feature_ID: 1 };
  const b = { ...trench([[0, 50], [100, 50]]), Feature_ID: 2 };
  const r = planTrenchSplits([a, b], [[40, 0]]);
  if (r.trenches !== 1) fail(`${r.trenches} trenches planned for cutting, wanted 1`);
  if (r.pieces !== 2) fail(`${r.pieces} pieces planned, wanted 2`);
  if (r.splits[0].trench.Feature_ID !== 1) fail("the wrong trench was planned for cutting");
}

// 9. Degenerate geometry is left alone rather than cut into nothing.
{
  if (planTrenchSplit(trench([[0, 0]]), [[0, 0]])) fail("a one-point line was cut");
  if (planTrenchSplit(trench([]), [[0, 0]])) fail("a line with no points was cut");
  if (planTrenchSplit(straight, [])) fail("a trench with no nodes on it was cut");
}

// 10. Every piece has a build status.
//
//     Existing is the one status the estimate treats differently — an
//     existing trench is laid but not dug — so a piece with none looked
//     the same as one somebody had marked. A trench somebody has drawn
//     is a trench somebody intends to dig, and that is what planned
//     means.
{
  /* Carried where the original had one. Cutting an existing trench
     gives three existing pieces, not three to be dug again. */
  const wasExisting = planTrenchSplit(
    trench([[0, 0], [100, 0]], { Build_Status: "existing" }), [[50, 0]],
  );
  for (const p of wasExisting.pieces) {
    if (p.Attributes.Build_Status !== "existing") {
      fail("a piece of an existing trench was not existing");
    }
  }

  /* And filled in where it had none — a trench drawn before the default
     existed. */
  const hadNone = planTrenchSplit(trench([[0, 0], [100, 0]]), [[50, 0]]);
  for (const p of hadNone.pieces) {
    if (p.Attributes.Build_Status !== "planned") {
      fail(`a piece of an unmarked trench came out as ${p.Attributes.Build_Status}`);
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Trench splitting behaves (shape and attributes kept, second run does nothing).");
process.exit(bad ? 1 : 0);
