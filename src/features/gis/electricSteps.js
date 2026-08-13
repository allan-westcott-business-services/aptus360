/* Building the electric network, in order.

   ── Why this exists ──

   Each step needs what the one before it produced. Auto Service draws
   into mains trenches; the span nodes are placed on those trenches; the
   LV build routes between the nodes. Done out of order, each still runs
   and quietly produces a worse answer than it should — a network built
   before the meters are on circuits routes to nothing, and looks like
   it worked.

   ── Read, not recorded ──

   Every step's state is worked out from the drawing rather than stored
   when somebody presses a button. Stored state goes stale the moment
   anyone deletes a trench or re-imports a plot schedule, and then the
   list says a step is done when it plainly is not.

   It also means a design built before this existed reads correctly:
   the work is there, so the steps show as done.

   ── Blocked, not hidden ──

   A later step is offered but refused, with the reason. Hiding it
   leaves somebody hunting for a menu item that used to be there;
   greying it out with no explanation is the same problem more politely.
   Saying "the meters are not on circuits yet" is the thing that
   actually helps. */

const has = (features, test) => features.some(test);
const count = (features, test) => features.filter(test).length;

const isLine = (f) => f.Feature_Type === "line";
const isPoint = (f) => f.Feature_Type === "point";

/* A trench, by its layer rather than its type key: the keys are
   configured per database and the layer is what they all agree on. */
const isTrench = (f, lineTypes = []) => {
  if (!isLine(f)) return false;
  if (f.Layer_Key === "trench") return true;
  const t = lineTypes.find((x) => x.Type_Key === f.Attributes?.Line_Type);
  return t ? t.Layer_Key === "trench" : false;
};
const isService = (f) => /service/i.test(String(f.Attributes?.Line_Type ?? ""));

export function electricSteps({
  features = [], plots = [], developers = [], lineTypes = [],
} = {}) {
  const mains = features.filter((f) => isTrench(f, lineTypes) && !isService(f));
  const services = features.filter((f) => isTrench(f, lineTypes) && isService(f));
  const meters = features.filter((f) => f.Feature_Role === "meter"
    && f.Layer_Key === "electric");

  /* A plot needs both to be sized: the house type says how big it is
     and the heat source says what it draws. Either missing and the
     load is a guess. */
  const sized = plots.filter((p) => (p.config_code ?? p.Config_Code ?? p.Code)
    && (p.heat_source_id ?? p.Heat_Source_ID));

  const steps = [
    {
      key: "plots",
      title: "Set the plots",
      hint: "House type and heat source against every plot",
      done: plots.length > 0 && sized.length === plots.length,
      detail: plots.length === 0
        ? "No plots on this project yet"
        : `${sized.length} of ${plots.length} have a house type and heat source`,
    },
    {
      key: "boundary",
      title: "Draw the boundaries",
      hint: "The site, and a developer area for each developer beyond the first",
      done: has(features, (f) => f.Feature_Role === "boundary")
        /* One developer needs no areas: the whole site is theirs. */
        && (developers.length < 2
          || count(features, (f) => f.Feature_Role === "devarea") >= developers.length),
      detail: !has(features, (f) => f.Feature_Role === "boundary")
        ? "No site boundary drawn"
        : `${count(features, (f) => f.Feature_Role === "devarea")} developer area(s) `
          + `for ${developers.length} developer(s)`,
    },
    {
      key: "seeds",
      title: "Place the plot seeds",
      hint: "Puts the meters and the property boundary point on each plot",
      done: plots.length > 0
        && count(features, (f) => f.Feature_Role === "plot") >= plots.length,
      detail: `${count(features, (f) => f.Feature_Role === "plot")} seed(s) `
        + `for ${plots.length} plot(s)`,
    },
    {
      key: "mains",
      title: "Draw the mains trench",
      hint: "The dig the network is built along",
      done: mains.length > 0,
      detail: `${mains.length} mains trench(es) drawn`,
    },
    {
      key: "service",
      title: "Auto Service",
      hint: "Draws the service trench and the service cables and pipes",
      done: services.length > 0,
      detail: `${services.length} service trench(es) drawn`,
    },
    {
      key: "nodes",
      title: "Place the span nodes",
      hint: "The points the network is measured between",
      done: has(features, (f) => f.Feature_Role === "spannode"),
      detail: `${count(features, (f) => f.Feature_Role === "spannode")} span node(s)`,
    },
    {
      key: "circuits",
      title: "Link the meters to circuits",
      hint: "Says which feeder serves which plot",
      done: meters.length > 0
        && meters.every((m) => m.Attributes?.Circuit_ID != null),
      detail: meters.length === 0
        ? "No electric meters placed"
        : `${count(meters, (m) => m.Attributes?.Circuit_ID != null)} of `
          + `${meters.length} meter(s) on a circuit`,
    },
    {
      key: "build",
      title: "Build the LV network",
      hint: "Routes the feeders and sizes the cable",
      done: has(features, (f) => isLine(f) && f.Layer_Key === "electric"
        && f.Attributes?.Generated),
      detail: `${count(features, (f) => isLine(f) && f.Layer_Key === "electric"
        && f.Attributes?.Generated)} feeder cable(s) built`,
    },
  ];

  /* A step is open when everything before it is done. The first one
     that is not done is the one to do next. */
  let blockedBy = null;
  for (const s of steps) {
    s.blockedBy = blockedBy;
    s.open = blockedBy == null;
    if (!s.done && blockedBy == null) blockedBy = s;
  }

  const next = steps.find((s) => !s.done) ?? null;
  return {
    steps,
    next,
    doneCount: steps.filter((s) => s.done).length,
    /* Whether a step may be run now, and why not where it may not. */
    allows: (key) => {
      const s = steps.find((x) => x.key === key);
      if (!s) return { ok: true };
      if (s.open) return { ok: true };
      return {
        ok: false,
        why: `${s.blockedBy.title} first \u2014 ${s.blockedBy.detail.toLowerCase()}`,
      };
    },
  };
}

export const ELECTRIC_STEP_KEYS = [
  "plots", "boundary", "seeds", "mains", "service", "nodes", "circuits", "build",
];
