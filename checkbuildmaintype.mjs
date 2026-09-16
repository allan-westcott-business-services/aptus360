/* The type a build lays a new main as \u2014 ours, never the incumbent's.
   Reported as a style fault twice over: Build Water Network laid
   `water_main_existing`, so the pipe drew in the incumbent's grey and
   defaulted to `existing` \u2014 a pipe this job had supposedly done
   nothing to. The build found its type with `/main/i` and took the
   first in Sort_Order, and on water the incumbent's type sorts first.
   Gas and electric passed by luck of an ordering anybody can change
   in admin. Recurring faults 126 and 134. */
import { readFileSync } from "node:fs";
import { newMainTypeFor } from "./src/features/gis/buildStatus.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* The real water catalogue's shape: the incumbent's type sorted AHEAD
   of ours, which is the ordering that bit. */
const lineTypes = [
  { Type_Key: "water_main_existing", Label: "Existing water main (incumbent)",
    Layer_Key: "water", Sort_Order: 46 },
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water",
    Sort_Order: 50 },
  { Type_Key: "water_service", Label: "Water Service", Layer_Key: "water",
    Sort_Order: 60 },
  { Type_Key: "gas_main", Label: "Gas Main", Layer_Key: "gas", Sort_Order: 30 },
  { Type_Key: "gas_main_existing", Label: "Existing gas main (incumbent)",
    Layer_Key: "gas", Sort_Order: 34 },
];

// 1. Water: ours, not the incumbent's, whatever the sort order says.
{
  const t = newMainTypeFor(lineTypes, "water");
  if (t?.Type_Key !== "water_main") {
    fail(`the water build would lay ${t?.Type_Key ?? "nothing"} \u2014 the `
      + "incumbent's grey pipe, defaulting to a status of existing");
  }
}

// 2. Gas keeps working when its ordering flips the same way.
{
  const flipped = lineTypes.map((t) => (t.Type_Key === "gas_main_existing"
    ? { ...t, Sort_Order: 1 } : t));
  const t = newMainTypeFor(flipped, "gas");
  if (t?.Type_Key !== "gas_main") {
    fail("gas passes only by luck of the sort order \u2014 reorder the types "
      + "in admin and the gas build lays the incumbent's main");
  }
}

// 3. An incumbent named only in the label is still not ours. A type
//    renamed in admin keeps its key, so both are read.
{
  const relabelled = [
    { Type_Key: "water_old", Label: "Incumbent water main",
      Layer_Key: "water", Sort_Order: 1 },
    ...lineTypes,
  ];
  if (newMainTypeFor(relabelled, "water")?.Type_Key !== "water_main") {
    fail("a type whose LABEL says incumbent is laid as ours");
  }
}

// 4. No candidate at all comes back null, so the caller can refuse
//    with its own message rather than lay nothing quietly.
{
  if (newMainTypeFor(lineTypes, "heat") !== null) {
    fail("a layer with no mains type invents one");
  }
}

// 5. Wired: every build asks the one predicate; the loose pattern that
//    took first-in-sort-order is gone.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/newMainTypeFor\(lineTypes, "water"\)/.test(canvas)) {
    fail("the water build does not use the shared predicate");
  }
  if (!/newMainTypeFor\(lineTypes, "gas"\)/.test(canvas)) {
    fail("the gas readers do not use the shared predicate");
  }
  if (/\/main\/i\.test\(t\.Type_Key\) && !\/service\/i\.test\(t\.Type_Key\)/.test(canvas)) {
    fail("a loose /main/i find over type keys survives \u2014 the first type "
      + "in sort order decides what a build lays");
  }
  /* And the laid pipe states its stage. Sliced to the water build's
     write \u2014 its runs are labelled `W${i + 1}` and nothing else's are \u2014
     per the handover's anchoring note. */
  const at = canvas.indexOf("Label: `W${i + 1}`");
  const write = at >= 0 ? canvas.slice(at, at + 1500) : "";
  if (!write) {
    fail("the water build's write cannot be found where it was \u2014 this "
      + "check needs re-anchoring, not deleting");
  } else if (!/Build_Status: "planned"/.test(write)) {
    fail("a generated water main carries no stage of its own \u2014 it rides "
      + "on the default, which is what read `existing` off the wrong type");
  }
}

// 6. The line editors state the type; they do not offer to change it.
//    A line is drawn as what it is: the type decides the status list,
//    the bill and what every build reads, so retyping a drawn line
//    reclassifies work. The drawn-wrong line is deleted and redrawn.
{
  const fe = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (/setAttr\("Line_Type"\)/.test(fe)) {
    fail("a line editor still offers changing the line type");
  }
  if (!/id="fe-type" readOnly/.test(fe)) {
    fail("the editor no longer says what type a line is \u2014 stating it is "
      + "not the same as offering it");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Builds lay our main type, planned, and the editors only state it.");
process.exit(bad ? 1 : 0);
