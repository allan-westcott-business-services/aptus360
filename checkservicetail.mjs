/* Does the service tail behave — charged once, worst customer wins, and
   never quietly counted as zero when the cable has no figures?

   Run: node checkservicetail.mjs */
import { serviceVoltDrop, legVoltDrop } from "./src/features/gis/voltDrop.js";
import { buildFeederModel } from "./src/features/gis/feeder.js";
import { readFileSync } from "node:fs";

const fails = [];
const fail = (m) => fails.push(m);
const near = (a, b, tol = 1e-9) => Math.abs(a - b) < tol;

/* 35mm single phase CNE, as 0191 records it from the workbook. */
const SVC35 = { Loop_Impedance_Ohm: 0.9785, Volt_Drop_Base: 3094 };
const W95 = { Loop_Impedance_Ohm: 0.687, Volt_Drop_Base: 191 };

// 1. The arithmetic, against the workbook's own service line.
//    impedances!G43 = 3094, and regulat!N38 = (L38 * 0.9785)/1000.
{
  const r = serviceVoltDrop({ cable: SVC35, lengthM: 10, kva: 18.02 });
  if (!near(r.ohms, (10 / 1000) * 0.9785)) fail(`service ohms: ${r.ohms}`);
  if (!near(r.ohms, 0.009785)) fail(`does not match regulat!N38: ${r.ohms}`);
  if (!near(r.pct, 18.02 * 3094e-6 * 10)) fail(`service pct: ${r.pct}`);
}

// 2. No unbalanced correction, ever. One customer is not a group, and
//    1 + 4.14/sqrt(1) would multiply the tail by 5.14.
{
  const plain = serviceVoltDrop({ cable: SVC35, lengthM: 20, kva: 5 });
  const leg = legVoltDrop({ cable: SVC35, lengthM: 20, terminalKva: 5,
    meterCount: 1, unbalanced: true, unbalConst: 4.14 });
  if (near(plain.pct, leg.pct)) fail("service took the unbalanced correction");
  if (!(leg.pct > plain.pct * 5)) fail("fixture wrong: correction not applied to the leg");
}

// 3. No joint allowance on the tail. The tee is charged on the leg of
//    main it tees into; charging it here too counts it twice.
{
  const a = serviceVoltDrop({ cable: SVC35, lengthM: 20, kva: 5 });
  const b = legVoltDrop({ cable: SVC35, lengthM: 20, terminalKva: 5,
    jointEquivM: 3, jointCount: 1 });
  if (near(a.ohms, b.ohms)) fail("service charged a joint allowance");
}

// 4. A cable with no figures is reported, not counted as zero.
{
  const bare = serviceVoltDrop({
    cable: { Loop_Impedance_Ohm: null, Volt_Drop_Base: null }, lengthM: 20, kva: 5 });
  if (!bare.missingSpec) fail("an unfigured service cable passed as fine");
  const none = serviceVoltDrop({ cable: null, lengthM: 20, kva: 5 });
  if (!none.missingSpec) fail("a missing service cable passed as fine");
  if (none.ohms !== 0 || none.pct !== 0) fail("a missing cable invented a figure");
}

// 5. No drawn service means no length, and no length means no charge —
//    rather than a guess at one.
{
  const r = serviceVoltDrop({ cable: SVC35, lengthM: 0, kva: 5 });
  if (r.ohms !== 0 || r.pct !== 0) fail("a zero-length service charged something");
}

// 6. Longer tail costs more, and thinner cable costs more. Direction
//    only, but a sign error here would be silent.
{
  const short = serviceVoltDrop({ cable: SVC35, lengthM: 10, kva: 5 });
  const long = serviceVoltDrop({ cable: SVC35, lengthM: 30, kva: 5 });
  if (!(long.ohms > short.ohms && long.pct > short.pct)) fail("longer service did not cost more");
  const main = serviceVoltDrop({ cable: W95, lengthM: 10, kva: 5 });
  if (!(short.ohms > main.ohms)) fail("35mm service cheaper than 95mm main per metre");
}

// 7. The model records WHICH meters landed where, not just how many.
{
  const at = (x, y) => [[x, y]];
  const feats = [
    { Feature_ID: 1, Feature_Role: "poc", Layer_Key: "electric", Geometry: at(0, 0) },
    /* A trench, which is what the feeder model routes along — the
       cable lines sit on top of it. */
    { Feature_ID: 2, Feature_Type: "line", Layer_Key: "trench",
      Attributes: { Line_Type: "trench_main" }, Geometry: [[0, 0], [50, 0], [100, 0]] },
    { Feature_ID: 10, Feature_Role: "meter", Layer_Key: "electric",
      Plot_ID: 1, Geometry: at(50, 0) },
    { Feature_ID: 11, Feature_Role: "meter", Layer_Key: "electric",
      Plot_ID: 2, Geometry: at(50, 0) },
  ];
  const m = buildFeederModel(feats, { fallbackKva: 5 });
  if (m.error) {
    fail(`model did not build: ${m.error}`);
  } else if (!m.metersAt) {
    fail("model returned no metersAt");
  } else {
    const total = m.metersAt.reduce((n, a) => n + a.length, 0);
    if (total !== 2) fail(`metersAt holds ${total} meters, expected 2`);
    const counted = m.meterCount.reduce((n, c) => n + c, 0);
    if (total !== counted) fail(`metersAt (${total}) disagrees with meterCount (${counted})`);
    const one = m.metersAt.flat()[0];
    if (!one?.meter?.Feature_ID) fail("metersAt entry carries no meter");
    if (typeof one?.kva !== "number") fail("metersAt entry carries no kva");
  }
}

// 8. Both checks must hand legExtras the same service geometry. One
//    check seeing services and the other not is two answers for one
//    drawing, and that is the fault this whole change came out of.
{
  const src = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const svc = [...src.matchAll(/services: src\.filter/g)].length;
  const mains = [...src.matchAll(/mains: src\.filter/g)].length;
  if (svc !== 2) fail(`services passed to ${svc} ctx objects, expected 2`);
  if (mains !== 2) fail(`mains passed to ${mains} ctx objects, expected 2`);
  if (!/atCutout/.test(src)) fail("legExtras reports no cut-out figure");
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Service tails behave (charged once, worst customer, said plainly when unfigured).");
process.exit(fails.length ? 1 : 0);
