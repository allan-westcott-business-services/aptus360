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
import { contentsOf } from "./src/features/gis/trenchContents.js";

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
  const { heads, bar, view } = sectionMarkShape(0);
  if (heads.length !== 2 || heads.some((h) => h.length !== 3)) {
    fail("the mark does not carry a head at each end");
  }

  /* Both heads point the way the section is VIEWED — along the trench,
     the same way as each other. The first version pointed them back
     along the bar at one another, which is an arrow across the trench
     saying "this width" rather than a section mark saying "viewed this
     way". A mark without a direction leaves a reader to guess which
     way round the drawing beneath it is. */
  for (const [i, tri] of heads.entries()) {
    const midBase = [(tri[0][0] + tri[1][0]) / 2, (tri[0][1] + tri[1][1]) / 2];
    const apex = tri[2];
    const dx = apex[0] - midBase[0];
    const dy = apex[1] - midBase[1];
    const len = Math.hypot(dx, dy) || 1;
    const dot = (dx / len) * view[0] + (dy / len) * view[1];
    if (dot < 0.99) {
      fail(`head ${i} does not point the way the section is viewed`);
    }
  }
  /* And they sit AT the ends of the bar, not in from them. */
  for (const [i, tri] of heads.entries()) {
    const end = bar[i];
    if (Math.hypot(tri[0][0] - end[0], tri[0][1] - end[1]) > 0.001) {
      fail(`head ${i} is not at the end of the bar`);
    }
  }

  /* Flipped, the heads look the other way and the bar does not move:
     the cut is the same cut, read from the other side. */
  const back = sectionMarkShape(0, SECTION_LEN_M, { flip: true });
  if (back.view[0] !== -1) fail("flipping does not reverse the view");
  if (Math.abs(back.bar[0][1] - bar[0][1]) > 0.001) {
    fail("flipping the view moves the bar — it is the same cut");
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

// 7b. A mark is annotation, not apparatus.
//
//     It was created on the `trench` layer, because that is what it is
//     placed on — and the layer is one of the keys the drawing hides
//     by, so switching the trench off switched off every section mark.
//     Print to Scale switches the trench off deliberately, so a mark
//     vanished from exactly the sheet it was drawn for.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf('Feature_Role: "sectionmark"');
  const write = at >= 0 ? canvas.slice(Math.max(0, at - 600), at) : "";
  if (!write) {
    fail("the section mark's write cannot be found where it was");
  } else if (!/Layer_Key: "annotation"/.test(write)) {
    fail("a section mark is created on a utility layer, so hiding that "
      + "layer — which Print to Scale does to the trench — hides the mark");
  }

  const mig = "./supabase/migrations/0215_annotation_layer.sql";
  let sql = "";
  try { sql = readFileSync(mig, "utf8"); } catch { /* reported below */ }
  if (!sql) {
    fail(`${mig} is missing — the annotation layer does not exist, so `
      + "marks sit on a layer the Layers panel cannot show");
  } else if (!/UPDATE "GIS_Feature"/.test(sql)) {
    fail("marks already placed are not moved to the new layer, so they "
      + "stay hidden with the trench");
  }
}

// 7c. The whole path, end to end: a trench with things in it, through
//     contentsOf, into a section.
//
//     Every case above tested a piece. The join between them is where
//     this actually broke: contentsOf wants SETS for its service-type
//     options and was handed arrays, so `.has` was not a function and
//     the section threw where no static check was looking. A test that
//     runs the pipeline catches that; one that reads the source does
//     not.
{
  const world = [
    { Feature_ID: 10, Feature_Type: "line", Layer_Key: "trench",
      Geometry: [[0, 0], [100, 0]],
      Attributes: { Line_Type: "water_trench" } },
    { Feature_ID: 11, Feature_Type: "line", Layer_Key: "water",
      Label: "W1", Geometry: [[0, 0], [100, 0]],
      Attributes: { Line_Type: "water_main", Size: "180mm" } },
    { Feature_ID: 12, Feature_Type: "line", Layer_Key: "electric",
      Label: "1A", Geometry: [[0, 0.3], [100, 0.3]],
      Attributes: { Line_Type: "elec_lv", Size: "185mm" } },
  ];

  /* Built the way the canvas builds them — Sets, because that is what
     contentsOf asks for. */
  const opts = {
    serviceLineTypes: new Set(lineTypes
      .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key)),
    serviceTrenchTypes: new Set(["trench_service", ...lineTypes
      .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
      .map((t) => t.Type_Key)]),
  };

  let res;
  try {
    res = contentsOf(world[0], world, opts);
  } catch (e) {
    fail(`reading a trench's contents threw: ${e.message}`);
    res = null;
  }

  if (res && res.error) {
    fail(`a trench with a main and a cable in it reports: ${res.error}`);
  } else if (res) {
    const model = trenchSection((res.contents || []).map((c) => c.feature ?? c),
      { lineTypes, surface: "footway", label: "Section 1", atM: 50 });
    if (model.items.length < 2) {
      fail(`the section draws ${model.items.length} of the two runs in the `
        + "trench — the path from the drawing to the section drops things");
    }
    const svg = sectionSvg(model);
    if (!/<svg/.test(svg) || svg.length < 400) {
      fail("the section produces no drawing worth the name");
    }
  }

  /* And the canvas uses the sets the trench editor already builds,
     rather than a second copy that can be the wrong shape. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/contentsOf\(trench, features, serviceTypeSets\)/.test(canvas)) {
    fail("the section builds its own service-type options instead of "
      + "reading the ones already built — two copies of an answer, which "
      + "is how this broke the first time");
  }
}

// 7d. Turned about, the section is its mirror.
//
//     The same cut seen from the other side: the same runs at the same
//     depths, with left and right swapped. The positions themselves do
//     NOT change — they are what the guidance gives — only the drawing
//     is mirrored, and the boundary and carriageway labels travel with
//     the sides they name. A mirrored section that still says
//     "boundary" on the road side is worse than one not mirrored at
//     all.
{
  const c = [{ Feature_ID: 20, Label: "W1", Layer_Key: "water",
    Attributes: { Line_Type: "water_main", Size: "180mm" } }];
  const near = trenchSection(c, { lineTypes });
  const far = trenchSection(c, { lineTypes, flip: true });

  if (near.items[0].xMm !== far.items[0].xMm) {
    fail("turning the mark about moves the apparatus — the cut is the "
      + "same cut, and only the drawing should mirror");
  }

  const xOf = (svg) => Number(/circle cx="([0-9.]+)"/.exec(svg)?.[1]);
  const a = xOf(sectionSvg(near));
  const b = xOf(sectionSvg(far));
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    fail("the section draws no apparatus to mirror");
  } else if (Math.abs(a - b) < 1) {
    fail("the section is not mirrored when the mark is turned about");
  } else {
    /* Mirrored about the middle of the FOOTWAY, not of the image: the
       margins are not equal, so the centre of the drawing is not the
       centre of the picture. Taken from the ground rect the section
       draws, which is the footway itself. */
    const ground = /<rect x="([0-9.]+)" y="[0-9.]+" width="([0-9.]+)"[^>]*fill="#f8fafc"/
      .exec(sectionSvg(near));
    if (!ground) {
      fail("the section draws no ground to measure against");
    } else {
      const mid = Number(ground[1]) + Number(ground[2]) / 2;
      if (Math.abs((a + b) / 2 - mid) > 1) {
        fail("the mirrored section is not a reflection about the middle of "
          + "the footway");
      }
    }
  }

  /* And the sides keep their names. */
  const svgFar = sectionSvg(far);
  const bPos = svgFar.indexOf("Boundary");
  const cPos = svgFar.indexOf("Carriageway");
  const bx = Number(/<text x="([0-9.]+)"[^>]*>Boundary/.exec(svgFar)?.[1]);
  const cx = Number(/<text x="([0-9.]+)"[^>]*>Carriageway/.exec(svgFar)?.[1]);
  if (bPos < 0 || cPos < 0) {
    fail("the mirrored section loses its boundary and carriageway labels");
  } else if (Number.isFinite(bx) && Number.isFinite(cx) && bx < cx) {
    fail("the mirrored section puts the boundary on the road side — the "
      + "labels must travel with the sides they name");
  }

  /* The mark and the section read the one flag, so the drawing on
     screen cannot disagree with the section it opens. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/flip: !!f\.Attributes\?\.Section_Flip/.test(canvas)) {
    fail("the mark on screen ignores the flip, so it points one way while "
      + "its section is drawn the other");
  }
  if (!/Section_Flip : !!flipOverride/.test(canvas)) {
    fail("the section ignores the flip, so turning the mark changes "
      + "nothing but the arrows");
  }
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/setAttr\("Section_Flip"\)/.test(editor)) {
    fail("there is no way to turn a mark about");
  }
}

// 7e. The drawing reads. Three faults the first version shipped, each
//     of which a reader would have had to work around:
{
  const c = [
    { Feature_ID: 30, Label: "Supply from POC", Layer_Key: "electric",
      Attributes: { Line_Type: "elec_hv" } },
    { Feature_ID: 31, Label: "B11", Layer_Key: "electric",
      Attributes: { Line_Type: "elec_lv" } },
    { Feature_ID: 32, Label: "G12", Layer_Key: "gas",
      Attributes: { Line_Type: "gas_main", Size: "125mm" } },
  ];
  const model = trenchSection(c, { lineTypes: [...lineTypes,
    { Type_Key: "elec_hv", Layer_Key: "electric" },
    { Type_Key: "elec_lv", Layer_Key: "electric" }], surface: "unmade" });
  const svg = sectionSvg(model);

  /* A size with no size on the drawing read "100 nommm". */
  if (/nommm/.test(svg)) {
    fail("a nominal size prints as \"nommm\"");
  }
  if (!/100mm nominal/.test(svg)) {
    fail("a run with no size does not say its size is nominal");
  }

  /* Every cover figure was written at the top of the drawing rather
     than beside the run it measured, so three runs gave three numbers
     in a stack belonging to nothing. Each must sit at its own height. */
  const dims = [...svg.matchAll(/<text x="[0-9.]+" y="([0-9.]+)"[^>]*>\d+mm<\/text>/g)]
    .map((m2) => Number(m2[1]));
  if (dims.length >= 2) {
    const spread = Math.max(...dims) - Math.min(...dims);
    if (spread < 4) {
      fail("the cover figures are all written at the same height, so they "
        + "read as a list rather than as dimensions of their own runs");
    }
  }

  /* And two runs in one position had their names printed over each
     other. */
  const names = [...svg.matchAll(/<text x="([0-9.]+)" y="([0-9.]+)"[^>]*>([^<]*(?:B11|Supply from POC))<\/text>/g)]
    .map((m2) => ({ x: Number(m2[1]), y: Number(m2[2]) }));
  if (names.length === 2) {
    if (Math.abs(names[0].x - names[1].x) < 60
      && Math.abs(names[0].y - names[1].y) < 10) {
      fail("two runs sharing a position have their names drawn on top of "
        + "one another");
    }
  }
}

// 7f. A surface the guidance does not name is READ as one, and says so.
{
  const c = [{ Feature_ID: 40, Label: "G1", Layer_Key: "gas",
    Attributes: { Line_Type: "gas_main", Size: "180mm" } }];
  /* Unmade follows the FOOTWAY figures, by this operator's decision.
     Not a guess and not the guidance: marked as policy so the section
     can say which column it used without implying NJUG named it. */
  const made = trenchSection(c, { lineTypes, surface: "unmade" });
  if (made.surface !== "footway") {
    fail(`unmade ground is worked to the ${made.surface} figures, not the `
      + "footway ones this business has decided on");
  }
  if (!made.surfacePolicy) {
    fail("unmade is not marked as mapped by policy, so the section cannot "
      + "say which column it used");
  }
  if (made.surfaceAssumed) {
    fail("a decided mapping is reported as an assumption");
  }
  if (made.surfaceSaid !== "unmade") {
    fail("the section forgets what the drawing actually called the surface");
  }

  /* By KEY, from GIS_Surface_Type, not by words in a label — which
     breaks the day somebody renames one in admin. */
  for (const key of ["carriageway_12", "carriageway_34"]) {
    const road = trenchSection(c, { lineTypes, surface: key });
    if (road.surface !== "carriageway" || road.surfaceAssumed) {
      fail(`${key} is not recognised as a carriageway`);
    }
  }
  if (trenchSection(c, { lineTypes, surface: "verge" }).surface !== "verge") {
    fail("a verge is not recognised");
  }

  /* Agricultural has no decision and no NJUG column: read as a verge
     and ADMITTED as inferred. Ploughing is why that deserves a real
     answer rather than a quiet default. */
  const ag = trenchSection(c, { lineTypes, surface: "agricultural" });
  if (!ag.surfaceAssumed) {
    fail("agricultural land borrows a figure without saying it had to "
      + "choose one — an inferred cover there is the kind a subsoiler "
      + "finds");
  }

  /* And a surface added to the table later is assumed, never silent. */
  if (!trenchSection(c, { lineTypes, surface: "somethingnew" }).surfaceAssumed) {
    fail("a surface nobody has decided about borrows a figure quietly");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/model\.surfaceAssumed && \(/.test(canvas)) {
    fail("the dialogue does not tell the reader which surface's figures "
      + "were used when it had to choose one");
  }
  if (!/model\.surfacePolicy && \(/.test(canvas)) {
    fail("the dialogue does not say when a surface is worked to another "
      + "surface's figures by decision rather than by the guidance");
  }
}

// 7g. The dialogue carries its own box.
//
//     It used `.sch`, and that CSS is injected by SchematicModal.jsx
//     when THAT component renders — so with the schematic unmounted
//     the rules did not exist and the panel had no background. The
//     drawing looked boxed only because its own SVG paints a white
//     rectangle; the notes beneath sat straight on the map.
//
//     Borrowing a class across components couples two things that have
//     no reason to be mounted together, and the failure is invisible
//     until somebody opens one without the other.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("{sectionOf && (");
  /* Long enough to reach the scrolling body below the drawing. The
     dialogue has grown; a slice that stops short reports a missing
     feature that is there, which is worse than no check. */
  const dialog = at >= 0 ? canvas.slice(at, at + 4200) : "";

  if (!dialog) {
    fail("the section dialogue cannot be found where it was");
  } else {
    if (/className="sch[ "]/.test(dialog) || /className="sch-/.test(dialog)) {
      fail("the section dialogue still borrows the schematic's classes, "
        + "which exist only while that component is mounted — so the "
        + "panel has no background when it is not");
    }
    /* On the PANEL itself, not merely somewhere inside it: the inner
       scroll area painting white while the panel does not is exactly
       what this looked like on screen. */
    if (!/background: "#fff", borderRadius: 12/.test(dialog)) {
      fail("the dialogue panel paints no background of its own, so whatever "
        + "is on the canvas shows through its notes");
    }
    if (!/overflow: "auto"/.test(dialog)) {
      fail("the dialogue does not scroll, so a section with many findings "
        + "runs off the bottom of it");
    }
  }
}

// 7h. Turning it about redraws the open section, at once.
//
//     The checkbox in the editor wrote to a DRAFT and the dialogue was
//     built from the SAVED feature, so ticking it changed nothing
//     anybody could see until a save and a reopen. Somebody looking
//     straight at a drawing and asking for its mirror expects the
//     drawing to change.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

  if (!/function showSection\(mark, flipOverride = null\)/.test(canvas)) {
    fail("the section cannot be drawn to a flip other than the one saved "
      + "on the mark, so the dialogue cannot turn its own drawing about");
  }
  if (!/function flipSection\(next\)/.test(canvas)) {
    fail("there is no way to turn the section about from the dialogue");
  }
  /* Redrawn first, saved after: the drawing must not wait on the round
     trip. */
  const fn = (() => {
    const at = canvas.indexOf("async function flipSection(next)");
    return at >= 0 ? canvas.slice(at, canvas.indexOf("\n  }", at)) : "";
  })();
  /* Present AND first. `indexOf` returns -1 for absent, and -1 is less
     than any real index — so an ordering test alone reads a missing
     redraw as a correctly ordered one. That is how this check passed
     when the redraw was deleted. */
  const drawAt = fn ? fn.indexOf("showSection(cur.mark, next)") : -1;
  const saveAt = fn ? fn.indexOf("bulkUpdate") : -1;
  if (fn && drawAt < 0) {
    fail("turning the section about does not redraw it, so the control "
      + "appears to do nothing");
  } else if (fn && saveAt >= 0 && drawAt > saveAt) {
    fail("the section waits for the save before it redraws");
  }
  if (!/bulkUpdateFeatures/.test(fn)) {
    fail("turning the section about is not written to the mark, so the "
      + "mark on the canvas keeps pointing the old way");
  }
  if (!/checked=\{!!sectionOf\.model\.flip\}/.test(canvas)) {
    fail("the dialogue's switch does not show the state of the drawing "
      + "in front of it");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/onShowSection\(\{ \.\.\.feature, \.\.\.f \}\)/.test(editor)) {
    fail("the editor shows the section of the SAVED mark, so a tick that "
      + "has not been saved yet is ignored");
  }
}

// 7i. The ground does not move when the drawing is mirrored.
//
//     Everything that sits at a POSITION across the footway goes
//     through the mirroring transform; the ground and the surface over
//     it are the frame the positions are measured in, and do not. The
//     first version drew both rects from X(0) — which, mirrored, is the
//     RIGHT-hand edge — so the ground box and the grey surface bar shot
//     off to the right of the drawing while the pipes stayed put.
{
  const c = [{ Feature_ID: 50, Label: "W1", Layer_Key: "water",
    Attributes: { Line_Type: "water_main", Size: "63mm" } }];
  const boxes = (flip) => {
    const svg = sectionSvg(trenchSection(c, { lineTypes, flip }));
    return [...svg.matchAll(/<rect x="([0-9.]+)" y="[0-9.-]+" width="([0-9.]+)"/g)]
      .map((m2) => `${m2[1]}+${m2[2]}`);
  };
  const near = boxes(false);
  const far = boxes(true);
  if (!near.length) {
    fail("the section draws no ground");
  } else if (near.join("|") !== far.join("|")) {
    fail("the ground and the surface move when the section is mirrored — "
      + "they are the frame the positions are measured in, not a position");
  }

  /* And every rect stays inside the picture. */
  const svg = sectionSvg(trenchSection(c, { lineTypes, flip: true }));
  const width = Number(/<svg[^>]*width="(\d+)"/.exec(svg)?.[1]);
  for (const m2 of svg.matchAll(/<rect x="([0-9.]+)" y="[0-9.-]+" width="([0-9.]+)"/g)) {
    if (Number(m2[1]) + Number(m2[2]) > width + 0.5) {
      fail("a mirrored section draws outside its own picture");
      break;
    }
  }
}

// 8. Wired: placeable, drawn square to its trench, and right-clicking
//    it shows the section.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/placeNode\("sectionmark", "annotation"\)/.test(canvas)) {
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

  /* ── Annotation is not apparatus ──

     The layer is one of the keys the drawing hides by. A mark placed
     on the `trench` layer disappeared whenever the trench was switched
     off — and Print to Scale switches the trench off deliberately, so
     it vanished from exactly the sheet it was drawn for. */
  if (/Layer_Key: "trench",\s*\n\s*Feature_Type: "point",\s*\n\s*Feature_Role: "sectionmark"/
    .test(canvas)) {
    fail("a section mark is placed on the trench layer, so hiding the "
      + "trench \u2014 which printing does \u2014 hides the mark with it");
  }
  if (!/Layer_Key: "annotation",/.test(canvas)) {
    fail("a section mark has no layer of its own, so it cannot be turned "
      + "off without turning off something it is not part of");
  }
  /* And the print set-up must not switch that layer off. */
  const offKeys = (canvas.match(/const PRINT_OFF_KEYS = \[([\s\S]*?)\];/) || ["", ""])[1];
  if (/annotation|sectionmark/.test(offKeys)) {
    fail("printing hides annotation, so a section mark is missing from the "
      + "sheet it was drawn for");
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
    const at = canvas.indexOf("function showSection(mark,");
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
  if (!/Feature_Role === "sectionmark" &&/.test(editor)
    || !/onShowSection\(\{ \.\.\.feature, \.\.\.f \}\)/.test(editor)) {
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
