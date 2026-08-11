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

/* The trench for these contents.

   `items` are { utility, outsideDiameterMM } — one per thing laid in
   the trench, not one per utility: two gas mains in one trench need
   separating from each other as well as from the electric.

   Returns the width and depth, and the working that produced them, so
   a figure on a drawing can be explained without rerunning anything. */
export function trenchSize(items = []) {
  const laid = items.filter((x) => x && x.utility);
  if (!laid.length) {
    return {
      widthM: 0, depthM: 0, items: 0,
      note: "Nothing is laid in this trench.",
    };
  }

  /* Deepest first, because that is the order they are laid and the
     order that decides the depth. */
  const ordered = [...laid].sort((a, b) => coverFor(b.utility) - coverFor(a.utility));

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
     diameter, plus what it is bedded on. */
  const deepest = ordered[0];
  const depthM = coverFor(deepest.utility) + itemWidthM(deepest) + BEDDING_M;

  return {
    widthM: Math.round(widthM * 100) / 100,
    depthM: Math.round(depthM * 100) / 100,
    items: ordered.length,
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
