import { readFileSync } from "node:fs";
/* Dig and lay time as rows on the bill.

   The hours themselves are digRate.js and are checked there. What is
   checked here is what the bill does with them: that excavation and
   laying are separated, that they are cut the way somebody reading a
   bill would cut them, and that the rows come to what the estimate says
   for the same trench.

   The shape matters as much as the numbers. These rows are merged in
   beside gis_bom's own and the modal groups, totals, sorts and exports
   them without knowing they came from somewhere else — so a row missing
   a field it expects is a bill with a hole in it. */
import { bomLabour, LABOUR_UTILITY } from "./src/features/gis/bomLabour.js";
import { contentsOf } from "./src/features/gis/trenchContents.js";
import { trenchSize } from "./src/features/gis/trenchSize.js";
import { digEstimate } from "./src/features/gis/digRate.js";
import { contentsOptions } from "./src/features/gis/spanContents.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const LINE_TYPES = [
  { Type_Key: "trench_main", Layer_Key: "trench", Label: "Mains Trench" },
  { Type_Key: "gas_main", Layer_Key: "gas", Label: "Gas main" },
  { Type_Key: "elec_main", Layer_Key: "electric", Label: "Electric main" },
  { Type_Key: "water_main", Layer_Key: "water", Label: "Water main" },
];
const SURFACES = [
  { Surface_Key: "unmade", Label: "Unmade", Dig_Factor: 1.0 },
  { Surface_Key: "carriageway_34", Label: "Carriageway 3/4", Dig_Factor: 2.1 },
];
const UTILS = [
  { Utility_ID: 1, Utility: "Electric" },
  { Utility_ID: 2, Utility: "Gas" },
  { Utility_ID: 3, Utility: "Water" },
];
const opts = {
  lineTypes: LINE_TYPES, surfaceTypes: SURFACES, utilities: UTILS,
};

const line = (id, g, a) => ({
  Feature_ID: id, Feature_Type: "line", Geometry: g, Layer_Key: a.lk,
  Attributes: {
    Line_Type: a.lt, Size: a.size, Site: a.site,
    Surface_Type: a.surf, Build_Status: a.bs,
  },
});

/* Two hundred metres of joint trench in three sections: unmade, then
   carriageway, then a length that is already there. Gas, electric and
   water run the whole way. */
const SITE = [
  line(1, [[0, 0], [100, 0]], { lk: "trench", lt: "trench_main", site: "On-site", surf: "unmade" }),
  line(2, [[100, 0], [160, 0]], { lk: "trench", lt: "trench_main", site: "On-site", surf: "carriageway_34" }),
  line(3, [[160, 0], [220, 0]], { lk: "trench", lt: "trench_main", site: "On-site", surf: "unmade", bs: "existing" }),
  line(10, [[0, 0], [220, 0]], { lk: "gas", lt: "gas_main", size: "180mm PE" }),
  line(11, [[0, 0], [220, 0]], { lk: "electric", lt: "elec_main", size: "95" }),
  line(12, [[0, 0], [220, 0]], { lk: "water", lt: "water_main", size: "110mm" }),
];

const rows = bomLabour(SITE, opts);
const digs = rows.filter((r) => r.item === "Excavation");
const lays = rows.filter((r) => r.item.startsWith("Laying"));

// 1. Digging and laying are separate rows, not one figure.
{
  if (!digs.length) fail("no excavation on the bill");
  if (!lays.length) fail("no laying on the bill");
  for (const r of rows) {
    if (r.unit !== "hr") fail(`a labour row was measured in ${r.unit}`);
    if (r.utility !== LABOUR_UTILITY) fail(`a labour row sat under ${r.utility}`);
    if (!(r.quantity > 0)) fail(`a labour row came to ${r.quantity} hours`);
  }
}

// 2. Excavation is cut by surface, because that is what changes it.
//
//    A metre of carriageway is better than twice a metre of verge.
//    Totalling them would hide the one number somebody would query.
{
  const bySurface = new Set(digs.map((r) => r.surface));
  if (bySurface.size !== 2) {
    fail(`excavation came back on ${bySurface.size} surfaces, wanted 2`);
  }
  const hard = digs.find((r) => r.surface === "Carriageway 3/4");
  const soft = digs.find((r) => r.surface === "Unmade");
  if (!hard || !soft) fail("the two surfaces were not named on the bill");
  /* Sixty metres of carriageway against a hundred of unmade: the
     shorter length is the longer job. */
  else if (!(hard.quantity > soft.quantity)) {
    fail("60m of carriageway did not out-dig 100m of unmade ground");
  }
  /* And it carries no utility of its own — a hole is a hole, whatever
     ends up in it. */
  if (digs.some((r) => /—/.test(r.item))) fail("excavation was split by utility");
}

// 3. Laying is cut by utility, because that is the question asked of it.
{
  const named = lays.map((r) => r.item).sort();
  if (named.length !== 3) fail(`laying came back as ${named.length} rows, wanted 3`);
  for (const u of ["Electric", "Gas", "Water"]) {
    if (!lays.some((r) => r.item === `Laying \u2014 ${u}`)) {
      fail(`no laying row for ${u}`);
    }
  }
  /* Named as the bill names its own sections, or the laying for gas
     lands beside the gas rather than under it. */
  if (lays.some((r) => /laying — [a-z]/.test(r.item))) {
    fail("a utility was named in lower case");
  }
  /* Laying carries no surface: what is over the trench decides the dig,
     not the lay. */
  if (lays.some((r) => r.surface)) fail("a laying row was given a surface");
}

// 4. An existing section is laid but not dug.
//
//    The same line the estimate and the bill's quantities draw. It is
//    not this job's hole, but its pipes still go in.
{
  const withoutExisting = bomLabour(SITE.filter((f) => f.Feature_ID !== 3), opts);
  const digWith = digs.reduce((t, r) => t + r.quantity, 0);
  const digWithout = withoutExisting
    .filter((r) => r.item === "Excavation").reduce((t, r) => t + r.quantity, 0);
  if (Math.abs(digWith - digWithout) > 0.11) {
    fail("an existing section added excavation to the bill");
  }

  const layWith = lays.reduce((t, r) => t + r.quantity, 0);
  const layWithout = withoutExisting
    .filter((r) => r.item.startsWith("Laying")).reduce((t, r) => t + r.quantity, 0);
  if (!(layWith > layWithout)) {
    fail("an existing section added no laying to the bill");
  }

  /* Every section it does appear in is counted, so the feature count
     says how much trench is behind a row. */
  for (const r of lays) {
    if (r.features !== 3) fail(`a laying row counted ${r.features} sections, wanted 3`);
  }
}

// 5. The bill agrees with the estimate for the same trench.
//
//    Both read digRate.js, so this is checking the bill does not lose
//    or double anything on the way through — in particular the joint
//    trench allowance, which applies to a trench's laying as a whole and
//    has to be spread across the rows rather than dropped.
{
  let dig = 0;
  let lay = 0;
  const co = contentsOptions(LINE_TYPES, null);
  for (const t of SITE.filter((f) => f.Layer_Key === "trench")) {
    const res = contentsOf(t, SITE, co);
    const items = (res.contents || []).map((c) => ({
      utility: c.utility,
      withinM: c.withinM,
      outsideDiameterMM: Number(String(c.feature?.Attributes?.Size ?? "")
        .replace(/[^0-9.]/g, "")) || null,
    }));
    const e = digEstimate({
      lengthM: res.trenchM,
      size: trenchSize(items, { trenchM: res.trenchM }),
      surfaceKey: t.Attributes?.Surface_Type ?? null,
      existing: t.Attributes?.Build_Status === "existing",
      utilities: items.map((x) => x.utility),
      surfaceTypes: SURFACES,
    });
    if (!e.ok) continue;
    dig += e.digHours + e.setupHours;
    lay += e.layHours;
  }

  const billDig = digs.reduce((t, r) => t + r.quantity, 0);
  const billLay = lays.reduce((t, r) => t + r.quantity, 0);
  if (Math.abs(billDig - dig) > 0.31) {
    fail(`the bill digs ${billDig.toFixed(1)}hr, the estimate ${dig.toFixed(1)}hr`);
  }
  if (Math.abs(billLay - lay) > 0.31) {
    fail(`the bill lays ${billLay.toFixed(1)}hr, the estimate ${lay.toFixed(1)}hr`);
  }
}

// 6. Trench with nothing in it, and no trench at all, produce no rows.
//
//    Rather than rows of zero. A bill line reading nothing invites
//    somebody to wonder what was meant by it.
{
  const bare = [line(1, [[0, 0], [100, 0]],
    { lk: "trench", lt: "trench_main", site: "On-site", surf: "unmade" })];
  if (bomLabour(bare, opts).length) fail("an empty trench produced labour rows");
  if (bomLabour([], opts).length) fail("a drawing with nothing on it produced labour rows");
}

// 7. The rows carry every field the bill's own rows carry.
//
//    They are merged in beside them and grouped, totalled, sorted and
//    exported by the same code. A row missing a field is a hole in the
//    sheet somebody sends out.
{
  for (const r of rows) {
    for (const k of ["site", "utility", "item", "surface", "unit",
      "quantity", "features"]) {
      if (!(k in r)) fail(`a labour row has no ${k}`);
    }
    if (typeof r.surface !== "string") fail("a labour row's surface is not text");
    if (typeof r.quantity !== "number") fail("a labour row's quantity is not a number");
  }
}

// 8. Labour splits by developer, like every other row.
//
//    gis_bom attributes a line from Project_Developer_ID on the feature,
//    and the modal treats a row with none as shared plant — shown in
//    every developer's tab. These rows carried none, so every tab showed
//    the whole site's labour.
//
//    That is the worst way for it to be wrong: not missing, and not
//    obviously too large, but exactly the total somebody would expect if
//    they had not thought about it.
{
  const withDev = (f, dev) => ({
    ...f, Attributes: { ...f.Attributes, Project_Developer_ID: dev },
  });
  const split = SITE.map((f) => {
    if (f.Layer_Key !== "trench") return f;
    if (f.Feature_ID === 1) return withDev(f, 1);
    if (f.Feature_ID === 2) return withDev(f, 2);
    return f;                       // the third is nobody's yet
  });
  const developers = [
    { Project_Developer_ID: 1, label: "Barratt" },
    { Project_Developer_ID: 2, label: "Anwyl" },
  ];
  const rows = bomLabour(split, { ...opts, developers });

  const named = rows.filter((r) => r.developer_name);
  if (!named.length) fail("no labour row is attributed to a developer");
  for (const d of ["Barratt", "Anwyl"]) {
    if (!rows.some((r) => r.developer_name === d)) {
      fail(`${d} has no labour of their own`);
    }
  }

  /* A trench nobody has assigned stays shared, which is what it is —
     nobody has said whose it is. */
  const shared = rows.filter((r) => r.developer_id == null);
  if (!shared.length) fail("an unassigned trench was given to a developer");
  /* And reads as shared. A row with no developer but somebody's name on
     it shows their name against work that is not theirs, which is worse
     than a blank. */
  for (const r of shared) {
    if (r.developer_name != null) {
      fail(`a shared row is labelled "${r.developer_name}"`);
    }
  }

  /* The canvas hands the developers in. Without them every row falls
     back to "Developer 3", which is not what any heading on the bill
     says — so the labour would sit under a heading of its own beside
     the pipe it lays. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const call = canvas.slice(canvas.indexOf("labour={bomLabour("));
  if (!/developers,/.test(call.slice(0, call.indexOf("})}")))) {
    fail("the canvas does not pass the developers to bomLabour");
  }
  if (rows.some((r) => /^Developer \d+$/.test(r.developer_name || ""))) {
    fail("a developer is numbered rather than named");
  }

  /* And the split is a split: one developer's excavation is less than
     the whole site's. Before this, each tab showed all of it. */
  const all = bomLabour(SITE, opts)
    .filter((r) => r.item === "Excavation").reduce((t, r) => t + r.quantity, 0);
  const theirs = rows.filter((r) => r.item === "Excavation"
    && r.developer_name === "Barratt").reduce((t, r) => t + r.quantity, 0);
  if (!(theirs > 0)) fail("a developer has no excavation at all");
  if (!(theirs < all)) fail("one developer carries the whole site's excavation");

  /* Nothing is lost in the split: the parts still come to the whole. */
  const parts = rows.filter((r) => r.item === "Excavation")
    .reduce((t, r) => t + r.quantity, 0);
  if (Math.abs(parts - all) > 0.31) {
    fail(`split by developer the excavation comes to ${parts}, whole it is ${all}`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : `Bill labour behaves (${digs.length} excavation row(s) by surface, `
    + `${lays.length} laying row(s) by utility).`);
process.exit(bad ? 1 : 0);
