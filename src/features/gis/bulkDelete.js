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

import { JOINT_KINDS, isJointOfKind } from "./joints.js";

/* The order the joint kinds are offered in, which is not the order the
   catalogue happens to declare them.

   Commonest first: a drawing has a service joint at every plot and a
   handful of the rest. Bottle ends last because they are the one nobody
   asked for. Written out rather than taken from JOINT_KINDS so that
   adding a kind to the catalogue does not silently reshuffle a panel
   somebody has learnt the shape of. */
const JOINT_KIND_ORDER = ["service", "breech", "straight", "bottleend"];

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
        /* And each kind of joint on its own.

           Here rather than among the general Points entries, because a
           joint kind is an electric idea. Gas and water have connectors
           and no kinds to tell apart, so the same four entries offered
           generally would be four permanent zeroes on any drawing
           without electric on it.

           They earn separate entries because they are replaced by
           different things. Rebuilding the feeders puts the straights
           and the breeches back; the service joints belong to the plots
           and outlive it. Clearing all of them and re-running restored
           a service joint only where a service still ran to it, which
           is not the same set \u2014 so redoing the feeder joints meant
           deleting everything and hoping.

           Bottle ends included though not asked for: leaving one of the
           four reachable only through "all joints" is an asymmetry
           somebody hits the first time they redo the ends of the
           runs. */
        ...JOINT_KIND_ORDER.map((kind) => [
          `joint_${kind}`,
          `${JOINT_KINDS[kind].label.toLowerCase()}s`,
          (f) => isJointOfKind(f, kind),
        ]),
        ["spannode", "span nodes", role("spannode")],
        ["poc", "POC", role("poc")],
        ["substation", "substations", role("substation")],
      ],
      gas: [
        ["main", "mains pipe", isMain],
        ["service", "service pipe", isService],
        ["meter", "meters", role("meter")],
        ["joint", "connectors", role("joint")],
        /* Two entries, not one.

           They share a role and a symbol, but they are placed by
           different routines at different times and cleared for
           different reasons: the main tees go in with the network and
           the top tees with the services. Clearing all of them to redo
           one is the same blunt instrument "all joints" was before the
           kinds were split out.

           Told apart by Tee_Kind. A tee written before that attribute
           existed was a top tee \u2014 that is all the first version
           placed \u2014 so an absent kind counts as one, and no fitting
           falls outside both entries. */
        ["hvtt_service", "top tees (HVTT)",
          (f) => f.Feature_Role === "hvtt"
            && f.Attributes?.Tee_Kind !== "junction"],
        ["hvtt_junction", "main tees",
          (f) => f.Feature_Role === "hvtt"
            && f.Attributes?.Tee_Kind === "junction"],
        /* The reducers, so a drawing whose sizes have been reworked can
           be cleared and the routine re-run.

           Its own entry rather than folded in with the tees. They are
           different fittings placed for different reasons — a tee marks
           a join, a reducer marks a change of size — and clearing all
           the tees to redo the sizes would take the joins with them. */
        ["reducer", "reducers", role("reducer")],
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
      /* The general entry this kind rolls up into, where there is one.

         Only for kinds that more than one utility has: ticking "All
         meters" should take the gas and water ones too. Substations and
         governors have no general entry, because they belong to a single
         utility and a second name for the same list helps nobody. */
      const general = {
        main: "main", service: "service",
        meter: "meter", joint: "joint", poc: "poc", spannode: "spannode",
        column: "column",
        /* Every kind rolls up into the one general joints entry, so
           ticking "All joints and connectors" still takes them and
           unticking a kind means "all the joints except those". */
        ...Object.fromEntries(JOINT_KIND_ORDER.map((k) => [`joint_${k}`, "joint"])),
        /* Both kinds of tee roll up into nothing more general: a tee is
           not a joint, and there is no "all tees" entry to sit under.
           Left out of the map rather than pointed at "joint", which
           would make ticking the connectors take the tees as well. */
      }[key];
      /* A kind of joint sits under this utility's joints entry as well.

         "Electric — joints" covers the straights and the breeches and
         the rest, so without naming it as a parent, unticking the
         straights while it is ticked leaves them in: idsForKeys reads
         the wider entry as a separate, deliberate claim on the same
         features rather than as the thing being narrowed. */
      const under = key.startsWith("joint_") ? [`${l.Layer_Key}:joint`] : [];

      add(`${l.Layer_Key}:${key}`, `${l.Label} \u2014 ${what}`,
        (f) => on(f) && pred(f), `${l.Label} only`,
        [`layer:${l.Layer_Key}`, ...under, ...(general ? [general] : [])]);
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
    (f) => isLine(f) && !!f.Attributes?.Generated && f.Layer_Key === "electric", "Lines");
  /* Its own entry rather than widening the one above. Both are drawn by
     a builder and both are safe to sweep, but "LV feeders" naming a
     list that quietly included the gas main is how somebody clears a
     utility they did not mean to. */
  add("gengas", "All generated gas mains",
    (f) => isLine(f) && !!f.Attributes?.Generated && f.Layer_Key === "gas", "Lines");

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
  /* Separate from plot seeds, and from meters. A supply seed is neither
     — clearing the plots down and starting again should not take the
     pumping station with them, and the meters it owns are ordinary
     meters that go with "All meters" like any other. */
  add("nrs", "All non-residential supplies", (f) => f.Feature_Role === "nrs", "Points");
  add("poc", "All POCs", (f) => f.Feature_Role === "poc", "Points");
  add("spannode", "All span nodes", (f) => f.Feature_Role === "spannode", "Points");
  add("servicevalve", "All service valves",
    (f) => f.Feature_Role === "servicevalve", "Points");
  /* Substations and gas governors are not here. Each belongs to one
     utility, so "all of them" and "all of that utility's" are the same
     list under two names — and two entries that always agree are one
     more thing to read and one more place to tick the wrong box. They
     appear under Electric and Gas respectively. */

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
