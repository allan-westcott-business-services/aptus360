/* What sits on top of what.

   The canvas drew in creation order, so a trench dug after its cable
   covered it — and on a drawing where the trenches were laid out first
   and then redrawn, whole runs of cable disappeared under them. Nothing
   was wrong with the data; the last thing drawn simply won.

   A cable belongs above its trench. The trench is the ground it lies in,
   and a drawing that hides the cable inside it is showing the excavation
   rather than the design. The same goes for a service pipe in its dig.

   ── Bands, not a full ordering ──

   Only enough to fix what actually overlaps. Within a band creation
   order is kept, because it is the order someone drew things in and
   there is no better rule — reordering two cables against each other
   would be inventing a preference nobody expressed.

   Points are not in here: they are drawn after every line regardless,
   which is right, since a meter under a cable is a meter nobody can
   click. */

export const BAND = {
  SHAPE: 0,     // boundaries, developer areas — the ground plan
  TRENCH: 1,    // the dig
  UTILITY: 2,   // what lies in it
  POINT: 3,     // meters, joints, seeds
};

/* Which band a feature belongs in.

   The trench test is passed in rather than imported so this stays a pure
   function of its arguments — the canvas already knows how to decide
   what a trench is, and two definitions of that would eventually
   disagree. */
export function bandOf(f, isTrench = () => false) {
  if (!f) return BAND.UTILITY;
  if (f.Feature_Type === "point") return BAND.POINT;
  if (f.Feature_Type === "polygon") return BAND.SHAPE;

  const lt = f.Attributes?.Line_Type;
  if (lt && isTrench(lt)) return BAND.TRENCH;

  /* A line with no type at all sits with the utilities rather than the
     trenches: an untyped line is more often a cable someone has not
     finished describing than a dig, and putting it under the trenches
     would hide it. */
  return BAND.UTILITY;
}

/* Back to front.

   Stable within a band: the sort compares band first and falls back to
   the original position, so two cables keep the order they were drawn
   in and the drawing does not shuffle between repaints. */
export function inDrawOrder(features = [], isTrench = () => false) {
  return features
    .map((f, i) => ({ f, i }))
    .sort((a, b) => bandOf(a.f, isTrench) - bandOf(b.f, isTrench) || a.i - b.i)
    .map((x) => x.f);
}
