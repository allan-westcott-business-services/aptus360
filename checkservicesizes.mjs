/* What a service pipe is when nothing else has said.

   A service takes its size from the outline design's default, and where
   nobody filled that in it was drawn with no size — which reads on the
   bill as "Water Service (pipe size not set)" against four hundred
   metres of perfectly ordinary 25mm.

   The floor fixes that. What is checked here is the order things are
   asked in, because a floor that overrode anything would be worse than
   no floor: a project that has chosen 32mm water would silently get
   25mm on every plot. */
import { readFileSync } from "node:fs";
import { SERVICE_SIZES, serviceSizeFor } from "./src/features/gis/serviceDefaults.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

// 1. The sizes are the ones asked for.
{
  if (SERVICE_SIZES.water !== "25mm") fail(`water services default to ${SERVICE_SIZES.water}`);
  if (SERVICE_SIZES.gas !== "32mm") fail(`gas services default to ${SERVICE_SIZES.gas}`);
  if (serviceSizeFor("water") !== "25mm") fail("the water lookup does not agree with the table");
  if (serviceSizeFor("gas") !== "32mm") fail("the gas lookup does not agree with the table");
}

// 2. Electric has none, and neither has anything else.
//
//    A cable is a reference into Electric_Cable_Size, not a piece of
//    text. Guessing one would put an id-shaped hole where a cable
//    should be, and the bill would show a cable that is not in the
//    catalogue rather than one nobody has chosen.
{
  if (serviceSizeFor("electric") !== null) fail("electric was given a text size");
  if (serviceSizeFor("telecoms") !== null) fail("a utility with no floor was given one");
  if (serviceSizeFor(undefined) !== null) fail("a missing layer was given a size");
}

/* The resolver as GISCanvasPage has it, so the order can be checked
   without a browser. Kept deliberately close to the original — if that
   changes shape this stops being a check of anything, which is what the
   text assertions below are for. */
function defaultsFor({ lineTypeKey, layerKey, utilityId = 1, scope = null }) {
  const isService = String(lineTypeKey).includes("service");
  const floor = isService && serviceSizeFor(layerKey)
    ? { Size: serviceSizeFor(layerKey) } : {};
  if (!utilityId) return floor;
  if (!scope) return floor;
  if (layerKey === "electric") {
    const id = isService
      ? scope.Default_Service_Cable_Size_ID : scope.Default_Main_Cable_Size_ID;
    return id != null ? { VD_Cable_Size_ID: Number(id) } : {};
  }
  const size = isService ? scope.Default_Service_Size : scope.Default_Main_Size;
  return size ? { Size: size } : floor;
}

// 3. A project that has chosen a size keeps it.
//
//    The floor is a floor. Overriding the outline design would be worse
//    than having no default at all: a scheme on 32mm water would get
//    25mm on every plot and nothing would say so.
{
  const chosen = defaultsFor({
    lineTypeKey: "water_service", layerKey: "water",
    scope: { Default_Service_Size: "32mm" },
  });
  if (chosen.Size !== "32mm") fail(`a chosen service size came out as ${chosen.Size}`);

  const none = defaultsFor({
    lineTypeKey: "water_service", layerKey: "water",
    scope: { Default_Service_Size: null },
  });
  if (none.Size !== "25mm") fail(`an unset scope did not fall back: ${none.Size}`);

  /* And a project with no scope row at all, which is every project that
     has not been through the outline design screen. */
  const bare = defaultsFor({ lineTypeKey: "gas_service", layerKey: "gas", scope: null });
  if (bare.Size !== "32mm") fail("a project with no scope row got no service size");
}

// 4. Mains are not defaulted.
//
//    A main is sized by the load it carries. Leaving one unset is
//    honest when the calculation cannot run; putting a number on it
//    would be a figure on a drawing that nothing worked out.
{
  for (const [lt, lk] of [["water_main", "water"], ["gas_main", "gas"]]) {
    const r = defaultsFor({ lineTypeKey: lt, layerKey: lk, scope: null });
    if (r.Size) fail(`a ${lt} was defaulted to ${r.Size}`);
  }
  /* Except where the project says so, which is what the scope is for. */
  const said = defaultsFor({
    lineTypeKey: "water_main", layerKey: "water",
    scope: { Default_Main_Size: "180mm" },
  });
  if (said.Size !== "180mm") fail("a project's default main size was ignored");
}

// 5. Electric services still resolve to a cable, not to text.
{
  const e = defaultsFor({
    lineTypeKey: "elec_service", layerKey: "electric",
    scope: { Default_Service_Cable_Size_ID: 7 },
  });
  if (e.Size) fail("an electric service was given a text size");
  if (e.VD_Cable_Size_ID !== 7) fail("an electric service lost its cable");
}

// 6. The canvas asks in that order, and the migration fills the same
//    sizes.
//
//    Both are copies of what is checked above — the resolver here is a
//    stand-in and the SQL is a separate file — so the two are read
//    rather than trusted.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/serviceSizeFor/.test(canvas)) fail("the canvas does not use the service floor");
  if (!/import \{ serviceSizeFor \}/.test(canvas)) fail("the canvas does not import it");

  const sql = readFileSync(
    "./supabase/migrations/0164_service_pipe_sizes.sql", "utf8");
  for (const [layer, key, size] of [
    ["water", "water_service", SERVICE_SIZES.water],
    ["gas", "gas_service", SERVICE_SIZES.gas],
  ]) {
    if (!sql.includes(`'"${size}"'::jsonb`)) {
      fail(`the backfill does not write ${size} for ${layer}`);
    }
    if (!sql.includes(`= '${key}'`)) fail(`the backfill does not match ${key}`);
  }
  /* Only the blanks. A size somebody wrote is somebody's answer. */
  if ((sql.match(/COALESCE\("Attributes" ->> 'Size', ''\) = ''/g) || []).length !== 2) {
    fail("the backfill does not restrict itself to services with no size");
  }
  /* And nothing on electric. */
  if (/elec_service/.test(sql)) fail("the backfill touches electric services");
}

console.log(bad ? `\n${bad} problem(s)`
  : `Service sizes behave (water ${SERVICE_SIZES.water}, gas ${SERVICE_SIZES.gas}, `
    + "the project's own choice first).");
process.exit(bad ? 1 : 0);
