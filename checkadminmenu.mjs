/* The admin menu, and the pages that merged.

   Regions and Sub Regions, Roles and Crafts, and the three POC lists
   were each several entries for one thing somebody sets up in one
   sitting — so the menu was long and the relationship between them was
   nowhere on screen.

   Merged as tabs over the editors that already existed, rather than as
   new screens. The risk in that is not the tabs: it is that a table
   removed from the menu is also removed from everything that looks a
   table up by key, and the tabs are exactly such a thing. */
import { readFileSync } from "node:fs";
import { ADMIN_TABLES, findAdminTable } from "./src/lib/adminTables.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const page = readFileSync("./src/features/admin/AdminPage.jsx", "utf8");
const tabs = readFileSync("./src/features/admin/TabbedTables.jsx", "utf8");

/* What the menu shows, which is not the same as what exists. */
const inMenu = (key) => ADMIN_TABLES.some((t) => t.key === key && !t.hidden
  && !t.separator && !t.group);

// 1. The merged pages are on the menu, once each.
{
  for (const [key, label] of [
    ["Regions", "Regions & Sub Regions"],
    ["RolesCrafts", "Roles & Crafts"],
    ["POCAdmin", "POC Admin"],
  ]) {
    const found = ADMIN_TABLES.filter((t) => t.key === key);
    if (!found.length) fail(`${label} is not on the admin menu`);
    else if (found.length > 1) fail(`${label} appears ${found.length} times`);
    else if (found[0].label !== label) {
      fail(`${key} is labelled "${found[0].label}", wanted "${label}"`);
    }
  }
}

// 2. What they merged is off the menu and still findable.
//
//    Both halves matter. Left on the menu, there are two routes to one
//    editor and no way to tell which somebody meant. Deleted outright,
//    the tabs have nothing to render — and the field definitions go
//    with them.
{
  for (const key of ["Region", "Sub_Region", "Role", "Craft",
    "POC_Type", "POC_Status", "Quotation_Status"]) {
    if (inMenu(key)) fail(`${key} is still a menu entry of its own`);
    if (!findAdminTable(key)) {
      fail(`${key} was deleted rather than hidden — its tab has nothing to draw`);
    }
  }

  /* And the menu honours the flag, or hiding does nothing. */
  if (!/!t\.hidden/.test(page)) {
    fail("the menu does not skip hidden tables, so they still show twice");
  }
}

// 3. Every tab names something that exists.
//
//    A tab whose key matches no table renders an empty page, and the
//    failure is silent — the tab is there and does nothing.
{
  const keys = [...tabs.matchAll(/key: "(\w+)"/g)].map((m) => m[1]);
  const named = [...page.matchAll(/\{ label: "[^"]+", key: "(\w+)" \}/g)]
    .map((m) => m[1]);
  for (const k of named) {
    if (!findAdminTable(k)) fail(`a tab names ${k}, which is not a table`);
  }
  if (named.length < 6) {
    fail(`only ${named.length} table-backed tabs found, expected at least 6`);
  }
  /* The wrapper looks tables up through the shared function rather than
     filtering the list itself — a separator has no key and would
     otherwise be a candidate. */
  if (!/findAdminTable\(/.test(tabs)) {
    fail("the tab wrapper resolves tables its own way");
  }
  if (keys.length) fail("the wrapper hard-codes tab keys of its own");
}

// 4. Outline Design Status: renamed, moved, same table.
{
  const t = findAdminTable("Scope_Status");
  if (!t) fail("the outline design status list is gone");
  else if (t.label !== "Outline Design Status") {
    fail(`it is labelled "${t.label}"`);
  }
  /* The key is unchanged: renaming a screen is a label, renaming a
     table is a migration and every reference to it. */
  if (t && t.pk !== "Scope_Status_ID") fail("the table behind it was renamed too");

  /* Beside the other design configuration rather than among the project
     lists — which for this menu means after Project Status and next to
     Design Status. */
  const order = ADMIN_TABLES.filter((x) => x.key).map((x) => x.key);
  const at = order.indexOf("Scope_Status");
  if (at < 0 || at < order.indexOf("Project_Status")) {
    fail("it still sits among the project lists");
  }
  if (Math.abs(at - order.indexOf("Design_Status")) !== 1) {
    fail("it is not beside Design Status");
  }
}

// 5. Quotation Status says which quotation.
{
  const t = findAdminTable("Quotation_Status");
  if (t && t.label !== "POC Quotation Status") {
    fail(`the quotation status list is labelled "${t.label}"`);
  }
}

// 6. Customers & Branches stays.
//
//    Organisations manages Organisation_Branch; this manages
//    Customer_Branch, which carries the region and is what a project's
//    developer points at. Two tables that mean different things, so
//    removing the screen would leave no way to add a developer branch.
{
  if (!inMenu("Customer")) {
    fail("Customers & Branches was removed, leaving no way to set a developer branch");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The admin menu behaves (merged pages, nothing orphaned).");
process.exit(bad ? 1 : 0);
