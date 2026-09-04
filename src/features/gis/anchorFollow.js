/* Whose anchor moves when the point does.

   Two kinds of point carry a `Span_Anchor` and they mean opposite
   things by it.

   A **span node** and a **feeder point** are markers. The node is
   dragged a metre or two clear of the trench so its label can be read,
   and the anchor is the place on the dig it stands for — every length,
   trace and call-off measures to the anchor rather than to the marker.
   Moving the marker must NOT move the anchor, or tidying a drawing
   would redesign it. Both have a handle of their own for correcting the
   anchor where it is wrong, which is the "anchor" drag mode.

   A **link box** is not a marker. It is a chamber in the ground with
   fuses in it. Its anchor is written once at placement, equal to its
   geometry, and there is no handle for it — so nothing could ever move
   it. Dragging a box left the anchor behind and every reader of the
   anchor went on describing where the box used to be: the joint pass
   suppressed the joint at the old spot, the cable stubs drew to the old
   spot, and Build LV Network matched its walk against the old spot,
   missed, and made a generated feeder point standing there. That is the
   stray duplicate arriving by a second route — the same fault
   feederPoints.js fixes at the other end.

   The rule is here rather than in the drag because the drag is four
   places — capture, frame, save, undo — and the four have to agree.
   checkanchormove drives it. */

/* A box whose anchor was never written has nothing to move, and
   inventing one from its geometry would be a guess about where it
   belongs on the run. */
export function anchorFollows(feature) {
  if (feature?.Feature_Role !== "linkbox") return false;
  const a = feature?.Attributes?.Span_Anchor;
  return Array.isArray(a) && a.length === 2;
}

/* Where each of them started, taken before the first frame moves
   anything. Copied rather than referenced: the frame update rebuilds
   from this on every move, and a live array would be moved out from
   under it — and under undo, which needs where the anchor was. */
export function anchorSnapshot(features = []) {
  const out = new Map();
  for (const f of features) {
    if (!anchorFollows(f)) continue;
    const a = f.Attributes.Span_Anchor;
    out.set(f.Feature_ID, [a[0], a[1]]);
  }
  return out;
}

/* The same delta the point took, not the cursor position: a box whose
   anchor has drifted off its symbol keeps the offset it had rather than
   being quietly corrected by a drag.

   Anything without a following anchor comes back untouched, so the
   frame update can run every dragged feature through this without
   asking first. */
export function withMovedAnchor(feature, origAnchor, dm) {
  if (!anchorFollows(feature) || !Array.isArray(origAnchor)) return feature;
  return {
    ...feature,
    Attributes: {
      ...feature.Attributes,
      Span_Anchor: [origAnchor[0] + dm[0], origAnchor[1] + dm[1]],
    },
  };
}

/* The rows to save, once the drag is released.

   A move writes Geometry; the anchor is an attribute, so it needs a row
   of its own — and the whole Attributes object, because the endpoint
   replaces that column rather than merging into it. Sending only the
   anchor would take the fuses off the box.

   Only where it actually moved. A click that happens to land on a box
   should not put a row through the database. */
export function anchorUpdates(features = [], snapshot = new Map()) {
  const rows = [];
  for (const f of features) {
    const was = snapshot.get(f.Feature_ID);
    if (!was) continue;
    const now = f.Attributes?.Span_Anchor;
    if (!Array.isArray(now)) continue;
    if (now[0] === was[0] && now[1] === was[1]) continue;
    rows.push({ Feature_ID: f.Feature_ID, Attributes: { ...f.Attributes } });
  }
  return rows;
}
