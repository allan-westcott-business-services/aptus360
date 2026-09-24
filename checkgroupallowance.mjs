/* The small group diversity allowance, on the Levels Check form.

   The customer verifies the app against their own volt drop workbook.
   Its load formula is the app's:

     ((distributed ÷ 2 + terminal) × ADMD) + block + B5   where B5 is
     added to every section that HAS customers, at full weight.

   `legVoltDrop` has taken `groupKva` since it was written, and the
   Aptus Calc Sheet passes it (8, the workbook's own figure). The
   cumulative walk behind the LEVELS CHECK and every node label never
   did — so the two disagreed by 8 kVA on every leg. On project 34's
   six-leg route that is 3.1620 against 2.7031, and passing it makes
   every leg agree to the last digit.

   Asked for as a switch and a number on the form, rather than a
   constant: the allowance is what the adopting DNO asks for. */
import { readFileSync } from "node:fs";
import { legVoltDrop, cumulativeToNode, VD_DEFAULTS } from "./src/features/gis/voltDrop.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const vd = readFileSync("./src/features/gis/voltDrop.js", "utf8");

// 1. The walk passes it through.
{
  if (!/groupKva: s\.groupKva/.test(vd)) {
    fail("the cumulative walk does not pass the group allowance to each leg, so "
      + "the levels check and the calc sheet disagree by it");
  }
  if (!/blockKva: s\.blockKva/.test(vd)) {
    fail("a section's block load is dropped by the walk, so a leg feeding a school "
      + "reads low on the drawing");
  }
  /* Zero unless asked: nothing moves on a drawing where nobody has
     switched it on. */
  if (VD_DEFAULTS.groupKva !== 0) fail("the allowance is on by default, moving every figure");
}

// 2. The arithmetic, against the workbook's own leg.
{
  /* B14-B15 on project 34: 21.3 m of 3c Wave 95, one distributed and
     one terminal customer at 1.88 kVA. The sheet gives 0.044019006. */
  const cable = { Volt_Drop_Base: 191, Loop_Impedance_Ohm: 0.687 };
  const leg = (groupKva) => legVoltDrop({
    cable, lengthM: 21.3, distributedKva: 1.88, terminalKva: 1.88,
    meterCount: 2, groupKva, distFactor: 0.5, voltageV: 240,
  }).pct;
  const sheet = 0.044019006;
  if (Math.abs(leg(8) - sheet) > 1e-9) {
    fail(`with the allowance the leg gives ${leg(8)}, the workbook ${sheet}`);
  }
  if (Math.abs(leg(0) - sheet) < 1e-6) {
    fail("the allowance changes nothing, so it is not reaching the load");
  }
  /* At FULL weight beside the halved domestic load — not halved with
     it. The workbook adds B5 outside the (I/2 + J) bracket. */
  const eight = leg(8) - leg(0);
  const four = leg(4) - leg(0);
  if (Math.abs(eight - 2 * four) > 1e-9) fail("the allowance is not linear in kVA");
  if (Math.abs(eight - (8 * 191e-6 * 21.3)) > 1e-9) {
    fail("the allowance is weighted rather than added whole");
  }
}

// 3. A section with no customers gets none.
{
  const cable = { Volt_Drop_Base: 191, Loop_Impedance_Ohm: 0.687 };
  const bare = legVoltDrop({
    cable, lengthM: 50, distributedKva: 0, terminalKva: 0,
    meterCount: 0, groupKva: 8, distFactor: 0.5, voltageV: 240,
  });
  if (bare.pct !== 0) {
    fail("a section with no customers is charged the group allowance — the "
      + "workbook's IF(K=0,0,B5) says otherwise");
  }
}

// 4. The form: a switch and a number.
{
  if (!/const \[groupOn, setGroupOn\] = useState\(false\)/.test(canvas)) {
    fail("the allowance is not switchable from the form, or is on by default");
  }
  if (!/const \[groupKva, setGroupKva\] = useState\(8\)/.test(canvas)) {
    fail("the form has no figure to add, or it does not start at the workbook's 8");
  }
  if (!/aria-label="Group allowance kVA"/.test(canvas)) {
    fail("the number control is missing from the Levels Check form");
  }
  if (!/limits\.groupKva = groupOn \? Number\(groupKva\) \|\| 0 : 0;/.test(canvas)) {
    fail("the form's setting does not reach the levels calculation");
  }
}

// 5. And changing either re-runs the check.
{
  /* The effect returns early when the key is unchanged. A setting that
     changes the ANSWER has to be in the key, or the form moves and the
     drawing does not — the fault the POC's own fields had. */
  if (!/const k = \[groupOn, groupKva\];/.test(canvas)) {
    fail("the group allowance is not in the levels key, so changing it leaves the "
      + "old figures on the drawing");
  }
  if (!/\}, \[features, groupOn, groupKva\]\);/.test(canvas)) {
    fail("the key is not rebuilt when the allowance changes");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The group allowance is the workbook's B5: a switch, a figure, and every leg agrees.");
process.exit(bad ? 1 : 0);
