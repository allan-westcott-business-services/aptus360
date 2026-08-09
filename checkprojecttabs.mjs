/* Which project tabs a section shows.

   Two filters combine here — the project's stage, which is a fact, and
   the section's preference, which is data — and the ways they can go
   wrong are quiet ones: a tab nobody can reach, a section with nothing
   on screen, or a seeded row naming a tab that does not exist. */
import { readFileSync } from "node:fs";
import {
  TABS, PINNED_TAB, tabsForStage, isHidden, visibleTabs,
} from "./src/lib/projectTabs.js";
import { AREAS, PROJECT_VIEWS, isProjectView, projectsViewFor } from "./src/lib/navigation.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const ids = TABS.map((t) => t.id);

// 1. Absent row means shown — a tab added later appears everywhere.
if (isHidden([], "operations", "plots")) fail("a tab with no row was treated as hidden");
if (!visibleTabs("contract", "operations", []).length) fail("no config gave no tabs");

// 2. A row saying false hides it.
const rows = [{ Area_Key: "operations", Tab_Key: "av", Is_Visible: false }];
if (!isHidden(rows, "operations", "av")) fail("Is_Visible false did not hide the tab");
if (isHidden(rows, "commercial", "av")) fail("one section's rule leaked into another");
if (visibleTabs("contract", "operations", rows).some((t) => t.id === "av"))
  fail("hidden tab still offered");
if (!visibleTabs("contract", "commercial", rows).some((t) => t.id === "av"))
  fail("tab hidden for the wrong section");

// 3. Details cannot be hidden — a section always has somewhere to land.
const hideAll = TABS.map((t) => ({ Area_Key: "finance", Tab_Key: t.id, Is_Visible: false }));
const left = visibleTabs("contract", "finance", hideAll);
if (left.length !== 1 || left[0].id !== PINNED_TAB)
  fail(`hiding every tab left ${JSON.stringify(left.map((t) => t.id))}, expected only ${PINNED_TAB}`);

// 4. A section cannot add a tab the stage does not have.
const wantAll = [];   // nothing hidden
if (visibleTabs("tender", "operations", wantAll).some((t) => t.id === "calloffs"))
  fail("Call-offs offered on a tender project");
if (visibleTabs("contract", "design", wantAll).some((t) => t.id === "poc"))
  fail("POC Applications offered on a contract project");

// 5. No area at all falls back to the stage rule alone.
const noArea = visibleTabs("contract", null, rows).map((t) => t.id);
if (JSON.stringify(noArea) !== JSON.stringify(tabsForStage("contract").map((t) => t.id)))
  fail("with no area, something other than the stage rule applied");

// 6. Every projects view belongs to the area it claims, and no area
//    claims two — the sidebar scopes itself on this lookup.
for (const [view, areaKey] of Object.entries(PROJECT_VIEWS)) {
  const area = AREAS.find((a) => a.id === areaKey);
  if (!area) { fail(`${view} claims area "${areaKey}", which does not exist`); continue; }
  if (!area.items.some((i) => i.view === view))
    fail(`${view} is not listed under the ${area.label} area`);
  if (projectsViewFor(areaKey) !== view && Object.values(PROJECT_VIEWS)
    .filter((a) => a === areaKey).length === 1) {
    fail(`projectsViewFor("${areaKey}") did not return ${view}`);
  }
}
if (!isProjectView("ops-projects")) fail("ops-projects not recognised as a projects view");
if (isProjectView("call-offs")) fail("call-offs wrongly recognised as a projects view");

// 7. The seed names tabs and areas that actually exist. A typo here
//    hides nothing and reports nothing, which is the worst outcome:
//    the setting looks applied and is not.
const sql = readFileSync("supabase/migrations/0138_project_tabs.sql", "utf8");
const seeded = [...sql.matchAll(/\('([a-z]+)',\s*'([a-z-]+)'\)/g)].map((m) => [m[1], m[2]]);
if (seeded.length < 20) fail(`only parsed ${seeded.length} seeded rows — check the migration`);
for (const [area, tab] of seeded) {
  if (!AREAS.some((a) => a.id === area)) fail(`seed names area "${area}", which does not exist`);
  if (!ids.includes(tab)) fail(`seed names tab "${tab}", which does not exist`);
  if (tab === PINNED_TAB) fail(`seed tries to hide "${tab}", which is pinned`);
}

// 8. The seed leaves every section something beyond Details.
for (const area of new Set(seeded.map(([a]) => a))) {
  const seedRows = seeded.filter(([a]) => a === area)
    .map(([, tab]) => ({ Area_Key: area, Tab_Key: tab, Is_Visible: false }));
  for (const stage of ["tender", "contract"]) {
    const shown = visibleTabs(stage, area, seedRows);
    if (shown.length < 2) fail(`${area} at ${stage} stage shows only ${shown.length} tab(s)`);
  }
}

// 9. Tendering & Design keeps everything — it is not in the seed.
if (seeded.some(([a]) => a === "design")) fail("the seed hides tabs from Tendering & Design");

const cover = new Set(seeded.map(([a]) => a));
console.log(bad
  ? `\n${bad} problem(s)`
  : `Project tab visibility behaves (${TABS.length} tabs, ${cover.size} sections seeded).`);
process.exit(bad ? 1 : 0);
