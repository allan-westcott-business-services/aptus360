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

console.log(bad ? `\n${bad} problem(s)`
  : "Seed cascade behaves (a plot takes its meters, services and dig, and nothing of its neighbour's).");
process.exit(bad ? 1 : 0);
