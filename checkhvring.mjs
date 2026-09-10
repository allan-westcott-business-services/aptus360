/* The daisy chain: a substation looped in and out of a shared HV
   circuit, several substations in series on one way's cable, the ring
   returning to a second way with a normally open point along it.

   The model has to read the arrangement off the drawing: which primary
   feeds the substation in normal running, how many substations share
   the leg (a cable fault takes them all, because ring switches are
   load-break switches and only the way's breaker clears it), where the
   open point splits the ring, and what a drawing of an open ring says
   when it is missing one of those facts. */
import { readFileSync } from "node:fs";
import {
  hvRingModel, feedSummary, faultCompany, isHvLine,
  HV_LINE_TYPES, HV_CONNECTIONS, RMU_TEE_PROTECTION,
} from "./src/features/gis/hvRing.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

let nextId = 1;
const pt = (role, x, y, attrs = {}, label = null) => ({
  Feature_ID: nextId++, Feature_Type: "point", Feature_Role: role,
  Layer_Key: "electric", Label: label,
  Geometry: [[x, y]], Attributes: attrs,
});
const hv = (points, type = "elec_hv_existing") => ({
  Feature_ID: nextId++, Feature_Type: "line", Feature_Role: "shape",
  Layer_Key: "electric", Geometry: points, Attributes: { Line_Type: type },
});

/* The standard arrangement, drawn as somebody would draw it: the
   primary at one end, three substations along one cable — ours in the
   middle — the run carrying on past the last one, and the open point
   on that far leg. Way 3 out, way 7 back. */
function standardRing({ withNop = true } = {}) {
  nextId = 1;
  const primary = pt("primary", 0, 0,
    { Feed_Way: 3, Return_Way: 7 }, "Hightown Primary");
  const s1 = pt("ringsub", 100, 0, {}, "Mill Lane");
  const ours = pt("substation", 200, 0,
    { HV_Connection: "looped", RMU_Tee_Protection: "fuse-switch" },
    "Substation 1");
  const s2 = pt("ringsub", 300, 0, {}, "Church Street");
  const run = hv([[0, 0], [100, 0], [200, 0], [300, 0], [400, 0]]);
  const back = hv([[400, 0], [400, -60], [0, -60], [0, 0]]);
  const nop = withNop
    ? pt("openpoint", 400, -30, {}, "NOP") : null;
  const features = [primary, s1, ours, s2, run, back,
    ...(nop ? [nop] : [])];
  return { features, primary, s1, ours, s2, nop, run, back };
}

// 1. The chain reads in cable order, and the feed says so out loud.
{
  const { features, ours, s1 } = standardRing();
  const m = hvRingModel(features);
  const feed = m.feeds.get(ours.Feature_ID);
  if (!feed) fail("our substation is on the chain and the model does not feed it");
  else {
    if (feed.primary.Label !== "Hightown Primary") {
      fail("fed from somewhere other than the primary on the drawing");
    }
    if (feed.hops !== 1) {
      fail(`one substation stands between ours and the primary; hops came back ${feed.hops}`);
    }
  }
  const first = m.feeds.get(s1.Feature_ID);
  if (!first || first.hops !== 0) {
    fail("the first substation on the chain is not read as the first");
  }
  const said = feedSummary(m, ours.Feature_ID) || "";
  if (!/way 3/.test(said)) {
    fail("the feed summary does not name the way whose breaker protects the chain: " + said);
  }
  if (!/1 substation up the chain/.test(said)) {
    fail("the summary does not say where on the chain it stands: " + said);
  }
  /* A cable fault trips the way and takes every substation on the leg. */
  if (faultCompany(m, ours.Feature_ID) !== 2) {
    fail("the shared fault exposure miscounts the substations on the leg");
  }
  if (m.findings.some((f) => f.level === "warn")) {
    fail("a correctly drawn open ring carries warnings: "
      + m.findings.map((f) => f.text).join(" | "));
  }
}

// 2. The open point decides the feed direction, not the drawing order.
{
  const r = standardRing();
  /* Move the split to between the primary and Mill Lane: everything is
     now fed the long way round, through the return leg. */
  r.nop.Geometry = [[50, 0]];
  const m = hvRingModel(r.features);
  const feed = m.feeds.get(r.ours.Feature_ID);
  if (!feed) fail("moving the open point unfed the substation entirely");
  else if (feed.hops !== 1) {
    /* Round the back: Church Street sits between the primary and ours. */
    fail(`fed the long way round, Church Street is between us and the primary; hops ${feed.hops}`);
  }
  const first = m.feeds.get(r.s1.Feature_ID);
  if (!first || first.hops !== 2) {
    fail("Mill Lane, beside the split, should now be last on the chain");
  }
}

// 3. A ring drawn closed is said, once there is a ring to close.
{
  const { features } = standardRing({ withNop: false });
  const m = hvRingModel(features);
  if (!m.findings.some((f) => /drawn closed/.test(f.text))) {
    fail("a ring with no normally open point is not called closed");
  }
}

// 4. The chain with no primary has no feed, and says why.
{
  const r = standardRing();
  const features = r.features.filter((f) => f.Feature_Role !== "primary");
  const m = hvRingModel(features);
  if (!m.findings.some((f) => /no primary/.test(f.text))) {
    fail("HV cable with no primary placed raises nothing");
  }
}

// 5. A substation the run does not pass is not quietly fed.
{
  const r = standardRing();
  r.ours.Geometry = [[200, 500]];
  const m = hvRingModel(r.features);
  if (m.feeds.get(r.ours.Feature_ID)) {
    fail("a substation 500 m off the cable is fed by wishful thinking");
  }
  if (!m.findings.some((f) => /not reached from a primary/.test(f.text))) {
    fail("the substation off the chain is not named in the findings");
  }
  /* Unless it is on a dedicated way, which is the one arrangement
     where being off this chain is the point. */
  r.ours.Attributes.HV_Connection = "dedicated";
  const m2 = hvRingModel(r.features);
  if (m2.findings.some((f) => /not reached from a primary/.test(f.text))) {
    fail("a dedicated-way substation is told off for not being on the ring");
  }
}

// 6. An open point in open ground is a split in nothing.
{
  const r = standardRing();
  r.nop.Geometry = [[800, 800]];
  const m = hvRingModel(r.features);
  if (!m.findings.some((f) => /does not stand on any HV cable/.test(f.text))) {
    fail("an open point off the cable is not called out");
  }
}

// 7. Two lengths drawn TO the substation, not to each other, are one
//    circuit: the RMU is the splice.
{
  nextId = 1;
  const primary = pt("primary", 0, 0, { Feed_Way: 1 }, "Primary");
  const ours = pt("substation", 100, 0, { HV_Connection: "looped" }, "Ours");
  const inCable = hv([[0, 0], [98, 0]]);       // stops 2 m short, at the RMU
  const outCable = hv([[102, 0], [200, 0]]);   // leaves the other side
  const nop = pt("openpoint", 200, 0, {}, "NOP");
  const m = hvRingModel([primary, ours, inCable, outCable, nop]);
  if (!m.feeds.get(ours.Feature_ID)) {
    fail("in and out cables meeting at the substation symbol do not chain through it");
  } else if (m.feeds.get(ours.Feature_ID).hops !== 0) {
    fail("the spliced chain miscounts");
  }
}

// 8. The vocabulary is what the editor offers, and both new line types
//    are the model's business.
{
  if (!HV_LINE_TYPES.includes("elec_hv") || !HV_LINE_TYPES.includes("elec_hv_existing")) {
    fail("the chain is one circuit however many owners its lengths have; both HV types belong to it");
  }
  if (!HV_CONNECTIONS.some((c) => c.key === "looped")
    || !HV_CONNECTIONS.some((c) => c.key === "teed")
    || !HV_CONNECTIONS.some((c) => c.key === "dedicated")) {
    fail("the three ways a substation hangs off the HV network are not all offered");
  }
  if (!RMU_TEE_PROTECTION.some((c) => c.key === "fuse-switch")) {
    fail("a fuse switch is the common tee protection and is not offered");
  }
  if (!isHvLine({ Feature_Type: "line", Layer_Key: "electric",
    Attributes: { Line_Type: "elec_hv_existing" } })) {
    fail("the incumbent's HV cable is not an HV line to the model");
  }
}

// 9. The pieces are wired in, not just written.
{
  const canvas = readFileSync("src/features/gis/GISCanvasPage.jsx", "utf8");
  const editor = readFileSync("src/features/gis/FeatureEditor.jsx", "utf8");
  const migration = readFileSync("supabase/migrations/0211_hv_ring.sql", "utf8");
  const bulk = readFileSync("src/features/gis/bulkDelete.js", "utf8");

  for (const role of ["primary", "ringsub", "openpoint"]) {
    if (!new RegExp(`placeNode\\("${role}"`).test(canvas)) {
      fail(`the canvas offers no way to place a ${role}`);
    }
    if (!new RegExp(`'${role}'`).test(migration)) {
      fail(`migration 0211 does not allow the ${role} role`);
    }
  }
  /* The constraint is rewritten whole, so every role it allowed before
     must survive the rewrite — one dropped is every feature of that
     kind refused on its next save. */
  for (const role of ["shape", "plot", "meter", "poc", "substation", "joint",
    "source", "spannode", "linkbox", "column", "governor", "servicevalve",
    "pumping", "hvtt", "reducer", "nrs", "feederpoint", "msdb", "hdcutout"]) {
    if (!new RegExp(`'${role}'`).test(migration)) {
      fail(`migration 0211 rewrites the role constraint and loses '${role}'`);
    }
  }
  if (!/elec_hv_existing/.test(migration)) {
    fail("the incumbent's HV cable type is not seeded");
  }
  if (!/HV_Connection/.test(editor)) {
    fail("the editor never asks how the substation hangs off the HV network");
  }
  if (!/RMU_Tee_Protection/.test(editor)) {
    fail("the editor never records what protects the transformer tee");
  }
  if (!/feedSummary/.test(editor)) {
    fail("the editor works the feed out for itself instead of reading the model");
  }
  if (!/Build_Status: "existing"/.test(canvas)) {
    fail("HV ring plant is placed without Build_Status existing, so the bill buys the incumbent's primary");
  }
  if (!/elec_hv_existing/.test(bulk)) {
    fail("bulk delete cannot clear the existing HV cables");
  }
  if (!/ringsub/.test(bulk)) {
    fail("bulk delete cannot clear the ring plant");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The daisy chain reads off the drawing (feed, split, and shared fault).");
process.exit(bad ? 1 : 0);
