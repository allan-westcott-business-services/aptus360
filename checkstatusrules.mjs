/* What a cable or pipe says about itself, and when.

   Three rules, all of them about the drawing not holding two facts that
   cannot both be true:

     a service has its own three stages, because it is dug in, jointed
     and made live on three different visits;

     nothing is live while the ground it lies in is still Planned;

     and putting a trench back to Planned takes its contents with it,
     because correcting the trench alone leaves the cable reading Live
     in a hole that has not been dug. */
import { readFileSync } from "node:fs";
import { contentsOf } from "./src/features/gis/trenchContents.js";
import {
  BUILD_STATUSES, MAIN_STATUSES, SERVICE_STATUSES, statusesFor,
  isServiceFeature, isMainFeature, blocksLive, canGoLive, LIVE_KEY, statusOf,
  statusOptions, needsGround, STAGES_NEEDING_GROUND,
} from "./src/features/gis/buildStatus.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LT = [
  { Type_Key: "elec_main", Label: "LV cable", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric" },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas" },
  { Type_Key: "trench_main", Label: "Mains trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service trench", Layer_Key: "trench" },
];

const line = (type, layer, attrs = {}) => ({
  Feature_Type: "line", Layer_Key: layer,
  Attributes: { Line_Type: type, ...attrs },
});

// 1. The service list is the three that were asked for, in order.
{
  const got = SERVICE_STATUSES.map((x) => x.label).join(" | ");
  if (got !== "Planned | Laid - Dead Jointed | Live") {
    fail(`the service list reads ${got}`);
  }
  /* The same keys a main uses, because they are the same three moments:
     a service reading "aslaid" should mean on a service what it means
     on a main, and only the wording differs. */
  if (SERVICE_STATUSES.map((x) => x.key).join(",") !== "planned,aslaid,live") {
    fail(`the service keys are ${SERVICE_STATUSES.map((x) => x.key).join(",")}`);
  }
}

// 2. And the mains keep saying "As-Laid".
//
//    A list of its own rather than a relabelling, so naming the middle
//    stage for the service trade does not rename it on every main on
//    every drawing.
{
  const mid = MAIN_STATUSES.find((x) => x.key === "aslaid");
  if (mid?.label !== "As-Laid") fail(`the mains middle stage now reads ${mid?.label}`);
}

// 3. Each kind of line is offered its own list.
{
  const svc = statusesFor(line("elec_service", "electric"), LT);
  if (svc !== SERVICE_STATUSES) fail("a service was offered the wrong list");
  if (statusesFor(line("elec_main", "electric"), LT) !== MAIN_STATUSES) {
    fail("a main was offered the wrong list");
  }
  /* A service trench is a dig, and a dig carries the trench list.
     Matching on the word "service" alone would have given every service
     trench a Live option. */
  if (statusesFor(line("trench_service", "trench"), LT) !== BUILD_STATUSES) {
    fail("a service trench was offered the service list");
  }
  if (isServiceFeature(line("trench_service", "trench"), LT)) {
    fail("a service trench counted as a service");
  }
  if (isMainFeature(line("elec_service", "electric"), LT)) {
    fail("a service counted as a main");
  }
}

// 4. Nothing goes live while the ground is still Planned.
{
  const planned = line("trench_service", "trench", { Build_Status: "planned" });
  const laid = line("trench_service", "trench", { Build_Status: "asbuilt" });

  if (canGoLive([planned])) fail("a cable went live in a trench still Planned");
  if (!canGoLive([laid])) fail("a cable was held back by a trench already laid");
  if (blocksLive([planned, laid]).length !== 1) fail("the wrong trench was named");

  /* Existing ground and trenches marked for removal hold nothing back:
     one was never dug by this job and the other is being taken out. */
  for (const key of ["existing", "remove", "asbuilt"]) {
    if (!canGoLive([line("trench_main", "trench", { Build_Status: key })])) {
      fail(`a trench marked ${key} held a cable back from going live`);
    }
  }
  /* A cable in no trench at all is not held back by nothing. */
  if (!canGoLive([])) fail("a cable in no trench was refused");
  /* And a trench with no stage set is not Planned. */
  if (!canGoLive([line("trench_main", "trench")])) {
    fail("a trench with no stage set held a cable back");
  }
}

// 5. The canvas enforces it as well as the editor greying it.
//
//    Greying an option is a courtesy to whoever is looking at the form.
//    The same edit arrives from the bulk editor and from anything
//    written later, so the rule has to live on the path that saves.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

  if (!/blocksLive\(/.test(canvas)) fail("the save path does not check the trench");
  /* The editor reaches the same rule through statusOptions, which is
     what builds the greyed entries \u2014 it does not call blocksLive
     itself, and should not: two callers of the underlying test are two
     places for it to drift. */
  if (!/statusOptions\(/.test(editor)) fail("the editor does not grey the stages");
  if (!/SERVICE_STATUSES/.test(editor)) fail("the editor offers no service status field");
  /* Both from the one place, so they cannot drift into disagreeing
     about which trench holds something back. */
  if (!/from "\.\/buildStatus\.js"/.test(editor)) {
    fail("the editor does not take the rule from buildStatus");
  }
}

// 6. Putting a trench back to Planned empties it, and only downwards.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/nowStatus === "planned" && wasStatus !== "planned"/.test(canvas)) {
    fail("nothing carries a trench correction to its contents");
  }
  /* The reverse must not exist: laying a duct and energising a cable
     are different visits, often weeks apart, and a rule that did both
     would be inventing work. */
  if (/nowStatus === "asbuilt"[\s\S]{0,200}Build_Status: "live"/.test(canvas)) {
    fail("marking a trench as-laid makes its contents live");
  }
  /* Only what is further on than Planned is touched, so the entry says
     what actually changed. */
  if (!/statusOf\(x\) !== "planned"/.test(canvas)) {
    fail("the cascade rewrites contents that were already Planned");
  }
}

// 7. statusOf reads what is stored and invents nothing.
{
  if (statusOf(line("elec_service", "electric", { Build_Status: "live" })) !== LIVE_KEY) {
    fail("a live service did not read as live");
  }
  if (statusOf(line("elec_service", "electric")) !== null) {
    fail("a service with no stage read as something");
  }
}

// 8. As-Laid needs the ground closed too, not only Live.
//
//    A cable is As-Laid when it is in the ground, which cannot be true
//    while the trench it lies in is still Planned — the claim is about
//    the dig as much as about the cable. So both stages past Planned
//    are held by the same fact.
{
  for (const key of ["aslaid", "asbuilt", "live"]) {
    if (!needsGround(key)) fail(`${key} does not require the ground to be closed`);
  }
  for (const key of ["planned", "existing", "remove", "", null]) {
    if (needsGround(key)) fail(`${JSON.stringify(key)} was treated as claiming the ground`);
  }
  if (STAGES_NEEDING_GROUND.includes("planned")) {
    fail("Planned requires the ground to be closed, which leaves nothing selectable");
  }
}

// 9. The options say why, rather than the save saying it afterwards.
//
//    An option that can be picked and then rejected teaches somebody
//    the form is unreliable, and the reason arrives after the decision.
{
  const trench = (key) => ({
    Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_service", Build_Status: key },
  });
  const svc = line("elec_service", "electric");
  const main = line("elec_main", "electric");

  for (const [what, f] of [["service", svc], ["main", main]]) {
    const held = statusOptions(f, LT, [trench("planned")]);

    /* Planned stays available: it is the only thing true of a length in
       a hole that has not been dug. */
    const open = held.filter((o) => !o.disabled).map((o) => o.key);
    if (open.join(",") !== "planned") {
      fail(`a ${what} over a planned trench offers ${open.join(",")}`);
    }
    /* And the ones that are not say so on themselves. */
    for (const o of held.filter((o) => o.disabled)) {
      if (!/trench/i.test(o.label)) {
        fail(`a disabled ${what} option reads "${o.label}" with no reason on it`);
      }
      if (!o.why) fail(`a disabled ${what} option carries no explanation`);
    }

    /* Once the trench is laid, everything is on offer again and the
       labels are back to their plain names. */
    const free = statusOptions(f, LT, [trench("asbuilt")]);
    if (free.some((o) => o.disabled)) fail(`a ${what} was still held back over laid ground`);
    if (free.some((o) => /trench/i.test(o.label))) {
      fail(`a ${what} option kept its reason after the ground was closed`);
    }
  }

  /* Nothing is held back where there is no trench under it at all. */
  if (statusOptions(svc, LT, []).some((o) => o.disabled)) {
    fail("a line in no trench had its stages held back");
  }
}

// 10. One builder, used by both fields.
//
//    The mains field had no guard at all while the service field did,
//    so a main could be set live in a trench nobody had dug and be
//    refused only on Save. A rule added in one place has to reach every
//    dropdown.
{
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/statusOptions\(/.test(editor)) fail("the editor does not use the shared builder");
  const selects = (editor.match(/statusChoices\.map\(/g) || []).length;
  if (selects < 2) fail(`${selects} status field(s) use the builder, wanted both`);
  /* And the canvas still refuses it, for edits that arrive from
     anywhere else. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/needsGround\(/.test(canvas)) fail("the save path no longer enforces the rule");
}

// 11. A trench is not in a trench.
//
//    trenchesUnder matches a trench against itself — a trench follows
//    its own line perfectly — so a trench still Planned came back as
//    the thing holding itself back, and correcting one to As-Laid was
//    refused on the grounds that it was Planned. Which it was, and
//    which was the thing being corrected.
{
  const trench = {
    Feature_Type: "line", Layer_Key: "trench",
    Attributes: { Line_Type: "trench_main", Build_Status: "planned" },
  };

  /* Handed itself, as the canvas hands it, and nothing is held back. */
  const own = statusOptions(trench, LT, [trench]);
  if (own.some((o) => o.disabled)) {
    fail(`a trench held itself back from ${own.find((o) => o.disabled)?.key}`);
  }
  /* Including the stage that was being set when this was reported. */
  if (own.find((o) => o.key === "asbuilt")?.disabled) {
    fail("a trench could not be corrected to As-Laid");
  }

  /* And a service trench likewise \u2014 it is a dig, whatever it is
     called. */
  const svcTrench = {
    ...trench,
    Attributes: { Line_Type: "trench_service", Build_Status: "planned" },
  };
  if (statusOptions(svcTrench, LT, [svcTrench]).some((o) => o.disabled)) {
    fail("a service trench held itself back");
  }

  /* The rule still bites on what actually lies in the ground. */
  const svc = line("elec_service", "electric");
  if (!statusOptions(svc, LT, [trench]).some((o) => o.disabled)) {
    fail("scoping the rule to cables and pipes turned it off entirely");
  }

  /* The canvas scopes it the same way, so the save path and the field
     cannot disagree about who the rule is for. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/isMainFeature\(before, lineTypes\) \|\| isServiceFeature\(before, lineTypes\)/
    .test(canvas)) {
    fail("the save path does not scope the rule to cables and pipes");
  }
}

/* ── Putting a trench back to Planned ──

   A trench that goes back to Planned takes what is in it with it: a
   cable cannot be As-Laid in a trench that has not been dug.

   That branch called `contentsOf(...).filter(...)`. `contentsOf`
   answers with a REPORT — `{ ok, trench, trenchM, contents, passing,
   byUtility }`, or `{ error }` where the geometry is not a line — so
   the filter threw and the save failed outright. As-Laid to Planned was
   impossible on any trench, which is the one direction that branch
   exists to handle.

   Every other caller in the app reads `.contents` off it. This was the
   only one that did not, and nothing caught it because the shape is
   only wrong at the moment somebody uses it. */
{
  const lineTypes = [
    { Type_Key: "trench_main", Layer_Key: "trench" },
    { Type_Key: "elec_main", Layer_Key: "electric" },
  ];
  const trench = {
    Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench",
    Geometry: [[0, 0], [50, 0]],
    Attributes: { Line_Type: "trench_main", Build_Status: "planned" },
  };
  const cable = {
    Feature_ID: 2, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [50, 0]],
    Attributes: { Line_Type: "elec_main", Build_Status: "aslaid" },
  };

  const res = contentsOf(trench, [trench, cable], { lineTypes });

  /* The shape, stated. If contentsOf ever becomes an array this fails
     and whoever changed it finds every caller. */
  if (Array.isArray(res)) {
    fail("contentsOf returns an array now \u2014 its callers read .contents");
  }
  if (!Array.isArray(res?.contents)) {
    fail("contentsOf(...).contents is not a list of what is in the trench");
  }
  /* And the thing that actually broke: it has no .filter of its own. */
  if (typeof res?.filter === "function") {
    fail("contentsOf answers something filterable \u2014 this check no longer"
      + " guards what it was written for");
  }

  /* Bad geometry answers with a reason, not a throw, and not a list. */
  const bad = contentsOf({ ...trench, Geometry: [[0, 0]] }, [], { lineTypes });
  if (!bad?.error) fail("a trench that is not a line did not say so");
  if (Array.isArray(bad?.contents) && bad.contents.length) {
    fail("a refused report still listed contents");
  }

  /* The canvas reads it correctly. Source-read, because the branch runs
     inside a save handler in a nineteen-thousand-line component and
     cannot be called from here. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (/contentsOf\([^;]*\)\s*\n?\s*\.filter\(/.test(canvas)) {
    fail("the canvas filters the report contentsOf returns, rather than"
      + " its .contents \u2014 the save throws and the trench cannot go back"
      + " to Planned");
  }
  if (!/res\?\.ok \? res\.contents : \[\]/.test(canvas)) {
    fail("the put-back-to-Planned branch does not read .contents");
  }
  /* `passing` stays out: those lines turn at a junction near the
     stretch rather than lying in it, and pulling a neighbour's cable
     back because it rounds a corner here would be wrong. */
  if (/res\.passing/.test(canvas)) {
    fail("lines merely passing the trench are being put back to Planned");
  }
}

/* ── Setting the stage on a whole selection ──

   Build status was four buttons in the Trench menu once and was taken
   out: a property belongs in the object's editor, and the menu changed
   a field without recording what it changed.

   It is back as one dropdown, because that reasoning is right for one
   trench and wrong for forty — opening the editor forty times to mark a
   phase as-laid is not an editor. Both objections have to stay
   answered, and this is what holds them answered. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fn = canvas.slice(canvas.indexOf("async function setStatusOnSelection"),
    canvas.indexOf("async function saveFeature"));

  if (!fn) {
    fail("there is no bulk status setter");
  } else {
    /* 1. Through saveFeature, the one path the editor uses.

       saveFeature refuses a stage that needs the ground closed while
       the trench is still Planned. Writing straight to updateFeature
       would go round that rule rather than restating it — and a rule
       enforced on one route is a rule until somebody takes the other. */
    if (!/saveFeature\(/.test(fn)) {
      fail("the bulk status setter does not go through saveFeature");
    }
    if (/updateFeature\(/.test(fn)) {
      fail("the bulk status setter writes straight to the database, "
        + "round the rule that nothing goes live before its ground is closed");
    }

    /* 2. Each feature's own list.

       A trench is existing, planned, to be removed or as-laid; a main
       is planned, as-laid or live. Marking a mixed selection as-laid
       would write a trench word onto a cable — unselectable in its own
       dropdown and meaningless to everything that reads it. */
    if (!/statusesFor\(f, lineTypes\)/.test(fn)) {
      fail("the bulk status setter does not check the stage is in each feature's own list");
    }

    /* 3. One undo entry.

       Forty separate ones would take forty presses to put back, which
       is not an undo. */
    if (!/withUndo\(/.test(fn)) {
      fail("a bulk status change cannot be undone in one press");
    }

    /* 4. And it says what it did.

       The objection to the old buttons was that the menu changed a
       field without recording it. A count of what was set, what was
       refused and what could not take the stage is the answer to that. */
    if (!/setStatus\(/.test(fn)) {
      fail("the bulk status setter does not report what it changed");
    }
    if (!/refused/.test(fn)) {
      fail("a refused save is counted as done \u2014 the report would overstate the work");
    }
  }

  /* 5. The refusal is tellable from a save.

     saveFeature returns false where it refuses. Without that a caller
     setting many at once cannot count them, and every refusal reads as
     a success. */
  const save = canvas.slice(canvas.indexOf("async function saveFeature"));
  if (!/return false;/.test(save.slice(0, save.indexOf("setFeatures((f) =>")))) {
    fail("saveFeature does not report a refusal, so a bulk set cannot count one");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Statuses behave (a service has its own three, nothing is live before its ground is closed).");
process.exit(bad ? 1 : 0);
