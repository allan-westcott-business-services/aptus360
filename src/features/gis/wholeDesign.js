/* ── Building the whole design in one go ──

   Six things, in an order that matters, across three utilities. Run by
   hand they are six menus in four places, and the order is remembered
   rather than written down — so the question "does the main go before
   the services?" gets asked every time and answered from memory.

   This module holds the answer and the reasons. It plans; the canvas
   runs. Nothing here touches the drawing or the database, so the order
   and the skipping can be checked against a made-up site.

   ── The order, and why it is this one ──

     1  service trenches   the trench network has to be complete before
                           anything reads it

     2  meters             all three mains builders need them: gas to
                           know where demand is, water to count what is
                           beyond a point, electric to build circuits

     3  span nodes         they go at every junction of the trench
                           network, and a service trench meeting the
                           main is a junction. They also cut and replace
                           trenches, so anything laid along a trench
                           first would be left pointing at a feature id
                           that no longer exists

     4  mains              electric, gas and water. Each reads service
                           trenches and meters — none of them reads
                           service cable, which is what makes this step
                           come before the next one rather than after

     5  services           the cable and pipe in the trenches. Laid
                           after the mains so that each one records the
                           main it meets in its Connects list, which is
                           what the joints and the delete cascade read

     6  joints             a service joint marks where a service leaves
                           a feeder, so both have to exist first

   The one that would be got wrong by hand is 3 before 5. Laying cable
   early looks harmless and quietly breaks the connection records when
   the span node pass replaces the trench underneath it.

   ── Why a utility is skipped rather than refused ──

   A main is adopted work. Laying one on a project with no outline
   design and no asset value agreement is quantities against work nobody
   is doing, which is why the gas and water builds refuse outright.

   That refusal is right for a menu item somebody chose. It is wrong
   here: a site with gas not yet contracted is ordinary, and stopping
   the whole run over it would mean the water main never gets laid
   either. So each utility is judged on its own and the ones that cannot
   proceed are named in the report. */

/* The utilities a whole run covers, in the order their mains are laid.
   Order between them does not matter — none reads another's work — but
   a fixed one makes the report read the same way twice. */
export const UTILITIES = ["electric", "gas", "water"];

export const STEPS = [
  { key: "trenches", label: "Auto Lay Service Trench" },
  { key: "meters", label: "Assign Meters" },
  { key: "nodes", label: "Place Span Nodes" },
  { key: "mains", label: "Build the mains", perUtility: true },
  /* "Services", not "Service Cable" or "Service Pipe". This step runs
     for electric, gas and water in turn, and each menu names its own:
     the electric one lays cable, the other two lay pipe. A name that is
     right for one of the three is wrong twice here. */
  { key: "services", label: "Auto Lay Services", perUtility: true },
  { key: "joints", label: "Place Feeder Joints" },
];

/* Whether a utility is contracted, and what is missing where it is not.

   Two facts, neither of them on the drawing: an outline design says the
   project does this utility at all, and an asset value agreement says
   there is somebody to adopt what gets built. The gas build states the
   reasoning and it holds for all three — including electric, which
   checks neither today and will happily lay a feeder on a project that
   has agreed to nothing.

   Reported rather than thrown. The caller wants every reason at once so
   it can say them in a single question, not the first one repeatedly. */
export function utilityReadiness(utility, {
  layers = [], scopeDefaults = [], agreements = [],
} = {}) {
  const layer = layers.find((l) => l.Layer_Key === utility);

  if (!layer) {
    return { utility, ready: false, why: `no ${utility} layer is set up` };
  }
  const utilityId = layer.Utility_ID;
  if (utilityId == null) {
    return {
      utility,
      ready: false,
      why: `the ${utility} layer has no utility set (Admin \u203a GIS Styles)`,
    };
  }

  const design = scopeDefaults.find((sc) => Number(sc.Utility_ID) === Number(utilityId));
  if (!design) {
    return {
      utility,
      ready: false,
      why: `no ${utility} outline design on this project`,
    };
  }

  const agreement = agreements.find((a) => Number(a.Utility_ID) === Number(utilityId));
  if (!agreement) {
    return {
      utility,
      ready: false,
      why: `no ${utility} asset value agreement`,
    };
  }

  return { utility, ready: true, utilityId };
}

/* What the drawing has to offer beyond the paperwork.

   Separate from the readiness above because the two are somebody else's
   to fix: a missing agreement is a job for the Asset Value tab, and a
   missing substation is a job for the drawing in front of them. */
export function drawingBlocks(utility, features = []) {
  const has = (f) => features.some(f);
  const out = [];

  if (utility === "electric") {
    if (!has((f) => f.Feature_Role === "substation")) out.push("no substation placed");
    if (!has((f) => f.Attributes?.Circuit_ID != null && f.Feature_Role === "meter")) {
      /* Drawn by hand with Link to Circuit, so it cannot be run as part
         of this. Named as a skip rather than silently producing nothing. */
      out.push("no meters linked to a circuit (use Link to Circuit)");
    }
  } else if (!has((f) => f.Feature_Role === "poc" && f.Layer_Key === utility)) {
    out.push(`no ${utility} POC placed`);
  }

  return out;
}

/* The whole plan: which steps run, which utilities take part, and every
   reason something will be left out.

   Built before anything is written, so the question put to somebody is
   the whole truth rather than the first step's worth of it. */
export function planWholeDesign({
  features = [], layers = [], scopeDefaults = [], agreements = [], lineTypes = [],
} = {}) {
  const skips = [];
  const utilities = [];

  for (const u of UTILITIES) {
    const r = utilityReadiness(u, { layers, scopeDefaults, agreements });
    if (!r.ready) { skips.push({ utility: u, why: r.why }); continue; }

    const blocked = drawingBlocks(u, features);
    if (blocked.length) {
      skips.push({ utility: u, why: blocked.join("; ") });
      /* The main is skipped, the services are not. A gas service pipe
         needs the service trench and a meter, neither of which is what
         a missing POC withholds — so the pipe still goes in and the
         main follows once the POC is placed. */
      utilities.push({ utility: u, mains: false, services: true });
      continue;
    }
    utilities.push({ utility: u, mains: true, services: true });
  }

  const mains = utilities.filter((u) => u.mains).map((u) => u.utility);
  const services = utilities.filter((u) => u.services).map((u) => u.utility);

  /* Trench types have to exist or Auto Lay Service Trench has nothing
     to draw with. Worth catching here: it fails silently otherwise. */
  const hasServiceTrenchType = lineTypes.some((t) =>
    /service/i.test(String(t.Type_Key ?? "")) && t.Layer_Key === "trench");

  return {
    steps: STEPS,
    utilities,
    mains,
    services,
    skips,
    hasServiceTrenchType,
    /* Nothing to build is worth saying before starting rather than
       after six steps that each did nothing. */
    worthRunning: mains.length > 0 || services.length > 0,
  };
}

/* The plan in words, for the one question asked before it runs. */
export function describePlan(plan) {
  const lines = [
    "1. Lay the service trenches",
    "2. Assign the meters",
    "3. Place the span nodes",
    plan.mains.length
      ? `4. Build the mains: ${plan.mains.join(", ")}`
      : "4. Build the mains: none \u2014 nothing is ready",
    plan.services.length
      ? `5. Lay the services: ${plan.services.join(", ")}`
      : "5. Lay the services: none",
    "6. Place the feeder joints",
  ];

  if (plan.skips.length) {
    lines.push("", "Skipped:");
    for (const s of plan.skips) lines.push(`   ${s.utility} \u2014 ${s.why}`);
  }

  return lines.join("\n");
}

/* And what actually happened, once it has.

   Every step reports rather than the run stopping at the first refusal.
   A site where gas is not contracted should still come out with its
   water main laid, and somebody reading this wants the whole picture
   in one place rather than six dialogs ago. */
export function describeOutcome(results = []) {
  const done = results.filter((r) => r.ok && r.changed);
  const nothing = results.filter((r) => r.ok && !r.changed);
  const failed = results.filter((r) => !r.ok);

  const lines = [];
  if (done.length) {
    lines.push("Done:");
    for (const r of done) lines.push(`   ${r.label}${r.detail ? ` \u2014 ${r.detail}` : ""}`);
  }
  if (nothing.length) {
    lines.push(lines.length ? "" : "", "Nothing to do:");
    for (const r of nothing) lines.push(`   ${r.label}`);
  }
  if (failed.length) {
    lines.push(lines.length ? "" : "", "Stopped short:");
    for (const r of failed) lines.push(`   ${r.label} \u2014 ${r.why}`);
  }
  return lines.filter((l, i) => !(l === "" && i === 0)).join("\n")
    || "Nothing to do \u2014 the drawing already has everything this would add.";
}
