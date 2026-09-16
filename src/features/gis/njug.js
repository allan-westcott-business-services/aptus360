/* Where the industry says apparatus goes, and how deep.

   The figures below are from NJUG Volume 1, Issue 8 (29.10.2013) —
   Table 1 for cover depths by surface, and Figure 1 for the order and
   spacing of apparatus across a two-metre footway. They are recorded
   as DATA rather than drawn into a diagram, so that when somebody asks
   where a number on a section came from there is one place to look and
   one place to change it.

   ── Three things to be clear about before anybody trusts a drawing
      built on this ──

   1. These are RECOMMENDED MINIMA and industry practice, not law.
      NJUG says so itself: there is no statutory obligation governing
      the position or depth of apparatus, and it should not be assumed
      that what is in the ground conforms.

   2. An asset owner's own specification OVERRIDES this. A DNO or a NAV
      may require more cover, or a different position, and theirs is
      the figure that governs their apparatus. That is why every number
      here is a default meant to be replaced by an operator's own row,
      not a constant compiled into the section drawing.

   3. Depths are to the CROWN of the apparatus — the top of the pipe or
      duct — measured from finished surface level. A section that
      measured to the centre or the invert would be wrong by a
      diameter, which on a 180mm main is the difference between
      compliant and not.

   Issue 8 dates from 2013. Anyone maintaining this should check it is
   still the current issue before relying on it for a drawing that
   leaves the office. */

/* Cover to the crown, in millimetres, by surface.

   `min` and `max` where the guidance gives a range; `max` null where
   it gives a single figure, which means "at least this" rather than
   "exactly this". Kept in millimetres because that is the unit the
   guidance and every utility specification use — converting to metres
   here would invite a factor-of-a-thousand mistake in the one place
   it matters most. */
export const NJUG_COVER_MM = {
  electric_hv: {
    label: "Electricity HV",
    footway: { min: 450, max: 1200 },
    carriageway: { min: 750, max: 1200 },
  },
  electric_lv: {
    label: "Electricity LV",
    footway: { min: 450, max: null },
    carriageway: { min: 600, max: null },
  },
  gas: {
    label: "Gas",
    /* The guidance distinguishes footway from verge for gas alone:
       600mm in a footway, 750mm in a verge. Verge is given its own
       entry rather than being folded into footway, because folding it
       would quietly lose 150mm on every verge section. */
    footway: { min: 600, max: null },
    verge: { min: 750, max: null },
    carriageway: { min: 750, max: null },
  },
  water: {
    label: "Water",
    footway: { min: 750, max: null },
    carriageway: { min: 750, max: null },
  },
  water_non_potable: {
    label: "Water (non-potable / grey)",
    footway: { min: 600, max: 750 },
    carriageway: { min: 600, max: 750 },
  },
  communications: {
    label: "Communications",
    footway: { min: 250, max: 350 },
    carriageway: { min: 450, max: 600 },
  },
  sewerage: {
    label: "Sewerage",
    /* Given as variable, because a sewer's depth follows its fall
       rather than a cover rule. Stated as null so a section says
       "set by levels" instead of inventing a figure. */
    footway: null,
    carriageway: null,
  },
  oil_fuel: {
    label: "Oil / fuel pipeline",
    footway: { min: 900, max: null },
    carriageway: { min: 900, max: null },
    /* Not a depth matter, but it belongs beside the depth because it
       is what somebody needs to know when one appears on a section. */
    warning: "All work within 3 metres of an oil or fuel pipeline must "
      + "receive prior approval.",
  },
};

/* Across a two-metre footway, from the property boundary.

   Figure 1's order and its running dimensions: 450 to the electricity,
   then 295, 295, 270, 260 between the rest, and 430 from the last to
   the carriageway — which sums to the 2000mm the figure is drawn for.

   Held as offsets FROM THE BOUNDARY rather than as gaps between
   neighbours, because that is what a section needs to place them and
   because a missing utility then leaves the others where they were. A
   footway with no communications duct does not shuffle the gas 295mm
   towards the boundary. */
export const NJUG_FOOTWAY_ORDER = [
  { key: "electric", fromBoundaryMm: 450, label: "Electricity" },
  { key: "communications_catv", fromBoundaryMm: 745, label: "Cable TV / comms" },
  { key: "gas", fromBoundaryMm: 1040, label: "Gas" },
  { key: "water", fromBoundaryMm: 1310, label: "Water" },
  { key: "communications", fromBoundaryMm: 1570, label: "Telecommunications" },
];

export const NJUG_FOOTWAY_WIDTH_MM = 2000;

/* The colour a section draws apparatus in.

   NJUG's colour coding is about what is IN THE GROUND — the duct, the
   pipe, the marker tape — so a section drawn in these colours reads
   the way the trench looks when it is open, which is the point of a
   cross-section. Where the drawing's own GIS styles disagree, the
   styles win for on-screen consistency; these are the fallback and the
   answer to "what colour should this be". */
export const NJUG_COLOUR = {
  electric_hv: "#dc2626",
  electric_lv: "#000000",
  gas: "#eab308",
  water: "#2563eb",
  water_non_potable: "#2563eb",
  communications: "#9ca3af",
  communications_catv: "#16a34a",
  sewerage: "#000000",
  oil_fuel: "#000000",
};

/* Which NJUG entry a drawing feature answers to.

   The drawing thinks in its own layers and line types; the guidance
   thinks in utilities and voltages. One place for the translation, so
   a section and any future compliance check cannot disagree about
   whether an HV cable is an HV cable. */
export function njugKeyFor(f, opts = {}) {
  const { lineTypes = [] } = opts;
  const key = String(f?.Attributes?.Line_Type ?? "");
  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f?.Layer_Key ?? "";

  if (layer === "electric" || /^elec/.test(key)) {
    return /hv/i.test(key) ? "electric_hv" : "electric_lv";
  }
  if (layer === "gas" || /^gas/.test(key)) return "gas";
  if (layer === "water" || /^water/.test(key)) return "water";
  if (/catv|cable_tv/i.test(key)) return "communications_catv";
  if (/comm|telecom|bt|duct/i.test(key)) return "communications";
  if (/sewer|foul|storm/i.test(key)) return "sewerage";
  return null;
}

/* The cover this apparatus should have here, or null where the
   guidance sets none (a sewer, whose depth follows its fall).

   `surface` is the drawing's own surface type, lower-cased: footway,
   verge, carriageway. Anything else is treated as a footway, which is
   the more onerous reading for communications and the less onerous for
   electricity — so a section says which surface it assumed, and this
   returns it for the caller to print. */
export function coverFor(njugKey, surface = "footway") {
  const row = NJUG_COVER_MM[njugKey];
  if (!row) return null;
  const named = njugSurface(surface);
  /* Verge falls back to footway for every utility but gas, which is
     the only one the guidance separates. */
  const band = row[named.key] ?? row.footway ?? null;
  if (!band) return null;
  return { ...band, surface: named.key, surfaceSaid: named.said,
    assumed: named.assumed, label: row.label, warning: row.warning };
}

/* Which of the guidance's three surfaces a drawing's surface answers
   to.

   The drawing has six and the guidance has three, so four of them need
   a decision made about them. By KEY, from the drawing's own
   `GIS_Surface_Type` — footway, carriageway_12, carriageway_34,
   unmade, verge, agricultural — rather than by matching words in a
   label, which breaks the day somebody renames one in admin.

     footway          footway    the guidance's own
     carriageway_12   carriageway
     carriageway_34   carriageway
     verge            verge
     unmade           footway    the operator's decision, recorded here
     agricultural     verge      NOT decided — read as a verge, and the
                                 section says it had to choose

   `unmade` is not an NJUG surface. It is worked to the FOOTWAY figures
   because that is what this operator has decided, not because the
   guidance says so — so it is marked as a policy rather than an
   assumption, and the section says which column it used without
   implying the guidance named it.

   `agricultural` has no decision yet and no NJUG column. It reads as a
   verge, marked assumed, which makes the section admit the depth was
   inferred. Ploughing depth is the reason this deserves a real answer
   rather than my guess: an inferred cover on agricultural land is the
   kind of number that gets a main struck by a subsoiler. */
const SURFACE_TO_NJUG = {
  footway: { key: "footway" },
  carriageway_12: { key: "carriageway" },
  carriageway_34: { key: "carriageway" },
  verge: { key: "verge" },
  unmade: { key: "footway", policy: true },
  agricultural: { key: "verge", assumed: true },
};

export function njugSurface(surface) {
  const raw = String(surface || "").trim();
  const known = SURFACE_TO_NJUG[raw.toLowerCase()];
  if (known) {
    return {
      key: known.key,
      said: raw.toLowerCase(),
      assumed: !!known.assumed,
      /* Mapped by somebody's decision rather than by the guidance, so
         the section can say so without calling it a guess. */
      policy: !!known.policy,
    };
  }

  /* Anything added to the surface table later, or a label passed where
     a key was expected. Matched on words as a last resort and always
     marked assumed: a surface nobody has decided about should not
     borrow a figure quietly. */
  const s = raw.toLowerCase();
  if (s.includes("carriage") || s.includes("road")) {
    return { key: "carriageway", said: s, assumed: true, policy: false };
  }
  if (s.includes("verge")) return { key: "verge", said: s, assumed: true, policy: false };
  if (s.includes("foot") || s.includes("path")) {
    return { key: "footway", said: s, assumed: true, policy: false };
  }
  return { key: "footway", said: s || "footway", assumed: true, policy: false };
}
