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
  statusOf, statusLabel, statusColour, LIVE_COLOUR, DEAD_COLOUR, UNSET_COLOUR,
  isMainType,
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
  /* Both lists say "As-Laid" for the same fact about the same length of
     road: the pipe is in the ground, and the trench that holds it is
     closed. They read differently for a while — "As Laid" against
     "As-Built" — which made one look like a different state from the
     other. */
  if (statusLabel("aslaid") !== "As-Laid") fail("a main's As-Laid is not called that");
  if (statusLabel("asbuilt") !== "As-Laid") fail("a trench's As-Laid is not called that");
  /* The trench keeps its key, though: `asbuilt` is what every drawing
     already stores and what the bill and the labour rows read. */
  if (!BUILD_STATUSES.some((x) => x.key === "asbuilt")) {
    fail("the trench's stored value was renamed, not just its label");
  }
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
  /* Three answers now, not two: live, said to be not live, and nobody
     has said. The third is grey because it is fixed by somebody setting
     a status rather than by energising anything. */
  if (!/stage === "live" \? LIVE_COLOUR/.test(canvas)) {
    fail("live is not told apart by colour");
  }
  if (!/: stage \? DEAD_COLOUR : UNSET_COLOUR/.test(canvas)) {
    fail("a main with no status is coloured as though it had one");
  }
  if (new Set([LIVE_COLOUR, DEAD_COLOUR, UNSET_COLOUR]).size !== 3) {
    fail("two of the three states share a colour");
  }
  /* Lighter than the plot marks: the band covers a length of road at
     every zoom, and at full strength the plan underneath could not be
     read — which is the thing somebody is checking the main against. */
  const bright = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    return (((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255)) / 3;
  };
  if (bright(LIVE_COLOUR) < 120 || bright(DEAD_COLOUR) < 120) {
    fail("the bands are as strong as the marks and swamp the plan");
  }

  /* A main with no stage is hatched red, not skipped.

     This used to require the opposite — skip it, on the grounds that
     nobody had answered. But liveness is a thing somebody asserts, and
     a main nobody has spoken about has certainly not been energised.
     Skipping drew nothing, which reads as "no main here" rather than
     "nobody has said", and the plot marks meanwhile called it dead —
     so the drawing and the panel disagreed about the same main.

     The distinction is kept in the wording of the plot's note, not in
     whether the ground is coloured. */
  /* To the end of the loop rather than a fixed window — the line this
     looks for sits 2,415 characters in, and a 2,400 window missed it by
     fifteen, which is the whole of this file's history in one
     mistake. */
  const passAt = canvas.indexOf("Whether a main is live");
  const pass = passAt < 0 ? ""
    : canvas.slice(passAt, canvas.indexOf("ctx.restore();", passAt));
  if (/const stage = statusOf\(f\);\s*\n\s*if \(!stage\) continue;/.test(pass)) {
    fail("a main with no stage set is left unhatched");
  }
  if (!/const stage = statusOf\(f\);/.test(pass)) {
    fail("the hatching no longer reads the main's stage");
  }
  /* Its own pass over the whole drawing, not inside the layer filter:
     isolating gas would otherwise hide the trench and take the marking
     with it.

     Over `features` rather than `visible`, but only while the service
     call-off picker is open — live or dead is the question being asked
     at that moment, and a red band across every road at all other times
     is a marking nobody reads. */
  if (!/for \(const f of \(serviceOpen \? features : \[\]\)\)/.test(pass.slice(0, 2200))) {
    fail("the marking follows the layer filter, or is not gated on the picker");
  }
  if (/for \(const f of visible\)/.test(pass.slice(0, 2200))) {
    fail("the marking is hidden by the layer filter");
  }
}

// 5. The field is offered on a main, and not instead of the trench's.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/isMain && \(/.test(editor)) fail("a main has nowhere to set its stage");
  /* The list now comes through statusOptions, which picks it by asking
     statusesFor — so a main is still offered the mains list and a trench
     the trench one, and the field additionally greys the stages that
     claim ground nobody has dug.

     The guarantee is checked where it lives rather than by the shape of
     the JSX: checkstatusrules asserts a main is handed MAIN_STATUSES. */
  if (!/statusOptions\(/.test(editor)) {
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

// 6. Auto Lay says how far through it is, and can be stopped.
//
//    One request per plot, awaited in turn: a site of seventy-six is
//    seventy-six round trips and the better part of a minute with
//    nothing on screen but a menu item reading "Laying…".
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function autoLayServices");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("async function buildGasNetwork"));
  if (!fn) fail("auto lay is gone");

  if (!/Connecting plot \$\{i \+ 1\} of \$\{cables\.length\}/.test(fn)) {
    fail("auto lay does not say which plot it is on");
  }
  /* Counted, not named: "connecting plot 12 of 76" reads as though
     there are 76 plots numbered up to at least 12. */
  if (/Connecting plot \$\{plot\}/.test(fn)) {
    fail("the bar names the plot rather than counting");
  }

  /* The bar is cleared however the run ends. Left at 43 of 76 after a
     failure it says the run is still going, which is the one thing it
     must never say. */
  if (!/finally \{ setBusy\(""\); setProgress\(null\)/.test(fn)) {
    fail("a failed run leaves the progress bar up");
  }

  /* Stop works. The button was already on the bar and auto lay never
     looked at the flag, so pressing it left the run going with no sign
     it had been ignored. */
  if (!/if \(cancelRef\.current\) \{ stopped = true; break; \}/.test(fn)) {
    fail("Stop does nothing during auto lay");
  }
  /* Cleared before starting, or a run stopped an hour ago stops this
     one on its first plot. */
  const beforeLoop = fn.slice(0, fn.indexOf("for (const [i, c] of cables"));
  if (!/cancelRef\.current = false;/.test(beforeLoop)) {
    fail("a previous Stop still applies to the next run");
  }
  /* And a part-finished run says so, rather than reporting a number
     that looks like the whole job. */
  if (!/stopped early/.test(fn)) {
    fail("a stopped run does not say it stopped");
  }
}

// 7. What could not be laid, and why, is kept.
//
//    The reasons were worked out and thrown away: the panel showed one,
//    and only when nothing at all had been laid. A run that laid
//    seventy-five of seventy-six said "1 trench skipped" and nothing
//    about which or why — which is exactly the case somebody needs,
//    because the seventy-five are fine and the one is a plot that will
//    be missed on site.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const auto = readFileSync("./src/features/gis/autoService.js", "utf8");

  if (!/setSkipReport\(/.test(canvas)) fail("the skip reasons are still discarded");
  if (!/gis-skips/.test(canvas)) fail("nothing shows what could not be laid");
  /* Not in the status line, which clears itself after eight seconds —
     a list somebody works through should stay until they close it. */
  const at = canvas.indexOf("setSkipReport(real.length");
  if (at < 0) fail("the skipped trenches are not reported");
  if (!/setSkipReport\(null\)/.test(canvas)) {
    fail("the report cannot be closed");
  }
  /* Already-serviced trenches are not a problem to look at. */
  if (!/!\/already\/i\.test/.test(canvas)) {
    fail("trenches that already have a service are listed as failures");
  }
  /* And each row selects its trench, because the next thing anybody
     does with this list is go and look. */
  /* Inside the report, not anywhere in the file — selecting a feature
     is a common thing to do and a search of the whole canvas passed
     while the row's own button did nothing. */
  const reportAt = canvas.indexOf('className="gis-skips"');
  const report = reportAt < 0 ? "" : canvas.slice(reportAt, reportAt + 2400);
  if (!/setSelected\(\[f\.Feature_ID\]\)/.test(report)) {
    fail("a listed trench cannot be found on the drawing");
  }

  /* The reasons say how far off, where it is a tolerance. "Does not
     meet a mains trench" is true of a trench half a metre short and one
     on the other side of the site, and only one is worth walking to. */
  if (!/closest is /.test(auto)) {
    fail("a trench that misses the main does not say by how much");
  }
  if (!/the nearest \$\{utility\} meter is /.test(auto)) {
    fail("a trench with no meter in range does not say how far the nearest is");
  }
  /* Both quote the tolerance, so the message says what to change. */
  if (!/within \$\{teeM\}m/.test(auto)) fail("the tee tolerance is not stated");
  if (!/within \$\{meterM\}m/.test(auto)) fail("the meter tolerance is not stated");
}

// 8. A rebuild replaces the mains and leaves the services alone.
//
//    Build Gas Network deleted every generated gas line — and Auto Lay
//    Services marks the service pipes it draws as generated too, on the
//    same layer. So rebuilding the mains deleted every service laid to
//    every plot on the site, and a gang would have arrived to find the
//    meters unconnected on a drawing that had been right an hour
//    earlier.
//
//    Water and electric had it too. It is the same fault the electric
//    build already had against gas — Generated alone was every layer —
//    one level further down.
{
  const types = [
    { Type_Key: "gas_main", Label: "Gas Main" },
    { Type_Key: "gas_service", Label: "Gas Service" },
    { Type_Key: "water_main", Label: "Water Main" },
    { Type_Key: "elec_main", Label: "Electric Main" },
    { Type_Key: "elec_service", Label: "Electric Service" },
    /* Renamed in admin, which is a thing somebody may do. */
    { Type_Key: "lp_main", Label: "Gas Main (LP)" },
    { Type_Key: "lp_svc", Label: "Gas Service (LP)" },
    /* A key that looks like a main on something labelled a service.
       This is what the label check is for, and without a case that
       reaches it the guard was untested — the key check alone answered
       every other fixture. */
    { Type_Key: "gas2_main", Label: "Gas Service (LP)" },
  ];
  for (const k of ["gas_main", "water_main", "elec_main", "lp_main"]) {
    if (!isMainType(k, types)) fail(`${k} is not treated as a main, so it is never rebuilt`);
  }
  for (const k of ["gas_service", "elec_service", "lp_svc", "gas2_main", ""]) {
    if (isMainType(k, types)) fail(`${k} is treated as a main, so a rebuild deletes it`);
  }

  /* All three builds ask. A guard on two of them leaves the third
     deleting services, which is how this was found in the first
     place. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const guards = (canvas.match(/isMainType\(f\.Attributes\?\.Line_Type, lineTypes\)/g) || []);
  if (guards.length < 3) {
    fail(`only ${guards.length} of the three rebuilds keep services`);
  }
  /* And each still narrows to its own layer, or a gas rebuild would
     replace the electric mains. */
  for (const layer of ["gas", "water", "electric"]) {
    if (!new RegExp(`Layer_Key === "${layer}"[\\s\\S]{0,120}isMainType`).test(canvas)) {
      fail(`the ${layer} rebuild does not keep that layer's services`);
    }
  }
}

// 9. One button for the whole gas network.
//
//    Mains then services, which is the order they have to happen in: a
//    service tees into the main, so laying services first gives every
//    one of them nothing to join. They were two menu items always
//    pressed together — and two steps only ever run as a pair are one
//    step somebody can get half right.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("async function buildWholeGasNetwork");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("\n  /* ── Build Gas Network", at));
  if (!fn) fail("there is no whole-network build");

  if (!/Build Whole Gas Network/.test(canvas)) fail("the button is not on the menu");

  /* Mains first. */
  if (fn.indexOf("buildGasNetwork(true)") > fn.indexOf('autoLayServices("gas"')) {
    fail("the services are laid before the main they tee into");
  }

  /* Asked once, covering both. Somebody who agreed to the first
     question and declined the second would be left with mains and no
     services — neither of the two states they were choosing between. */
  if ((fn.match(/window\.confirm/g) || []).length !== 1) {
    fail("the combined build asks more than once, or not at all");
  }
  if (!/buildGasNetwork\(true\)/.test(fn)) {
    fail("the mains build asks its own question as well");
  }
  /* And that flag actually silences it. */
  /* To the end of the function rather than a fixed window — its confirm
     is 7.5k characters in, and a 6k slice reported correct code as
     broken. */
  const gasAt = canvas.indexOf("async function buildGasNetwork");
  const gas = gasAt < 0 ? ""
    : canvas.slice(gasAt, canvas.indexOf("\n  async function", gasAt + 10));
  if (!/if \(!silent && !window\.confirm\(/.test(gas)) {
    fail("the mains build ignores the silent flag");
  }
  /* The flag is what matters, and that it is first and defaults to
     false \u2014 not that it is the only parameter. It now takes a drawing
     to work from as well, because a chained run has to hand it one:
     `features` is a closure over the render the run started in, so a
     main built as step four of six would otherwise be routed along the
     trenches as they were before step one dug them. */
  if (!/async function buildGasNetwork\(silent = false[,)]/.test(canvas)) {
    fail("the mains build cannot be run without asking");
  }

  /* Span nodes are what the mains build needs; without them it says so
     rather than running and failing. */
  if (!/Place the span nodes/.test(fn)) {
    fail("a drawing with no span nodes is not told why it cannot build");
  }
  /* No meters is not a reason to refuse the mains. A site still wants
     its main laid, and refusing the whole thing because the second step
     has nothing to do refuses the work that was possible. */
  if (!/skipped, no gas meters/.test(fn)) {
    fail("the question does not say the services will be skipped");
  }
  if (!/if \(!meters\) return;/.test(fn)) {
    fail("the services run even with no meters to run to");
  }

  /* The drawing is read back between the steps. The build has just
     written the mains and set state, but this is the same render —
     `features` in the closure is the drawing as it was before. */
  if (!/await listGis\(projectId\)/.test(fn)) {
    fail("the services are laid against a drawing that predates the mains");
  }
  if (!/autoLayServices\("gas", after\?\.features/.test(fn)) {
    fail("the freshly read drawing is not passed to the services step");
  }
  /* And auto lay uses what it is given rather than the closure. */
  const auto = canvas.slice(canvas.indexOf("async function autoLayServices"));
  const body = auto.slice(0, 4000);
  if (!/const world = src \?\? features;/.test(body)) {
    fail("auto lay ignores the drawing it is handed");
  }
  if (/layServices\(features,/.test(body)) {
    fail("auto lay still reads the stale drawing");
  }
}

// The cable feeding a span node can always be set.
//
//    The build's answer and the override, which feeder.js reads for
//    volt drop. It was briefly hidden on any node with no circuit, on
//    the grounds that such a node has no cable feeding it — but a
//    node's circuit is stamped on it when the LV network is built, so a
//    node on a drawing not yet built has none, and hiding the field
//    took away the only place the size could be set before the build
//    ran.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  const at = editor.indexOf('Feature_Role === "spannode"\n            && Number(f.Attributes.Span_Seq)');
  if (at < 0) fail("the cable-feeding-this-node fields are gone or re-gated");

  /* The rule, as the editor computes it. */
  const shown = (a) => a.Feature_Role === "spannode"
    && Number(a.Attributes.Span_Seq) !== 0;
  const node = (circuit, seq) => ({
    Feature_Role: "spannode", Attributes: { Circuit_ID: circuit, Span_Seq: seq },
  });
  if (!shown(node(7, 2))) fail("a node on a circuit cannot set its cable");
  if (!shown(node(null, 1))) fail("a standalone node cannot set its cable");
  if (!shown(node(undefined, 3))) {
    fail("a node on an unbuilt drawing cannot set its cable");
  }
  /* Nothing feeds the substation, which is the one case where the
     question does not arise. */
  if (shown(node(7, 0))) fail("the origin is asked what feeds it");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Main build status behaves (its own stages, live drawn apart).");
process.exit(bad ? 1 : 0);
