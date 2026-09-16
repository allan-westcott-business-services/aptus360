/* The cross-section mark, and the section it shows.

   A bar two metres of real ground long, square to the trench it is
   placed on, with a head at each end. Right-clicking it draws the
   section through that trench.

   The two things worth holding hardest: that the bar is SQUARE to the
   line (a cut at any other angle is through a longer trench than the
   one that was dug), and that the section escapes the drawing's own
   text before putting it into SVG. */
import { readFileSync } from "node:fs";
import {
  snapForSection, sectionMarkShape, SECTION_LEN_M,
} from "./src/features/gis/sectionMarks.js";
import { trenchSection, sectionSvg, diameterMm } from "./src/features/gis/trenchSection.js";
import { coverFor, njugKeyFor } from "./src/features/gis/njug.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const lineTypes = [
  { Type_Key: "water_trench", Label: "Water trench", Layer_Key: "trench" },
  { Type_Key: "water_main", Label: "Water Main", Layer_Key: "water" },
  { Type_Key: "gas_main", Label: "Gas Main", Layer_Key: "gas" },
  { Type_Key: "elec_lv", Label: "LV cable", Layer_Key: "electric" },
];
const trench = { Feature_ID: 1, Feature_Type: "line", Layer_Key: "trench",
  Geometry: [[0, 0], [100, 0]], Attributes: { Line_Type: "water_trench" } };

// 1. The bar is square to the line, and two metres end to end.
{
  for (const deg of [0, 30, 90, 217]) {
    const { bar } = sectionMarkShape(deg, SECTION_LEN_M);
    const len = Math.hypot(bar[1][0] - bar[0][0], bar[1][1] - bar[0][1]);
    if (!near(len, SECTION_LEN_M, 0.001)) {
      fail(`at ${deg}\u00b0 the bar is ${len.toFixed(2)}m, not ${SECTION_LEN_M}m`);
    }
    /* Square: the bar's direction dotted with the line's is zero. */
    const rad = (deg * Math.PI) / 180;
    const bx = (bar[1][0] - bar[0][0]) / len;
    const by = (bar[1][1] - bar[0][1]) / len;
    const dot = bx * Math.cos(rad) + by * Math.sin(rad);
    if (Math.abs(dot) > 0.001) {
      fail(`at ${deg}\u00b0 the bar is not square to the line \u2014 a section `
        + "cut at an angle is through a longer trench than was dug");
    }
  }
  const { heads } = sectionMarkShape(0);
  if (heads.length !== 2 || heads.some((h) => h.length !== 3)) {
    fail("the mark does not carry a head at each end");
  }
}

// 2. Placed anywhere ALONG a trench, not at its vertices — a section
//    is taken wherever somebody wants to look.
{
  const snap = snapForSection([37, 1.2], [trench], { lineTypes });
  if (!snap) {
    fail("a click beside a trench places no mark");
  } else {
    if (!near(snap.at[0], 37) || !near(snap.at[1], 0)) {
      fail(`the mark lands at ${snap.at}, not on the trench under the click`);
    }
    if (!near(snap.alongM, 37, 0.1)) {
      fail(`the distance along reads ${snap.alongM}m where the click is 37m `
        + "along \u2014 that number chooses which stretch the section reports");
    }
    if (!near(snap.angleDeg, 0, 0.01)) {
      fail("the stored bearing is not the TRENCH's own");
    }
  }
}

// 3. Not in open ground, and not on a pipe: a section is a cut through
//    a dig, and one across a single main with no trench is a drawing
//    of nothing much.
{
  if (snapForSection([37, 400], [trench], { lineTypes }) !== null) {
    fail("a click far from any trench still places a mark");
  }
  const pipe = { Feature_ID: 9, Feature_Type: "line", Layer_Key: "water",
    Geometry: [[0, 50], [100, 50]], Attributes: { Line_Type: "water_main" } };
  if (snapForSection([37, 50], [pipe], { lineTypes }) !== null) {
    fail("a mark can be placed on a pipe with no trench around it");
  }
}

// 4. The section places what is in the trench where the guidance says,
//    at the cover the guidance gives, for the surface it is in.
{
  const contents = [
    { Feature_ID: 2, Label: "W1", Layer_Key: "water",
      Attributes: { Line_Type: "water_main", Size: "180mm" } },
    { Feature_ID: 3, Label: "1A", Layer_Key: "electric",
      Attributes: { Line_Type: "elec_lv", Size: "185mm" } },
  ];
  const foot = trenchSection(contents, { lineTypes, surface: "footway" });
  const water = foot.items.find((i) => i.njugKey === "water");
  const lv = foot.items.find((i) => i.njugKey === "electric_lv");

  if (!water || water.coverMm !== 750) {
    fail(`water is drawn at ${water?.coverMm}mm cover in a footway, not 750`);
  }
  if (!water || water.xMm !== 1310) {
    fail(`water is drawn ${water?.xMm}mm from the boundary, not 1310`);
  }
  if (!lv || lv.coverMm !== 450) fail("LV is not drawn at 450mm in a footway");
  if (!lv || lv.xMm !== 450) fail("LV is not drawn 450mm from the boundary");

  /* The surface changes the answer, which is the whole reason it is
     carried: LV wants more cover under a road. */
  const road = trenchSection(contents, { lineTypes, surface: "carriageway" });
  const lvRoad = road.items.find((i) => i.njugKey === "electric_lv");
  if (!lvRoad || lvRoad.coverMm !== 600) {
    fail(`LV is drawn at ${lvRoad?.coverMm}mm in a carriageway, not 600 \u2014 `
      + "the section is ignoring which surface it is under");
  }

  /* Gas is the one utility whose verge figure differs from its
     footway one; folding verge into footway loses 150mm every time. */
  const verge = trenchSection([{ Feature_ID: 4, Label: "G1", Layer_Key: "gas",
    Attributes: { Line_Type: "gas_main", Size: "180mm" } }],
  { lineTypes, surface: "verge" });
  if (verge.items[0]?.coverMm !== 750) {
    fail(`gas in a verge is drawn at ${verge.items[0]?.coverMm}mm, not 750`);
  }
}

// 5. A run with no size is drawn nominal and SAYS so. A section that
//    invents a diameter and does not admit it gets measured off.
{
  const d = diameterMm({ Attributes: {} });
  if (d.stated) fail("a run with no size claims a stated diameter");
  const model = trenchSection([{ Feature_ID: 5, Label: "W2", Layer_Key: "water",
    Attributes: { Line_Type: "water_main" } }], { lineTypes });
  if (!model.findings.some((f) => f.kind === "nominal")) {
    fail("a run drawn at a nominal size is not reported as nominal");
  }
}

// 6. The drawing's own text is escaped before it becomes SVG. Labels
//    are typed by people, and a section is built from them.
{
  const model = trenchSection([{ Feature_ID: 6, Label: '<script>x</script>',
    Layer_Key: "water", Attributes: { Line_Type: "water_main", Size: "63mm" } }],
  { lineTypes });
  const svg = sectionSvg(model);
  if (/<script>/.test(svg)) {
    fail("a feature's label goes into the section unescaped");
  }
  if (!/&lt;script&gt;/.test(svg)) {
    fail("the label does not reach the section at all");
  }
}

// 7. The guidance is read as guidance: a sewer has no recommended
//    cover, and the section must say so rather than invent one.
{
  if (coverFor("sewerage", "footway") !== null) {
    fail("a sewer is given a recommended cover \u2014 its depth follows its "
      + "fall, and a figure here would be made up");
  }
  const oil = coverFor("oil_fuel", "footway");
  if (!oil?.warning) {
    fail("an oil or fuel pipeline carries no approval warning");
  }
  /* HV and LV are different things at different depths. */
  if (njugKeyFor({ Layer_Key: "electric", Attributes: { Line_Type: "elec_hv" } },
    { lineTypes }) !== "electric_hv") {
    fail("an HV cable is not recognised as HV, so it is drawn at LV depth");
  }
}

// 8. Wired: placeable, drawn square to its trench, and right-clicking
//    it shows the section.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/placeNode\("sectionmark", "trench"\)/.test(canvas)) {
    fail("there is no way to place a cross-section mark");
  }
  if (!/snapForSection\(point, features, \{ lineTypes \}\)/.test(canvas)) {
    fail("a mark is not snapped onto a trench");
  }
  if (!/sectionMarkShape\(/.test(canvas)) {
    fail("the canvas draws the mark by its own rule rather than the shared "
      + "shape, so the screen and the sheet will disagree about it");
  }
  if (!/Show Cross-section/.test(canvas)) {
    fail("right-clicking a mark does not offer the section, which is the "
      + "whole point of the mark");
  }
  if (!/Feature_Role === "sectionmark" && \(/.test(canvas)) {
    fail("the section item is offered on every object, not just a mark");
  }
  /* And the drawing says what it is: guidance, not a survey. */
  if (!/not a survey/.test(canvas)) {
    fail("the section does not say that it is recommended minima rather "
      + "than a survey \u2014 somebody reads these to a gang in a hole");
  }

  const sql = readFileSync("./supabase/migrations/0214_section_mark_role.sql", "utf8");
  const check = (sql.match(/CHECK \("Feature_Role" IN[\s\S]*?\)\);/) || [""])[0];
  for (const role of ["washout", "primary", "ringsub", "openpoint", "hdcutout"]) {
    if (!check.includes(`'${role}'`)) {
      fail(`the role constraint drops '${role}' \u2014 replacing the CHECK with `
        + "an older list revokes roles that are on drawings now");
    }
  }
  if (!check.includes("'sectionmark'")) {
    fail("the migration does not allow the section mark role");
  }
}

// 9. The lookup that finds a mark's trench survives an id coming back
//    as a string, and falls back to geometry when the link is gone.
//
//    The first version compared ids with === and trusted the link
//    alone. An id returned from the database as a string failed that
//    comparison, the trench was not found, and the button did nothing
//    anybody could see — the worst failure mode there is, because a
//    misclick and a bug look identical.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const fn = (() => {
    const at = canvas.indexOf("function showSection(mark)");
    return at >= 0 ? canvas.slice(at, canvas.indexOf("\n  }", at)) : "";
  })();

  if (!fn) {
    fail("showSection cannot be found where it was \u2014 this check needs "
      + "re-anchoring, not deleting");
  } else {
    if (!/Number\(f\.Feature_ID\) === want/.test(fn)) {
      fail("a mark's trench is looked up by strict comparison of raw ids, "
        + "so an id that comes back as a string finds nothing and the "
        + "button silently does nothing");
    }
    if (!/snapForSection\(at, features, \{ lineTypes \}\)/.test(fn)) {
      fail("a mark whose link is missing has no fallback, so a section "
        + "cannot be drawn for one placed before links were recorded");
    }
    if (!/catch \(e\)/.test(fn) || !/could not be drawn/.test(fn)) {
      fail("a failure inside the section build is swallowed rather than "
        + "reported, which reads as a dead button");
    }
  }

  /* And the button is where somebody who opened the mark will see it. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/Feature_Role === "sectionmark" && onShowSection/.test(editor)) {
    fail("the editor does not offer the section, so the only way to see "
      + "one is a right-click menu somebody has to know about");
  }
  if (!/onShowSection=\{\(mark\) =>/.test(canvas)) {
    fail("the canvas does not hand the editor a way to show the section, "
      + "so its button is never rendered");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Section marks lie square to their trench, and show what is in it.");
process.exit(bad ? 1 : 0);
