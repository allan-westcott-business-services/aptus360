/* Which feature is drawn over which.

   Until now, creation order: whatever was drawn last covered whatever
   was under it. That is right often enough to have gone unnoticed — a
   cable drawn over a trench is usually meant to sit on it — and wrong
   whenever a plan is redrawn, because the redrawn thing jumps to the
   front whether or not it belongs there.

   A feature can now carry Z_Index. Anything without one keeps its place
   in creation order, so a drawing nobody has reordered looks exactly as
   it did.

   In Attributes rather than a column: it is a drawing preference rather
   than a fact about the network, nothing joins on it, and it needs no
   migration to start using.

   ── Span nodes are not in this ──
   They are drawn in a pass of their own, after everything, because they
   sit exactly on the things they annotate — the origin node on the
   substation, a junction node on a cable — and being covered by them
   would make the drawing's index invisible. Reordering cannot put a
   cable over one, and should not. */

const zOf = (f) => {
  const z = f?.Attributes?.Z_Index;
  return Number.isFinite(Number(z)) ? Number(z) : null;
};

/* Sorting key: the Z where there is one, and creation order otherwise.

   Features with no Z sit at 0, which is where everything starts — so
   sending one thing back puts it behind the unordered pile rather than
   behind only the other things someone has already touched. */
export const zKey = (f) => (zOf(f) ?? 0);

/* Back to front. Ties are broken by Feature_ID so the order is stable:
   two features at the same Z must not swap places between repaints,
   which would flicker. */
export function inDrawOrder(features = []) {
  return features
    .map((f, i) => ({ f, i }))
    .sort((a, b) =>
      zKey(a.f) - zKey(b.f)
      || (Number(a.f.Feature_ID) || 0) - (Number(b.f.Feature_ID) || 0)
      || a.i - b.i)
    .map((x) => x.f);
}

/* What a reorder should write.

   Returned as rows to save rather than applied, so the caller can decide
   whether anything changed and so this can be tested.

   Front and back are absolute: one past the extreme, which is one write
   however many features there are. Forward and backward are a swap with
   the neighbour, which is what "forward" means on a drawing — one step,
   not to the top. */
export function planReorder(action, feature, features = []) {
  if (!feature) return [];

  /* Only what is drawn in the same pass. Ordering against a span node
     would compute a Z that does nothing, since span nodes are drawn
     afterwards regardless. */
  const pool = features.filter((f) => f.Feature_Role !== "spannode");
  const order = inDrawOrder(pool);
  const at = order.findIndex((f) => String(f.Feature_ID) === String(feature.Feature_ID));
  if (at < 0) return [];

  const patch = (f, z) => ({
    Feature_ID: f.Feature_ID,
    Attributes: { ...f.Attributes, Z_Index: z },
  });

  /* Already where it is being sent. Judged on position in the order
     rather than on the Z value, because several features can share a Z
     and only one of them is actually on top. */
  if (action === "front" && at === order.length - 1) return [];
  if (action === "back" && at === 0) return [];
  if (action === "forward" && at === order.length - 1) return [];
  if (action === "backward" && at === 0) return [];

  if (action === "front") {
    return [patch(feature, Math.max(...order.map(zKey)) + 1)];
  }
  if (action === "back") {
    return [patch(feature, Math.min(...order.map(zKey)) - 1)];
  }

  if (action === "forward" || action === "backward") {
    const to = action === "forward" ? at + 1 : at - 1;

    /* Two features at the same Z cannot be swapped by exchanging their Z
       values, and stepping past one of them steps past all of them —
       which is how "forward" jumped a feature straight to the top on a
       drawing where nothing had been ordered yet.

       So where the neighbour shares its Z, the run is numbered: the
       order is rebuilt with the two positions exchanged and sequential
       values written. That is one bulk write on the first reorder of a
       drawing and two rows on every one after it, because by then
       everything has a value of its own. */
    const mine = zKey(feature);
    const theirs = zKey(order[to]);
    if (mine !== theirs) return [patch(feature, theirs), patch(order[to], mine)];

    const moved = order.slice();
    [moved[at], moved[to]] = [moved[to], moved[at]];
    return moved
      .map((f, i) => ({ f, z: i - Math.floor(moved.length / 2) }))
      .filter(({ f, z }) => zKey(f) !== z)
      .map(({ f, z }) => patch(f, z));
  }

  return [];
}

/* Whether a button would do anything, so it can be disabled rather than
   pressed to no effect. */
export function canReorder(action, feature, features = []) {
  return planReorder(action, feature, features).length > 0;
}
