/* A column read from another table, and where a new column lands.

   Usage lives on the cable TYPE and decides which sizes the drawing
   offers for a main and which for a service. From Cable Specs there was
   no way to see it, so answering "why is that cable not in the menu"
   meant crossing to Cable Types and matching rows by name.

   Two things had to be true for a column like that to work:

   - `SpecTable` had no notion of a value read from elsewhere. Every
     column was a field on the row, editable. A derived column has to
     sort and filter like any other and take no typing;

   - a new column was APPENDED to a saved layout. The layout is written
     on first use, so that means everybody: a column asked for as the
     second arrived last, and the only way to find it was to know it had
     been added. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const table = readFileSync("./src/features/admin/SpecTable.jsx", "utf8");
const admin = readFileSync("./src/features/admin/ElectricSpecsAdmin.jsx", "utf8");
const layout = readFileSync("./src/lib/useTableLayout.js", "utf8");

/* Derived columns sort and filter like the rest — which they do by
   going through `shown`, the one function both read. */
if (!/if \(typeof c\.value === "function"\) return c\.value\(r\) \?\? "";/.test(table)) {
  fail("a derived column has no value, so it sorts and filters as blank");
}
if (!/typeof c\.value === "function" \? \(/.test(table)) {
  fail("a derived column is not rendered");
}
if (!/readOnly tabIndex=\{-1\}/.test(table)) {
  fail("a derived cell takes typing that is then thrown away");
}

/* The Usage column itself, second, from the types table. */
{
  /* Inside SPEC_COLUMNS. There is an earlier `sizes:` in the table-name
     map, and reading that one measured a different block entirely —
     the third time this session a check has been anchored by a string
     that appears twice. Anchor on something that appears once. */
  const cols = admin.slice(admin.indexOf("const SPEC_COLUMNS = useMemo("));
  const sizes = cols.slice(cols.indexOf("sizes: ["), cols.indexOf("imp: ["));
  if (!/key: "Usage_Type", label: "Usage"/.test(sizes)) {
    fail("Cable Specs does not show the Usage its sizes inherit");
  }
  if (!/\.find\(\(t\) => t\.Cable_Type_ID === r\.Cable_Type_ID\)\?\.Usage_Type/.test(sizes)) {
    fail("Usage is not read from the cable type");
  }
  /* Second: the cable type names the row, and the usage qualifies it. */
  const order = [...sizes.matchAll(/key: "([A-Za-z_]+)"/g)].map((m) => m[1]);
  if (order[1] !== "Usage_Type") {
    fail(`Usage is column ${order.indexOf("Usage_Type") + 1}, wanted the second`);
  }
  /* And it is not editable here: Usage belongs to the type. */
  if (/key: "Usage_Type"[^}]*type: "select"/.test(sizes)) {
    fail("Usage is editable from Cable Specs, where it is not stored");
  }
}

/* A new column goes where it was declared, not to the far right. */
{
  if (!/for \(const k of def\.order\) \{/.test(layout)
    || !/order\.splice\(at, 0, k\)/.test(layout)) {
    fail("a new column is appended to a saved layout, so everybody who has "
      + "opened the table before finds it last");
  }
  if (/def\.order\.forEach\(\(k\) => !order\.includes\(k\) && order\.push\(k\)\)/.test(layout)) {
    fail("the appending is still there");
  }
  /* Columns somebody has arranged are left alone: only keys missing
     from the saved order are placed. */
  if (!/if \(order\.includes\(k\)\) continue;/.test(layout)) {
    fail("the insertion reorders columns the user has already arranged");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Spec tables behave (Usage shown from the cable type, new columns "
  + "where they were declared).");
process.exit(bad ? 1 : 0);
