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

import { plotsOnBoards } from "./msdb.js";

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

  /* A boundary is known by its layer, not by a Feature_Role.

     I looked for Feature_Role "boundary", which nothing writes \u2014 so a
     site with its red line plainly drawn read as having none. The rule
     that matters is the one boundaryPolygons uses: on the boundary
     layer, a polygon, and without a developer on it.

     A developer area sits on the same layer and is told apart by
     carrying Project_Developer_ID. Counting one as the red line would
     say the site was bounded when only one developer's patch was. */
  const boundaryPolys = features.filter((f) => f.Layer_Key === "boundary"
    && f.Feature_Type === "polygon"
    && (f.Geometry || []).length >= 3);
  const siteBoundaries = boundaryPolys
    .filter((f) => f.Attributes?.Project_Developer_ID == null);
  const devAreas = boundaryPolys
    .filter((f) => f.Attributes?.Project_Developer_ID != null);

  /* A plot needs both to be sized: the house type says how big it is
     and the heat source says what it draws. Either missing and the
     load is a guess.

     ── Which field says a house type is set ──

     Property_Config_ID, which is what the plots endpoint returns and
     what the Plots screen writes. It was not in this list, so a site
     with all 129 plots set read as "0 of 129 have a house type and heat
     source" and every build refused to start.

     The names below it are the same fact under the names a joined view
     gives it — a code rather than an id. They stay because more than
     one shape reaches this, and dropping them would move the fault
     rather than fix it. Any of them is a house type; none of them is
     not.

     Nothing is checked here beyond presence. Whether the id points at a
     house type that still exists is the Plots screen's business, and a
     build refusing to start over it would be refusing over something
     nobody could see from here. */
  const hasHouseType = (p) => p.Property_Config_ID ?? p.property_config_id
    ?? p.config_code ?? p.Config_Code ?? p.Code;
  const hasHeatSource = (p) => p.heat_source_id ?? p.Heat_Source_ID;

  const sized = plots.filter((p) => hasHouseType(p) && hasHeatSource(p));

  /* Which plots still want a seed on the ground: the schedule less
     every flat a board has claimed. `plotsOnBoards` is the same reader
     the build's blockers use, so the two cannot disagree about which
     dwellings are on a board. */
  const onBoard = plotsOnBoards(features);
  const wantSeeds = plots.filter((p) =>
    !onBoard.has(Number(p.plot_id ?? p.Plot_ID)));
  const onBoards = plots.length - wantSeeds.length;

  /* And what there is to run a service to at all: plot seeds and
     non-residential supplies, both of which stand on the ground and
     take a service. A board takes a feeder, not a service. */
  const servable = count(features, (f) => f.Feature_Role === "plot")
    + count(features, (f) => f.Feature_Role === "nrs");

  const steps = [
    {
      key: "plots",
      title: "Set the plots",
      hint: "House type and heat source against every plot",
      done: plots.length > 0 && sized.length === plots.length,
      enough: sized.length > 0,
      detail: plots.length === 0
        ? "No plots on this project yet"
        : `${sized.length} of ${plots.length} have a house type and heat source`,
    },
    {
      key: "boundary",
      title: "Draw the boundaries",
      hint: "The site, and a developer area for each developer beyond the first",
      done: siteBoundaries.length > 0
        /* One developer needs no areas: the whole site is theirs. */
        && (developers.length < 2 || devAreas.length >= developers.length),
      enough: siteBoundaries.length > 0,
      detail: siteBoundaries.length === 0
        ? "No site boundary drawn"
        : `${devAreas.length} developer area(s) for ${developers.length} developer(s)`,
    },
    /* ── A flat on a board has no seed, and must not ──

       This counted every plot in the schedule and wanted a seed for
       each. A block of flats fed from an MSDB has none: the dwellings
       are a TABLE on the board, their meters are assumed for the
       length of a build, and there is nothing on the ground to seed.
       So a drawing of 65 flats read as "0 seed(s) for 65 plot(s)" and
       the build was refused for not doing something it must not do.

       Measured against the plots that still want one — the schedule
       less the flats every board has claimed — and where none do, the
       step is done because there is nothing to place. The count is
       said out loud rather than quietly subtracted: "0 of 0" with 65
       plots on the project reads as a fault, and the reason belongs on
       screen where somebody is looking for it. */
    {
      key: "seeds",
      title: "Place the plot seeds",
      hint: "Puts the meters and the property boundary point on each plot",
      done: wantSeeds.length === 0
        || count(features, (f) => f.Feature_Role === "plot") >= wantSeeds.length,
      enough: wantSeeds.length === 0
        || count(features, (f) => f.Feature_Role === "plot") > 0,
      detail: wantSeeds.length === 0
        ? (onBoards
          ? `every plot is a flat on an MSDB \u2014 ${onBoards} need no seed`
          : "no plots to seed")
        : `${count(features, (f) => f.Feature_Role === "plot")} seed(s) `
          + `for ${wantSeeds.length} plot(s)`
          + (onBoards ? ` (${onBoards} more are flats on an MSDB)` : ""),
    },
    {
      key: "mains",
      title: "Draw the mains trench",
      hint: "The dig the network is built along",
      done: mains.length > 0,
      detail: `${mains.length} mains trench(es) drawn`,
    },
    /* ── And nothing to service is not a step left undone ──

       The same fault one step along, and it would have been the next
       thing hit: a service is dug to a SEED, so a drawing whose
       dwellings are all on boards has nothing to run one to. Their
       tails are inside the building and the board's own editor works
       them out.

       Only where there is genuinely nothing on the ground to serve —
       no plot seeds and no non-residential supplies. One seed with no
       service is still a step in progress and still says so. */
    {
      key: "service",
      title: "Auto Service",
      hint: "Draws the service trench and the service cables and pipes",
      done: services.length > 0 || servable === 0,
      enough: services.length > 0 || servable === 0,
      detail: servable === 0
        ? "nothing on the ground to service \u2014 flats are fed from their board"
        : `${services.length} service trench(es) drawn`,
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
      enough: count(meters, (m) => m.Attributes?.Circuit_ID != null) > 0,
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
    /* Whether a step may be run now, and why not where it may not.

       ── Not finished is not the same as not started ──

       This refused anything whose predecessors were not complete, which
       reads as caution and is mostly an obstruction. Seeds on 69 of 72
       plots is not "the seeds have not been placed": it is a site being
       worked through, and Auto Service on those 69 is exactly the work
       somebody is trying to do. Refusing it meant either seeding three
       plots that are not ready or not laying sixty-nine that are.

       So a step that has started but is not finished warns; only one
       that has produced nothing at all blocks. No mains trench and
       there is nothing to tee off, which is a real answer — the caller
       has no route through that and should not have one.

       Every unfinished step before this one is considered, not merely
       the first. Told about the seeds, fixing them and being told about
       the boundary is the same refusal twice. */
    allows: (key) => {
      const i = steps.findIndex((x) => x.key === key);
      if (i < 0) return { ok: true };

      const short = steps.slice(0, i).filter((x) => !x.done);
      if (!short.length) return { ok: true };

      const hard = short.find((x) => !x.enough);
      if (hard) {
        return {
          ok: false,
          why: `${hard.title} first \u2014 ${hard.detail.toLowerCase()}`,
        };
      }

      return {
        ok: true,
        warn: short.map((x) => `${x.title}: ${x.detail.toLowerCase()}`).join("\n"),
      };
    },
  };
}

export const ELECTRIC_STEP_KEYS = [
  "plots", "boundary", "seeds", "mains", "service", "nodes", "circuits", "build",
];
