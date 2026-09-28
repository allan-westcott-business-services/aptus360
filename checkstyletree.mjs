/* GIS Styles, arranged into sections and items.

   Asked for: the flat list became sections — General Site Styles,
   Trench, Electric, Gas, Water — with one line per THING and its
   variations folded inside. Electric › Cable is one line; the
   on-site/off-site rule, the operator's rule and the size rules live
   under it.

   Two properties matter more than the arrangement itself.

   **Nothing is lost.** A rule that does not appear on this screen is a
   rule nobody can edit, and it carries on styling the drawing anyway.
   Every row in, every row out, exactly once.

   **Nothing is decided.** The cascade is scored in gisStyle.js from the
   scope columns and this must not touch it. Arranging rules on a screen
   is a rendering change; if it could alter which rule wins it would be
   a rendering change with teeth. The grouping is a pure function of the
   rows and returns the same row objects it was given. */

import { readFileSync } from "node:fs";
import {
  buildTree, countRows, sectionOf, itemOf, isVariant, SECTIONS,
} from "./src/features/admin/styleTree.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const lineTypes = [
  { Type_Key: "trench_main", Label: "Mains Trench", Layer_Key: "trench" },
  { Type_Key: "trench_service", Label: "Service Trench", Layer_Key: "trench" },
  { Type_Key: "elec_hv", Label: "HV Cable", Layer_Key: "electric" },
  { Type_Key: "elec_main", Label: "LV Cable", Layer_Key: "electric" },
  { Type_Key: "elec_service", Label: "Service Cable", Layer_Key: "electric" },
  { Type_Key: "gas_main", Label: "Gas Main", Layer_Key: "gas" },
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
];

const roleLabels = {
  plot: "Plot seed", boundary: "Property boundary point", meter: "Meter",
  joint: "Joint", poc: "POC", substation: "Substation", linkbox: "Link box",
  msdb: "MSDB", hdcutout: "Heavy duty cut-out", spannode: "Span node",
  governor: "Gas governor", servicevalve: "Service valve",
};

const opts = { lineTypes, roleLabels };

let nextId = 1;
const r = (o) => ({ GIS_Style_ID: nextId++, Style_Name: `rule ${nextId}`, ...o });

/* A drawing's worth of rules, including the ones that caused this:
   several narrowings of one thing. */
const rows = [
  // general site
  r({ Feature_Role: "plot", Style_Name: "Plot seed" }),
  r({ Feature_Role: "boundary", Style_Name: "Boundary point" }),
  // trench
  r({ Line_Type: "trench_main", Style_Name: "Mains trench" }),
  r({ Line_Type: "trench_main", Site: "Off-site", Style_Name: "Mains trench off site" }),
  r({ Line_Type: "trench_service", Style_Name: "Service trench" }),
  r({ Feature_Role: "spannode", Layer_Key: "trench", Style_Name: "Span node" }),
  r({ Layer_Key: "trench", Style_Name: "Any trench" }),
  // electric — one thing, many narrowings
  r({ Line_Type: "elec_hv", Layer_Key: "electric", Style_Name: "HV cable" }),
  r({ Line_Type: "elec_main", Layer_Key: "electric", Style_Name: "LV cable" }),
  r({ Line_Type: "elec_main", Layer_Key: "electric", Site: "Off-site", Style_Name: "LV off site" }),
  r({ Line_Type: "elec_main", Layer_Key: "electric", Organisation_ID: 7, Style_Name: "LV for an IDNO" }),
  r({ Feature_Role: "poc", Layer_Key: "electric", Style_Name: "POC" }),
  r({ Feature_Role: "substation", Layer_Key: "electric", Style_Name: "Substation" }),
  r({ Feature_Role: "meter", Layer_Key: "electric", Style_Name: "Meter" }),
  r({ Feature_Role: "meter", Layer_Key: "electric", Supply_Type: "nrs", Style_Name: "NRS meter" }),
  r({ Feature_Role: "joint", Layer_Key: "electric", Style_Name: "Joint" }),
  r({ Feature_Role: "linkbox", Layer_Key: "electric", Style_Name: "Link box" }),
  r({ Feature_Role: "msdb", Layer_Key: "electric", Style_Name: "MSDB" }),
  r({ Feature_Role: "hdcutout", Layer_Key: "electric", Style_Name: "HDCO" }),
  // gas and water
  r({ Line_Type: "gas_main", Layer_Key: "gas", Style_Name: "Gas main" }),
  r({ Feature_Role: "governor", Layer_Key: "gas", Style_Name: "Governor" }),
  r({ Line_Type: "water_main", Layer_Key: "water", Style_Name: "Water main" }),
  r({ Feature_Role: "servicevalve", Layer_Key: "water", Style_Name: "Service valve" }),
  // site layers: not a utility and not the dig
  r({ Layer_Key: "annotation", Style_Name: "Notes" }),
  r({ Layer_Key: "boundary", Style_Name: "Site boundary" }),
  // a layer this file has never heard of
  r({ Layer_Key: "lighting", Style_Name: "Lighting" }),
  // and one that scopes nothing at all
  r({ Style_Name: "Everything" }),
];

const tree = buildTree(rows, opts);
const find = (k) => tree.find((s) => s.key === k);
const itemsOf = (k) => (find(k)?.items ?? []).map((i) => i.label);

// ─── 1. Nothing lost, nothing duplicated ───
{
  if (countRows(tree) !== rows.length) {
    fail(`${countRows(tree)} rules in the tree, ${rows.length} went in`);
  }
  const seen = new Map();
  for (const s of tree) {
    for (const it of s.items) {
      for (const row of it.rows) {
        seen.set(row.GIS_Style_ID, (seen.get(row.GIS_Style_ID) ?? 0) + 1);
      }
    }
  }
  for (const [id, n] of seen) if (n !== 1) fail(`rule ${id} appears ${n} times`);
  for (const row of rows) {
    if (!seen.has(row.GIS_Style_ID)) {
      fail(`rule ${row.GIS_Style_ID} ("${row.Style_Name}") is on no screen at all`);
    }
  }
}

// ─── 2. The rows come back as they went in ───
{
  /* Same objects, untouched. If this screen ever starts editing a rule
     on its way into a group, the thing being edited is not the thing
     being saved. */
  const byId = new Map(rows.map((x) => [x.GIS_Style_ID, x]));
  for (const s of tree) {
    for (const it of s.items) {
      for (const row of it.rows) {
        if (byId.get(row.GIS_Style_ID) !== row) {
          fail(`rule ${row.GIS_Style_ID} was copied or changed by the grouping`);
        }
      }
    }
  }
}

// ─── 3. The sections asked for, in the order asked for ───
{
  const want = ["General Site Styles", "Trench", "Electric", "Gas", "Water"];
  const got = tree.map((s) => s.label);
  if (got.slice(0, want.length).join("|") !== want.join("|")) {
    fail(`sections read ${got.join(" | ")}\n         expected ${want.join(" | ")} first`);
  }
  /* A layer nobody named still gets a home, after the named ones —
     otherwise adding a utility means editing this file, which is the
     fault the ROLES list has had twice. */
  if (!got.includes("Lighting")) fail("a layer this file does not know about has no section");
  if (got.indexOf("Lighting") < want.length) fail("an unnamed layer jumped the named sections");
}

// ─── 4. One line per thing, variations inside it ───
{
  const elec = find("electric");
  const cable = elec?.items.find((i) => i.label === "Cable");
  if (!cable) fail("Electric has no Cable item");
  else {
    /* HV, LV, the off-site LV rule and the IDNO's rule: four rules, one
       line. That is the request in one assertion. */
    if (cable.rows.length !== 4) {
      fail(`Electric › Cable holds ${cable.rows.length} rules, expected 4`);
    }
    if (cable.variants !== 2) {
      fail(`Electric › Cable counts ${cable.variants} variations, expected 2 (off site, operator)`);
    }
    /* Base rules first, then the narrowings. */
    if (isVariant(cable.rows[0])) fail("Electric › Cable leads with a variation");
  }

  const meter = elec?.items.find((i) => i.label === "Meter");
  if (!meter) fail("Electric has no Meter item");
  else if (meter.rows.length !== 2 || meter.variants !== 1) {
    fail("the non-residential meter rule is not folded under Meter");
  }

  /* Every item the list asked for, IN THE ORDER it was asked for. The
     order is not alphabetical and that is the point: it follows how a
     network is built, the same argument the Electric menu's bands were
     arranged on. Sorting it prettily would lose the information. */
  const want = ["POC", "Substation", "Cable", "MSDB", "Link box", "Meter",
    "Joint", "Heavy duty cut-out"];
  const got = itemsOf("electric");
  for (const label of want) {
    if (!got.includes(label)) fail(`Electric has no ${label} item`);
  }
  const positions = want.map((l) => got.indexOf(l)).filter((i) => i >= 0);
  const ascending = positions.every((v, i) => i === 0 || v > positions[i - 1]);
  if (!ascending) {
    fail(`Electric reads ${got.join(" | ")}\n         expected ${want.join(" | ")} in that order`);
  }
}

// ─── 5. The dig keeps mains and service apart ───
{
  const items = itemsOf("trench");
  for (const label of ["Mains Trench", "Service Trench", "Span node"]) {
    if (!items.includes(label)) fail(`Trench has no ${label} item`);
  }
  /* The dig reads mains, then service, then the node that marks a span
     — not alphabetically, which would put Span node between them. */
  const order = ["Mains Trench", "Service Trench", "Span node"]
    .map((l) => items.indexOf(l)).filter((i) => i >= 0);
  if (!order.every((v, i) => i === 0 || v > order[i - 1])) {
    fail(`Trench reads ${items.join(" | ")} rather than mains, service, span node`);
  }

  const mains = find("trench")?.items.find((i) => i.label === "Mains Trench");
  if (mains && mains.variants !== 1) {
    fail("the off-site mains trench rule is not folded under Mains Trench");
  }
  /* The layer's own fallback sorts last: it is the thing the others are
     exceptions to. */
  const last = find("trench")?.items.at(-1);
  if (last?.label !== "Everything else") {
    fail(`Trench ends with "${last?.label}" rather than its fallback rule`);
  }
}

// ─── 6. Gas and water get the same treatment, from what is there ───
{
  for (const [k, pipe, role] of [["gas", "Pipe", "Gas governor"],
    ["water", "Pipe", "Service valve"]]) {
    const items = itemsOf(k);
    if (!items.includes(pipe)) fail(`${k} has no ${pipe} item`);
    if (!items.includes(role)) fail(`${k} has no ${role} item`);
  }
}

// ─── 7. Site things are not filed under a utility ───
{
  const items = itemsOf("site");
  for (const label of ["Plot seed", "Property boundary point"]) {
    if (!items.includes(label)) fail(`General Site Styles has no ${label} item`);
  }
  /* A rule scoping nothing applies across the drawing, so it belongs
     where somebody would look for it rather than under one utility. */
  if (!items.includes("Everything")) {
    fail("a rule that scopes nothing has been hidden under a utility");
  }
  /* And a rule on a site LAYER — annotation, the boundary — is a site
     rule too. A different branch from the role path above, and the one
     the fixture did not reach until a mutation walked through it
     untouched. */
  for (const name of ["Notes", "Site boundary"]) {
    const where = tree.find((sec) => sec.items.some((it) =>
      it.rows.some((x) => x.Style_Name === name)));
    if (where?.key !== "site") {
      fail(`"${name}" is filed under ${where?.label ?? "nothing"}, not General Site Styles`);
    }
  }
}

// ─── 8. Empty in, empty out ───
{
  const t = buildTree([], opts);
  if (t.length !== 0) fail("an empty rule set produced sections anyway");
  if (countRows(t) !== 0) fail("an empty rule set counted rows");
}

// ─── 8b. With no line-type rows, it still files and names correctly ───
//
//     The Styles screen reads the rules and nothing else — layers and
//     line types come from the canvas endpoint, which needs a project.
//     So the common case is NO line-type rows at all, and everything
//     has to come from the keys and the names people typed.
{
  const bare = buildTree(rows, { roleLabels });
  if (countRows(bare) !== rows.length) fail("rules were lost with no line types to hand");

  const sec = (k) => bare.find((x) => x.key === k);
  const labels = (k) => (sec(k)?.items ?? []).map((i) => i.label);

  /* Filed by the key's prefix, which is the only evidence there is. */
  if (!sec("trench")) fail("with no line types, nothing lands in Trench");
  if (!sec("electric")) fail("with no line types, nothing lands in Electric");

  /* Named from the rule somebody wrote, not from titleCasing a key:
     "Mains trench", never "Trench Main". */
  if (!labels("trench").includes("Mains trench")) {
    fail(`Trench items read ${labels("trench").join(" | ")} — expected the rule's own name`);
  }
  if (labels("trench").some((l) => /Trench Main/i.test(l))) {
    fail("an item is named by titleCasing its key rather than by its rule");
  }
  /* And where several base rules share an item, none of their names is
     borrowed — that would be a lie about the others. */
  const cable = sec("electric")?.items.find((i) => i.rows.length === 4);
  if (cable && cable.label !== "Cable") {
    fail(`the electric cable item is called "${cable.label}" rather than Cable`);
  }
}

// ─── 9. The grouping decides nothing about the cascade ───
{
  const src = readFileSync("src/features/admin/styleTree.js", "utf8");
  /* It must not import, or re-implement, the thing that picks a winner.
     Two places scoring specificity is two places to drift. */
  if (/from ["'].*gisStyle/.test(src)) {
    fail("the grouping imports the cascade, so arranging a screen could change a drawing");
  }
  for (const word of ["styleScore", "resolveStyle", "WEIGHT"]) {
    if (src.includes(word)) fail(`the grouping references ${word} — it must not weigh rules`);
  }
  /* Pure: no state, no fetching, nothing but the rows it is handed. */
  if (/useState|useEffect|fetch\(/.test(src)) fail("the grouping is not a pure function");
}

// ─── 10. The pieces answer sensibly on their own ───
{
  if (sectionOf({ Layer_Key: "trench" }, opts) !== "trench") fail("a trench rule is not in Trench");
  if (sectionOf({ Line_Type: "elec_hv" }, opts) !== "electric") {
    fail("a rule with a line type and no layer does not find its section");
  }
  if (sectionOf({ Feature_Role: "plot" }, opts) !== "site") {
    fail("a plot seed rule is not a site rule");
  }
  if (itemOf({ Feature_Role: "poc" }, opts).label !== "POC") fail("a role is not named by its label");
  if (!isVariant({ Site: "Off-site" })) fail("Site is not treated as a variation");
  if (!isVariant({ Organisation_ID: 3 })) fail("an operator rule is not treated as a variation");
  if (isVariant({ Line_Type: "elec_hv" })) fail("a plain line-type rule was called a variation");
  if (SECTIONS.length < 5) fail("the sections asked for are not all declared");
}

console.log(bad ? `\n${bad} problem(s)`
  : "GIS Styles group into sections and items — every rule once, and the cascade untouched.");
process.exit(bad ? 1 : 0);
