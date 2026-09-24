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
import { upstreamVoltDropPct } from "./src/features/gis/electric.js";

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
  /* The six names the form works with, however they are held — this
     pinned six useState calls and went stale when they became one
     stored object. Their defaults are checked with the storage below. */
  if (!/const \{ groupOn, groupKva, admdOn, admdKva, jointOn, jointM \} = levelOpts;/.test(canvas)) {
    fail("the form's six settings are not all present");
  }
  /* The switch and its figure, bound to the right state. This pinned
     the aria-label's exact words and broke when the three options
     became one list with composed labels. */
  if (!/label: "Group allowance"[\s\S]{0,160}on: groupOn, setOn: setGroupOn, val: groupKva, setVal: setGroupKva/.test(canvas)) {
    fail("the group allowance switch and figure are not on the form, or not bound "
      + "to the group state");
  }
  /* Reaches the calculation, however the settings object is built —
     this pinned one assignment and went stale when the block became a
     returned object. */
  if (!/groupKva: groupOn \? Number\(groupKva\) \|\| 0 : 0/.test(canvas)) {
    fail("the form's setting does not reach the levels calculation");
  }
}

// 5. And changing either re-runs the check.
{
  /* The effect returns early when the key is unchanged. A setting that
     changes the ANSWER has to be in the key, or the form moves and the
     drawing does not — the fault the POC's own fields had. */
  /* Named in the key, in whatever company: this pinned the key's exact
     contents and broke the moment a second setting joined it. */
  const key = (canvas.match(/const k = \[[^\]]*\]/) || [""])[0];
  /* Every `}, [features …]` in the file, not the first: the levels key
     is not the only memo on `features`, and matching the first found
     `[features, lineTypes]` and failed on a key that was perfectly
     correct. */
  const keyDeps = (canvas.match(/\}, \[features,[^\]]*\]\);/g) || []).join(" ");
  for (const name of ["groupOn", "groupKva"]) {
    if (!key.includes(name)) {
      fail(`${name} is not in the levels key, so changing it leaves the old `
        + "figures on the drawing");
    }
    if (!keyDeps.includes(name)) fail(`the key is not rebuilt when ${name} changes`);
  }
}

// 6. One ADMD for every plot.
{
  /* The levels check adds up what each plot actually draws — its
     figure comes from House_Type_Consumption, on bedrooms and heat
     source together. The verification workbook multiplies a customer
     COUNT by one ADMD, so on a mixed scheme the two disagree however
     right both are.

     Asked for as a second switch, so the drawing can answer the
     workbook's question while people learn to trust it. */

  if (!/label: "One ADMD per plot"[\s\S]{0,160}on: admdOn, setOn: setAdmdOn, val: admdKva, setVal: setAdmdKva/.test(canvas)) {
    fail("the ADMD switch and figure are not on the form, or not bound to the "
      + "ADMD state");
  }
  /* Wherever the plot's load is resolved: this was an inline
     `plotById` and is now `plotLoadById`, shared by every path that
     traces the drawing. */
  const at = canvas.indexOf("const plotLoadById = useCallback");
  const body = at < 0 ? "" : canvas.slice(at, at + 420);
  if (!/admdOn \? \{ \.\.\.pl, kva_load: Number\(admdKva\) \|\| 0 \} : pl/.test(body)) {
    fail("the switch does not reach the load each plot is counted at");
  }
  /* A meter pointing at a plot that is not there stays unknown rather
     than becoming an ADMD out of nowhere. */
  if (!/if \(!pl\) return pl;/.test(body)) {
    fail("a missing plot is given an ADMD it has no basis for");
  }
  /* Non-residential supplies keep their own kVA: a pump has no plot
     behind it to average away, and the workbook counts it separately. */
  if (/nrsById[\s\S]{0,120}admdKva/.test(canvas)) {
    fail("the ADMD is applied to non-residential supplies as well");
  }
  /* Both settings in the key, or the form moves and the drawing does
     not. */
  for (const name of ["admdOn", "admdKva"]) {
    if (!(canvas.match(/const k = \[[^\]]*\]/) || [""])[0].includes(name)) {
      fail(`changing ${name} leaves the old figures on the drawing`);
    }
  }
  /* And it says what it is doing: with this on, a mixed scheme's
     figures are the sheet's answer, not the drawing's. */
  if (!/Every plot counted at \{Number\(admdKva\) \|\| 0\} kVA, not its own load/.test(canvas)) {
    fail("nothing on the panel says the figures are no longer the drawing's own");
  }
}

// 7. The joint allowance, from the form.
{
  /* Metres of the leg's own cable charged for each plot connection.
     The catalogue holds the figure and on this customer's instance it
     is 0; the verification workbook has no equivalent. A switch so the
     app can be compared with the sheet without changing the setting
     for everybody. */

  if (!/label: "Joint allowance"[\s\S]{0,160}on: jointOn, setOn: setJointOn, val: jointM, setVal: setJointM/.test(canvas)) {
    fail("the joint switch and figure are not on the form, or not bound to the "
      + "joint state");
  }
  /* Stacked in one group, not three blocks that lay out side by side
     and had to be kept in step by hand. */
  if (!/className="gt-h-set gt-h-opts"/.test(canvas)) {
    fail("the three settings are not one stacked group");
  }
  /* An OVERRIDE: off, the catalogue's own figure still applies, so a
     drawing nobody has touched reads exactly as it did. */
  if (!/\.\.\.\(jointOn \? \{ jointEquivM: Number\(jointM\) \|\| 0 \} : \{\}\)/.test(canvas)) {
    fail("the switch replaces the catalogue's joint figure even when off, or does "
      + "not reach the calculation when on");
  }
  for (const name of ["jointOn", "jointM"]) {
    if (!(canvas.match(/const k = \[[^\]]*\]/) || [""])[0].includes(name)) {
      fail(`changing ${name} leaves the old figures on the drawing`);
    }
  }
}

// 8. A substation can carry a starting volt drop.
{
  /* `upstreamVoltDropPct` answered zero for anything but a POC — a
     substation IS the start of the network, and the transformer's
     contribution is impedance, handled by sourceImpedance.

     That still holds for the transformer. What it missed is everything
     else somebody accounts for before the first metre of LV cable: the
     HV side, the busbar, the way fuse. The customer's workbook types
     0.02% into exactly that cell (its M6) on a substation-fed scheme,
     and the app had nowhere to put it — so project 34 read 3.142
     against the sheet's 3.162, the whole difference being that cell. */
  const at = (role, v) => ({ Feature_Role: role, Attributes: { Source_Volt_Drop_Pct: v } });
  if (upstreamVoltDropPct(at("substation", 0.02)) !== 0.02) {
    fail("a substation cannot carry a starting volt drop");
  }
  if (upstreamVoltDropPct(at("poc", 2.5)) !== 2.5) {
    fail("a POC's own figure has been broken by the change");
  }
  /* Unset stays zero, which is every drawing that exists. */
  if (upstreamVoltDropPct(at("substation", undefined)) !== 0) {
    fail("a substation with nothing set contributes something");
  }
  /* And only those two: a meter or a joint carrying the attribute by
     accident must not start the cascade somewhere else. */
  if (upstreamVoltDropPct(at("meter", 9)) !== 0) {
    fail("any feature at all can now start the cascade");
  }

  /* One attribute for both, so there is one rule and one name. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/id="fe-sub-vd"/.test(editor)) {
    fail("the substation editor has no field for it");
  }
  if ((editor.match(/setAttr\("Source_Volt_Drop_Pct"\)/g) || []).length < 2) {
    fail("the substation's field writes a different attribute from the POC's");
  }
  /* Watched, or the figure is typed and the drawing keeps its old
     numbers. */
  if (!/a\.Source_Volt_Drop_Pct/.test(canvas)) {
    fail("changing it does not re-run the levels check");
  }
}

// 9. The three settings survive a refresh.
{
  /* Asked for: they are how somebody has decided to check this design,
     not a momentary choice. Kept in the browser rather than on the
     project, because they belong to the person checking — one
     estimator comparing against a workbook should not change what a
     colleague sees on the same drawing. */
  if (!/const LEVEL_OPTS_KEY = "aptus\.levels\.options";/.test(canvas)) {
    fail("the three settings are not kept anywhere, so a refresh forgets them");
  }
  if (!/localStorage\.setItem\(LEVEL_OPTS_KEY/.test(canvas)
    || !/localStorage\.getItem\(LEVEL_OPTS_KEY\)/.test(canvas)) {
    fail("they are written but never read back, or read but never written");
  }
  /* Guarded both ways: private browsing refuses localStorage, and a
     half-written entry must not stop the canvas opening. */
  const at = canvas.indexOf("const [levelOpts, setLevelOpts]");
  const init = at < 0 ? "" : canvas.slice(at, at + 1400);
  if (!/catch \{\s*\n?\s*return def;/.test(init)) {
    fail("an unreadable entry throws during render, so the drawing will not open");
  }
  if (!/catch \{ \/\* private mode/.test(canvas)) {
    fail("writing in private browsing throws");
  }
  /* A figure that will not parse falls back rather than becoming NaN,
     which would make its allowance zero while its switch still read
     on — a setting that lies about itself. */
  for (const k of ["groupKva", "admdKva", "jointM"]) {
    if (!new RegExp(`Number\\.isFinite\\(Number\\(p\\.${k}\\)\\)`).test(init)) {
      fail(`a corrupt ${k} becomes NaN rather than falling back to the default`);
    }
  }
  /* Off by default on an instance that has never stored anything. */
  if (!/groupOn: false, groupKva: 8, admdOn: false, admdKva: 5\.01, jointOn: false, jointM: 1\.5/.test(init)) {
    fail("the defaults are not everything off at the workbook's figures");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The group allowance is the workbook's B5: a switch, a figure, and every leg agrees.");
process.exit(bad ? 1 : 0);
