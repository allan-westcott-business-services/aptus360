/* Can several classes be edited at once, and only on what they share?

   Run: node checkbulkedit.mjs */
import { fieldsFor, fieldsForMany, membersOfMany, planBulkEditMany }
  from "./src/features/gis/bulkEdit.js";
import { statusesFor, BUILD_STATUSES } from "./src/features/gis/buildStatus.js";

const fails = [];
const fail = (m) => fails.push(m);

const lineTypes = [
  { Type_Key: "trench_service", Layer_Key: "trench", Is_Trench: true },
  { Type_Key: "elec_main", Layer_Key: "electric" },
];
const trench = { layer: "trench", lineType: "trench_service", role: null };
const cable = { layer: "electric", lineType: "elec_main", role: null };
const joint = { layer: "electric", lineType: null, role: "joint" };
const keys = (cs) => fieldsForMany(cs, { lineTypes }).map((f) => f.key);

// 1. Build status is offered on every class. Without it the commonest
//    bulk change on a drawing is the one thing this cannot do.
{
  for (const [name, c] of [["trench", trench], ["cable", cable], ["joint", joint]]) {
    if (!fieldsFor(c, { lineTypes }).some((f) => f.key === "Build_Status")) {
      fail(`${name} is offered no build status`);
    }
  }
}

// 2. A mixed selection offers only what they share. A cable field on a
//    joint is a form that writes a cable size onto a joint.
{
  const alone = keys([cable]);
  if (!alone.includes("VD_Cable_Size_ID")) fail("a cable alone is offered no cable field");
  const mixed = keys([cable, joint]);
  if (mixed.includes("VD_Cable_Size_ID")) fail("cable field survived into a mixed selection");
  if (!mixed.includes("Build_Status")) fail("status did not survive a mixed selection");

  const three = keys([trench, cable, joint]);
  if (three.length !== 1 || three[0] !== "Build_Status") {
    fail(`trench+cable+joint offered ${three.join(", ")}, expected Build_Status only`);
  }
  if (!keys([trench]).includes("Surface_Type")) fail("a trench alone is offered no surface");
  if (keys([trench, cable]).includes("Surface_Type")) fail("surface survived onto cables");
}

// 3. Same key, different catalogue, is two fields — not one. A mains
//    cable field and a service cable field differ in `usage`, and
//    merging them would offer service cables for a mains run.
{
  const svc = { layer: "electric", lineType: "elec_service", role: null };
  const merged = fieldsForMany([cable, svc], { lineTypes });
  const cableField = merged.find((f) => f.key === "VD_Cable_Size_ID");
  if (cableField) fail("mains and service cable fields were merged despite differing usage");
}

// 4. Members across classes, deduplicated. A feature written twice in
//    one save is a race against itself.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "electric", Attributes: { Line_Type: "elec_main" } },
    { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "joint", Attributes: {} },
  ];
  const all = { layer: "electric", lineType: null, role: null };
  const got = membersOfMany(feats, [cable, joint, cable]);
  if (got.length !== 2) fail(`membersOfMany returned ${got.length}, expected 2 deduplicated`);
  if (new Set(got.map((f) => f.Feature_ID)).size !== got.length) fail("members were duplicated");
  if (all && membersOfMany(feats, []).length !== 0) fail("no classes should select nothing");
}

// 5. A status a feature cannot hold is refused for THAT feature, not
//    for the whole edit — and it is reported, not silently dropped.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "trench", Attributes: { Line_Type: "trench_service", Build_Status: "planned" } },
    { Feature_ID: 3, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "planned" } },
  ];
  const ok = planBulkEditMany(feats, [trench, joint], { Build_Status: "remove" },
    { lineTypes, statusesFor });
  if (ok.rows.length !== 2) fail(`a valid status wrote ${ok.rows.length} rows, expected 2`);
  if ((ok.skipped || []).length) fail("a valid status skipped something");

  const bad = planBulkEditMany(feats, [trench, joint], { Build_Status: "\u0000nonsense" },
    { lineTypes, statusesFor });
  if (bad.rows.length) fail("a status nothing can hold was still written");
  if ((bad.skipped || []).length !== 2) fail("refused features were not reported back");
}

// 6. A feature already holding the value is not rewritten. Fewer rows,
//    and an undo entry listing only what actually moved.
{
  const feats = [
    { Feature_ID: 1, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "planned" } },
    { Feature_ID: 2, Layer_Key: "electric", Feature_Role: "joint", Attributes: { Build_Status: "existing" } },
  ];
  const r = planBulkEditMany(feats, [joint], { Build_Status: "planned" },
    { lineTypes, statusesFor });
  if (r.rows.length !== 1) fail(`rewrote ${r.rows.length} rows, expected 1`);
  if (r.rows[0]?.Feature_ID !== 2) fail("rewrote the feature that already matched");
}

// 7. Nothing set writes nothing, and says why rather than doing nothing
//    quietly.
{
  const r = planBulkEditMany([], [joint], {}, { lineTypes, statusesFor });
  if (r.rows.length) fail("an empty draft wrote rows");
  if (!r.reason) fail("an empty draft gave no reason");
}

// 8. Other fields are untouched. Bulk editing is mostly one field
//    across features that differ in every other.
{
  const feats = [{
    Feature_ID: 1, Layer_Key: "electric", Feature_Role: "joint",
    Attributes: { Build_Status: "planned", Joint_Kind: "straight", Circuit_ID: 4 },
  }];
  const r = planBulkEditMany(feats, [joint], { Build_Status: "existing" },
    { lineTypes, statusesFor });
  const a = r.rows[0]?.Attributes || {};
  if (a.Joint_Kind !== "straight" || a.Circuit_ID !== 4) fail("bulk edit disturbed other fields");
  if (!BUILD_STATUSES.some((s) => s.key === "existing")) fail("fixture used an unreal status");
}

console.log(fails.length
  ? "FAIL\n - " + fails.join("\n - ")
  : "Bulk edit behaves (many classes, only shared fields, per-feature status refusal).");
process.exit(fails.length ? 1 : 0);
