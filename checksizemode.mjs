/* Two sizes on a utility line, and which one is in force.

   A build works out what each length ought to be from the load; a
   designer overrides it, because the drawing does not know about a road
   crossing or a duct already in the ground. Held in one field those two
   facts destroy each other: rebuilding wiped every override silently,
   and overriding made the calculated size unrecoverable.

   Held apart, both survive and either can be read. */
import {
  sizeIdFor, isOverridden, SIZE_KEYS, utilityOf, sizeLabelOf,
} from "./src/features/gis/sizeMode.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const built = { Layer_Key: "gas", Attributes: { Gas_Pipe_Size_ID: 4 } };
const over = {
  Layer_Key: "gas",
  Attributes: { Gas_Pipe_Size_ID: 4, Manual_Gas_Pipe_Size_ID: 6 },
};

// 1. An override does not destroy the calculated size, and the
//    calculated size does not hide the override.
if (sizeIdFor(over, "gas", "system") !== 4) fail("an override overwrote the system size");
if (sizeIdFor(over, "gas", "manual") !== 6) fail("the override was not read in manual mode");

// 2. Manual mode falls back to the calculated size where nothing was
//    overridden — "the sizes" means the ones that would be built, not a
//    drawing full of blanks on every length nobody touched.
if (sizeIdFor(built, "gas", "manual") !== 4) {
  fail("a length with no override read as unsized in manual mode");
}

// 3. System mode does not fall back the other way. The system's answer
//    is the system's answer; showing an override there answers a
//    different question.
const manualOnly = { Layer_Key: "gas", Attributes: { Manual_Gas_Pipe_Size_ID: 6 } };
if (sizeIdFor(manualOnly, "gas", "system") !== null) {
  fail("system mode showed an override as though the build had produced it");
}

// 4. An override is marked as one whatever mode is showing: a size
//    somebody chose is a decision, and one that looks identical to a
//    calculation is one nobody revisits.
if (!isOverridden(over, "gas")) fail("an override was not marked");
if (isOverridden(built, "gas")) fail("a calculated size was marked as an override");

// 5. Every utility has both keys, and the system key is the one that
//    already existed — so nothing has to be migrated.
for (const [utility, keys] of Object.entries(SIZE_KEYS)) {
  if (!keys.system || !keys.manual) fail(`${utility} is missing a size key`);
  if (keys.system === keys.manual) fail(`${utility} uses one key for both sizes`);
  if (!keys.manual.startsWith("Manual_")) {
    fail(`${utility}'s override key is not named as one`);
  }
}
for (const [utility, want] of [["gas", "Gas_Pipe_Size_ID"],
  ["water", "Water_Pipe_Size_ID"], ["electric", "VD_Cable_Size_ID"]]) {
  if (SIZE_KEYS[utility].system !== want) {
    fail(`${utility}'s system key changed to ${SIZE_KEYS[utility].system}, `
      + `which would strand every size already stored in ${want}`);
  }
}

// 6. A trench is not a utility line and has no sizes of its own.
if (utilityOf({ Layer_Key: "trench" })) fail("a trench was treated as a utility");
if (sizeIdFor({ Layer_Key: "trench", Attributes: {} }, "trench") !== null) {
  fail("a trench returned a size");
}

/* What the bill counts.

   The override where there is one, the calculated size everywhere else
   — the pipe that will actually go in the ground. A length upsized by
   hand and ordered at the size the build rejected is the one figure on
   a drawing that has to be right.

   Deliberately not the canvas toggle: that is a view, so the two can be
   compared, and a bill that changed depending on which way a menu was
   left is a bill nobody could check. */
{
  const forBill = (f, utility) => sizeIdFor(f, utility, "manual");

  const built = { Layer_Key: "water", Attributes: { Water_Pipe_Size_ID: 3 } };
  const over = {
    Layer_Key: "water",
    Attributes: { Water_Pipe_Size_ID: 3, Manual_Water_Pipe_Size_ID: 7 },
  };

  if (forBill(built, "water") !== 3) fail("the bill ignored a calculated size");
  if (forBill(over, "water") !== 7) fail("the bill ordered the overruled size");

  /* And the bill does not follow the toggle: whichever way it is set,
     the answer above is the one that gets ordered. */
  for (const mode of ["system", "manual"]) {
    const shown = sizeIdFor(over, "water", mode);
    if (mode === "system" && shown === forBill(over, "water")) {
      fail("the bill and the system view cannot be told apart");
    }
  }
}

/* What the drawing calls a size.

   The override where there is one. A label still showing the calculated
   pipe on a length somebody upsized is the one figure that gets read
   off the drawing and ordered from. */
{
  const cat = {
    electric: [{ Cable_Size_ID: 7, Size_Label: "185mm\u00b2 WF" },
      { Cable_Size_ID: 9, Size_Label: "300mm\u00b2 WF" }],
    gas: [{ Gas_Pipe_Size_ID: 4, Size_Label: "90mm PE" },
      { Gas_Pipe_Size_ID: 6, Size_Label: "125mm PE" }],
    water: [{ Water_Pipe_Size_ID: 3, Diameter_mm: 180 }],
  };

  const label = (f) => sizeLabelOf(f, cat);

  if (label({ Layer_Key: "gas", Attributes: { Gas_Pipe_Size_ID: 4 } }) !== "90mm PE") {
    fail("a calculated gas size was not labelled");
  }
  if (label({
    Layer_Key: "gas",
    Attributes: { Gas_Pipe_Size_ID: 4, Manual_Gas_Pipe_Size_ID: 6 },
  }) !== "125mm PE") {
    fail("an overridden gas main still shows the calculated size");
  }

  /* Electric's catalogue is keyed on Cable_Size_ID while the feature
     stores VD_Cable_Size_ID. Looking one up by the other found nothing
     and left every cable unlabelled. */
  if (label({
    Layer_Key: "electric",
    Attributes: { VD_Cable_Size_ID: 7, Manual_VD_Cable_Size_ID: 9 },
  }) !== "300mm\u00b2 WF") {
    fail("an overridden cable is not labelled with its override");
  }

  /* A size with no label falls back to its diameter. */
  if (label({ Layer_Key: "water", Attributes: { Water_Pipe_Size_ID: 3 } }) !== "180mm") {
    fail("a size with no label did not fall back to its diameter");
  }

  /* And with no catalogue at all, the Size attribute the build and the
     editor both write \u2014 so a drawing reads without a lookup. */
  if (sizeLabelOf({ Layer_Key: "gas", Attributes: { Size: "63mm" } }) !== "63mm") {
    fail("the written size label was not used as a fallback");
  }
  if (sizeLabelOf({ Layer_Key: "trench", Attributes: { Size: "x" } })) {
    fail("a trench was given a pipe size label");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Size modes behave (both recorded, either read, neither lost).");
process.exit(bad ? 1 : 0);
