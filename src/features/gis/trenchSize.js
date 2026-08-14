/* How wide and how deep a trench has to be, from what is in it.

   The utilities in a joint trench cannot be laid touching. Each needs
   clearance from the others so one can be dug up without damaging the
   next, and each sits at its own depth so a spade meets the shallowest
   first. NJUG Volume 1 sets both.

   ── This is a starting point, not a substitute for the guidance ──

   The figures below are the ordinary case: a footway, a straight run,
   no obstruction, standard voltages and pressures. Real jobs depart
   from it constantly — a carriageway is deeper, a crossing is deeper
   again, HV is not LV, and an operator's own specification wins over
   the general one. The numbers are in one table here, and the table is
   the thing to change when a scheme says otherwise.

   What this is for is the ordinary case done consistently: a trench
   with three utilities in it should not be sized by eye differently on
   two drawings.

   ── Depth is cover, and width is a sum ──

   Depth is measured to the top of the highest thing in the trench, and
   each utility has a minimum cover. So the trench depth is the deepest
   requirement among its contents, plus that utility's own diameter,
   plus bedding.

   Width is the horizontal sum: each utility's own width, plus a
   separation between every neighbouring pair, plus a working margin at
   each side. A trench with one pipe in it is not narrower than a spade.

   ── Why the numbers are here and not in a database table ──

   They are a published standard rather than a company preference, so
   they change when the standard changes and not per project. When a
   scheme needs its own, the shape to add is an override on the trench
   rather than an edit here. */

/* Cover to the top of the utility, in metres, in a footway.

   NJUG Volume 1 table 1. Electric and gas are the ones people get
   wrong: LV electric is shallower than gas, so a joint trench is dug
   to the gas and the electric sits above it. */
export const NJUG_COVER_M = {
  electric: 0.45,
  gas: 0.60,
  water: 0.75,
  telecoms: 0.25,
  /* Anything not named. Deliberately the deepest of the above rather
     than the shallowest: a trench dug too deep is money, a trench dug
     too shallow is a strike. */
  other: 0.75,
};

/* Horizontal clearance between two different utilities, in metres.

   NJUG gives 250mm as the general separation in a joint trench, with
   more between electric and gas. Held as a pair lookup rather than one
   number, because the exceptions are the point of the table. */
export const NJUG_SEPARATION_M = {
  default: 0.25,
  "electric|gas": 0.25,
  "electric|water": 0.25,
  "electric|telecoms": 0.25,
  "gas|water": 0.25,
  "gas|telecoms": 0.25,
  "telecoms|water": 0.25,
};

/* Working room at each side of the trench, in metres. Not from NJUG:
   a trench has to be dug and backfilled by somebody, and a width that
   is the sum of its contents and nothing else cannot be worked in. */
export const EDGE_MARGIN_M = 0.15;

/* Bedding and surround below the lowest utility, in metres. */
export const BEDDING_M = 0.10;

/* The narrowest a trench is dug whatever is in it: one spade's width.

   A floor rather than a rule that fires: the two working margins alone
   come to 0.30m, so anything with something in it already clears this.
   Kept so that a smaller margin later cannot quietly produce a trench
   nobody could dig, and so the intent is written down rather than
   implied by an arithmetic accident. */
export const MIN_WIDTH_M = 0.30;

const pairKey = (a, b) => [a, b].sort().join("|");

export const separationFor = (a, b) =>
  NJUG_SEPARATION_M[pairKey(a, b)] ?? NJUG_SEPARATION_M.default;

export const coverFor = (utility) =>
  NJUG_COVER_M[utility] ?? NJUG_COVER_M.other;

/* How wide one thing in the trench is, in metres.

   A pipe is its outside diameter. A cable is its overall diameter,
   which is not something the drawing records — a nominal figure is used
   and named as such, because a cable's width contributes far less to
   the trench than its separation does and inventing precision here
   would be false. */
export const DEFAULT_ITEM_WIDTH_M = 0.10;

export function itemWidthM(item) {
  const od = Number(item?.outsideDiameterMM);
  if (od > 0) return od / 1000;
  return DEFAULT_ITEM_WIDTH_M;
}

/* The things laid side by side at the busiest point of the trench.

   ── Width is a cross-section, and the contents list is not ──

   What runs along a trench and what lies across it are different
   questions. In one section of trench the answer to the second is the
   same everywhere: pipes and cables do not join a trench part way along
   its length, so everything laid in it runs the whole of it.

   That means a line covering only part of a section is not a neighbour
   of the rest — it is a consecutive run of the same pipe, picking up
   where the last one stopped. A 145m trench with three gas runs along
   it has one gas pipe in its cross-section, not three.

   Summing the list regardless was what produced a three-metre trench
   from a single gas, water and LV: every run added its own diameter and
   another 0.25m of separation to a hole nothing extra was being laid
   in. And it got worse as the design matured, because each rebuild
   splits the network into more runs — more features along the same
   trench, none of them beside each other.

   ── The busiest point, not the first ──

   Swept rather than counted, so the answer does not depend on where the
   runs happen to be cut. Every start and end is a boundary; between two
   boundaries the set laid is constant; the trench is dug for the widest
   of those sets.

   An item with no extent counts as running the whole length. That is
   the cautious reading — it is the one that keeps it in every
   cross-section — and it is what every caller that knows only what is
   in a trench, and not where, should get. */
export function crossSection(items = [], trenchM = null) {
  if (items.length < 2) return items;

  const spans = items.map((x) => ({
    item: x,
    from: Number.isFinite(x.fromM) ? x.fromM : 0,
    to: Number.isFinite(x.toM) ? x.toM : (trenchM || Infinity),
  }));

  const bounds = [...new Set(spans.flatMap((s) => [s.from, s.to]))]
    .sort((a, b) => a - b);

  let best = [];
  let bestW = -1;
  for (let i = 0; i + 1 < bounds.length; i++) {
    /* The middle of the interval, so a run ending exactly where the
       next begins is not counted in both. */
    const at = (bounds[i] + bounds[i + 1]) / 2;
    const here = spans.filter((s) => s.from <= at && at < s.to).map((s) => s.item);
    if (!here.length) continue;
    /* Widest rather than most numerous: three ducts are not a wider
       trench than one large main beside a cable. */
    const w = here.reduce((t, x) => t + itemWidthM(x), 0)
      + separationTotal(here);
    if (w > bestW) { bestW = w; best = here; }
  }

  /* No interval at all means nothing carried an extent — one boundary,
     or none. Everything is then in the cross-section. */
  return best.length ? best : items;
}

/* The separations between a set laid side by side, in the order they
   would be laid: deepest first. */
function separationTotal(set = []) {
  const ordered = [...set].sort((a, b) => coverFor(b.utility) - coverFor(a.utility));
  let t = 0;
  for (let i = 1; i < ordered.length; i++) {
    t += separationFor(ordered[i - 1].utility, ordered[i].utility);
  }
  return t;
}

/* The trench for these contents.

   `items` are { utility, outsideDiameterMM } and, where the caller
   knows it, { fromM, toM } — where along the trench each one runs.

   One per thing laid, not one per utility: two gas mains genuinely
   running side by side need separating from each other as well as from
   the electric. Two laid end to end do not, which is what the extents
   are for.

   Returns the width and depth, and the working that produced them, so
   a figure on a drawing can be explained without rerunning anything. */
export function trenchSize(items = [], opts = {}) {
  const all = items.filter((x) => x && x.utility);
  if (!all.length) {
    return {
      widthM: 0, depthM: 0, items: 0,
      note: "Nothing is laid in this trench.",
    };
  }

  /* The width comes from what is laid beside what. The depth does not:
     a trench is dug to the deepest thing anywhere along it, because it
     is dug in one pass. So the cross-section sizes the width and the
     whole list sets the depth. */
  const laid = crossSection(all, opts.trenchM ?? null);

  /* Deepest first, because that is the order they are laid and the
     order that decides the depth. */
  const ordered = [...laid].sort((a, b) => coverFor(b.utility) - coverFor(a.utility));
  const deepestOfAll = [...all]
    .sort((a, b) => coverFor(b.utility) - coverFor(a.utility))[0];

  const widths = ordered.map(itemWidthM);
  const contentW = widths.reduce((t, w) => t + w, 0);

  /* A separation between each neighbouring pair. Two items have one gap
     between them, three have two \u2014 not one per item, which would leave
     a gap against nothing at the end. */
  let separationW = 0;
  const gaps = [];
  for (let i = 1; i < ordered.length; i++) {
    const m = separationFor(ordered[i - 1].utility, ordered[i].utility);
    separationW += m;
    gaps.push({ between: [ordered[i - 1].utility, ordered[i].utility], m });
  }

  const widthM = Math.max(
    MIN_WIDTH_M,
    contentW + separationW + EDGE_MARGIN_M * 2,
  );

  /* Depth to the bottom: the deepest cover, plus that item's own
     diameter, plus what it is bedded on.

     Taken from everything in the trench rather than from the busiest
     cross-section. A trench is dug to one depth in one pass, so a
     deeper run further along still sets it — the width can vary along a
     section and the depth cannot. */
  const deepest = deepestOfAll;
  const depthM = coverFor(deepest.utility) + itemWidthM(deepest) + BEDDING_M;

  return {
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
    /* What is laid across it, which is what the width is made of. */
    items: ordered.length,
    /* And what runs along it. The two differ wherever a run is split,
       and a panel showing five things beside a width built from three
       needs to be able to say why. */
    runs: all.length,
    consecutive: all.length - ordered.length,
    /* The working, in the order it was done. */
    deepest: deepest.utility,
    coverM: coverFor(deepest.utility),
    contentWidthM: Math.round(contentW * 100) / 100,
    separationWidthM: Math.round(separationW * 100) / 100,
    marginWidthM: EDGE_MARGIN_M * 2,
    gaps,
    atMinimum: contentW + separationW + EDGE_MARGIN_M * 2 < MIN_WIDTH_M,
  };
}
