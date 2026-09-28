/* Sorting the style rules into sections and items.

   ── Why ──

   GIS Styles was one flat list. Every rule sat at the same level, so a
   rule saying "off-site electric mains, 185mm, as-laid, for this IDNO"
   had the same standing on screen as "electric". Finding the one you
   wanted meant reading scope lines down a list that grows every time
   anybody narrows anything.

   Asked for: sections, one line per THING, and the variations of a
   thing folded inside it. So Electric › Cable is one line, and the
   on-site and off-site, the voltages, the sizes and the operators live
   under it.

   ── The shape ──

   Section  what the rule is about: the utility, the dig, or the site
            itself. Taken from the layer, because that is what the
            drawing already uses to separate them.

   Item     the thing being styled: a role (POC, Meter, Joint) or a kind
            of line (Mains Trench, Cable). One line in the list.

   Variant  a rule that narrows the item further — by Site, by supply
            type, by operator, by size, by build status. Folded under
            its item and counted, not listed, until somebody opens it.

   ── What this does NOT do ──

   It does not change a rule, reorder the cascade, or merge anything.
   Specificity is still scored in gisStyle.js from the scope columns,
   exactly as before; this only decides where a rule is DRAWN on an
   admin screen. A grouping that quietly changed which rule won would be
   a rendering change with teeth, and this has none: feed it the rows,
   get the same rows back, arranged. `countRows` holds that. */

/* The sections, in the order they were asked for. Anything whose layer
   is not named here gets a section of its own, after these, so a new
   utility appears without this file being edited — the fault the ROLES
   list in GisStylesAdmin has had twice, where a thing on the drawing
   could not be styled because a list here had not caught up. */
export const SECTIONS = [
  { key: "site", label: "General Site Styles" },
  { key: "trench", label: "Trench" },
  { key: "electric", label: "Electric" },
  { key: "gas", label: "Gas" },
  { key: "water", label: "Water" },
  { key: "lighting", label: "Street Lighting" },
];

/* ── The order items read in ──

   Asked for as a list, and the list is not alphabetical: POC,
   Substation, Cable, MSDB, Link Box, Meter, Joints, Heavy Duty Cut Out.
   That is the order a network is built in — the source, then the plant,
   then what runs between them, then what hangs off it — and it is the
   same order the Electric menu's bands were put in for the same reason.
   Alphabetical is easy to sort and tells you nothing.

   One list for every utility rather than one per section: a gas
   governor and an electric substation are the same thing in the same
   place, and a second list would be a second thing to keep in step.
   Anything not named here follows, alphabetically, so a role added to
   the drawing appears without this file being edited. */
const ITEM_ORDER = [
  "role:poc", "role:source",
  "role:substation", "role:governor", "role:pumping",
  "family", "lt",
  "role:msdb", "role:linkbox", "role:feederpoint",
  "role:meter", "role:nrs", "role:servicevalve",
  "role:joint", "role:hvtt", "role:reducer", "role:washout",
  "role:hdcutout", "role:column", "role:spannode",
];

/* A family or line-type item sorts as its kind, so "Cable" and "Pipe"
   land in the same place whatever they are called. */
const orderKey = (key) => (key.startsWith("family:") ? "family"
  : key.startsWith("lt:") ? "lt" : key);

const orderOf = (key) => {
  const i = ITEM_ORDER.indexOf(orderKey(key));
  return i < 0 ? ITEM_ORDER.length : i;
};

/* ── Where a role lives when the rule names no layer ──

   Most rules scope a role and stop: "Meter", "Joint", "POC". With no
   layer to file them under they all landed in General Site Styles,
   which put the whole of Electric in the wrong section — reported, and
   fair.

   So a role says where it belongs. Three of these are shared in truth:
   a POC, a meter and a joint exist on gas and water too, and a rule
   naming one and no layer really does apply to all three. They are
   filed under Electric because that is where they are worked on and
   where somebody goes to look — while the scope line under the item
   still says the rule names no layer, which is where the truth is
   kept. Narrowing such a rule with a layer moves it to that utility,
   which is the honest way to have it both ways.

   A role missing from here falls to General Site Styles: a place
   somebody will find it, rather than a guess at a utility. */
const ROLE_SECTION = {
  // the site itself
  plot: "site", boundary: "site", shape: "site",
  // the dig
  spannode: "trench",
  // electric, including the three that are shared
  poc: "electric", source: "electric", meter: "electric", joint: "electric",
  substation: "electric", msdb: "electric", linkbox: "electric",
  feederpoint: "electric", nrs: "electric", hdcutout: "electric",
  // gas
  governor: "gas", hvtt: "gas", reducer: "gas",
  // water
  servicevalve: "water", washout: "water", pumping: "water",
  // street lighting
  column: "lighting",
};

/* Layers that are about the site rather than a utility or the dig. */
/* `plot`, singular, is the real key — this had the plural and nothing
   else, so the layer default for plots was filed under a section of its
   own called "Plot", after Street Lighting. Both are listed rather than
   one corrected, because guessing a key's number twice is worse than
   accepting either. */
const SITE_LAYERS = new Set([
  "site", "boundary", "annotation", "plot", "plots",
]);

/* ── Working out the layer where nothing says it ──

   The Styles screen is deliberately self-contained: it reads the rules
   and nothing else, because layers and line types come from the canvas
   endpoint and that needs a project. So a rule carrying only a line
   type has no layer to be filed under, and the key is the only
   evidence there is.

   The keys are prefixed by convention — trench_main, elec_hv, gas_main
   — and this reads that prefix. It is a FALLBACK and is written as one:
   pass real line-type rows and they win. An unrecognised prefix files
   the rule under the general section, where somebody will find it,
   rather than inventing a section for a guess. */
const LAYER_BY_PREFIX = [
  ["trench_", "trench"],
  ["elec_", "electric"],
  ["gas_", "gas"],
  ["water_", "water"],
];

export function layerFromTypeKey(key) {
  const k = String(key || "");
  for (const [prefix, layer] of LAYER_BY_PREFIX) if (k.startsWith(prefix)) return layer;
  return null;
}

const titleCase = (s) => String(s || "")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (c) => c.toUpperCase())
  .trim();

/* Which section a rule belongs in.

   The layer decides, because the layer is what the drawing uses. A rule
   with no layer is placed by its role, then by its line type's layer —
   so "Meter, any layer" still lands under the utility it is about,
   rather than in a catch-all nobody looks in. */
export function sectionOf(row, { lineTypes = [] } = {}) {
  const lt = row.Line_Type
    ? lineTypes.find((t) => t.Type_Key === row.Line_Type)
    : null;
  const layer = row.Layer_Key ?? lt?.Layer_Key
    ?? layerFromTypeKey(row.Line_Type) ?? null;

  if (layer === "trench") return "trench";
  if (layer && SITE_LAYERS.has(layer)) return "site";
  if (layer) return layer;

  /* No layer on the rule. The role can still say what it is about. */
  if (row.Feature_Role && ROLE_SECTION[row.Feature_Role]) {
    return ROLE_SECTION[row.Feature_Role];
  }

  /* Nothing says. It applies across the drawing, so it belongs with the
     general rules rather than being hidden under one utility. */
  return "site";
}

/* Which item within that section.

   A role names the thing outright. Failing that, a line type does — and
   line types collapse to the family they belong to, so elec_hv and
   elec_main are both "Cable" and the voltage is a variant inside it.
   That is the whole point of the exercise: one line per thing. */
export function itemOf(row, { lineTypes = [], roleLabels = {} } = {}) {
  if (row.Feature_Role) {
    return {
      key: `role:${row.Feature_Role}`,
      label: roleLabels[row.Feature_Role] ?? titleCase(row.Feature_Role),
    };
  }

  if (row.Line_Type) {
    const lt = lineTypes.find((t) => t.Type_Key === row.Line_Type);
    const layer = row.Layer_Key ?? lt?.Layer_Key
      ?? layerFromTypeKey(row.Line_Type) ?? null;
    /* A utility's lines are all "Cable" or "Pipe" — one item, with the
       voltage, the size and the rest as variants under it. The dig is
       different: a mains trench and a service trench are two things
       that get dug at different times by different gangs, and they were
       asked for as separate items. */
    if (layer === "trench") {
      /* Named from the line type where the rows are available, and
         otherwise from the rule itself in buildTree — "Mains Trench"
         rather than "Trench Main", which is what titleCasing a key
         gives and is not what anybody calls it. */
      return {
        key: `lt:${row.Line_Type}`,
        label: lt?.Label ?? null,
        fallback: titleCase(row.Line_Type),
      };
    }
    const family = layer === "electric" ? "Cable"
      : layer === "gas" || layer === "water" ? "Pipe"
        : "Line";
    return { key: `family:${layer ?? "any"}`, label: family };
  }

  /* Layer only: the rule the whole layer falls back to.

     Named from the rule itself where there is one, in buildTree — a
     section holding several layers cannot call them all "Everything
     else" and expect anybody to tell them apart, which is exactly the
     question this drew: "what is the difference between Plots and Plot
     Seed?" One is the plot LAYER's fallback and the other is the seed
     SYMBOL, and the names are the only thing on screen that can say
     so. */
  if (row.Layer_Key) {
    return { key: `layer:${row.Layer_Key}`, label: null, fallback: "Everything else" };
  }

  return { key: "any", label: "Everything" };
}

/* Is this rule a variant of its item, or the item's own base rule?

   A base rule names the thing and stops. A variant narrows it further —
   which is exactly the set of columns that are NOT what the item was
   named from. */
export function isVariant(row) {
  return row.Site != null
    || row.Supply_Type != null
    || row.Organisation_ID != null
    /* A condition narrows the thing, which is the definition of a
       variation. Without this, "Electric main, planned" would stand
       beside "Electric main" as a second item with the same name and
       nothing on screen to tell them apart — the fault Supply_Type
       had on this screen before it was named in the scope line. */
    || (Array.isArray(row.Conditions)
      && row.Conditions.some((c) => c && c.field));
}

/* The tree. Sections in the order above, then any unnamed layer; items
   alphabetical within a section, except that the item holding a
   section's fallback rule sorts last, because it is the thing the
   others are exceptions to. */
export function buildTree(rows = [], opts = {}) {
  const bySection = new Map();

  for (const row of rows) {
    const sKey = sectionOf(row, opts);
    if (!bySection.has(sKey)) bySection.set(sKey, new Map());
    const items = bySection.get(sKey);

    const item = itemOf(row, opts);
    if (!items.has(item.key)) {
      items.set(item.key, {
        key: item.key, label: item.label, fallback: item.fallback ?? null, rows: [],
      });
    }
    items.get(item.key).rows.push(row);
  }

  const known = SECTIONS.map((s) => s.key);
  const extra = [...bySection.keys()]
    .filter((k) => !known.includes(k))
    .sort();

  const order = [...known, ...extra];
  const labelFor = (k) => SECTIONS.find((s) => s.key === k)?.label
    ?? (opts.layerLabels?.[k] ?? titleCase(k));

  return order
    .filter((k) => bySection.has(k))
    .map((k) => {
      const items = [...bySection.get(k).values()]
        .map((it) => ({
          ...it,
          /* ── The name somebody gave it ──

             An item with no label of its own takes the name of its base
             rule. The screen cannot see line-type labels, but every
             rule carries a Style_Name that a person wrote, and "Mains
             trench" beats anything derivable from `trench_main`. Only
             where there is exactly one base rule: with several, the
             item is the family they share and one of their names would
             be a lie about the other. */
          label: it.label ?? (() => {
            const base = it.rows.filter((x) => !isVariant(x));
            return base.length === 1 && base[0].Style_Name
              ? base[0].Style_Name
              : it.fallback ?? "Everything";
          })(),
          /* The base rules first, then what narrows them — the order
             somebody reads them in when asking why something looks the
             way it does. */
          rows: it.rows.slice().sort((a, b) =>
            (isVariant(a) - isVariant(b))
            || String(a.Style_Name ?? "").localeCompare(String(b.Style_Name ?? ""))),
          variants: it.rows.filter(isVariant).length,
        }))
        .sort((a, b) => {
          /* The layer's own fallback rule sorts last wherever it is: it
             is the thing every other item is an exception to. */
          const fallback = (x) => (x.key.startsWith("layer:") || x.key === "any" ? 1 : 0);
          return fallback(a) - fallback(b)
            || orderOf(a.key) - orderOf(b.key)
            || a.label.localeCompare(b.label);
        });
      return { key: k, label: labelFor(k), items };
    });
}

/* Every rule appears exactly once. The grouping must not lose a rule or
   show one twice: a rule that has vanished from this screen is a rule
   nobody can edit, and it goes on styling the drawing regardless. */
export function countRows(tree = []) {
  return tree.reduce((n, s) =>
    n + s.items.reduce((m, it) => m + it.rows.length, 0), 0);
}
