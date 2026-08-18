/* What a plot seed takes with it when it is deleted.

   Auto Service draws a service trench from the main to the plot, a
   meter for each utility the plot takes, and a cable or pipe along the
   trench to each meter. Every one of them is stamped with the seed it
   was drawn for, and deleting the seed used to leave the lot behind:
   a dig to nowhere, meters belonging to nothing, cables teed off a main
   to serve nobody.

   Not merely untidy. The bill still counts the pipe and the dig
   estimate still counts the trench — and Auto Service reads a service
   trench stamped with a seed as "this plot is done", so the plot could
   not be redrawn either. The command that would have tidied it was the
   one the mess stopped from running.

   What is checked here is the reach of the rule: that it takes the
   three things it should, that it stops at the main, and that it never
   crosses to a neighbouring plot. */
import {
  servicePartOf, belongsToSeed, seedCascade, cascadeSummary,
} from "./src/features/gis/seedCascade.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LINE_TYPES = [
  { Type_Key: "elec_main", Label: "LV cable", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
  { Type_Key: "water_service", Label: "Water service", Layer_Key: "water" },
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench" },
];

/* Plot 12, seeded, with the service Auto Service would draw for it:
   one dig, three meters, three cables. Plot 13 next door has its own.
   The main runs past both and belongs to neither. */
const SEED_12 = {
  Feature_ID: 100, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: 12, Label: "12", Layer_Key: "plot", Attributes: {},
};
const SEED_13 = {
  Feature_ID: 200, Feature_Role: "plot", Feature_Type: "point",
  Plot_ID: 13, Label: "13", Layer_Key: "plot", Attributes: {},
};

const svc = (id, seedId, plotId, layer, type, role = null) => ({
  Feature_ID: id,
  Feature_Type: role ? "point" : "line",
  ...(role ? { Feature_Role: role } : {}),
  Layer_Key: layer,
  Plot_ID: plotId,
  Geometry: [[0, 0], [1, 1]],
  Attributes: { Seed_Feature_ID: seedId, ...(type ? { Line_Type: type } : {}) },
});

const MAIN = {
  Feature_ID: 1, Feature_Type: "line", Layer_Key: "electric",
  Geometry: [[0, 0], [50, 0]], Attributes: { Line_Type: "elec_main" },
};
const MAINS_TRENCH = {
  Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
  Geometry: [[0, 0], [50, 0]], Attributes: { Line_Type: "trench_main" },
};

const FEATURES = [
  MAIN, MAINS_TRENCH, SEED_12, SEED_13,
  svc(101, 100, 12, "trench", "trench_service"),
  svc(102, 100, 12, "electric", null, "meter"),
  svc(103, 100, 12, "gas", null, "meter"),
  svc(104, 100, 12, "water", null, "meter"),
  svc(105, 100, 12, "electric", "elec_service"),
  svc(106, 100, 12, "gas", "gas_service"),
  svc(107, 100, 12, "water", "water_service"),
  svc(201, 200, 13, "trench", "trench_service"),
  svc(202, 200, 13, "electric", null, "meter"),
  svc(203, 200, 13, "electric", "elec_service"),
];

// 1. Each part of a service is recognised for what it is.
{
  const part = (id) => servicePartOf(FEATURES.find((f) => f.Feature_ID === id), LINE_TYPES);
  if (part(101) !== "trench") fail(`the service trench read as ${part(101)}`);
  if (part(102) !== "meter") fail(`a meter read as ${part(102)}`);
  if (part(105) !== "cable") fail(`a service cable read as ${part(105)}`);
  if (part(107) !== "cable") fail(`a service pipe read as ${part(107)}`);
  /* And the things that are not part of one. */
  if (part(1) !== null) fail(`the main read as ${part(1)}`);
  if (part(2) !== null) fail(`the mains trench read as ${part(2)}`);
  if (part(100) !== null) fail(`the seed read as ${part(100)}`);
}

// 2. Deleting the seed takes its whole service and nothing else.
{
  const c = seedCascade([100], FEATURES, LINE_TYPES);
  if (c.meter.length !== 3) fail(`${c.meter.length} meters went, wanted 3`);
  if (c.cable.length !== 3) fail(`${c.cable.length} cables went, wanted 3`);
  if (c.trench.length !== 1) fail(`${c.trench.length} trenches went, wanted 1`);
  if (c.all.length !== 7) fail(`${c.all.length} features went, wanted 7`);

  const ids = new Set(c.ids.map(Number));
  // The main and its trench stay: they serve the street, not the plot.
  for (const id of [1, 2]) if (ids.has(id)) fail(`the mains (${id}) was taken`);
  // The seed itself is the caller's business, not the cascade's.
  if (ids.has(100)) fail("the seed listed itself as a dependent");
  // And nothing of plot 13's.
  for (const id of [200, 201, 202, 203]) {
    if (ids.has(id)) fail(`plot 13's feature ${id} was taken with plot 12`);
  }
}

// 3. Two seeds at once take both services, each feature once.
{
  const c = seedCascade([100, 200], FEATURES, LINE_TYPES);
  /* Seven for plot 12, three for plot 13. */
  if (c.all.length !== 10) fail(`${c.all.length} features went for two plots, wanted 10`);
  if (new Set(c.ids).size !== c.ids.length) fail("a feature was listed twice");
  if (c.seeds.length !== 2) fail(`${c.seeds.length} seeds were recognised, wanted 2`);
}

// 4. A feature already being deleted is not counted again.
//
//    Selecting a seed and one of its own meters is one delete. Counting
//    the meter twice would make the question overstate what is going.
{
  const c = seedCascade([100, 102], FEATURES, LINE_TYPES);
  if (c.ids.includes(102)) fail("a feature in the selection was listed as a dependent");
  if (c.all.length !== 6) fail(`${c.all.length} extras, wanted 6`);
}

// 5. Deleting something that is not a seed cascades nothing.
//
//    Including a meter, which carries the same stamp. The stamp says
//    what a thing belongs to, not what belongs to it.
for (const id of [1, 102, 105, 101]) {
  const c = seedCascade([id], FEATURES, LINE_TYPES);
  if (c.all.length) fail(`deleting ${id} took ${c.all.length} feature(s) with it`);
}

// 6. The stamp wins over the plot number.
//
//    A meter stamped with plot 13's seed is plot 13's, whatever plot
//    number it carries — a plot renumbered by hand should not hand its
//    neighbour's meter to the delete.
{
  const crossed = FEATURES.map((f) => (f.Feature_ID === 202
    ? { ...f, Plot_ID: 12 } : f));
  const c = seedCascade([100], crossed, LINE_TYPES);
  if (c.ids.includes(202)) fail("a neighbour's stamped meter was taken by plot number");
}

// 7. No stamp and the plot number is the link.
//
//    A meter placed through the plot flow rather than by Auto Service
//    has no Seed_Feature_ID. Left out, deleting the seed would strand
//    exactly the meters somebody placed by hand.
{
  const handPlaced = {
    Feature_ID: 300, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "gas", Plot_ID: 12, Geometry: [[2, 2]], Attributes: {},
  };
  const c = seedCascade([100], [...FEATURES, handPlaced], LINE_TYPES);
  if (!c.ids.includes(300)) fail("a hand-placed meter was left behind");

  /* And an empty stamp counts as none rather than as zero. */
  const blank = { ...handPlaced, Feature_ID: 301, Attributes: { Seed_Feature_ID: "" } };
  if (!seedCascade([100], [...FEATURES, blank], LINE_TYPES).ids.includes(301)) {
    fail("a meter with a blank stamp was left behind");
  }
}

// 8. A seed with no plot behind it does not sweep up every stray.
//
//    Plot_ID null on both sides must not read as a match, or one
//    unplotted seed would take every unplotted meter on the drawing.
{
  const loose = { ...SEED_12, Feature_ID: 400, Plot_ID: null };
  const stray = {
    Feature_ID: 401, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "gas", Plot_ID: null, Geometry: [[9, 9]], Attributes: {},
  };
  if (belongsToSeed(stray, loose)) fail("two features with no plot matched each other");
  const c = seedCascade([400], [...FEATURES, loose, stray], LINE_TYPES);
  if (c.all.length) fail(`an unplotted seed took ${c.all.length} feature(s)`);
}

// 9. Nothing to go on produces nothing, rather than throwing.
for (const args of [[[], [], []], [[100], [], LINE_TYPES], [undefined, undefined, undefined]]) {
  const c = seedCascade(...args);
  if (c.all.length) fail("an empty drawing produced a cascade");
  if (c.summary !== "") fail(`an empty cascade summarised as "${c.summary}"`);
}

// 10. The summary reads as a sentence, and counts singly and plurally.
{
  const say = (m, c, t) => cascadeSummary({
    meter: Array(m).fill(0), cable: Array(c).fill(0), trench: Array(t).fill(0),
  });
  if (say(3, 3, 1) !== "3 meters, 3 service cables and pipes and 1 service trench") {
    fail(`a full service summarised as "${say(3, 3, 1)}"`);
  }
  if (say(1, 0, 1) !== "1 meter and 1 service trench") {
    fail(`one of each summarised as "${say(1, 0, 1)}"`);
  }
  if (say(0, 0, 1) !== "1 service trench") {
    fail(`a lone trench summarised as "${say(0, 0, 1)}"`);
  }
  if (say(0, 0, 0) !== "") fail("nothing summarised as something");
  /* The real cascade says the same thing, so the question a planner
     answers matches what the rule will do. */
  const c = seedCascade([100], FEATURES, LINE_TYPES);
  if (!/3 meters/.test(c.summary) || !/1 service trench/.test(c.summary)) {
    fail(`the cascade summarised as "${c.summary}"`);
  }
}

// 11. Work drawn by hand, carrying no stamp at all.
//
//    This is what an older drawing is mostly made of, and the version
//    of this rule that only read the stamp found none of it — which is
//    the same lesson isServed learned when Auto Service laid a second
//    trench over a hand-dug one. A cascade that only tidies up after
//    itself leaves exactly the mess somebody has been living with.
//
//    Plot 20 sits at [100,0] with the main 10 m south. Its dig runs
//    from the main up to the seed, its three meters stand in a column
//    just beyond, and a cable runs to each. Nothing is stamped and
//    nothing carries a plot number.
{
  const seed20 = {
    Feature_ID: 500, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: null, Layer_Key: "plot", Geometry: [[100, 0]], Attributes: {},
  };
  const hand = (id, layer, type, geom, role = null) => ({
    Feature_ID: id,
    Feature_Type: role ? "point" : "line",
    ...(role ? { Feature_Role: role } : {}),
    Layer_Key: layer, Plot_ID: null, Geometry: geom,
    Attributes: type ? { Line_Type: type } : {},
  });

  const drawn = [
    MAIN, MAINS_TRENCH, seed20,
    hand(501, "trench", "trench_service", [[100, -10], [100, 0]]),
    hand(502, "electric", null, [[100, 1.5]], "meter"),
    hand(503, "gas", null, [[100, 2.3]], "meter"),
    hand(504, "water", null, [[100, 3.1]], "meter"),
    hand(505, "electric", "elec_service", [[100, -10], [100, 1.5]]),
    hand(506, "gas", "gas_service", [[100, -10], [100, 2.3]]),
    hand(507, "water", "water_service", [[100, -10], [100, 3.1]]),
  ];

  const c = seedCascade([500], drawn, LINE_TYPES);
  if (c.meter.length !== 3) fail(`${c.meter.length} hand-drawn meters went, wanted 3`);
  if (c.cable.length !== 3) fail(`${c.cable.length} hand-drawn cables went, wanted 3`);
  if (c.trench.length !== 1) fail(`${c.trench.length} hand-drawn trenches went, wanted 1`);
  /* The main it tees into is not a service and stays whatever the
     geometry says — both its ends are far away, but the type is what
     settles it. */
  const ids = new Set(c.ids.map(Number));
  for (const id of [1, 2]) if (ids.has(id)) fail(`the mains (${id}) was taken by position`);
}

// 12. And the plot next door keeps its own, drawn the same way.
//
//    The two columns of meters are 10 m apart, which is the distance
//    that matters: the reach past a seed is 4.5 m and a trench end
//    counts within 1.5 m, so neither plot can see the other's.
{
  const seedAt = (id, x) => ({
    Feature_ID: id, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: null, Layer_Key: "plot", Geometry: [[x, 0]], Attributes: {},
  });
  const svcAt = (id, x, kind) => ({
    Feature_ID: id, Feature_Type: kind === "meter" ? "point" : "line",
    ...(kind === "meter" ? { Feature_Role: "meter" } : {}),
    Layer_Key: kind === "trench" ? "trench" : "electric",
    Plot_ID: null,
    Geometry: kind === "meter" ? [[x, 1.5]] : [[x, -10], [x, kind === "trench" ? 0 : 1.5]],
    Attributes: kind === "meter" ? {}
      : { Line_Type: kind === "trench" ? "trench_service" : "elec_service" },
  });

  const street = [
    MAIN,
    seedAt(600, 100), svcAt(601, 100, "trench"), svcAt(602, 100, "meter"),
    svcAt(603, 100, "cable"),
    seedAt(700, 110), svcAt(701, 110, "trench"), svcAt(702, 110, "meter"),
    svcAt(703, 110, "cable"),
  ];

  const c = seedCascade([600], street, LINE_TYPES);
  if (c.all.length !== 3) fail(`plot 100 took ${c.all.length} features, wanted 3`);
  for (const id of [700, 701, 702, 703]) {
    if (c.ids.map(Number).includes(id)) fail(`the neighbour's ${id} was taken by position`);
  }
}

// 13. A stamp still beats proximity.
//
//    A trench ending right at this seed but stamped for the plot next
//    door belongs to the plot next door. Position is the fallback for
//    work that names no owner, never an override of one that does.
{
  const seed = {
    Feature_ID: 800, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 30, Layer_Key: "plot", Geometry: [[0, 0]], Attributes: {},
  };
  const theirs = {
    Feature_ID: 801, Feature_Type: "line", Layer_Key: "trench",
    Plot_ID: 31, Geometry: [[0, -5], [0, 0]],
    Attributes: { Line_Type: "trench_service", Seed_Feature_ID: 900 },
  };
  const alsoTheirs = {
    Feature_ID: 802, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "gas", Plot_ID: 31, Geometry: [[0, 1.5]], Attributes: {},
  };
  const c = seedCascade([800], [seed, theirs, alsoTheirs], LINE_TYPES);
  if (c.all.length) {
    fail(`a neighbour's labelled service was taken by proximity (${c.ids.join(", ")})`);
  }
}

// 14. The service joint on the main goes with the plot.
//
//    It sits at the tee — the far end of the cable from the meter,
//    often tens of metres from the plot — so it is found from the cable
//    that is going, not from the seed. A joint left behind is a fitting
//    on a main with nothing coming off it.
{
  const plot = {
    Feature_ID: 900, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 40, Layer_Key: "plot", Geometry: [[100, 0]], Attributes: {},
  };
  const jointAt = (id, x, attrs) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "joint",
    Layer_Key: "electric", Geometry: [[x, -10]], Attributes: attrs,
  });
  const cable = {
    Feature_ID: 902, Feature_Type: "line", Layer_Key: "electric", Plot_ID: 40,
    Geometry: [[100, -10], [100, 1.5]],
    Attributes: { Line_Type: "elec_service", Seed_Feature_ID: 900 },
  };
  const meter = {
    Feature_ID: 903, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: 40, Geometry: [[100, 1.5]],
    Attributes: { Seed_Feature_ID: 900 },
  };

  const base = [MAIN, plot, cable, meter];
  const svc = jointAt(901, 100, { Joint_Type: "service", Joint_Code: "SVC", Services: 1 });
  const c = seedCascade([900], [...base, svc], LINE_TYPES);
  if (c.joint.length !== 1) fail(`${c.joint.length} service joints went, wanted 1`);
  if (!c.ids.includes(901)) fail("the service joint was left on the main");
  if (!/service joint/.test(c.summary)) fail(`the summary did not mention it: ${c.summary}`);

  // A joint on a different tee, 10 m along the main, is not this one's.
  const far = jointAt(904, 110, { Joint_Type: "service", Services: 1 });
  if (seedCascade([900], [...base, far], LINE_TYPES).ids.includes(904)) {
    fail("a joint at another plot's tee was taken");
  }

  // Recognised by its code alone, for a joint written without the type.
  const byCode = jointAt(905, 100, { Joint_Code: "SVC" });
  if (!seedCascade([900], [...base, byCode], LINE_TYPES).ids.includes(905)) {
    fail("a joint identified only by its code was left behind");
  }
}

// 15. A joint that is there for another reason stays.
//
//    The type is the largest reason the joint exists for, so a breech
//    that also takes a service off it is typed "breech". The feeder
//    still divides there once this plot has gone, and taking the
//    fitting out would break the run it divides.
{
  const plot = {
    Feature_ID: 910, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 41, Layer_Key: "plot", Geometry: [[0, 0]], Attributes: {},
  };
  const cable = {
    Feature_ID: 911, Feature_Type: "line", Layer_Key: "electric", Plot_ID: 41,
    Geometry: [[0, -10], [0, 1.5]],
    Attributes: { Line_Type: "elec_service", Seed_Feature_ID: 910 },
  };
  for (const kind of ["breech", "bottleend", "straight"]) {
    const joint = {
      Feature_ID: 912, Feature_Type: "point", Feature_Role: "joint",
      Layer_Key: "electric", Geometry: [[0, -10]],
      Attributes: { Joint_Type: kind, Joint_Reasons: [kind, "service"] },
    };
    const c = seedCascade([910], [MAIN, plot, cable, joint], LINE_TYPES);
    if (c.ids.includes(912)) fail(`a ${kind} joint was removed with the plot`);
  }
  /* And a lighting column's service joint, which feeds a lamp. */
  const lamp = {
    Feature_ID: 913, Feature_Type: "point", Feature_Role: "joint",
    Layer_Key: "electric", Geometry: [[0, -10]],
    Attributes: { Joint_Type: "service", For_Lighting: true },
  };
  if (seedCascade([910], [MAIN, plot, cable, lamp], LINE_TYPES).ids.includes(913)) {
    fail("a lighting service joint was removed with a plot");
  }
}

// 16. A joint feeding two plots stays until both have gone.
//
//    Two services off one fitting is ordinary on a terrace. Removing it
//    with the first plot would cut the second off at the main.
{
  const seedAt = (id, plotId, x) => ({
    Feature_ID: id, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: plotId, Layer_Key: "plot", Geometry: [[x, 0]], Attributes: {},
  });
  const cableAt = (id, seedId, plotId, x) => ({
    Feature_ID: id, Feature_Type: "line", Layer_Key: "electric", Plot_ID: plotId,
    Geometry: [[0, -10], [x, 1.5]],
    Attributes: { Line_Type: "elec_service", Seed_Feature_ID: seedId },
  });
  const shared = {
    Feature_ID: 950, Feature_Type: "point", Feature_Role: "joint",
    Layer_Key: "electric", Geometry: [[0, -10]],
    Attributes: { Joint_Type: "service", Services: 2 },
  };
  const pair = [
    MAIN, shared,
    seedAt(951, 50, 0), cableAt(952, 951, 50, 0),
    seedAt(953, 51, 3), cableAt(954, 953, 51, 3),
  ];

  if (seedCascade([951], pair, LINE_TYPES).ids.includes(950)) {
    fail("a shared joint went with the first of two plots");
  }
  if (!seedCascade([951, 953], pair, LINE_TYPES).ids.includes(950)) {
    fail("a shared joint stayed when both its plots went");
  }
  /* Without the recorded count, the cables still on the drawing settle
     it — so a joint written before Services existed behaves the same. */
  const noCount = pair.map((f) => (f.Feature_ID === 950
    ? { ...f, Attributes: { Joint_Type: "service" } } : f));
  if (seedCascade([951], noCount, LINE_TYPES).ids.includes(950)) {
    fail("an uncounted shared joint went with the first plot");
  }
  if (!seedCascade([951, 953], noCount, LINE_TYPES).ids.includes(950)) {
    fail("an uncounted shared joint stayed when both plots went");
  }
}

// 17. The joint the trench says it is connected to.
//
//    Every service trench and cable is written with a Connects list —
//    the ids its ends actually meet. Where the joint is in that list
//    there is nothing to measure: the trench has already recorded what
//    it is connected to.
//
//    This is the case measurement misses. The joint sits on the feeder
//    cable while the trench starts on the mains trench, and on a drawing
//    where those two are metres apart no tolerance that is safe between
//    neighbouring plots is loose enough to bridge it.
{
  const seed = {
    Feature_ID: 1000, Feature_Role: "plot", Feature_Type: "point",
    Plot_ID: 60, Layer_Key: "plot", Geometry: [[0, 0]], Attributes: {},
  };
  /* The joint is 8 m from the end of the dig — far outside any radius —
     but the dig names it. */
  const joint = {
    Feature_ID: 1001, Feature_Type: "point", Feature_Role: "joint",
    Layer_Key: "electric", Geometry: [[0, -18]],
    Attributes: { Joint_Type: "service", Services: 1 },
  };
  const trench = {
    Feature_ID: 1002, Feature_Type: "line", Layer_Key: "trench", Plot_ID: 60,
    Geometry: [[0, -10], [0, 0]],
    Attributes: {
      Line_Type: "trench_service", Seed_Feature_ID: 1000, Connects: [1001],
    },
  };
  const meter = {
    Feature_ID: 1003, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "electric", Plot_ID: 60, Geometry: [[0, 1.5]],
    Attributes: { Seed_Feature_ID: 1000 },
  };

  const c = seedCascade([1000], [MAIN, seed, joint, trench, meter], LINE_TYPES);
  if (!c.ids.includes(1001)) {
    fail("a joint the trench records as connected was left behind");
  }

  /* And a neighbour's cable naming the same joint still keeps it. */
  const theirs = {
    Feature_ID: 1004, Feature_Type: "line", Layer_Key: "electric", Plot_ID: 61,
    Geometry: [[40, -18], [40, 1.5]],
    Attributes: { Line_Type: "elec_service", Connects: [1001] },
  };
  if (seedCascade([1000], [MAIN, seed, joint, trench, meter, theirs], LINE_TYPES)
    .ids.includes(1001)) {
    fail("a joint another plot's cable still connects to was removed");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Seed cascade behaves (a plot takes its meters, services and dig, and nothing of its neighbour's).");
process.exit(bad ? 1 : 0);
