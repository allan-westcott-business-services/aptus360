/* Building the whole design in one go.

   Six steps across three utilities, in an order that matters. Run by
   hand they are six menu items in four places and the order is
   remembered rather than written down — so the question "does the main
   go before the services?" gets asked every time and answered from
   memory.

   What is checked here is the plan, not the drawing: which steps run,
   which utilities take part, and every reason something is left out.
   The order itself is a constant, and the point of pinning it in a test
   is that the reasons behind it are not obvious from reading it. */
import {
  STEPS, UTILITIES, utilityReadiness, drawingBlocks, planWholeDesign,
  describePlan, describeOutcome,
} from "./src/features/gis/wholeDesign.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LAYERS = [
  { Layer_Key: "electric", Utility_ID: 1 },
  { Layer_Key: "gas", Utility_ID: 2 },
  { Layer_Key: "water", Utility_ID: 3 },
  { Layer_Key: "trench", Utility_ID: null },
];
const SCOPES = [{ Utility_ID: 1 }, { Utility_ID: 2 }, { Utility_ID: 3 }];
const AGREEMENTS = [{ Utility_ID: 1 }, { Utility_ID: 2 }, { Utility_ID: 3 }];
const LINE_TYPES = [
  { Type_Key: "trench_service", Layer_Key: "trench" },
  { Type_Key: "trench_main", Layer_Key: "trench" },
];

/* A site drawn far enough for every utility: a substation, a meter on a
   circuit, and a POC for gas and for water. */
const DRAWN = [
  { Feature_ID: 1, Feature_Role: "substation", Layer_Key: "electric" },
  { Feature_ID: 2, Feature_Role: "meter", Layer_Key: "electric", Attributes: { Circuit_ID: 7 } },
  { Feature_ID: 3, Feature_Role: "poc", Layer_Key: "gas" },
  { Feature_ID: 4, Feature_Role: "poc", Layer_Key: "water" },
];

const full = (over = {}) => planWholeDesign({
  features: DRAWN, layers: LAYERS, scopeDefaults: SCOPES,
  agreements: AGREEMENTS, lineTypes: LINE_TYPES, ...over,
});

// 1. The order, and that it is the order.
//
//    Trenches before nodes because a service trench meeting the main is
//    a junction and the nodes go at junctions. Nodes before services
//    because placing them cuts and replaces trenches, and cable laid
//    first would be left pointing at feature ids that no longer exist.
//    Mains before services because every mains builder reads service
//    trenches and meters, and none reads service cable — so the cable
//    goes in last and records the main it meets. Joints last because a
//    service joint needs a feeder and a service to sit between.
{
  const order = STEPS.map((s) => s.key).join(",");
  if (order !== "trenches,meters,nodes,mains,services,joints") {
    fail(`the order is ${order}`);
  }
  const at = (k) => STEPS.findIndex((s) => s.key === k);
  if (!(at("trenches") < at("nodes"))) fail("span nodes are placed before the trenches exist");
  if (!(at("nodes") < at("services"))) fail("services are laid before the trenches are cut");
  if (!(at("meters") < at("mains"))) fail("the mains are built before the meters are assigned");
  if (!(at("mains") < at("services"))) fail("the services are laid before the mains");
  if (!(at("services") < at("joints"))) fail("the joints are placed before the services");
}

// 2. A fully contracted, fully drawn site builds everything.
{
  const p = full();
  if (p.mains.join(",") !== UTILITIES.join(",")) {
    fail(`mains built for ${p.mains.join(", ") || "nothing"}`);
  }
  if (p.services.length !== 3) fail(`${p.services.length} utilities got services, wanted 3`);
  if (p.skips.length) fail(`a ready site reported skips: ${JSON.stringify(p.skips)}`);
  if (!p.worthRunning) fail("a ready site was judged not worth running");
}

// 3. No outline design, no main. Including electric.
//
//    A main is adopted work, and one laid on a project with no design
//    and no agreement is quantities against work nobody is doing. Gas
//    and water refuse on exactly this; electric checks neither today
//    and will lay a feeder on a project that has agreed to nothing.
{
  for (const [utilityId, name] of [[1, "electric"], [2, "gas"], [3, "water"]]) {
    const p = full({ scopeDefaults: SCOPES.filter((x) => x.Utility_ID !== utilityId) });
    if (p.mains.includes(name)) fail(`${name} was built with no outline design`);
    if (!p.skips.some((s) => s.utility === name && /outline design/.test(s.why))) {
      fail(`${name} was skipped without saying the design was missing`);
    }
  }
}

// 4. No asset value agreement, no main. Same three.
{
  for (const [utilityId, name] of [[1, "electric"], [2, "gas"], [3, "water"]]) {
    const p = full({ agreements: AGREEMENTS.filter((x) => x.Utility_ID !== utilityId) });
    if (p.mains.includes(name)) fail(`${name} was built with no asset value agreement`);
    if (!p.skips.some((s) => s.utility === name && /agreement/.test(s.why))) {
      fail(`${name} was skipped without saying the agreement was missing`);
    }
  }
}

// 5. One utility short does not stop the others.
//
//    This is the whole reason a skip is a skip rather than a refusal. A
//    site where gas is not yet contracted is ordinary, and abandoning
//    the run over it would mean the water main never gets laid either.
{
  const p = full({ scopeDefaults: SCOPES.filter((x) => x.Utility_ID !== 2) });
  if (!p.mains.includes("water")) fail("the water main was lost with the gas design");
  if (!p.mains.includes("electric")) fail("the LV network was lost with the gas design");
  if (!p.worthRunning) fail("a site with two of three utilities was not run");
}

// 6. Nothing contracted at all is worth saying before starting.
{
  const p = full({ scopeDefaults: [], agreements: [] });
  if (p.worthRunning) fail("a site with nothing contracted was still run");
  if (p.skips.length !== 3) fail(`${p.skips.length} skips reported, wanted 3`);
}

// 7. What the drawing withholds, as against the paperwork.
{
  if (drawingBlocks("electric", []).length !== 2) {
    fail("a bare drawing did not report both the substation and the circuits");
  }
  const noCircuit = DRAWN.filter((f) => f.Feature_Role !== "meter");
  if (!drawingBlocks("electric", noCircuit).some((w) => /Link to Circuit/.test(w))) {
    fail("meters not on a circuit were not named as the blocker");
  }
  /* Drawn by hand, so it cannot be part of the run — it has to be a
     skip somebody is told about rather than a step that silently makes
     nothing. */
  if (!drawingBlocks("gas", DRAWN.filter((f) => f.Layer_Key !== "gas"))
    .some((w) => /POC/.test(w))) {
    fail("a missing gas POC was not reported");
  }
  if (drawingBlocks("water", DRAWN).length) fail("a fully drawn water setup reported a blocker");
}

// 8. A missing POC stops the main, not the service pipe.
//
//    A gas service needs the service trench and a meter beyond it.
//    Neither is what a missing POC withholds, so the pipe still goes in
//    and the main follows once somebody places the POC.
{
  const p = full({ features: DRAWN.filter((f) => !(f.Feature_Role === "poc" && f.Layer_Key === "gas")) });
  if (p.mains.includes("gas")) fail("the gas main was built with no POC");
  if (!p.services.includes("gas")) fail("the gas service pipe was withheld over the POC");
  if (!p.skips.some((s) => s.utility === "gas")) fail("the missing POC was not reported");
}

// 9. No service trench type is caught before anything runs.
{
  if (full({ lineTypes: [{ Type_Key: "trench_main", Layer_Key: "trench" }] })
    .hasServiceTrenchType) {
    fail("a project with no service trench type looked ready to lay them");
  }
  if (!full().hasServiceTrenchType) fail("a configured service trench type was not found");
}

// 10. The question says what will happen and what will not.
{
  const p = full({ agreements: AGREEMENTS.filter((x) => x.Utility_ID !== 2) });
  const said = describePlan(p);
  for (const want of ["service trenches", "span nodes", "electric", "water", "gas"]) {
    if (!said.includes(want)) fail(`the plan did not mention ${want}`);
  }
  if (!/Skipped/.test(said)) fail("the plan did not say what it would skip");
  /* The order it reads in is the order it runs in — a list that says
     services before mains would teach somebody the wrong sequence. */
  if (said.indexOf("Build the mains") > said.indexOf("Lay the services")) {
    fail("the plan listed the services before the mains");
  }
}

// 11. The outcome separates what was done from what did nothing and
//     what failed. All three happen on one ordinary run.
{
  const said = describeOutcome([
    { label: "Service trenches", ok: true, changed: true, detail: "12 added" },
    { label: "Span nodes", ok: true, changed: false },
    { label: "Gas main", ok: false, why: "the diversity table is empty" },
  ]);
  if (!/Done:/.test(said)) fail("the outcome did not say what was done");
  if (!/12 added/.test(said)) fail("the outcome did not say how much");
  if (!/Nothing to do:/.test(said)) fail("a step that changed nothing was reported as done");
  if (!/Stopped short:/.test(said)) fail("a failed step was not reported");
  if (!/diversity table/.test(said)) fail("the reason for the failure was lost");

  if (!/Nothing to do/.test(describeOutcome([]))) fail("an empty run said nothing at all");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Whole design behaves (built in dependency order, each utility judged on its own).");
process.exit(bad ? 1 : 0);
