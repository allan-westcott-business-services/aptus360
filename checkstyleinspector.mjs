/* The style cascade, narrated \u2014 and the narration cannot disagree
   with what the canvas draws.

   The GIS Styles admin previews one rule in isolation, which cannot
   answer "why does the drawing look like THAT": a rule can preview
   perfectly and match nothing, or match and lose every field to a
   more specific row. Both read as "the canvas ignores my style", and
   both took a support round trip to diagnose (fault 133). The
   inspector answers it in one look \u2014 but only if what it says is
   exactly what resolveStyle does, which is what these cases hold.

   explainStyle is built ON cascadeOf, the same ordering resolveStyle
   folds. These cases still compare the two end to end rather than
   trusting the shared plumbing: a refactor that split them apart
   again should fail here, not on a user's drawing. */
import { readFileSync } from "node:fs";
import {
  resolveStyle, explainStyle, cascadeOf,
} from "./src/lib/gisStyle.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const styles = [
  { GIS_Style_ID: 1, Style_Name: "Water (layer default)",
    Layer_Key: "water", Colour: "#2ccc00", Width_Px: 2 },
  { GIS_Style_ID: 2, Style_Name: "Water Main", Line_Type: "water_main",
    Layer_Key: "water", Colour: "#2ccc00", Width_Px: 3.5, Dashed: true },
  { GIS_Style_ID: 3, Style_Name: "Operator water", Line_Type: "water_main",
    Organisation_ID: 7, Colour: "#9333ea", Width_Px: 1.5, Dashed: false },
  { GIS_Style_ID: 4, Style_Name: "Off rule", Layer_Key: "water",
    Colour: "#000000", Is_Active: false },
  { GIS_Style_ID: 5, Style_Name: "Meter", Feature_Role: "meter",
    Symbol: "square", Symbol_Size_Px: 8 },
];

const mainSubject = { Layer_Key: "water", Line_Type: "water_main",
  Feature_Role: null, Site: null, Supply_Type: null, Utility_ID: null };

// 1. The narrated result IS the resolved result, whatever the context.
{
  const ctxs = [{}, { organisationId: 7 }, { organisationId: 9 }];
  const subjects = [mainSubject,
    { ...mainSubject, Line_Type: null },
    { Layer_Key: "electric", Line_Type: null, Feature_Role: "meter",
      Site: null, Supply_Type: null, Utility_ID: null }];
  for (const subject of subjects) {
    for (const ctx of ctxs) {
      const a = resolveStyle(subject, styles, ctx);
      const b = explainStyle(subject, styles, ctx).resolved;
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        fail("the inspector's resolved style is not resolveStyle's \u2014 the "
          + "narration and the drawing disagree");
      }
    }
  }
}

// 2. Applied order: least specific first, and the last row wins ties.
{
  const { rows } = explainStyle(mainSubject, styles, { organisationId: 7 });
  const scores = rows.map((r) => r.score);
  if (JSON.stringify(scores) !== JSON.stringify([...scores].sort((a, b) => a - b))) {
    fail("the rules are not listed least specific first, so the row that "
      + "reads as winning is not the one that wins");
  }
  if (rows[rows.length - 1].style.GIS_Style_ID !== 3) {
    fail("the operator's rule is not last under its own standard \u2014 the "
      + "strongest claim is shown losing");
  }
}

// 3. Attribution: an overridden field points at the rule that took it.
{
  const { wonBy } = explainStyle(mainSubject, styles, { organisationId: 7 });
  if (wonBy.Colour !== 3 || wonBy.Width_Px !== 3) {
    fail("a field the operator's rule overrides is not attributed to it");
  }
  const base = explainStyle(mainSubject, styles, {});
  if (base.wonBy.Colour !== 2) {
    fail("with no standard, the line-type rule does not own the colour");
  }
}

// 4. Inactive rules and non-matching scopes stay out of the story.
{
  const { rows } = explainStyle(mainSubject, styles, {});
  const ids = rows.map((r) => r.style.GIS_Style_ID);
  if (ids.includes(4)) fail("an inactive rule is shown applying");
  if (ids.includes(3)) {
    fail("an operator's rule is shown applying with no standard in force");
  }
  if (ids.includes(5)) fail("a meter rule is shown applying to a main");
}

// 5. A subject nothing matches says so, rather than inventing rows.
{
  const none = explainStyle({ Layer_Key: "watr", Line_Type: "watr_main",
    Feature_Role: null, Site: null, Supply_Type: null, Utility_ID: null },
  styles, {});
  if (none.rows.length !== 0) {
    fail("a mistyped key matches rules \u2014 the trap the inspector exists "
      + "to expose would be hidden by it");
  }
}

// 6. resolveStyle folds cascadeOf itself \u2014 one ordering, two readers.
{
  const src = readFileSync("./src/lib/gisStyle.js", "utf8");
  const from = src.indexOf("export function resolveStyle");
  const upto = src.indexOf("export function explainStyle");
  const body = from >= 0 && upto > from ? src.slice(from, upto) : "";
  if (!body) {
    fail("resolveStyle cannot be found where it was \u2014 this check needs "
      + "re-anchoring, not deleting");
  } else if (!/cascadeOf\(/.test(body)) {
    fail("resolveStyle orders the cascade itself instead of reading "
      + "cascadeOf \u2014 two copies of the ordering will drift");
  }
}

// 7. Wired into the admin, answering the question by name.
{
  const admin = readFileSync("./src/features/admin/GisStylesAdmin.jsx", "utf8");
  if (!/explainStyle/.test(admin)) {
    fail("the styles admin does not use the inspector \u2014 the preview still "
      + "draws one rule in isolation and cannot say which wins");
  }
  if (!/Why does it look like that\?/.test(admin)) {
    fail("the inspector is not offered where somebody asking the question "
      + "would look");
  }
  if (!/No rule matches this object/.test(admin)) {
    fail("a subject nothing matches is not called out, which is the "
      + "mistyped-key trap left set");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The inspector narrates the same cascade the canvas draws.");
process.exit(bad ? 1 : 0);
