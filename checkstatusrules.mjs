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
import {
  BUILD_STATUSES, MAIN_STATUSES, SERVICE_STATUSES, statusesFor,
  isServiceFeature, isMainFeature, blocksLive, canGoLive, LIVE_KEY, statusOf,
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
  if (!/blocksLive\(/.test(editor)) fail("the editor does not grey Live");
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

console.log(bad ? `\n${bad} problem(s)`
  : "Statuses behave (a service has its own three, nothing is live before its ground is closed).");
process.exit(bad ? 1 : 0);
