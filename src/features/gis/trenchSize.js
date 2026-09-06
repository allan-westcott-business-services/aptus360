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

/* How many of a set of alike things are laid side by side.

   ── Width is a cross-section, and the contents list is not ──

   What runs along a trench and what lies across it are different
   questions. In one section of trench the answer to the second is the
   same everywhere: pipes and cables do not join a trench part way along
   its length, so anything laid in it runs the whole of it.

   That means several features of one size in a trench are usually
   consecutive runs of a single pipe, cut where the build split it at a
   junction or a size step — not several pipes laid together. A 145m
   trench with three gas runs along it has one gas pipe across it.

   Summing the list regardless was what produced a three-metre trench
   from a single gas, water and LV: every run added its own diameter and
   another 0.25m of separation to a hole nothing extra was being laid
   in. It got worse as the design matured, because each rebuild splits
   the network into more runs — more features along the same trench,
   none of them beside each other.

   ── Counted by coverage, not by where the cuts fall ──

   From the metres, not from the extents. Consecutive runs tile the
   trench, so their lengths come to one trench length; two laid together
   come to two. The ratio says which, and it does not care where the
   joins are.

   Extents were the obvious way to do this and they are not reliable
   enough. A run is measured as being in the trench anywhere within a
   metre and a half of it, so where two meet — at a bend, a junction, or
   a branch turning off — each is inside the other's territory for a few
   metres and the two read as overlapping when they are end to end.
   Lengths do not have that problem: a metre counted for one run is a
   metre not counted for the other.

   Never less than one, and never more than there are features. A group
   covering half the trench is still one pipe, not half of one. */
export function concurrentCount(items = [], trenchM = null) {
  if (items.length < 2) return items.length;
  /* No trench length is no way to tell consecutive from parallel, so
     everything is assumed to be laid together. The cautious reading:
     it is the one that keeps them all in the cross-section, and it is
     what a caller knowing only what is in a trench should get. */
  if (!trenchM) return items.length;

  /* An item with no measured length is assumed to run the whole way,
     which is the cautious reading — it is the one that keeps it in the
     cross-section. */
  const covered = items.reduce(
    (t, x) => t + (Number.isFinite(x.withinM) ? x.withinM : trenchM), 0);

  const n = Math.round(covered / trenchM);
  return Math.min(items.length, Math.max(1, n));
}

/* The things laid side by side at any one point.

   ── Grouped by utility, not by utility and size ──

   One gas main is one gas main however many sizes it is drawn in. A
   build cuts a run wherever the calculated size steps, so a single pipe
   from the governor to the far end of a site comes back as 180mm for
   most of it and 90mm past the point the load drops — two features, one
   pipe, one slot in the cross-section.

   Grouping by size as well reported both and dug the trench wide enough
   for both, which is how a trench carrying one gas, one water and one
   LV came back listing five things. Nothing joins a trench part way
   along its length, so the question a cross-section asks is "how many
   gas pipes", never "how many gas pipes of each size".

   ── Represented by the widest ──

   The trench has to take the largest thing that goes in it, so a
   stepped main is dug for its 180mm rather than its 90mm. Over-digging
   a length is money; under-digging it is a pipe that will not fit. */
export function crossSection(items = [], trenchM = null) {
  if (items.length < 2) return items;

  /* ── Grouped by utility here, and only here ──

     The editor's list splits electric into HV and LV, because they are
     two different cables rather than one cable in two sizes, and it
     named a trench "3 x HV Cable" when it held two HV and one LV.

     The WIDTH keeps the coarser grouping on purpose. It takes the
     widest in each group and repeats it, so an LV counted as HV digs a
     little wide. Splitting them would narrow the dig, and this module's
     rule is that over-digging is money while under-digging is a pipe
     that will not fit. The two still agree about how MANY things are in
     the trench, which is what the editor's note requires. */
  const groups = new Map();
  for (const x of items) {
    const k = x.utility;
    if (groups.has(k)) groups.get(k).push(x);
    else groups.set(k, [x]);
  }

  const out = [];
  for (const set of groups.values()) {
    const n = concurrentCount(set, trenchM);
    const widest = set.reduce((a, b) => (itemWidthM(b) > itemWidthM(a) ? b : a));
    for (let i = 0; i < n; i++) out.push(widest);
  }
  return out;
}

/* The run that best represents a utility in the trench: the one that
   covers most of it.

   What a panel should name. The widest is what the hole is dug for, but
   it is not always what is mostly in the ground — a short length of
   larger pipe at the head of a run would otherwise label the whole
   trench with a size that covers ten metres of a hundred and fifty. */
export function dominantOf(items = []) {
  if (!items.length) return null;
  return items.reduce((a, b) =>
    ((Number(b.withinM) || 0) > (Number(a.withinM) || 0) ? b : a));
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
