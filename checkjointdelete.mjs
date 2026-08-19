/* Deleting joints by kind.

   "All joints and connectors" is the wrong instrument for most of what
   somebody wants. Rebuilding the feeders replaces the straight joints
   and the breeches; the service joints belong to the plots and outlive
   it. Clearing the lot and re-running put a service joint back only
   where a service still ran to it, which is not the same set — so the
   way to redo the feeder joints was to delete everything and hope. */
import {
  bulkDeleteCategories, idsForKeys, keysToAdd, keysToRemove,
} from "./src/features/gis/bulkDelete.js";
import { JOINT_KINDS, isJointOfKind, isBreechJoint } from "./src/features/gis/joints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const byType = (id, type) => ({
  Feature_ID: id, Feature_Type: "point", Feature_Role: "joint",
  Layer_Key: "electric", Attributes: { Joint_Type: type },
});
const byCode = (id, code) => ({
  Feature_ID: id, Feature_Type: "point", Feature_Role: "joint",
  Layer_Key: "electric", Attributes: { Joint_Code: code },
});

/* Four kinds, both routes of recording them, plus a gas connector that
   carries no kind at all and a meter that is not a joint. */
const FEATURES = [
  byType(1, "service"), byType(2, "service"),
  byType(3, "breech"),
  byType(4, "straight"),
  byType(5, "bottleend"),
  byCode(6, "SVC"), byCode(7, "BRE"), byCode(8, "STR"), byCode(9, "BTL"),
  { Feature_ID: 10, Feature_Type: "point", Feature_Role: "joint",
    Layer_Key: "gas", Attributes: {} },
  { Feature_ID: 11, Feature_Type: "point", Feature_Role: "meter",
    Layer_Key: "gas", Attributes: {} },
];

const cats = bulkDeleteCategories(FEATURES, { lineTypes: [], layers: [] });
const cat = (key) => cats.find((c) => c.key === key);

// 1. A category for each kind, counting both ways of recording it.
//
//    A joint placed from the catalogue carries Joint_Code and one
//    placed from the menu carries Joint_Type, and both are the same
//    fitting. A filter that read only one would silently take half.
{
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    const c = cat(`joint_${kind}`);
    if (!c) { fail(`there is no category for ${kind} joints`); continue; }
    const want = kind === "service" ? 3 : 2;   // service has an extra
    if (c.count !== want) fail(`${kind} counted ${c.count}, wanted ${want}`);
  }
}

// 2. Each takes only its own.
{
  if (idsForKeys(cats, ["joint_service"]).sort((a, b) => a - b).join(",") !== "1,2,6") {
    fail(`the service joints came out as ${idsForKeys(cats, ["joint_service"]).join(",")}`);
  }
  if (idsForKeys(cats, ["joint_breech"]).sort((a, b) => a - b).join(",") !== "3,7") {
    fail(`the breech joints came out as ${idsForKeys(cats, ["joint_breech"]).join(",")}`);
  }
  if (idsForKeys(cats, ["joint_straight"]).sort((a, b) => a - b).join(",") !== "4,8") {
    fail(`the straight joints came out as ${idsForKeys(cats, ["joint_straight"]).join(",")}`);
  }
}

// 3. Nothing that is not a joint, whatever else it is.
{
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    if (idsForKeys(cats, [`joint_${kind}`]).includes(11)) {
      fail(`the ${kind} category took a meter`);
    }
  }
}

// 4. The catch-all still holds everything, including what has no kind.
//
//    A gas connector carries no Joint_Type and no Joint_Code and
//    belongs to none of the four. It has to stay reachable, or a
//    drawing ends up with joints nothing on this dialog can clear.
{
  const all = cat("joint");
  if (all.count !== 10) fail(`all joints counted ${all.count}, wanted 10`);
  if (!idsForKeys(cats, ["joint"]).includes(10)) {
    fail("a connector with no kind fell out of the catch-all");
  }
  const covered = new Set(["service", "breech", "straight", "bottleend"]
    .flatMap((k) => idsForKeys(cats, [`joint_${k}`])));
  if (covered.has(10)) fail("a connector with no kind was claimed by a kind");
}

// 5. Ticking the catch-all ticks the kinds under it.
{
  const on = keysToAdd(cats, "joint");
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    if (!on.includes(`joint_${kind}`)) fail(`ticking all joints missed the ${kind} ones`);
  }
  if (!keysToRemove(cats, "joint").includes("joint_straight")) {
    fail("unticking all joints left the straight ones ticked");
  }
}

// 6. All the joints except one kind.
//
//    Unticking a child leaves the parent ticked and subtracts the
//    child, which is what "all of them except that" means — and it must
//    still leave the connector that belongs to no kind in.
{
  const keys = keysToAdd(cats, "joint").filter((k) => k !== "joint_straight");
  const got = idsForKeys(cats, keys).sort((a, b) => a - b).join(",");
  if (got !== "1,2,3,5,6,7,9,10") fail(`all-but-straight came out as ${got}`);
}

// 7. Every kind in the catalogue has a category.
//
//    Bottle ends were not asked for. Leaving one of the four reachable
//    only through "all joints" is an asymmetry somebody hits the first
//    time they want to redo the ends of the runs — and a kind added to
//    JOINT_KINDS later should not quietly go missing here either.
{
  for (const kind of Object.keys(JOINT_KINDS)) {
    if (!cat(`joint_${kind}`)) fail(`${kind} is in the catalogue with no category`);
  }
  for (const kind of Object.keys(JOINT_KINDS)) {
    const label = cat(`joint_${kind}`)?.label ?? "";
    if (!label.toLowerCase().includes(JOINT_KINDS[kind].label.toLowerCase())) {
      fail(`the ${kind} category reads "${label}"`);
    }
  }
}

// 8. The predicate itself: kind or code, either casing, never crossed.
{
  const j = (type, code) => ({
    Feature_Role: "joint", Attributes: { Joint_Type: type, Joint_Code: code },
  });
  if (!isJointOfKind(j("Service", null), "service")) fail("a capitalised kind did not match");
  if (!isJointOfKind(j(null, "svc"), "service")) fail("a lower-case code did not match");
  if (isJointOfKind(j("breech", null), "service")) fail("a breech matched as a service");
  if (isJointOfKind(j("service", null), "nonsense")) fail("an unknown kind matched something");
  if (isJointOfKind({ Feature_Role: "meter", Attributes: {} }, "service")) {
    fail("a meter matched as a joint");
  }
  /* The one predicate that existed before still answers the same. */
  if (!isBreechJoint(j("breech", null)) || !isBreechJoint(j(null, "BRE"))) {
    fail("the breech test stopped working when it was generalised");
  }
  if (isBreechJoint(j("service", null))) fail("the breech test now matches a service");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Joint delete behaves (each kind on its own, and the connectors with no kind still reachable).");
process.exit(bad ? 1 : 0);
