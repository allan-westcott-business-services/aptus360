/* Two sizes on a utility line, and which one is in force.

   A build works out what each length ought to be from the load; a
   designer overrides it, because the drawing does not know about a road
   crossing or a duct already in the ground. Held in one field those two
   facts destroy each other: rebuilding wiped every override silently,
   and overriding made the calculated size unrecoverable.

   Held apart, both survive and either can be read. */
import { sizeIdFor, isOverridden, SIZE_KEYS, utilityOf } from "./src/features/gis/sizeMode.js";

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
  ["water", "Water_Pipe_Size_ID"], ["electric", "Cable_Size_ID"]]) {
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

console.log(bad ? `\n${bad} problem(s)`
  : "Size modes behave (both recorded, either read, neither lost).");
process.exit(bad ? 1 : 0);
