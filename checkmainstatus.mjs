/* Whether a main has been laid, and whether it is live.

   ── Why it is not the trench's status ──

   On a lay-only project the developer digs and we lay: the trench is
   As-Built or Existing before anything is in it. Reading the pipe's
   stage from the hole around it would call every one of those mains
   laid on the day the trench was finished.

   And Live belongs to nothing else. A trench is dug or it is not; a
   main is charged or energised separately, often weeks later and by
   somebody else. A gang sent to connect a plot off a main nobody has
   made live has been sent to do something that cannot be done — which
   is what all of this exists to prevent. */
import { readFileSync } from "node:fs";
import {
  BUILD_STATUSES, MAIN_STATUSES, statusesFor, isMainFeature, isLive,
  statusOf, statusLabel, statusColour, LIVE_COLOUR, DEAD_COLOUR,
} from "./src/features/gis/buildStatus.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "gas_main", Layer_Key: "gas" },
  { Type_Key: "gas_service", Layer_Key: "gas" },
  { Type_Key: "elec_main", Layer_Key: "electric" },
  { Type_Key: "water_main", Layer_Key: "water" },
  { Type_Key: "trench_main", Layer_Key: "trench" },
  { Type_Key: "light_service", Layer_Key: "lighting" },
];
const line = (type, status) => ({
  Feature_Type: "line",
  Attributes: { Line_Type: type, Build_Status: status },
});

// 1. What counts as a main.
{
  for (const t of ["gas_main", "elec_main", "water_main"]) {
    if (!isMainFeature(line(t), LT)) fail(`${t} is not recognised as a main`);
  }
  /* Not a service. A service takes its liveness from the main feeding
     it — it goes in on the same visit as the plot it serves, and a
     stage on every one would be a hundred fields nobody fills in. */
  for (const t of ["gas_service", "trench_main", "light_service"]) {
    if (isMainFeature(line(t), LT)) fail(`${t} is treated as a main`);
  }
  /* And a point is not a line. */
  if (isMainFeature({ Feature_Type: "point", Attributes: { Line_Type: "gas_main" } }, LT)) {
    fail("a point was treated as a main");
  }
}

// 2. The two lists stay apart.
//
//    A main set to "existing", or a trench set to "live", is a value
//    from the wrong list — and keeping one list would have allowed
//    both.
{
  const mainKeys = MAIN_STATUSES.map((x) => x.key);
  const trenchKeys = BUILD_STATUSES.map((x) => x.key);

  for (const k of ["planned", "aslaid", "live"]) {
    if (!mainKeys.includes(k)) fail(`a main cannot be ${k}`);
  }
  for (const k of ["existing", "remove", "asbuilt"]) {
    if (mainKeys.includes(k)) fail(`${k} is offered on a main`);
  }
  if (trenchKeys.includes("live")) fail("a trench can be set live");
  if (trenchKeys.includes("aslaid")) fail("a trench can be set as laid");

  /* statusesFor picks by what the feature is, not by what it holds. */
  if (statusesFor(line("gas_main"), LT) !== MAIN_STATUSES) {
    fail("a main is offered the trench statuses");
  }
  if (statusesFor(line("trench_main"), LT) !== BUILD_STATUSES) {
    fail("a trench is offered the main statuses");
  }

  /* Planned appears in both and must mean the same thing in both, or
     the colour of a planned length would depend on what it is. */
  const inMain = MAIN_STATUSES.find((x) => x.key === "planned");
  const inTrench = BUILD_STATUSES.find((x) => x.key === "planned");
  if (inMain.colour !== inTrench.colour) {
    fail("planned is a different colour on a main than on a trench");
  }

  /* Labels and colours resolve for both lists, or a main's stage shows
     as blank wherever one is looked up. */
  for (const k of [...mainKeys, ...trenchKeys]) {
    if (!statusLabel(k)) fail(`${k} has no label`);
    if (!statusColour(k)) fail(`${k} has no colour`);
  }
  if (statusLabel("aslaid") !== "As Laid") fail("As Laid is not called that");
}

// 3. Only a main can be live.
{
  if (!isLive(line("gas_main", "live"), LT)) fail("a live main is not live");
  if (isLive(line("gas_main", "aslaid"), LT)) fail("an as-laid main reads as live");
  if (isLive(line("gas_main"), LT)) fail("a main with no stage reads as live");
  /* A trench holding the value by mistake is still not a live main. */
  if (isLive(line("trench_main", "live"), LT)) fail("a trench can be live");
  if (isLive(line("gas_service", "live"), LT)) fail("a service can be live");
}

// 4. The drawing says which.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  /* Solid only when live. As Laid means the cable is in the ground and
     cannot yet be connected to, which is closer to planned than to
     finished for anybody deciding what work can go out. */
  const dashed = (f) => {
    const bs = statusOf(f);
    return bs === "planned" || bs === "remove"
      || (isMainFeature(f, LT) && bs !== "live");
  };
  if (!dashed(line("gas_main", "aslaid"))) fail("an as-laid main draws solid");
  if (!dashed(line("gas_main"))) fail("a main with no stage draws solid");
  if (dashed(line("gas_main", "live"))) fail("a live main draws dashed");
  /* And nothing else changed: a service and an as-built trench are as
     they were. */
  if (dashed(line("gas_service"))) fail("services now draw dashed");
  if (dashed(line("trench_main", "asbuilt"))) fail("an as-built trench now draws dashed");

  /* The rule as the page computes it, not the copy above — a copy
     passed while the page had stopped asking whether a main was live,
     which is the whole of this section. */
  const decl = canvas.match(/const notLive = ([^;]+);/);
  if (!decl) fail("the page no longer works out whether a main is live");
  else if (!/isMainFeature\(f, lineTypes\) && bs !== "live"/.test(decl[1])) {
    fail(`the page decides a main is not live by: ${decl[1]}`);
  }
  if (!/\|\| notLive \?/.test(canvas)) {
    fail("a main that is not live is not dashed");
  }

  /* Hatched over the trench, green or red — a dashed cable is easy to
     miss at the zoom somebody plans at. */
  if (!/Whether a main is live/.test(canvas)) {
    fail("nothing marks a main's stage on the drawing");
  }
  if (!/stage === "live" \? LIVE_COLOUR : DEAD_COLOUR/.test(canvas)) {
    fail("live and dead are not told apart by colour");
  }
  if (LIVE_COLOUR === DEAD_COLOUR) fail("live and dead are the same colour");

  /* Only where somebody has said. A drawing that has never used the
     field is not covered in red — it is one where nobody has answered,
     and answering for them would be a claim this cannot support. */
  const pass = canvas.slice(canvas.indexOf("Whether a main is live"));
  if (!/if \(!stage\) continue;/.test(pass.slice(0, 1800))) {
    fail("a main with no stage set is marked as dead");
  }
  /* Its own pass over every feature, not inside the layer filter:
     isolating gas would otherwise hide the trench and take the marking
     with it. */
  if (!/for \(const f of features\)/.test(pass.slice(0, 1800))) {
    fail("the marking follows the layer filter");
  }
}

// 5. The field is offered on a main, and not instead of the trench's.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/isMain && \(/.test(editor)) fail("a main has nowhere to set its stage");
  if (!/MAIN_STATUSES\.map/.test(editor)) {
    fail("the main's field offers the trench statuses");
  }
  /* The trench's own field is untouched. */
  if (!/BUILD_STATUSES\.map/.test(editor)) {
    fail("the trench lost its build status field");
  }
  /* Read from the edited attributes, so changing a line's type to a
     main shows the field without saving first. */
  if (!/isMainFeature\(\{ \.\.\.feature, Attributes: f\.Attributes \}/.test(editor)) {
    fail("the field only appears after saving");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Main build status behaves (its own stages, live drawn apart).");
process.exit(bad ? 1 : 0);
