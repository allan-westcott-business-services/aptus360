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
  /* Parents, plural. A per-utility kind belongs to two broader entries at
     once — "All Electric objects" and "All meters" — and ticking either
     should tick it. One parent was enough while only the utility rows
     cascaded; it is not once the Points rows do too. */
  const add = (key, label, pred, group, parents = []) =>
    cats.push({ key, label, pred, group, parents });

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
    /* What each utility actually has.

       Not the same list everywhere. A substation is electric and a
       governor is gas; electric carries cable where gas and water carry
       pipe; and the point that joins two runs is a joint on electric and
       a connector on gas and water — the same shape of thing, different
       trades, different words on a schedule.

       Offering every kind on every utility filled the panel with entries
       that could never count anything — "Water — gas governors" is not a
       category anyone was missing, and a column of permanent zeroes
       makes the ones that matter harder to find. */
    const isMain = (f) => isLine(f) && typeOf(f).includes("_main") && !isTrench(f, lineTypes);
    const isService = (f) => isLine(f) && typeOf(f).includes("_service") && !isTrench(f, lineTypes);
    const role = (r) => (f) => f.Feature_Role === r;

    const KINDS = {
      electric: [
        ["main", "mains cable", isMain],
        ["service", "service cable", isService],
        ["meter", "meters", role("meter")],
        ["joint", "joints", role("joint")],
        ["spannode", "span nodes", role("spannode")],
        ["poc", "POC", role("poc")],
        ["substation", "substations", role("substation")],
      ],
      gas: [
        ["main", "mains pipe", isMain],
        ["service", "service pipe", isService],
        ["meter", "meters", role("meter")],
        ["joint", "connectors", role("joint")],
        ["poc", "POC", role("poc")],
        ["governor", "governors", role("governor")],
      ],
      water: [
        ["main", "mains pipe", isMain],
        ["service", "service pipe", isService],
        ["meter", "meters", role("meter")],
        ["joint", "connectors", role("joint")],
        ["poc", "POC", role("poc")],
      ],
      lighting: [
        ["main", "mains cable", isMain],
        ["service", "service cable", isService],
        ["column", "columns", role("column")],
        ["poc", "POC", role("poc")],
      ],
    };
    const kinds = KINDS[l.Layer_Key] || [];

    for (const [key, what, pred] of kinds) {
      /* A child of the whole-utility entry, and of the general entry for
         its kind where one exists — so All Electric objects and All
         meters both tick the electric meters, and unticking them takes
         them out of whichever was used. */
      const general = { meter: "meter", joint: "joint", poc: "poc", spannode: "spannode" }[key];
      add(`${l.Layer_Key}:${key}`, `${l.Label} \u2014 ${what}`,
        (f) => on(f) && pred(f), `${l.Label} only`,
        [`layer:${l.Layer_Key}`, ...(general ? [general] : [])]);
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
  /* One role, two trades. Named for both here because this entry spans
     the utilities — a gas connector and an electric joint are the same
     kind of feature and this takes them all. */
  add("joint", "All joints and connectors", (f) => f.Feature_Role === "joint", "Points");
  add("linkbox", "All link boxes", (f) => f.Feature_Role === "linkbox", "Points");
  add("column", "All lighting columns", (f) => f.Feature_Role === "column", "Points");
  add("seed", "All plot seeds", (f) => f.Feature_Role === "plot", "Points");
  add("poc", "All POCs", (f) => f.Feature_Role === "poc", "Points");
  add("substation", "All substations", (f) => f.Feature_Role === "substation", "Points");
  add("spannode", "All span nodes", (f) => f.Feature_Role === "spannode", "Points");
  add("governor", "All gas governors", (f) => f.Feature_Role === "governor", "Points");

  add("boundary", "Site boundary", (f) => f.Layer_Key === "boundary", "Everything");
  add("all", "Everything on the drawing", () => true, "Everything");

  /* Counted once, here, rather than by each render. */
  return cats.map((c) => {
    const ids = features.filter(c.pred).map((f) => f.Feature_ID);
    return { ...c, count: ids.length, ids };
  });
}

/* What ticking these categories would remove.

   Deduped, because the categories overlap by design — All Electric and
   All Meters both claim an electric meter, and it should be deleted
   once.

   And with a whole utility, minus anything unticked beneath it. Ticking
   "All Electric objects" ticks the kinds under it; unticking one of them
   is a way of saying "all of it except that", which is the reason for
   ticking the parent in the first place — everything but the span nodes,
   everything but the meters.

   Subtraction only where nothing else ticked claims the feature. If All
   Meters is ticked as well, an electric meter is wanted by that entry on
   its own account, and an untick under Electric is not a reason to
   overrule a separate, deliberate tick. */
export function idsForKeys(categories, keys) {
  const want = new Set(keys);
  const ids = new Set();
  for (const c of categories) {
    if (!want.has(c.key)) continue;
    for (const id of c.ids) ids.add(id);
  }

  for (const c of categories) {
    const parents = c.parents || [];
    /* A child, left unticked, under a parent that is ticked. */
    if (!parents.length || want.has(c.key)) continue;
    if (!parents.some((k) => want.has(k))) continue;

    for (const id of c.ids) {
      /* Claimed by something other than this entry or any of its
         parents. A parent claiming it is exactly the case being
         overruled; a separate, deliberate tick is not. */
      const claimedElsewhere = categories.some((o) =>
        o.key !== c.key && !parents.includes(o.key)
        && want.has(o.key) && o.ids.includes(id));
      if (!claimedElsewhere) ids.delete(id);
    }
  }
  return [...ids];
}

/* The keys a tick should turn on: the one clicked, and anything named as
   its child. Ticking a whole utility ticks its kinds, so they are there
   to be unticked one at a time. */
export function keysToAdd(categories, key) {
  const kids = categories
    .filter((c) => (c.parents || []).includes(key))
    .map((c) => c.key);
  return [key, ...kids];
}

/* And the keys an untick should turn off: the one clicked, and anything
   named as its child.

   Unticking a child leaves its parent ticked on purpose. The parent
   covers more than its children do — an HV cable, a substation, a POC
   are all electric without being a mains, a service or a meter — so
   swapping the parent for its children would quietly drop them. The
   parent stays ticked and idsForKeys subtracts the unticked child,
   which is what "all of it except that" means. */
export function keysToRemove(categories, key) {
  const kids = categories
    .filter((x) => (x.parents || []).includes(key))
    .map((x) => x.key);
  return [key, ...kids];
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
