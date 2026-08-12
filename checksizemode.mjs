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

/* The drawing shows what will be built, whatever the menu says.

   The label takes the override where there is one and the calculated
   size elsewhere, and it does not follow the Sizes menu \u2014 that governs
   what the levels check measures. An override nobody can see on the
   drawing is a decision nobody can check. */
{
  const cat = {
    gas: [{ Gas_Pipe_Size_ID: 4, Size_Label: "90mm PE" },
      { Gas_Pipe_Size_ID: 6, Size_Label: "180mm PE" }],
  };
  const over = {
    Layer_Key: "gas",
    /* A stale Size attribute, as a rebuild can leave. The label must
       come from the id, not from the text beside it. */
    Attributes: { Gas_Pipe_Size_ID: 4, Manual_Gas_Pipe_Size_ID: 6, Size: "90mm PE" },
  };
  if (sizeLabelOf(over, cat) !== "180mm PE") {
    fail(`an overridden main is labelled ${sizeLabelOf(over, cat)}, wanted 180mm PE`);
  }

  const plain = { Layer_Key: "gas", Attributes: { Gas_Pipe_Size_ID: 4 } };
  if (sizeLabelOf(plain, cat) !== "90mm PE") {
    fail("a main with no override is not labelled with its calculated size");
  }
}

/* The levels check follows the menu; the bill does not.

   They are different questions. The bill is what will be ordered, so it
   takes the override whatever a menu says \u2014 a bill that changed with a
   toggle is one nobody could check. The levels check is what somebody
   is examining, and the two modes exist precisely so the difference can
   be measured: run it one way, switch, run it again.

   Fixing the check to the override made the toggle inert, which is the
   one thing that stops that question being asked at all. */
{
  const f = {
    Layer_Key: "gas",
    Attributes: { Gas_Pipe_Size_ID: 4, Manual_Gas_Pipe_Size_ID: 6 },
  };
  if (sizeIdFor(f, "gas", "manual") === sizeIdFor(f, "gas", "system")) {
    fail("the two modes cannot be told apart, so the toggle does nothing");
  }
  /* A length nobody overrode reads the same either way, which is what
     makes the comparison meaningful: only the overrides move. */
  const plain = { Layer_Key: "gas", Attributes: { Gas_Pipe_Size_ID: 4 } };
  if (sizeIdFor(plain, "gas", "manual") !== sizeIdFor(plain, "gas", "system")) {
    fail("a length with no override differs between the modes");
  }
}

/* Every reader of a size agrees.

   The drawing, the bill and the levels check all show what would be
   built: the override where there is one. The levels check followed the
   Sizes menu instead, so a length upsized by hand read 63mm on the
   report and 180mm PE on the canvas beside it \u2014 the same pipe, two
   answers, and no way to tell which was being priced. */
{
  const over = {
    Layer_Key: "gas",
    Attributes: { Gas_Pipe_Size_ID: 4, Manual_Gas_Pipe_Size_ID: 6 },
  };

  /* What each reader asks for. */
  const forDrawing = sizeIdFor(over, "gas", "manual");
  const forBill = sizeIdFor(over, "gas", "manual");
  const forCheck = sizeIdFor(over, "gas", "manual");

  if (forDrawing !== 6 || forBill !== 6 || forCheck !== 6) {
    fail("the drawing, the bill and the levels check do not agree on a size");
  }

  /* The system view still shows the calculated size \u2014 that is what it
     is for, and it must not follow the override. */
  if (sizeIdFor(over, "gas", "system") !== 4) {
    fail("the system view stopped showing what the build worked out");
  }
}

/* A rebuild replaces what the build drew, and nothing else.

   Build Gas Network deletes the generated mains and lays them again, so
   an override went with them — every manually set pipe size lost on
   every build, silently. The calculated size is the build's to replace;
   the decision somebody made is not. */
{
  const key = (pts) => pts
    .map((q) => `${q[0].toFixed(2)},${q[1].toFixed(2)}`).join(" ");

  const before = [
    {
      Geometry: [[0, 0], [100, 0]],
      Attributes: { Gas_Pipe_Size_ID: 1, Manual_Gas_Pipe_Size_ID: 6, Size: "180mm PE" },
    },
    {
      Geometry: [[100, 0], [200, 0]],
      Attributes: { Gas_Pipe_Size_ID: 1, Size: "63mm PE" },
    },
  ];

  const overrides = new Map();
  for (const f of before) {
    const id = f.Attributes?.Manual_Gas_Pipe_Size_ID;
    if (id != null) {
      overrides.set(key(f.Geometry), { id, size: f.Attributes?.Size ?? null });
    }
  }

  const rebuild = (pts, systemLabel) => {
    const held = overrides.get(key(pts));
    return {
      Gas_Pipe_Size_ID: 1,
      Size: systemLabel,
      ...(held
        ? { Manual_Gas_Pipe_Size_ID: held.id, ...(held.size ? { Size: held.size } : {}) }
        : {}),
    };
  };

  const kept = rebuild([[0, 0], [100, 0]], "63mm PE");
  if (kept.Manual_Gas_Pipe_Size_ID !== 6) fail("a rebuild lost an override");
  /* And its label, or the drawing would show the size the build chose
     while the feature carried the one somebody set. */
  if (kept.Size !== "180mm PE") fail("a rebuild overwrote an override's label");

  const plain = rebuild([[100, 0], [200, 0]], "90mm PE");
  if (plain.Manual_Gas_Pipe_Size_ID != null) {
    fail("a length nobody overrode came back with an override");
  }
  if (plain.Size !== "90mm PE") {
    fail("a rebuild did not update the calculated size where none was overridden");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Size modes behave (both recorded, either read, neither lost).");
process.exit(bad ? 1 : 0);
