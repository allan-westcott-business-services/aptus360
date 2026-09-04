/* What moves when a point is moved.

   Two kinds of point carry a Span_Anchor, and they mean opposite
   things by it.

   A span node and a feeder point are MARKERS. The node is dragged a
   metre or two clear of the trench so its label can be read, and the
   anchor is the place on the dig it stands for — every length, trace
   and call-off measures to the anchor. Moving the marker must not move
   the anchor, or tidying a drawing would redesign it. Both have a
   handle of their own for correcting the anchor when it is wrong.

   A link box is not a marker. It is a chamber in the ground with fuses
   in it, and its anchor is where it stands — written once at placement
   and equal to its geometry ever since. It has no handle, so nothing
   could ever move it: dragging a box two metres left the anchor
   behind, and every reader of the anchor went on describing the old
   position. The joint pass suppressed the joint at the old spot, the
   cable stubs drew to the old spot, and the next Build LV Network
   matched the walk against the old spot, missed, and made a generated
   feeder point standing where the box used to be — the stray duplicate
   again, arriving by a second route.

   So: a box's anchor follows it, a marker's does not. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let af = {};
try { af = await import("./src/features/gis/anchorFollow.js"); }
catch { /* named below rather than crashing the suite's report */ }

const { anchorFollows, anchorSnapshot, withMovedAnchor, anchorUpdates } = af;

if (typeof anchorFollows !== "function" || typeof withMovedAnchor !== "function"
  || typeof anchorSnapshot !== "function" || typeof anchorUpdates !== "function") {
  fail("anchorFollow.js does not export the rule — a dragged link box "
    + "still leaves its anchor where it was");
} else {
  const box = (at, extra = {}) => ({
    Feature_ID: 1, Feature_Role: "linkbox", Feature_Type: "point",
    Layer_Key: "electric", Label: "Link Box 1", Geometry: [at],
    Attributes: { Link_Ways: 4, Way_Fuse_A: {}, Circuit_ID: 1, Span_Seq: 1,
      Span_Label: "A1", Span_Anchor: at, ...extra },
  });
  const node = (role, at) => ({
    Feature_ID: 2, Feature_Role: role, Feature_Type: "point",
    Layer_Key: role === "spannode" ? "trench" : "electric",
    Geometry: [at], Attributes: { Span_Seq: 3, Span_Label: "A3", Span_Anchor: at },
  });
  const meter = { Feature_ID: 3, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Geometry: [[0, 0]], Attributes: {} };

  // 1. The rule itself, said once and read by everything below.
  {
    if (!anchorFollows(box([10, 10]))) {
      fail("a link box's anchor does not follow the box");
    }
    for (const role of ["spannode", "feederpoint"]) {
      if (anchorFollows(node(role, [10, 10]))) {
        fail(`a ${role}'s anchor follows the marker — tidying the drawing `
          + "would move where the design is measured from");
      }
    }
    if (anchorFollows(meter)) fail("a point with no anchor was said to have one");
    /* A box drawn before anchors were written to it has nothing to
       move, and inventing one from its geometry would be a guess about
       where it belongs. */
    if (anchorFollows({ ...box([10, 10]), Attributes: { Link_Ways: 2 } })) {
      fail("a box with no anchor recorded was given one by the move");
    }
  }

  // 2. The anchor moves by the same delta as the point, not to the
  //    cursor: a box whose anchor had drifted keeps the offset it had.
  {
    const b = box([100, 0], { Span_Anchor: [99, 0] });
    const after = withMovedAnchor(b, [99, 0], [10, 5]);
    const a = after.Attributes.Span_Anchor;
    if (!a || a[0] !== 109 || a[1] !== 5) {
      fail(`the anchor moved to ${JSON.stringify(a)}, wanted the same delta`);
    }
    /* And nothing else about it is disturbed. */
    if (after.Attributes.Span_Label !== "A1" || after.Attributes.Link_Ways !== 4) {
      fail("moving the anchor rewrote the rest of the box");
    }
  }

  // 3. A marker is handed back untouched, so the frame update can run
  //    every dragged feature through this without asking first.
  {
    const n = node("feederpoint", [100, 0]);
    const after = withMovedAnchor(n, [100, 0], [10, 5]);
    const a = after.Attributes.Span_Anchor;
    if (a[0] !== 100 || a[1] !== 0) fail("a feeder point's anchor was dragged");
  }

  // 4. What gets saved. A drag writes geometry; the anchor is an
  //    attribute, and the endpoint replaces Attributes wholesale rather
  //    than merging — so the row has to carry the whole object.
  {
    const before = box([100, 0]);
    const snap = anchorSnapshot([before, node("spannode", [0, 0]), meter]);
    if (snap.size !== 1 || !snap.has(1)) {
      fail("the drag records anchors for the wrong set of features");
    }
    const after = withMovedAnchor(before, snap.get(1), [10, 5]);
    const rows = anchorUpdates([after], snap);
    if (rows.length !== 1) {
      fail(`${rows.length} row(s) to save, wanted the one box`);
    } else {
      const w = rows[0].Attributes?.Span_Anchor;
      if (!w || w[0] !== 110 || w[1] !== 5) {
        fail("the saved row does not carry the moved anchor");
      }
      if (rows[0].Attributes?.Way_Fuse_A === undefined) {
        fail("the saved row carries a partial Attributes object \u2014 the "
          + "endpoint replaces the column, so the fuses would be lost");
      }
    }
  }

  // 5. A click that did not move writes nothing.
  {
    const b = box([100, 0]);
    const snap = anchorSnapshot([b]);
    if (anchorUpdates([b], snap).length) {
      fail("touching a box wrote a row through the database");
    }
  }

  // 6. Undo has the old anchor to put back. Restoring the geometry and
  //    leaving the anchor moved is a drawing nobody drew, so the
  //    snapshot taken at drag start is what the before-row carries.
  {
    const b = box([100, 0]);
    const snap = anchorSnapshot([b]);
    const after = withMovedAnchor(b, snap.get(1), [10, 5]);
    if (after.Attributes.Span_Anchor[0] === 100) fail("the fixture proves nothing");
    const beforeRow = { ...after,
      Attributes: { ...after.Attributes, Span_Anchor: snap.get(1) } };
    if (beforeRow.Attributes.Span_Anchor[0] !== 100) {
      fail("the anchor recorded at drag start is not the one before the move");
    }
    /* The snapshot is a copy, not the live array \u2014 a frame update that
       moved it in place would leave undo with nothing to restore. */
    if (snap.get(1) === b.Attributes.Span_Anchor) {
      fail("the snapshot holds the box's own anchor array rather than a copy");
    }
  }
}

/* And the drag uses it: captured at the start, moved on every frame,
   saved on release, and recorded before-and-after so undo puts the
   anchor back with the geometry. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/anchorSnapshot\(/.test(canvas)) {
    fail("the drag does not record the anchors it is about to move");
  }
  if (!/withMovedAnchor\(/.test(canvas)) {
    fail("the anchor does not follow the point on the frame update");
  }
  if (!/anchorUpdates\(/.test(canvas)) {
    fail("the moved anchor is never saved \u2014 it comes back on the next load");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Anchors behave (a link box takes its own with it, a marker leaves "
  + "its own where the dig is).");
process.exit(bad ? 1 : 0);
