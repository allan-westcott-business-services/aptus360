/* Bulk delete: categories of thing, rather than a selection.

   A port of the original's gisBulkDeleteCats. Clearing a drawing is not
   a selection job — nobody rubber-bands four hundred service trenches.
   It is "get rid of all the meters", and the categories are the shapes
   that sentence takes.

   Each category carries a live count, so you can see what you are about
   to remove before ticking it, and the ticked ones are unioned and
   deduped: All Electric and All Meters overlap, and an electric meter
   should be deleted once and counted once.

   Pure so it can be tested. Doing the deleting is the canvas's job. */

const typeOf = (f) => String(f.Attributes?.Line_Type ?? "");
const isLine = (f) => f.Feature_Type === "line";

/* A trench is anything on the trench layer. Matching on the type key
   alone would miss a trench drawn with a type someone added later. */
const isTrench = (f, lineTypes) => {
  if (f.Layer_Key === "trench") return true;
  const t = lineTypes.find((x) => x.Type_Key === typeOf(f));
  return t ? t.Layer_Key === "trench" : typeOf(f).includes("trench");
};

export function bulkDeleteCategories(features = [], opts = {}) {
  const { lineTypes = [], layers = [] } = opts;

  const cats = [];
  const add = (key, label, pred, group) => cats.push({ key, label, pred, group });

  /* By utility first: the commonest clear-down is one service at a
     time — take the gas out and start again. */
  for (const l of layers) {
    if (!["electric", "gas", "water", "lighting"].includes(l.Layer_Key)) continue;
    add(`layer:${l.Layer_Key}`, `All ${l.Label} objects`,
      (f) => f.Layer_Key === l.Layer_Key, "Utility");
  }

  /* And by utility and kind together.

     "All services" takes the gas and the water with the electric, which
     is rarely what someone redoing one utility wants. The whole-layer
     entries above are too coarse for it and the by-kind entries below
     too broad; this is the pairing that gets used.

     Every kind is offered on every utility rather than only where it can
     exist. Joints and span nodes are electric, so their gas and water
     entries count nothing — and an entry reading zero is disabled and
     dimmed, which says "there are none of these" more plainly than an
     absence, and cannot be mistaken for a category nobody thought of. */
  for (const l of layers) {
    if (!["electric", "gas", "water", "lighting"].includes(l.Layer_Key)) continue;
    const on = (f) => f.Layer_Key === l.Layer_Key;
    const kinds = [
      ["main", "mains (cable / pipe)",
        (f) => isLine(f) && typeOf(f).includes("_main") && !isTrench(f, lineTypes)],
      ["service", "services (cable / pipe)",
        (f) => isLine(f) && typeOf(f).includes("_service") && !isTrench(f, lineTypes)],
      ["meter", "meters", (f) => f.Feature_Role === "meter"],
      ["joint", "joints / connectors", (f) => f.Feature_Role === "joint"],
      ["spannode", "span nodes", (f) => f.Feature_Role === "spannode"],
    ];
    for (const [key, what, pred] of kinds) {
      add(`${l.Layer_Key}:${key}`, `${l.Label} \u2014 ${what}`,
        (f) => on(f) && pred(f), `${l.Label} only`);
    }
  }

  add("main", "All mains (cable / pipe)",
    (f) => isLine(f) && typeOf(f).includes("_main") && !isTrench(f, lineTypes), "Lines");
  add("service", "All services (cable / pipe)",
    (f) => isLine(f) && typeOf(f).includes("_service") && !isTrench(f, lineTypes), "Lines");
  add("hv", "All HV cables",
    (f) => isLine(f) && typeOf(f) === "elec_hv", "Lines");
  /* Only what the router drew. A cable someone drew by hand is a
     decision, and rebuilding is not the same as discarding. */
  add("generated", "All generated LV feeders",
    (f) => isLine(f) && !!f.Attributes?.Generated, "Lines");

  add("tmain", "All mains trenches",
    (f) => isTrench(f, lineTypes) && !typeOf(f).includes("service"), "Trenches");
  add("tserv", "All service trenches",
    (f) => isTrench(f, lineTypes) && typeOf(f).includes("service"), "Trenches");
  add("trench", "All trenches",
    (f) => isTrench(f, lineTypes), "Trenches");

  add("meter", "All meters", (f) => f.Feature_Role === "meter", "Points");
  add("joint", "All joints", (f) => f.Feature_Role === "joint", "Points");
  add("linkbox", "All link boxes", (f) => f.Feature_Role === "linkbox", "Points");
  add("column", "All lighting columns", (f) => f.Feature_Role === "column", "Points");
  add("seed", "All plot seeds", (f) => f.Feature_Role === "plot", "Points");
  add("poc", "All POCs", (f) => f.Feature_Role === "poc", "Points");
  add("substation", "All substations", (f) => f.Feature_Role === "substation", "Points");
  add("spannode", "All span nodes", (f) => f.Feature_Role === "spannode", "Points");

  add("boundary", "Site boundary", (f) => f.Layer_Key === "boundary", "Everything");
  add("all", "Everything on the drawing", () => true, "Everything");

  /* Counted once, here, rather than by each render. */
  return cats.map((c) => {
    const ids = features.filter(c.pred).map((f) => f.Feature_ID);
    return { ...c, count: ids.length, ids };
  });
}

/* What ticking these categories would remove. Deduped, because the
   categories overlap by design — All Electric and All Meters both claim
   an electric meter, and it should be deleted once. */
export function idsForKeys(categories, keys) {
  const want = new Set(keys);
  const ids = new Set();
  for (const c of categories) {
    if (!want.has(c.key)) continue;
    for (const id of c.ids) ids.add(id);
  }
  return [...ids];
}

/* Grouped for display, in the order the categories were declared. */
export function groupCategories(categories) {
  const out = [];
  for (const c of categories) {
    let g = out.find((x) => x.label === c.group);
    if (!g) { g = { label: c.group, items: [] }; out.push(g); }
    g.items.push(c);
  }
  return out;
}
