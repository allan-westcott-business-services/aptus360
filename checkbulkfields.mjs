/* What a bulk edit may offer.

   A field belongs on the panel only where EVERY selected feature has
   it and it means the same thing on each. `fieldsForMany` intersects
   the classes; this holds what the classes themselves offer. */
import { readFileSync } from "node:fs";
import { fieldsForMany, classesIn, planBulkEditOn } from "./src/features/gis/bulkEdit.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const raw = JSON.parse(readFileSync("./fixtures/drawing-6-msdb-link.json", "utf8"));
const f = raw.features;
const opts = { lineTypes: raw.lineTypes || [], layers: raw.layers || [],
  surfaceTypes: raw.surfaceTypes || [] };
const keysFor = (sel) => fieldsForMany(classesIn(sel, opts), opts).map((x) => x.key);
const some = (fn, n) => f.filter(fn).slice(0, n);

const mains = some((x) => x.Attributes?.Line_Type === "elec_main", 4);
const svc = some((x) => x.Attributes?.Line_Type === "elec_service", 3);
const trench = some((x) => /trench/.test(String(x.Attributes?.Line_Type)), 3);
const meters = some((x) => x.Feature_Role === "meter", 4);

// 1. A cable is not a thing with a name, nor a thing with a depth.
//
//    Forty cables sharing one label says nothing anybody wants to read,
//    and a cable's depth is the depth of the trench it lies in — two
//    places to say one thing, disagreeing the moment either is edited.
{
  if (mains.length) {
    const k = keysFor(mains);
    if (k.includes("Label")) fail("a run of cable is offered a shared Name");
    if (k.includes("Depth_m")) fail("a cable is offered a Depth of its own");
  }
  /* A trench keeps both: a dig is a thing on a programme, and it is
     what is dug to a depth. */
  if (trench.length) {
    const k = keysFor(trench);
    if (!k.includes("Label")) fail("a trench lost its Name");
    if (!k.includes("Depth_m")) fail("a trench lost its Depth");
  }
  /* And a point keeps its name. */
  if (meters.length && !keysFor(meters).includes("Label")) {
    fail("a meter lost its Name");
  }
}

// 2. The circuit, on anything that carries one.
{
  for (const [what, sel] of [["cables", mains], ["services", svc], ["meters", meters]]) {
    if (!sel.length) continue;
    if (!keysFor(sel).includes("Circuit_ID")) {
      fail(`${what} are not offered a Circuit, which is the field this panel `
        + "is most often opened for");
    }
  }
  /* Not on a trench: a dig belongs to no circuit, and two circuits
     commonly share one. */
  if (trench.length && keysFor(trench).includes("Circuit_ID")) {
    fail("a trench is offered a Circuit");
  }
  /* Offered once, not twice. */
  if (mains.length) {
    const all = fieldsForMany(classesIn(mains, opts), opts).map((x) => x.key);
    if (all.filter((k) => k === "Circuit_ID").length > 1) {
      fail("the Circuit control is drawn twice");
    }
  }
}

// 3. A mixed selection offers only what they share.
{
  if (mains.length && meters.length) {
    const k = keysFor([...mains.slice(0, 2), ...meters.slice(0, 2)]);
    if (k.includes("Manual_VD_Cable_Size_ID")) {
      fail("a selection of cables AND meters is offered a cable size");
    }
    if (!k.includes("Circuit_ID")) {
      fail("cables and meters share a circuit and are not offered it");
    }
  }
  /* Mains and services both carry a cable, but from different
     catalogues: the same key meaning two things is two fields. */
  if (mains.length && svc.length) {
    const k = keysFor([...mains.slice(0, 2), ...svc.slice(0, 2)]);
    if (k.includes("Manual_VD_Cable_Size_ID")) {
      fail("mains and services are offered one cable list, so a service "
        + "cable can be set on a main");
    }
  }
}

// 4. A circuit carries its name and letter.
//
//    The same reason a line type carries its layer: everything that
//    reads a circuit reads all three, and writing the id alone leaves a
//    run numbered 3 and still called Circuit 2 on every sheet.
{
  const onTwo = f.filter((x) => x.Attributes?.Line_Type === "elec_main"
    && Number(x.Attributes?.Circuit_ID) === 2).slice(0, 3);
  const named = f.find((x) => Number(x.Attributes?.Circuit_ID) === 1
    && x.Attributes?.Circuit_Name != null);
  if (onTwo.length && named) {
    const r = planBulkEditOn(onTwo, { Circuit_ID: 1 },
      { lineTypes: raw.lineTypes || [], features: f });
    const a = r.rows[0]?.Attributes || {};
    if (Number(a.Circuit_ID) !== 1) fail("the circuit was not written");
    if (a.Circuit_Name !== named.Attributes.Circuit_Name) {
      fail("a moved run keeps the name of the circuit it left");
    }
    /* And moving them to the circuit they are already on writes
       nothing. */
    const same = planBulkEditOn(onTwo, { Circuit_ID: 2 },
      { lineTypes: raw.lineTypes || [], features: f });
    if (same.rows.length) {
      fail("setting a circuit to the one they are already on rewrites them");
    }
  }
}

// 5. A cable size can be set in bulk.
//
//    A MAINS run's size is held twice: on the run, and on the point it
//    feeds, because the volt drop sum reads it from the point. The
//    panel REFUSED the edit for that reason \u2014 which sent somebody to
//    open forty editors instead, where the drift is just as possible
//    and nobody is watching for it.
{
  const panel = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  if (/Cable size is set on the run itself/.test(panel)) {
    fail("the panel still refuses a bulk cable edit, which is the edit it is "
      + "most often opened for");
  }
  if (/f\.kind === "cable" && f\.usage !== "service"/.test(panel)) {
    fail("mains cables are still singled out for refusal");
  }
  /* Offered on a run as on a service. */
  const mainsSel = f.filter((x) => x.Attributes?.Line_Type === "elec_main").slice(0, 3);
  if (mainsSel.length && !keysFor(mainsSel).includes("Manual_VD_Cable_Size_ID")) {
    fail("a run of mains is not offered a cable size");
  }

  /* ── And the copy moves with it ──

     `syncNodeCables` is the routine behind "N nodes out of step with
     their cables \u2014 fix". Run after the rows are written, from the
     drawing as just saved rather than from state that has not caught
     up. */
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/if \(touchedCable\) \{/.test(canvas)) {
    fail("a bulk cable edit does not bring the points that copy it into step");
  }
  if (!/srcFeatures: fresh\.features/.test(canvas)) {
    fail("the sync reads state that has not caught up with the save, so it "
      + "puts the OLD sizes back");
  }
  /* Only where a cable size was part of the edit: a sync nobody asked
     for is a second write to explain. */
  if (!/u\?\.Attributes\?\.VD_Cable_Size_ID !== undefined/.test(canvas)) {
    fail("every bulk edit triggers the sync, whatever was changed");
  }
}

// 6. Line type is not a bulk edit.
//
//    "Reclassifies every one of them" was the warning it carried, and
//    it was the right warning: turning forty cables into trenches, or a
//    run of gas main into water, is not an edit somebody makes to a
//    selection \u2014 it is a mistake somebody makes to a selection.
{
  for (const [what, sel] of [["cables", mains], ["services", svc],
    ["trenches", trench]]) {
    if (!sel.length) continue;
    if (keysFor(sel).includes("Line_Type")) {
      fail(`${what} are offered a Line type, which reclassifies every one of `
        + "them and moves them to another layer");
    }
  }
  /* And the single-feature editor keeps it: one line at a time can be
     reclassified deliberately, with its own panel redrawing around it. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/htmlFor="fe-type"/.test(editor)) {
    fail("the single-feature editor lost its Line type as well, so a line "
      + "cannot be reclassified at all");
  }
}

// 7. The cable list is the one the field asked for.
//
//    The dropdown was hard-coded to the SERVICE catalogue, which was
//    true while the only cable field reaching it was a service \u2014 mains
//    were turned away with a message. Removing that message let mains
//    fall into the same branch, and they were offered service cables
//    under a note about customers' tails: the wrong list, described as
//    the wrong thing.
{
  const panel = readFileSync("./src/features/gis/BulkEditor.jsx", "utf8");
  if (/cableMenu\(cableSizes, cableTypes, \{ usage: "service" \}\)/.test(panel)) {
    fail("the cable list is fixed to services, so a run of mains is offered "
      + "the wrong catalogue");
  }
  if (!/usage: f\.usage \|\| "mains"/.test(panel)) {
    fail("the list does not follow the field's own usage");
  }
  /* And the words follow it too. */
  if (!/f\.usage === "service"\s*\n?\s*\? "The tail each customer/.test(panel)) {
    fail("a run of mains is described as a customer's tail");
  }

  /* ── An HV run is not an LV main ──
     Both are "Mains" by usage, so a field carrying usage alone offers
     LV cable for eleven kilovolts. The voltage rides on the field and
     is compared alongside kind and usage, so a selection holding both
     is offered NEITHER \u2014 there is no one size that suits both. */
  const lt = [{ Type_Key: "elec_main", Layer_Key: "electric" },
    { Type_Key: "elec_hv", Layer_Key: "electric" }];
  const o2 = { lineTypes: lt, layers: [{ Layer_Key: "electric" }], surfaceTypes: [] };
  const L = (t, i) => ({ Feature_ID: i, Feature_Type: "line",
    Layer_Key: "electric", Attributes: { Line_Type: t } });
  const cableOf = (sel) => fieldsForMany(classesIn(sel, o2), o2)
    .find((x) => x.key === "Manual_VD_Cable_Size_ID");

  const hv = cableOf([L("elec_hv", 1), L("elec_hv", 2)]);
  if (!hv) fail("a run of HV is offered no cable at all");
  else if (String(hv.voltageIds) !== "2") {
    fail("an HV run's cable field does not ask for HV cable");
  }
  if (cableOf([L("elec_main", 3), L("elec_main", 4)])?.voltageIds) {
    fail("an LV main's cable field asks for a voltage, narrowing it wrongly");
  }
  if (cableOf([L("elec_hv", 5), L("elec_main", 6)])) {
    fail("a selection of HV and LV mains is offered one cable list, so an LV "
      + "cable can be set on eleven kilovolts");
  }
  const src = readFileSync("./src/features/gis/bulkEdit.js", "utf8");
  if (!/String\(match\.voltageIds \?\? ""\) === String\(f\.voltageIds \?\? ""\)/.test(src)) {
    fail("the voltage is carried on the field and not compared, so HV and LV "
      + "merge into one field");
  }
}

// 8. The bulk cable field writes the OVERRIDE.
//
//    Every electric line carries two sizes: `VD_Cable_Size_ID`, which
//    Build LV Network works out, and `Manual_VD_Cable_Size_ID`, which a
//    designer sets to overrule it. The single-feature editor has always
//    written the second.
//
//    This wrote the FIRST, so a bulk change looked right until the next
//    build recalculated the field and put its own answer back \u2014 the
//    size returned to what it had been and nothing said why.
{
  const src = readFileSync("./src/features/gis/bulkEdit.js", "utf8");
  if (/key: "VD_Cable_Size_ID", label: "Cable"/.test(src)) {
    fail("the bulk cable field writes the calculated size, which the next "
      + "build overwrites");
  }
  if (!/key: "Manual_VD_Cable_Size_ID", label: "Cable"/.test(src)) {
    fail("the bulk cable field does not write the override");
  }

  /* And the calculated size is left alone, so the build's own answer
     survives for anything not overridden. */
  const mainsAny = f.filter((x) => x.Attributes?.Line_Type === "elec_main").slice(0, 2);
  if (mainsAny.length) {
    const r = planBulkEditOn(mainsAny, { Manual_VD_Cable_Size_ID: 3 },
      { lineTypes: raw.lineTypes || [], features: f });
    const a = r.rows[0]?.Attributes || {};
    if (Number(a.Manual_VD_Cable_Size_ID) !== 3) fail("the override was not written");
    if (a.VD_Cable_Size_ID !== mainsAny[0].Attributes.VD_Cable_Size_ID) {
      fail("the calculated size was changed as well, so the build's own "
        + "answer is lost");
    }
  }

  /* The same field the one-at-a-time editor writes, so the two agree
     about what "set the cable" means. */
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/setAttr\("Manual_VD_Cable_Size_ID"\)/.test(editor)) {
    fail("the single-feature editor no longer writes the override, so the "
      + "two editors disagree");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Bulk edit offers what they share (and only that).");
process.exit(bad ? 1 : 0);
