/* What stage a thing starts at.

   Planned. Everything drawn is proposed work until somebody says
   otherwise — that is what drawing it means.

   It was not stored. One path wrote it: a trench drawn by hand. A main
   laid by Build LV Network, a gas main, a water main and every main
   drawn by hand all arrived with the attribute missing, and the editor
   covered for it by displaying "Planned" where nothing was set. That
   papered over the trench case and made the mains case worse — the
   mains field was later changed to show a blank instead, precisely
   because a main reading Planned on screen with an empty attribute sent
   somebody looking for why their plots would not connect and gave them
   nothing to see.

   Writing the value settles both: the screen and the attribute say the
   same thing because there is only one thing. */
import { readFileSync } from "node:fs";
import {
  withDefaultStatus, defaultStatusOf, BUILD_STATUSES, MAIN_STATUSES,
} from "./src/features/gis/buildStatus.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench" },
  { Type_Key: "elec_main", Label: "LV cable", Layer_Key: "electric" },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas" },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water" },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
];

const line = (type, layer, attrs = {}) => ({
  Feature_Type: "line", Layer_Key: layer,
  Geometry: [[0, 0], [1, 1]],
  Attributes: { Line_Type: type, ...attrs },
});

const statusOn = (f) => withDefaultStatus(f, LT).Attributes?.Build_Status ?? null;

// 1. Every trench starts Planned, mains and service alike.
//
//    A dig is proposed work whichever kind it is, and the trench list
//    is the one that applies to both.
for (const [type, layer] of [["trench_main", "trench"], ["trench_service", "trench"]]) {
  if (statusOn(line(type, layer)) !== "planned") {
    fail(`${type} started as ${statusOn(line(type, layer))}`);
  }
}

// 2. Every main starts Planned, on all three utilities.
//
//    This is the case that was missing entirely: nothing wrote a stage
//    onto a main, however it was laid.
for (const [type, layer] of [
  ["elec_main", "electric"], ["gas_main", "gas"], ["water_main", "water"],
]) {
  if (statusOn(line(type, layer)) !== "planned") {
    fail(`${type} started as ${statusOn(line(type, layer))}`);
  }
}

// 3. A service gets none, for the reason isMainFeature gives.
//
//    It takes its liveness from the main feeding it. A stage on every
//    service would be a hundred fields nobody fills in.
for (const [type, layer] of [["elec_service", "electric"], ["gas_service", "gas"]]) {
  if (statusOn(line(type, layer)) !== null) {
    fail(`${type} was given a stage of ${statusOn(line(type, layer))}`);
  }
}

// 4. Nothing that has nowhere to put it.
//
//    A plot seed, a boundary, a POC have no stage field and no list of
//    stages. Writing an attribute nothing reads onto them is litter
//    somebody later has to explain.
{
  const points = [
    { Feature_Type: "point", Feature_Role: "plot", Attributes: {} },
    { Feature_Type: "point", Feature_Role: "meter", Layer_Key: "gas", Attributes: {} },
    { Feature_Type: "point", Feature_Role: "poc", Layer_Key: "water", Attributes: {} },
    { Feature_Type: "polygon", Layer_Key: "boundary", Attributes: {} },
  ];
  for (const f of points) {
    if (statusOn(f) !== null) {
      fail(`a ${f.Feature_Role || f.Feature_Type} was given a stage`);
    }
  }
  /* And a line with no type at all is left alone rather than guessed
     at. */
  if (statusOn({ Feature_Type: "line", Attributes: {} }) !== null) {
    fail("a line with no type was given a stage");
  }
}

// 5. A deliberate choice is never overwritten.
//
//    This sits on the path every created feature takes, so it has to be
//    safe on the paths that set their own. A length drawn as Existing
//    stays Existing.
{
  for (const set of ["existing", "asbuilt", "remove", "live"]) {
    const f = line("trench_main", "trench", { Build_Status: set });
    if (statusOn(f) !== set) fail(`a length set to ${set} was reset to ${statusOn(f)}`);
  }
  /* An empty string counts as unset \u2014 it is what a cleared select
     leaves behind, and treating it as a choice would leave the feature
     with no stage at all. */
  const cleared = line("elec_main", "electric", { Build_Status: "" });
  if (statusOn(cleared) !== "planned") fail("a cleared status was not filled back in");
  const nulled = line("elec_main", "electric", { Build_Status: null });
  if (statusOn(nulled) !== "planned") fail("a null status was not filled in");
}

// 6. The other attributes survive, and the original is not mutated.
{
  const f = line("gas_main", "gas", { Size_ID: 4, Generated: true });
  const out = withDefaultStatus(f, LT);
  if (out.Attributes.Size_ID !== 4) fail("the size was lost");
  if (out.Attributes.Generated !== true) fail("the generated flag was lost");
  if (out.Geometry !== f.Geometry) fail("the geometry was rebuilt needlessly");
  if (f.Attributes.Build_Status != null) fail("the feature passed in was modified");
}

// 7. "planned" is a real key in both lists.
//
//    The two lists diverge \u2014 a main has no "existing" and a trench has
//    no "live" \u2014 and this writes one value onto both kinds. If either
//    list ever drops it, the default becomes a value nothing can show.
{
  if (!BUILD_STATUSES.some((x) => x.key === "planned")) {
    fail("the trench list has no planned");
  }
  if (!MAIN_STATUSES.some((x) => x.key === "planned")) {
    fail("the mains list has no planned");
  }
}

// 8. Nothing creates a feature around the back.
//
//    The default is applied once, in the wrapper every creation goes
//    through, rather than repeated at thirty call sites — because
//    thirty places to remember is thirty places to forget, and the next
//    routine somebody writes should get this without knowing it needs
//    to.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  const direct = (canvas.match(/createFeature\(projectId, /g) || []).length;
  if (direct !== 1) {
    fail(`${direct} calls create a feature directly; only the wrapper should`);
  }
  if (!/withDefaultStatus\(feature, lineTypes\)/.test(canvas)) {
    fail("the wrapper does not apply the default");
  }
  if (!/await addFeature\(/.test(canvas)) {
    fail("nothing goes through the wrapper");
  }
  /* The line types are what tell a main from a service, so a wrapper
     that forgot them would quietly stop giving mains a stage. */
  if (!/\[projectId, lineTypes\]/.test(canvas)) {
    fail("the wrapper does not rebuild when the line types load");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Default status behaves (trenches and mains start Planned, and a set stage is left alone).");
process.exit(bad ? 1 : 0);
