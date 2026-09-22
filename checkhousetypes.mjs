/* A development's plot breakdown.

   Asked for: the builder's named house types for a development — the
   Sunflower, code SUNF, a 3 bed semi-detached, with a floor plan — at
   the top of the Plots tab, and a Code column in the Add plots rows, to
   the right of House type, offering them.

   Held here:
     - one SUNF per development, however it is typed;
     - a code chosen for a plot sets its house type from the breakdown,
       so the two cannot be entered at odds;
     - floor plans are private, and a caller cannot attach another
       project's file;
     - retiring a house type never takes it off the plots built as it;
     - nothing about it can stop the Plots tab loading. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const sql = readFileSync("./supabase/migrations/0236_house_types.sql", "utf8").replace(/--[^\n]*/g, "");
const sql37 = readFileSync("./supabase/migrations/0237_plot_house_type_link.sql", "utf8").replace(/--[^\n]*/g, "");
const api = readFileSync("./netlify/functions/house-types.js", "utf8");
const form = readFileSync("./src/features/plots/AddPlotsForm.jsx", "utf8");
const tab = readFileSync("./src/features/plots/PlotsTab.jsx", "utf8");
const panel = readFileSync("./src/features/plots/PlotBreakdown.jsx", "utf8");
const photos = readFileSync("./src/api/connectionPhotos.js", "utf8");

// 1. What each house type records.
{
  for (const col of ['"Name"', '"Code"', '"Property_Config_ID"', '"Storage_Path"', '"File_Name"']) {
    if (!sql.includes(col)) fail(`a house type has no ${col}`);
  }
  if (!/ON "Project_House_Type" \("Project_ID", lower\("Code"\)\)\s*\n\s*WHERE "Code" IS NOT NULL AND "Is_Active"/.test(sql)) {
    fail("two house types in one development can share a code, so the Code dropdown "
      + "could offer two SUNFs meaning different houses");
  }
  /* ── Its own column, and verified ──

     0236 added Plot.House_Type_ID with IF NOT EXISTS; the live table
     already had one pointing at Property_Type, holding 35 plots, and
     the guard adopted it in silence. Adding plots with a code then
     failed its foreign key. The link is Project_House_Type_ID, and
     0237 STOPS if that name turns out to point anywhere else. */
  if (/ALTER TABLE "Plot"\s*\n\s*ADD COLUMN IF NOT EXISTS "House_Type_ID"/.test(sql)) {
    fail("0236 still adds Plot.House_Type_ID, a name the live table already used "
      + "for something else");
  }
  if (!/ADD COLUMN IF NOT EXISTS "Project_House_Type_ID" bigint\s*\n\s*REFERENCES "Project_House_Type"/.test(sql37)) {
    fail("a plot cannot say which named house it is");
  }
  if (!/IF target IS DISTINCT FROM '"Project_House_Type"' THEN\s*\n\s*RAISE EXCEPTION/.test(sql37)) {
    fail("0237 trusts IF NOT EXISTS — the thing that caused this — rather than "
      + "checking where the column points");
  }
  /* A retired house type must not wipe the name off plots built as it. */
  if (!/ON DELETE SET NULL/.test(sql37)) fail("deleting a house type is not survivable by its plots");
  /* The app writes and counts the new column, never the old one. */
  if (/House_Type_ID: Number\(r\.houseTypeId\)/.test(form.replace(/Project_House_Type_ID/g, ""))) {
    fail("plots are still written to the old House_Type_ID, which points at Property_Type");
  }
  if (!/select\("Project_House_Type_ID"\)/.test(api)) {
    fail("the breakdown's plot counts read the old column, so a house type shows "
      + "the plots whose old property type shares its id");
  }
  if (!/\.update\(\{ Is_Active: false \}\)/.test(api) || /\.delete\(\)/.test(api)) {
    fail("a house type is deleted outright rather than retired — its plots lose the "
      + "name they were built as");
  }
}

// 2. Floor plans: private, and only this row's.
{
  if (!/VALUES \('house-types', 'house-types', false\)/.test(sql)) {
    fail("the floor plans' bucket is not created, or is public — a builder's floor "
      + "plans are its commercial documents");
  }
  if (!/createSignedUrl\(r\.Storage_Path, 300/.test(api)) {
    fail("a floor plan is opened by a link that does not expire");
  }
  if (!/path\.startsWith\(`project-\$\{r\.Project_ID\}\/\$\{r\.House_Type_ID\}\/`\)/.test(api)) {
    fail("a caller can attach a file from another project or another house type");
  }
  /* Replacing a plan removes the old file — after the row points at
     the new one, so a failed update never leaves it pointing at nothing. */
  const at = api.indexOf('what === "attach"');
  const block = api.slice(at, at + 1400);
  if (!(block.indexOf(".update(") < block.indexOf(".remove(["))) {
    fail("the old floor plan is removed before the row points at the new one");
  }
}

// 3. Codes are unique, and said so in words.
{
  if (!/The code \$\{clash\.Code\} is already the \$\{clash\.Name\}/.test(api)) {
    fail("a duplicate code is refused with the index's bare message, not which house has it");
  }
  /* Called on create AND on edit — counted by call, not by name, since
     the definition is not a use. */
  if ((api.match(/await codeTaken\(/g) || []).length < 2) {
    fail("the duplicate code check is not applied on both create and edit");
  }
}

// 4. The Code column in the Add plots rows.
{
  const head = form.indexOf("<span>House type</span>");
  const code = form.indexOf("<span>Code</span>");
  const prefix = form.indexOf("<span>Prefix (optional)</span>");
  if (code < 0) fail("the Add plots rows have no Code column");
  else if (!(head < code && code < prefix)) {
    fail("the Code column is not to the right of House type");
  }
  /* Choosing a code sets the house type from the breakdown. */
  if (!/configId: String\(h\.Property_Config_ID\)/.test(form)) {
    fail("choosing SUNF does not set the Sunflower's house type, so the two can be "
      + "entered at odds");
  }
  if (!/\.\.\.\(r\.houseTypeId \? \{ Project_House_Type_ID: Number\(r\.houseTypeId\) \} : \{\}\)/.test(form)) {
    fail("the chosen code is not saved on the plots, or is sent as null for plots "
      + "without one");
  }
  if (!/houseTypes=\{houseTypes\}/.test(tab)) fail("the add form is not given the breakdown");
}

// 4b. A row offers only the codes of its own house type.
{
  /* Reported off a screenshot: a 3 Bed Detached row offered SUNF, the
     Sunflower's 3 bed semi, as well as CARN. */
  if (!/houseTypes\.filter\(\(h\) => String\(h\.Property_Config_ID \?\? ""\) === String\(r\.configId\)\)/.test(form)) {
    fail("the Code list is not filtered to the row's house type");
  }
  if (!/\{codesFor\(r\)\.map\(/.test(form) || /\{houseTypes\.map\(\(h\) => \(\s*\n\s*<option key=\{h\.House_Type_ID\}/.test(form)) {
    fail("the Code list still offers every house type");
  }
  /* With no house type yet, all codes — picking one sets the type. */
  if (!/: houseTypes\);/.test(form)) {
    fail("a row with no house type chosen offers no codes, so the quicker way "
      + "round — pick the code, get the type — is lost");
  }
  /* Changing the type clears a code that no longer matches. */
  if (!/setRow\(r\.key, \{ configId: v, \.\.\.\(keep \? \{\} : \{ houseTypeId: "" \}\) \}\)/.test(form)) {
    fail("changing a row's house type leaves a code of another type on it, so the "
      + "Sunflower's name would be saved on a house it is not");
  }
}

// 5. At the top of the Plots tab, and never in the way of it.
{
  const bd = tab.indexOf("<PlotBreakdown");
  const head = tab.indexOf('<div className="tab-head">', bd - 400);
  if (bd < 0) fail("the breakdown is not on the Plots tab");
  else if (!(bd < head)) fail("the breakdown is not at the top of the Plots tab");
  /* A breakdown that cannot load — 0236 not yet run — must not stop the
     plots showing. */
  if (!/\.catch\(\(\) => \{ setHouseTypes\(\[\]\); setHouseCounts\(\{\}\); \}\)/.test(tab)) {
    fail("a breakdown that fails to load takes the Plots tab down with it");
  }
  if (!/onChange=\{\(v\) => onSave\(\{ Property_Config_ID: v \|\| null \}\)\}/.test(panel)) {
    fail("a house type's type cannot be changed in the breakdown");
  }
}

// 6. And the photo upload found broken on the way.
{
  const f = photos.slice(photos.indexOf("export async function addPhoto"));
  if (!(f.indexOf("const supabase = await getSupabase()") < f.indexOf("if (!supabase)"))) {
    fail("a connection photo tests `supabase` before declaring it — a ReferenceError "
      + "on every upload");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "A development's house types have names, codes, types and plans; plots pick them by code.");
process.exit(bad ? 1 : 0);
