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

/* The layers matter now: the kind entries live under Electric only,
   which is built from the layer list. */
const LAYERS = [
  { Layer_Key: "electric", Label: "Electric" },
  { Layer_Key: "gas", Label: "Gas" },
];
const cats = bulkDeleteCategories(FEATURES, { lineTypes: [], layers: LAYERS });
const cat = (key) => cats.find((c) => c.key === key);

// 1. A category for each kind, counting both ways of recording it.
//
//    A joint placed from the catalogue carries Joint_Code and one
//    placed from the menu carries Joint_Type, and both are the same
//    fitting. A filter that read only one would silently take half.
{
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    const c = cat(`electric:joint_${kind}`);
    if (!c) { fail(`there is no category for ${kind} joints`); continue; }
    const want = kind === "service" ? 3 : 2;   // service has an extra
    if (c.count !== want) fail(`${kind} counted ${c.count}, wanted ${want}`);
  }
}

// 2. Each takes only its own.
{
  if (idsForKeys(cats, ["electric:joint_service"]).sort((a, b) => a - b).join(",") !== "1,2,6") {
    fail(`the service joints came out as ${idsForKeys(cats, ["electric:joint_service"]).join(",")}`);
  }
  if (idsForKeys(cats, ["electric:joint_breech"]).sort((a, b) => a - b).join(",") !== "3,7") {
    fail(`the breech joints came out as ${idsForKeys(cats, ["electric:joint_breech"]).join(",")}`);
  }
  if (idsForKeys(cats, ["electric:joint_straight"]).sort((a, b) => a - b).join(",") !== "4,8") {
    fail(`the straight joints came out as ${idsForKeys(cats, ["electric:joint_straight"]).join(",")}`);
  }
}

// 3. Nothing that is not a joint, whatever else it is.
{
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    if (idsForKeys(cats, [`electric:joint_${kind}`]).includes(11)) {
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
  /* Through keysToAdd, because that is what a tick does. Naming the
     parent alone and none of its children is not a state the panel can
     be in \u2014 and it means something else entirely: every child left
     unticked under a ticked parent is subtracted, which is how "all of
     it except that" works. */
  if (!idsForKeys(cats, keysToAdd(cats, "joint")).includes(10)) {
    fail("a connector with no kind fell out of the catch-all");
  }
  const covered = new Set(["service", "breech", "straight", "bottleend"]
    .flatMap((k) => idsForKeys(cats, [`electric:joint_${k}`])));
  if (covered.has(10)) fail("a connector with no kind was claimed by a kind");
}

// 5. Ticking the catch-all ticks the kinds under it.
{
  const on = keysToAdd(cats, "joint");
  for (const kind of ["service", "breech", "straight", "bottleend"]) {
    if (!on.includes(`electric:joint_${kind}`)) fail(`ticking all joints missed the ${kind} ones`);
  }
  if (!keysToRemove(cats, "joint").includes("electric:joint_straight")) {
    fail("unticking all joints left the straight ones ticked");
  }
}

// 6. All the joints except one kind.
//
//    Unticking a child leaves the parent ticked and subtracts the
//    child, which is what "all of them except that" means — and it must
//    still leave the connector that belongs to no kind in.
{
  const keys = keysToAdd(cats, "joint").filter((k) => k !== "electric:joint_straight");
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
    if (!cat(`electric:joint_${kind}`)) fail(`${kind} is in the catalogue with no category`);
  }
  for (const kind of Object.keys(JOINT_KINDS)) {
    const label = cat(`electric:joint_${kind}`)?.label ?? "";
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

// 9. The two gas tees are cleared separately.
//
//    They share a role and a symbol, but they are placed by different
//    routines at different times and cleared for different reasons: the
//    main tees go in with the network, the top tees with the services.
//    One entry for both was the same blunt instrument "all joints" was.
{
  const tee = (id, kind) => ({
    Feature_ID: id, Feature_Type: "point", Feature_Role: "hvtt",
    Layer_Key: "gas", Attributes: kind ? { Tee_Kind: kind } : {},
  });
  const world = [tee(1, "service"), tee(2, "junction"), tee(3, "junction"),
    /* Written before the kinds were told apart. */
    tee(4, null)];
  const cs = bulkDeleteCategories(world, {
    lineTypes: [], layers: [{ Layer_Key: "gas", Label: "Gas" }],
  });

  const svc = cs.find((c) => c.key === "gas:hvtt_service");
  const jct = cs.find((c) => c.key === "gas:hvtt_junction");
  if (!svc || !jct) { fail("the tees are not offered separately"); }
  else {
    if (svc.count !== 2) fail(`${svc.count} top tees counted, wanted 2`);
    if (jct.count !== 2) fail(`${jct.count} main tees counted, wanted 2`);
    /* Every tee falls in exactly one of the two, so none is unreachable
       and none is deleted twice. */
    const a = new Set(idsForKeys(cs, ["gas:hvtt_service"]));
    const b = new Set(idsForKeys(cs, ["gas:hvtt_junction"]));
    if ([...a].some((x) => b.has(x))) fail("a tee is in both entries");
    if (a.size + b.size !== 4) fail(`${a.size + b.size} tees reachable, wanted 4`);
    /* The one with no kind counts as a top tee. */
    if (!a.has(4)) fail("a tee written before the kinds existed is unreachable");
  }

  /* And ticking the gas connectors does not take them: a tee is not a
     joint, and the two are ordered as different parts. */
  const conn = cs.find((c) => c.key === "gas:joint");
  if (conn && idsForKeys(cs, keysToAdd(cs, "gas:joint")).some((x) => [1, 2, 3, 4].includes(x))) {
    fail("clearing the gas connectors took the tees with them");
  }
}

// 10. Nothing that was on the menu has fallen off it.
//
//    Adding the joint kinds to this file once took "All span nodes" and
//    "All service valves" with them — a text edit that reached three
//    lines further than intended, deleting two entries and the comment
//    explaining why substations are not among them. Nothing failed:
//    the file parsed, the suite passed, and two ways of clearing a
//    drawing had simply gone.
//
//    So the general entries are listed. A category deliberately removed
//    is one line to delete here as well, which is a moment to think;
//    one removed by accident is a failure.
{
  const world = [
    { Feature_ID: 1, Feature_Type: "point", Feature_Role: "spannode",
      Layer_Key: "electric", Attributes: {} },
    { Feature_ID: 2, Feature_Type: "point", Feature_Role: "servicevalve",
      Layer_Key: "water", Attributes: {} },
    { Feature_ID: 3, Feature_Type: "point", Feature_Role: "meter",
      Layer_Key: "gas", Attributes: {} },
    { Feature_ID: 4, Feature_Type: "point", Feature_Role: "plot",
      Layer_Key: "plot", Attributes: {} },
    { Feature_ID: 5, Feature_Type: "point", Feature_Role: "joint",
      Layer_Key: "electric", Attributes: {} },
  ];
  const cs = bulkDeleteCategories(world, {
    lineTypes: [],
    layers: [{ Layer_Key: "electric", Label: "Electric" },
      { Layer_Key: "gas", Label: "Gas" }, { Layer_Key: "water", Label: "Water" }],
  });

  const expected = [
    ["spannode", "Points"], ["servicevalve", "Points"], ["meter", "Points"],
    ["joint", "Points"], ["seed", "Points"], ["linkbox", "Points"],
    ["column", "Points"], ["poc", "Points"],
    ["boundary", "Everything"], ["all", "Everything"],
  ];
  for (const [key, group] of expected) {
    const c = cs.find((x) => x.key === key);
    if (!c) { fail(`the "${key}" category has gone from the menu`); continue; }
    if (c.group !== group) fail(`"${key}" moved to ${c.group}, wanted ${group}`);
  }

  /* And each still finds what it is for. A category that survives as a
     label but counts nothing is no better than one deleted. */
  /* Through keysToAdd, because that is what a tick does: a parent named
     alone with its children unticked means "all of it except those". */
  if (!idsForKeys(cs, keysToAdd(cs, "spannode")).includes(1)) {
    fail("all span nodes matched no span node");
  }
  if (!idsForKeys(cs, keysToAdd(cs, "servicevalve")).includes(2)) {
    fail("all service valves matched none");
  }
}

// 11. Everything the application can place can be cleared.
//
//    Three roles have been added since this dialog was written — the
//    two gas tees and the reducer — and the reducer arrived with a
//    symbol, a bill row, a migration and a placing routine but no way
//    to delete it in bulk. Nothing failed; there was simply no entry,
//    and a drawing whose sizes had been reworked could not be cleared
//    and re-run.
//
//    So the roles are listed from the constraint that governs them, and
//    each has to be reachable. Adding a role to the database and not to
//    this menu is now a failure rather than something found later.
{
  const ROLES = [
    "shape", "plot", "meter", "poc", "substation", "joint", "source",
    "spannode", "linkbox", "column", "governor", "servicevalve", "pumping",
    "hvtt", "reducer",
  ];

  const gas = new Set(["governor", "hvtt", "reducer"]);
  const world = ROLES.map((r, i) => ({
    Feature_ID: i + 1, Feature_Type: "point", Feature_Role: r,
    Layer_Key: gas.has(r) ? "gas" : "electric", Attributes: {},
  }));

  const cs = bulkDeleteCategories(world, {
    lineTypes: [],
    layers: [{ Layer_Key: "electric", Label: "Electric" },
      { Layer_Key: "gas", Label: "Gas" }],
  });

  const reachable = new Set();
  for (const c of cs) for (const id of idsForKeys(cs, [c.key])) reachable.add(id);

  for (const f of world) {
    if (!reachable.has(f.Feature_ID)) {
      fail(`a ${f.Feature_Role} cannot be deleted from this menu`);
    }
  }

  /* Reachable is not enough. "Everything on the drawing" reaches every
     role, and so does "All Gas objects" — a reducer was reachable
     through both while having no entry of its own, which is the state
     this is meant to catch.

     So each role needs a category that selects it and nothing else: one
     whose members are all of that role. That is what "clear the
     reducers and run it again" requires, and a layer-wide entry cannot
     do it without taking the pipe with them. */
  /* Three roles have never had one, and did not before any of this
     work: `shape`, `source` and `pumping`. Listed rather than the check
     loosened to let them pass, because a list is a decision somebody
     can look at and a loosened check is one that stops noticing.

     Worth someone deciding on: a pumping station and a source are real
     features that can be placed and cannot be cleared except by layer
     or by everything. `shape` is likelier to be deliberate \u2014 it is the
     catch-all for a drawn shape rather than a thing in the ground. */
  const NO_OWN_ENTRY = ["shape", "source", "pumping"];

  /* Asked of each category's own predicate rather than through
     idsForKeys.

     idsForKeys answers a different question: with a parent ticked and
     its children left unticked it subtracts the children, so "All Gas
     objects" came back holding nothing but the reducer and looked like
     an entry of its own. It was the only role left once the governors
     and the tees had been taken out — which is the opposite of what was
     being asked. */
  for (const f of world) {
    if (NO_OWN_ENTRY.includes(f.Feature_Role)) continue;
    const own = cs.some((c) => c.pred(f)
      && world.every((x) => !c.pred(x) || x.Feature_Role === f.Feature_Role));
    if (!own) fail(`a ${f.Feature_Role} has no entry of its own to clear it by`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Joint delete behaves (each kind on its own, and the connectors with no kind still reachable).");
process.exit(bad ? 1 : 0);
