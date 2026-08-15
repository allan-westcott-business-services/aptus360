/* Subtotals for the mains, and the size the bill orders.

   Two changes read together: the bill now totals the mains under their
   own rows, and it takes the size a designer overrode rather than the
   one the build worked out.

   The subtotal is a string match on the item name, because gis_bom
   returns names rather than keys. That is the kind of rule that wants
   checking hard — it is one rename away from silently counting the
   wrong thing, or nothing. */
import { readFileSync } from "node:fs";
import { isMainRun, mainName } from "./src/features/gis/bomSubtotals.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const sql = readFileSync("./supabase/migrations/0167_bom_manual_sizes.sql", "utf8");
const modal = readFileSync("./src/features/gis/BomModal.jsx", "utf8");

// 1. A main run is a length of main, and nothing else is.
{
  const mains = [
    "Water Main — 63mm",
    "Gas Main — 180mm PE",
    "Electric Main — Wavecon 95",
    "Mains Trench",
    "water main — 90mm",
  ];
  for (const item of mains) {
    if (!isMainRun({ item, unit: "m" })) fail(`"${item}" was not counted as a main`);
  }

  /* Services are not mains. They are the bulk of the metres on a
     drawing, so counting them would make the subtotal meaningless
     rather than slightly wrong. */
  for (const item of ["Water Service (pipe size not set)", "Gas Service",
    "Electric Service — 25", "Service Joint"]) {
    if (isMainRun({ item, unit: "m" })) fail(`"${item}" was counted as a main`);
  }

  /* And nothing counted in numbers. A Meter is a count, and adding it
     to a length gives a subtotal in no units at all. */
  for (const item of ["Meter", "Service Valve", "Lighting Column", "Main Joint"]) {
    if (isMainRun({ item, unit: "no." })) {
      fail(`"${item}" was added to a subtotal measured in metres`);
    }
  }

  /* "Main" as a word, not as letters. "Domain" and "Remains" are not
     mains, and a match on the substring would take both. */
  for (const item of ["Domain marker", "Remains of a duct"]) {
    if (isMainRun({ item, unit: "m" })) fail(`"${item}" matched on letters rather than a word`);
  }

  /* Missing fields do not throw. A row with no item is a bill row that
     came back oddly, not a crash. */
  if (isMainRun(null) || isMainRun({}) || isMainRun({ unit: "m" })) {
    fail("a row with nothing in it was counted as a main");
  }
}

// 2. The subtotal is called what the trade calls it.
{
  if (mainName("Electric") !== "LV Cable") {
    fail(`electric mains total is called "${mainName("Electric")}"`);
  }
  if (mainName("Gas") !== "Gas Main") fail("gas mains total is misnamed");
  if (mainName("Water") !== "Water Main") fail("water mains total is misnamed");
  /* A utility nobody has named still reads as something. */
  if (!/Telecoms/.test(mainName("Telecoms"))) fail("an unnamed utility has no subtotal name");
}

// 3. The subtotal adds up, and only appears when there is adding to do.
{
  const rows = [
    { item: "Water Main — 63mm", unit: "m", quantity: 611.6 },
    { item: "Water Main — 90mm", unit: "m", quantity: 343.6 },
    { item: "Water Main — 110mm", unit: "m", quantity: 59.1 },
    { item: "Water Service", unit: "m", quantity: 457.7 },
    { item: "Meter", unit: "no.", quantity: 72 },
  ];
  const total = rows.filter(isMainRun).reduce((t, r) => t + r.quantity, 0);
  if (Math.abs(total - 1014.3) > 0.05) fail(`the water mains came to ${total}, wanted 1014.3`);

  /* One size is one row, and a subtotal repeating it is noise. */
  if (!/count > 1/.test(modal)) {
    fail("a subtotal is shown under a single row, repeating it");
  }
  /* It goes under the mains, not at the foot of the section. */
  if (!/i === lastMain/.test(modal)) {
    fail("the subtotal is not placed under the rows it adds up");
  }
}

// 4. The bill takes the size in force, not the calculated one.
//
//    Every utility line carries two: what the build worked out, and what
//    a designer overrode it with. sizeMode.js has always read the
//    override where there is one; the bill read only the calculated one,
//    so a length overridden to 180mm was ordered at 125mm.
{
  for (const [what, manual, system] of [
    ["cable", "Manual_VD_Cable_Size_ID", "VD_Cable_Size_ID"],
    ["gas pipe", "Manual_Gas_Pipe_Size_ID", "Gas_Pipe_Size_ID"],
    ["water pipe", "Manual_Water_Pipe_Size_ID", "Water_Pipe_Size_ID"],
  ]) {
    /* Matched by reading the SQL rather than by writing the pattern out
       with backslashes: escaped by hand it needs four to reach the
       regex as one, and getting that wrong makes a check that silently
       matches nothing — which it did, first time. */
    const wants = `COALESCE(\n           f."Attributes" ->> '${manual}',\n`
      + `           f."Attributes" ->> '${system}')`;
    const flat = (t) => t.replace(/\s+/g, " ");
    if (!flat(sql).includes(flat(wants))) {
      fail(`the bill does not prefer the override for the ${what}`);
    }
    /* The override first. The other way round is the bug it replaces. */
    const backwards = `COALESCE( f."Attributes" ->> '${system}', `
      + `f."Attributes" ->> '${manual}')`;
    if (flat(sql).includes(flat(backwards))) {
      fail(`the ${what} prefers the calculated size over the override`);
    }
  }
}

// 5. Gas mains are itemised by size.
//
//    They came out as one row called "Gas Main" with no size, so a
//    scheme carrying three diameters was a single quantity nobody could
//    order against. Water has been split by diameter since 0117 and gas
//    has the same catalogue — it was never joined.
{
  if (!/LEFT JOIN "Gas_Pipe_Size" gp/.test(sql)) {
    fail("the bill does not join the gas pipe catalogue");
  }
  if (!/WHEN f\."Layer_Key" = 'gas' THEN/.test(sql)) {
    fail("gas mains are not itemised by size");
  }
  /* Falling back the way water does: a size typed before the catalogue
     existed is still a real size, and burying it in an unset row loses
     a quantity that is perfectly orderable. */
  const gas = sql.slice(sql.indexOf(`WHEN f."Layer_Key" = 'gas' THEN`));
  const block = gas.slice(0, gas.indexOf("ELSE ''"));
  if (!/NULLIF\(f\."Attributes" ->> 'Size', ''\)/.test(block)) {
    fail("a gas size typed by hand is dropped rather than itemised");
  }
  if (!/pipe size not in the catalogue/.test(block)) {
    fail("a gas size pointing at a missing catalogue row reads as unset");
  }
}

// 6. The sections read in trade order, not alphabetical order.
//
//    Alphabetical put Street Lighting between Gas and Water, which is an
//    order nobody thinks in. Lighting goes after water because it hangs
//    off another utility's network rather than having a main of its own,
//    and Labour last because it is not something to order.
{
  const order = modal.match(/const UTILITY_ORDER = \[([^\]]*)\]/);
  if (!order) fail("the sections have no stated order");
  else {
    const names = [...order[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    const at = (n) => names.indexOf(n);
    if (at("Street Lighting") < at("Water")) {
      fail("Street Lighting still comes before Water");
    }
    if (at("Water") < at("Gas") || at("Gas") < at("Electric")) {
      fail(`the utilities read ${names.join(", ")}`);
    }
    if (at("Labour") !== names.length - 1) fail("Labour is not last in the order");
  }

  /* And last on the page, which the order alone does not achieve.

     A labour row carries the site of the trench it was worked out from;
     a pipe row carries none. Ranking by site first put labour up with
     the trench sections and left it in the middle of the bill, however
     far down the list it was written — so labour is asked about before
     the site. */
  {
    const secs = [
      { site: "On-site", utility: "Labour" },
      { site: "", utility: "Water" },
      { site: "", utility: "Electric" },
      { site: "Off-site", utility: "Labour" },
      { site: "Off-site", utility: "Trench" },
    ];
    const SITE_ORDER = ["Off-site", "On-site", "Unclassified", ""];
    const UTILITY_ORDER = ["Electric", "Gas", "Water", "Street Lighting", "Labour"];
    const n = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
    const siteRank = (x) => {
      const i = SITE_ORDER.indexOf(x);
      return i < 0 ? SITE_ORDER.length : i;
    };
    const utilRank = (x) => {
      const i = UTILITY_ORDER.findIndex((u) => n(u) === n(x));
      return i < 0 ? UTILITY_ORDER.length : i;
    };
    const lab = (x) => (n(x) === "labour" ? 1 : 0);

    const sorted = [...secs].sort((a, b) => lab(a.utility) - lab(b.utility)
      || siteRank(a.site) - siteRank(b.site)
      || utilRank(a.utility) - utilRank(b.utility)
      || a.utility.localeCompare(b.utility));

    const tail = sorted.slice(-2).map((x) => x.utility);
    if (tail.some((u) => n(u) !== "labour")) {
      fail(`the bill ends with ${tail.join(", ")} rather than the labour`);
    }
    /* Off-site labour before on-site, the same way round as everything
       else — the site still orders them among themselves. */
    if (sorted.at(-2).site !== "Off-site") {
      fail("the labour sections are not in site order among themselves");
    }

    /* And the modal sorts that way, on the page and in the workbook. */
    if ((modal.match(/isLabour\(a\.utility\) \? 1 : 0/g) || []).length < 2) {
      fail("labour is not ranked before the site on both the page and the sheet");
    }
  }

  /* Ranked rather than compared by name, or the order above would be
     decoration.

     Looked for inside the sections memo, not anywhere in the file: the
     export sorts with the same expression, so a search across the whole
     modal passed while the sections had lost it. */
  const memo = modal.slice(modal.indexOf("const groups = useMemo("));
  const sort = memo.slice(0, memo.indexOf("}, [shown]);"));
  if (!/utilityRank\(a\.utility\) - utilityRank\(b\.utility\)/.test(sort)) {
    fail("the sections are not sorted by the stated order");
  }
  if (!/siteRank\(a\.site\) - siteRank\(b\.site\)/.test(sort)) {
    fail("the sections are not sorted by the site order");
  }

  /* And the workbook sorts the same way. A sheet that reads differently
     from the panel it was exported from is the kind of difference nobody
     notices until they are comparing two printouts. */
  const detail = modal.slice(modal.indexOf("const detailOf ="));
  const body = detail.slice(0, detail.indexOf(".map("));
  if (!/utilityRank/.test(body)) fail("the Excel detail sheet ignores the section order");
  if (!/siteRank/.test(body)) fail("the Excel detail sheet sorts sites by name");

  /* Matched on letters alone, so a rename that adds a hyphen or a case
     does not drop a section to the bottom. */
  if (!/replace\(\/\[\^a-z\]\/g, ""\)/.test(modal)) {
    fail("the utility order is matched too strictly to survive a rename");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bill subtotals behave (mains only, in metres, at the size in force).");
process.exit(bad ? 1 : 0);
