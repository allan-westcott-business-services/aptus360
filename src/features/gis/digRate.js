/* How long a length of trench takes to dig and to lay.

   trenchSize.js says how big the hole is. This says how long it takes.
   The two are deliberately separate: the size is a published standard
   and the same on every job, the time is a rate that differs by
   machine, by ground and by gang, and gets calibrated against what
   actually happened.

   ── These are estimates, and they are not NJUG ──

   NJUG Volume 1 is a positioning and depth standard. It contains no
   productivity data and there is no published figure for how long ten
   metres takes. What is below is an ordinary-case planning model built
   on standard civils output rates, keyed to the dimensions the drawing
   already knows.

   That matters for how the answer is presented: it is a duration to
   plan against, not a duration to price against, and the screen says
   so. A figure that looks measured when it was assumed is worse than
   no figure, because nobody questions it.

   ── Why the numbers are in the database and the NJUG ones are not ──

   trenchSize.js keeps its table in code, and gives the reason: a
   published standard changes when the standard changes, not per
   project. Rates are the opposite case. They are a company's own, they
   differ by machine and by ground, and the whole point is that they
   move as real jobs come in — a rate that needed a deploy to correct
   would never get corrected.

   So Dig_Rate, Dig_Depth_Factor and Dig_Lay_Rate are tables, and every
   rate row carries what it came from and how many jobs are behind it.
   The defaults below are the fallback for a database that has not been
   migrated yet and for the mock data, so the screens work out of the
   box the way the rest of the app does. They are named as estimates in
   the data, not just in this comment.

   ── The shape of the calculation ──

     volume  = length x width x depth              (from the drawing)
     dig     = volume / rate x depth x surface     (+ setup, once)
     lay     = length / lay rate, per utility      (x joint allowance)

   Depth and surface are multipliers rather than separate rates because
   they are independent of each other and of the machine: a 13 tonne
   machine and a 3 tonne machine both slow down in the same proportion
   when the trench gets deep enough to need supporting, and both have to
   get through the same tarmac first.

   ── What is not in here ──

   Reinstatement, scanning and trial holes, bedding and surround
   material, and traffic management. The surface multiplier covers
   breaking out, not making good. Backfill is not counted either. This
   answers "how long to open it and lay it", which is the question the
   trench dimensions can actually answer; everything else needs
   information the drawing does not hold. */

/* Machine output in cubic metres an hour, digging trench in unmade
   ground: a verge, a haul road, ground that was never made up.

   Unmade is the baseline because it is the honest middle of the range —
   soft enough that the machine is the constraint rather than the
   surface, hard enough that it is not a special case. Everything else
   is a multiplier off it.

   The rate is for the machine working: spoil to the side, banksman,
   trimming as it goes. It is not a gang rate for the whole operation. */
export const DEFAULT_DIG_RATES = [
  { key: "micro_1_5t", label: "1.5t micro", baseRateM3Hr: 2.5, setupMinutes: 15 },
  { key: "mini_3t", label: "3t mini", baseRateM3Hr: 4.5, setupMinutes: 15, isDefault: true },
  { key: "midi_5t", label: "5t midi", baseRateM3Hr: 7.0, setupMinutes: 20 },
  { key: "excavator_8t", label: "8t excavator", baseRateM3Hr: 10.0, setupMinutes: 20 },
  { key: "excavator_13t", label: "13t excavator", baseRateM3Hr: 15.0, setupMinutes: 25 },
];

/* How much slower the same machine is as the trench deepens.

   Not a cubic-metre effect — the multiplier is applied after the
   volume, so it is not double counting the extra dig. It is the things
   that change with depth and not with quantity: the spoil has further
   to travel, the accuracy matters more, and past about a metre the
   sides have to be battered or a box put in.

   The step at 1.20m is the largest and it is the real one. Below it a
   trench is dug; above it a trench is dug and supported, and support is
   a separate operation happening in the same hole. */
export const DEFAULT_DEPTH_FACTORS = [
  { fromM: 0, toM: 0.60, factor: 1.00, note: "Straightforward dig" },
  { fromM: 0.60, toM: 1.00, factor: 1.15, note: "Spoil lift and accuracy" },
  { fromM: 1.00, toM: 1.20, factor: 1.30, note: "Battering starts" },
  { fromM: 1.20, toM: null, factor: 1.60, note: "Supported — box or full batter" },
];

/* How much slower each surface is than unmade ground.

   Held on GIS_Surface_Type rather than here, because the trench already
   records its surface and a second list keyed by the same six values is
   a second place to remember them. These are the fallback for a surface
   row with no factor on it, matched by key.

   Softer than unmade goes below 1. Made surfaces go above it, and the
   number is the breaking out: a 3/4 carriageway is not twice the dig,
   it is the dig plus getting through the construction above it. */
export const DEFAULT_SURFACE_FACTORS = {
  agricultural: 0.85,
  verge: 0.90,
  unmade: 1.00,
  footway: 1.45,
  carriageway_12: 1.75,
  carriageway_34: 2.10,
};

/* The surface a trench with none set is estimated as.

   Unmade, which is the baseline and the middle of the range. Guessing
   carriageway would inflate every unanswered trench on the drawing;
   guessing verge would flatter it. Neither is better than saying which
   was assumed, which is what `surfaceAssumed` on the result is for. */
export const DEFAULT_SURFACE_KEY = "unmade";

/* Laying rate in metres an hour, in an open trench, by utility.

   Per utility rather than per size: the difference between 63mm and
   180mm is small next to the difference between drawing in a cable and
   jointing pipe, and inventing a size band here would be false
   precision on top of an estimate.

   Cable is quickest because it is drawn rather than assembled. Pipe is
   slower and gas slower than water, for the testing that goes with it. */
export const DEFAULT_LAY_RATES = {
  electric: 30,
  telecoms: 40,
  water: 25,
  gas: 22,
  other: 25,
};

/* What laying more than one utility in the same trench saves.

   Not nothing and not everything. The gang is already there, the trench
   is already open and the spoil is already handled, so the second
   utility does not repeat the setup — but two mains still have to be
   laid one after the other, and a joint trench is more careful work
   than a single. Applied to the total once, only where there is more
   than one thing to lay. */
export const JOINT_LAY_FACTOR = 0.85;

const round = (v, dp = 2) => Math.round(v * 10 ** dp) / 10 ** dp;

/* The rate to use when nobody has chosen one.

   The row flagged default, or failing that the first — a list with no
   flag is a seeding mistake rather than a reason to return nothing. */
export function defaultRate(rates = DEFAULT_DIG_RATES) {
  const list = rates?.length ? rates : DEFAULT_DIG_RATES;
  return list.find((r) => r.isDefault) ?? list[0];
}

export function rateFor(machineKey, rates = DEFAULT_DIG_RATES) {
  const list = rates?.length ? rates : DEFAULT_DIG_RATES;
  return list.find((r) => r.key === machineKey) ?? defaultRate(list);
}

/* The band a depth falls in.

   Bands are half open — from inclusive, to exclusive — so a trench at
   exactly 0.60m takes the shallower band and cannot match two. The last
   band has no ceiling; anything deeper than the table describes belongs
   to it rather than to nothing. */
export function depthFactorFor(depthM, bands = DEFAULT_DEPTH_FACTORS) {
  const list = bands?.length ? bands : DEFAULT_DEPTH_FACTORS;
  const d = Number(depthM) || 0;
  const hit = list.find((b) =>
    d >= (b.fromM ?? 0) && (b.toM == null || d < b.toM));
  return hit ?? list[list.length - 1];
}

/* The surface multiplier, off the surface row where it carries one.

   `surfaceTypes` are the GIS_Surface_Type rows the canvas already
   loads. Dig_Factor is read from the row so the six surfaces stay in
   one place; the constant here is only for a database that predates
   the column. */
export function surfaceFactorFor(surfaceKey, surfaceTypes = []) {
  const key = surfaceKey || DEFAULT_SURFACE_KEY;
  const row = (surfaceTypes || []).find((s) => s.Surface_Key === key);
  const stored = Number(row?.Dig_Factor);
  if (stored > 0) return { factor: stored, label: row?.Label ?? key, key };
  return {
    factor: DEFAULT_SURFACE_FACTORS[key] ?? 1.0,
    label: row?.Label ?? key,
    key,
  };
}

export function layRateFor(utility, layRates = DEFAULT_LAY_RATES) {
  const table = layRates && Object.keys(layRates).length ? layRates : DEFAULT_LAY_RATES;
  return table[utility] ?? table.other ?? DEFAULT_LAY_RATES.other;
}

/* How long this length takes to open and to lay.

   `size` is what trenchSize() returned — the width and depth worked out
   from the contents — and `lengthM` is measured off the line. Passing
   the size in rather than the contents keeps this ignorant of NJUG: it
   estimates a hole of a given size, whatever decided the size.

   `utilities` is one entry per thing laid, as utility keys, so two gas
   mains in one trench are two lays and not one.

   Everything the answer was made from comes back with it. A duration on
   a programme gets questioned, and "the system said 4 hours" is not an
   answer somebody can check. */
export function digEstimate({
  lengthM = 0,
  size = null,
  surfaceKey = null,
  utilities = [],
  machineKey = null,
  rates = DEFAULT_DIG_RATES,
  depthBands = DEFAULT_DEPTH_FACTORS,
  layRates = DEFAULT_LAY_RATES,
  surfaceTypes = [],
} = {}) {
  const L = Number(lengthM) || 0;
  const W = Number(size?.widthM) || 0;
  const D = Number(size?.depthM) || 0;

  /* No dimensions is no estimate, not a zero. A trench with nothing
     routed in it has no width and no depth yet, and "0 hours" reads as
     a finished job rather than an unanswered question. */
  if (!(L > 0) || !(W > 0) || !(D > 0)) {
    return {
      ok: false,
      note: !(L > 0)
        ? "No length measured for this trench."
        : "Nothing is laid in this trench, so it has no size to dig.",
    };
  }

  const rate = rateFor(machineKey, rates);
  const band = depthFactorFor(D, depthBands);
  const surface = surfaceFactorFor(surfaceKey, surfaceTypes);

  const volumeM3 = L * W * D;
  const digHours = (volumeM3 / rate.baseRateM3Hr) * band.factor * surface.factor;
  const setupHours = (rate.setupMinutes ?? 0) / 60;

  /* One lay per thing in the trench, at that utility's rate. */
  const laid = (utilities || []).filter(Boolean);
  const lays = laid.map((u) => ({
    utility: u,
    rateMHr: layRateFor(u, layRates),
    hours: L / layRateFor(u, layRates),
  }));
  const rawLayHours = lays.reduce((t, x) => t + x.hours, 0);
  const jointFactor = lays.length > 1 ? JOINT_LAY_FACTOR : 1;
  const layHours = rawLayHours * jointFactor;

  const totalHours = digHours + setupHours + layHours;

  return {
    ok: true,
    /* The answer. */
    volumeM3: round(volumeM3),
    digHours: round(digHours, 2),
    setupHours: round(setupHours, 2),
    layHours: round(layHours, 2),
    totalHours: round(totalHours, 2),

    /* The working, in the order it was done. */
    lengthM: round(L, 1),
    widthM: round(W),
    depthM: round(D),
    machine: rate.label,
    machineKey: rate.key,
    baseRateM3Hr: rate.baseRateM3Hr,
    depthFactor: band.factor,
    depthBandNote: band.note ?? null,
    surfaceFactor: surface.factor,
    surfaceLabel: surface.label,
    surfaceAssumed: !surfaceKey,
    lays,
    jointFactor,

    /* Said on every screen that shows the figure, because the figure
       looks like the NJUG ones beside it and is not the same kind of
       thing at all. */
    basis: rate.sampleSize > 0
      ? `From ${rate.sampleSize} recorded job${rate.sampleSize === 1 ? "" : "s"}`
      : "Planning estimate — not measured",
  };
}

/* The same, over a set of trenches.

   Summed rather than averaged, and the setup counted once per trench
   because each is a separate move of the machine. Where that is wrong —
   four trenches meeting at one junction are one setup, not four — it is
   wrong in the safe direction. */
export function digEstimateTotal(estimates = []) {
  const ok = estimates.filter((e) => e?.ok);
  const sum = (f) => ok.reduce((t, e) => t + (e[f] ?? 0), 0);
  return {
    trenches: ok.length,
    skipped: estimates.length - ok.length,
    lengthM: round(sum("lengthM"), 1),
    volumeM3: round(sum("volumeM3")),
    digHours: round(sum("digHours"), 2),
    setupHours: round(sum("setupHours"), 2),
    layHours: round(sum("layHours"), 2),
    totalHours: round(sum("totalHours"), 2),
  };
}

/* Hours as something a person reads.

   Under a day in hours, over it in days at the length of a working one,
   because "23.4 hours" is a number somebody has to divide before it
   means anything to a programme. */
export const HOURS_PER_DAY = 8;

export function hoursText(hours) {
  const h = Number(hours) || 0;
  if (h <= 0) return "\u2014";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < HOURS_PER_DAY) return `${round(h, 1)} hr`;
  const days = h / HOURS_PER_DAY;
  return `${round(days, 1)} day${days >= 1.95 ? "s" : ""}`;
}
