/* Cable size in and out, read off the drawing.

   The jointing form asks for both at every joint, and both are already
   on the design: a plot knows the LV feeder that supplies it and the
   service that runs to its meter. Asking a gang to type them is asking
   them to copy two numbers off a drawing they are not holding onto the
   one sheet that records what was actually jointed.

   ── The rule this pins ──

   Null where the drawing does not say. Never a default, never the
   nearest thing found. A blank on a jointing sheet gets asked about;
   185mm printed against a 95mm main gets jointed. */
import { sizesForPlot, sizesAt, cableSizes, sizeOf, isServiceLine, isMainLine }
  from "./src/features/gis/cableSizes.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const main = (id, size, geom) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "electric",
  Attributes: { Line_Type: "elec_lv", Size: size }, Geometry: geom,
});
const service = (id, plot, size, geom) => ({
  Feature_ID: id, Feature_Type: "line", Layer_Key: "electric", Plot_ID: plot,
  Attributes: { Line_Type: "elec_service", Size: size }, Geometry: geom,
});

const F = [
  main(2, "185mm AL WF", [[0, 0], [100, 0]]),
  service(30, 18, "35mm CNE", [[50, 0], [50, 6]]),
  /* Drawn from the meter back to the main — the other way round. */
  service(31, 19, "25mm CNE", [[70, 5], [70, 0]]),
];

// 1. A plot's own service is out; the main it comes off is in.
{
  const a = sizesForPlot(F, 18);
  if (a.out !== "35mm CNE") fail(`plot 18 cable out is ${a.out}`);
  if (a.in !== "185mm AL WF") fail(`plot 18 cable in is ${a.in}`);
}

// 2. Which end of a service was drawn first is not a convention.
//
//    Nobody has kept one, so picking an end and trusting it is right
//    about half the time. Both ends are tried; the one meeting a main
//    answers.
{
  const b = sizesForPlot(F, 19);
  if (b.out !== "25mm CNE") fail(`a service drawn meter-first lost its size (${b.out})`);
  if (b.in !== "185mm AL WF") fail(`a service drawn meter-first found no main (${b.in})`);
}

// 3. Nothing invented where the drawing is silent.
{
  const none = sizesForPlot(F, 99);
  if (none.in || none.out) fail(`a plot not on the drawing returned ${JSON.stringify(none)}`);
  if (sizesForPlot(F, null).in) fail("a null plot id returned a size");

  /* A service with no main under it: the service is still known. */
  const orphan = [service(40, 21, "35mm CNE", [[900, 900], [900, 906]])];
  const o = sizesForPlot(orphan, 21);
  if (o.out !== "35mm CNE") fail("an orphaned service lost its own size");
  if (o.in !== null) fail(`an orphaned service invented a main: ${o.in}`);

  /* A run with no size attribute at all. */
  const unsized = [main(2, null, [[0, 0], [10, 0]]),
    service(41, 22, null, [[5, 0], [5, 4]])];
  const u = sizesForPlot(unsized, 22);
  if (u.in !== null || u.out !== null) fail(`an unsized design returned ${JSON.stringify(u)}`);
}

// 4. At a breech joint, mid-main.
//
//    A service leaves a main part way along a run rather than at its
//    end, so a test that only looked at endpoints would miss the main
//    about half the time.
{
  const at = sizesAt(F, [50, 0]);
  if (at.in !== "185mm AL WF") fail(`a joint mid-main found no main (${at.in})`);
  if (at.out !== "35mm CNE") fail(`a joint mid-main found no service (${at.out})`);

  if (sizesAt(F, [500, 500]).in) fail("a point with nothing near it returned a size");
  if (sizesAt(F, null).in) fail("a joint with no position returned a size");

  /* Within the snap the canvas uses, but not beyond it. */
  if (!sizesAt(F, [50, 0.2]).in) fail("a joint 0.2 m off the main did not find it");
  if (sizesAt(F, [50, 4]).in) fail("a joint 4 m from the main was joined to it anyway");
}

// 5. A service is a service by what the drawing calls it.
//
//    A substring match, the same test electric.js uses, so a run drawn
//    as elec_service, service_lv or "Service (3ph)" all read alike.
{
  for (const t of ["elec_service", "service_lv", "Service (3ph)"]) {
    const f = { Feature_Type: "line", Layer_Key: "electric", Attributes: { Line_Type: t } };
    if (!isServiceLine(f)) fail(`"${t}" is not read as a service`);
    if (isMainLine(f)) fail(`"${t}" is read as a main as well`);
  }
  const lv = { Feature_Type: "line", Layer_Key: "electric", Attributes: { Line_Type: "elec_lv" } };
  if (!isMainLine(lv) || isServiceLine(lv)) fail("an LV main is misread");
  /* Gas is not electric, whatever it is called. */
  const gas = { Feature_Type: "line", Layer_Key: "gas", Attributes: { Line_Type: "gas_service" } };
  if (isServiceLine(gas) || isMainLine(gas)) fail("a gas run was read as a cable");
}

// 6. Whatever the drawing called the size field.
{
  if (sizeOf({ Attributes: { Size: "95mm" } }) !== "95mm") fail("Size was not read");
  if (sizeOf({ Attributes: { Cable_Size: "95mm" } }) !== "95mm") fail("Cable_Size was not read");
  if (sizeOf({ Attributes: { Size_Label: "95mm" } }) !== "95mm") fail("Size_Label was not read");
  if (sizeOf({ Attributes: { Size: "  " } }) !== null) fail("blank text was read as a size");
  if (sizeOf({}) !== null) fail("a feature with no attributes returned a size");
}

// 7. Keyed the way the form keys its pages.
//
//    plot:<id> and breech:<featureId>. A mismatch here is a form that
//    shows every box empty while the sizes sit in the payload under
//    names nothing looks up.
{
  const all = cableSizes(F, { joints: [{ featureId: 20, node: "A1", at: [50, 0] }] }, [18, 19]);
  for (const k of ["plot:18", "plot:19", "breech:20"]) {
    if (!(k in all)) fail(`cableSizes has no entry for ${k}`);
  }
  if (all["plot:18"].out !== "35mm CNE") fail("the plot entry lost its size");
  if (all["breech:20"].in !== "185mm AL WF") fail("the breech entry lost its size");
  if (cableSizes(F, null, []) && Object.keys(cableSizes(F, null, [])).length) {
    fail("a call-off with no joints produced entries");
  }
}

// 8. Downstream of a link box, where three runs of one circuit lie in
//    one trench.
//
//    A box's outputs leave through the same dig and store overlapping
//    routes \u2014 the separation on screen is display offset, not geometry.
//    So a service tee'ing in touches more than one main, and `.find()`
//    answered with whichever came first in the feature array. Plots on
//    output 3 were reported as fed by output 2's cable, which is the
//    wrong size on the jointing sheet and the wrong cable named in the
//    field.
//
//    This is the fault the joint-feeder pick already had, and the
//    drawnMainAt comment already describes: array order deciding a
//    schedule. The meter says which output it is on \u2014 the build stamps
//    Link_Box_ID and Link_Way on what it lays, and the meter carries the
//    same \u2014 so the run on that output answers, and where nothing says,
//    the NEAREST run does rather than the first one found.
{
  const out2 = { Feature_ID: 60, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [100, 0]],
    Attributes: { Line_Type: "elec_main", Size: "95mm AL WF",
      Circuit_ID: 1, Link_Box_ID: 9, Link_Way: 2 } };
  /* Output 3's run, in the same trench, a few centimetres away \u2014 which
     is what two cables in one dig actually are. Later in the array, so
     "first found" cannot get it right by luck. */
  const out3 = { Feature_ID: 61, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0.2], [100, 0.2]],
    Attributes: { Line_Type: "elec_main", Size: "185mm AL WF",
      Circuit_ID: 1, Link_Box_ID: 9, Link_Way: 3 } };
  const svc48 = { Feature_ID: 62, Feature_Type: "line", Layer_Key: "electric",
    Plot_ID: 48, Geometry: [[50, 0.2], [50, 6]],
    Attributes: { Line_Type: "elec_service", Size: "35mm CNE" } };
  const mtr48 = { Feature_ID: 63, Feature_Role: "meter", Feature_Type: "point",
    Layer_Key: "electric", Plot_ID: 48, Geometry: [[50, 6]],
    Attributes: { Circuit_ID: 1, Link_Box_ID: 9, Link_Way: 3 } };

  const world = [out2, out3, svc48, mtr48];
  const r = sizesForPlot(world, 48);
  if (r.in !== "185mm AL WF") {
    fail(`plot 48 is on output 3 and its cable in reads ${r.in} \u2014 the `
      + "other output's run, picked by array order");
  }
  if (r.out !== "35mm CNE") fail("the plot's own service size was lost");

  /* And the joint at the tee, which the field form reads. */
  const j = sizesAt(world, [50, 0.2], 0.35, { way: 3, box: 9 });
  if (j.in !== "185mm AL WF") {
    fail(`the joint on output 3 reports ${j.in} as the main it is cut into`);
  }

  /* With nothing saying which output, the nearest run answers rather
     than the first in the list. The service leaves output 3's cable, so
     output 3 is what it is joined to whatever the meter carries. */
  const anon = [out2, out3,
    { ...svc48, Attributes: { ...svc48.Attributes } },
    { ...mtr48, Attributes: { Circuit_ID: 1 } }];
  if (sizesForPlot(anon, 48).in !== "185mm AL WF") {
    fail("with no output claim the service took the first main in the "
      + "array rather than the one it actually meets");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Cable sizes are read off the design (in from the main, out to the meter).");
process.exit(bad ? 1 : 0);
