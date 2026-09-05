/* A cable is joined to a joint because somebody joined it.

   Not because its end happens to lie within a quarter of a metre of it.
   That inference is where every fault in this area came from: the
   relink pass derives `Connects` from geometry, so on a shared trench a
   joint lists cables it has nothing to do with, and anything reading it
   moves the wrong run.

   `Joint_Cables` is the record of what a fitting actually holds:
   written when a cable end is SNAPPED to the joint, which is the moment
   somebody says so, and removed only by Disconnect. In between the
   drawing can be moved about and the connection stands — which is what
   stops a cable coming adrift from its fitting by accident. */
import { readFileSync } from "node:fs";
import { jointCables, holdsCable, withCable, withoutCable, jointAtEnd,
  jointAtPoint, cableEndsAt, JOIN_REACH_M, cablesHeldAt, servicesAt,
  servedPlots } from "./src/features/gis/joints.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const joint = (attrs = {}) => ({ Feature_ID: 7, Feature_Role: "joint",
  Feature_Type: "point", Layer_Key: "electric", Label: "Service Joint",
  Geometry: [[50, 0]], Attributes: { Joint_Type: "service", ...attrs } });

// 1. Holding, adding, releasing.
{
  if (jointCables(joint()).length) fail("a fresh joint claims to hold cables");
  const one = withCable(joint(), 11);
  if (!one.Joint_Cables.includes(11)) fail("a cable was not recorded");
  const two = withCable(joint({ Joint_Cables: [11] }), 99);
  if (two.Joint_Cables.length !== 2) fail("a second cable replaced the first");

  /* The same object back where nothing changed, so a caller can tell
     and not write for nothing. */
  const held = joint({ Joint_Cables: [11] });
  if (withCable(held, 11) !== held.Attributes) {
    fail("re-joining a cable already held rewrites the joint for nothing");
  }
  if (withoutCable(held, 4242) !== held.Attributes) {
    fail("releasing a cable that was never held rewrites the joint");
  }

  const gone = withoutCable(joint({ Joint_Cables: [11, 99] }), 11);
  if (gone.Joint_Cables.join() !== "99") fail("Disconnect released the wrong cable");
  if (!holdsCable(joint({ Joint_Cables: [11] }), "11")) {
    fail("an id as text is not recognised as the same cable");
  }
}

// 2. ENDS only. A cable passing across a fitting is not joined to it,
//    and treating it as joined is how a joint came to drag a run that
//    merely crosses its position.
{
  const j = joint();
  if (!jointAtEnd({ Geometry: [[0, 0], [50, 0]] }, [j])) {
    fail("an end dropped on the joint is not seen as joined to it");
  }
  if (jointAtEnd({ Geometry: [[0, 0], [100, 0]] }, [j])) {
    fail("a cable passing across the joint counts as joined to it");
  }
  if (jointAtEnd({ Geometry: [[0, 0], [40, 0]] }, [j])) {
    fail("an end ten metres short counts as joined");
  }
  /* The nearest joint, where two stand close together. */
  const near = { ...joint(), Feature_ID: 8, Geometry: [[50.2, 0]] };
  if (jointAtEnd({ Geometry: [[0, 0], [50, 0]] }, [near, j])?.Feature_ID !== 7) {
    fail("the further of two joints was taken");
  }
  /* And nothing but a joint. */
  if (jointAtEnd({ Geometry: [[0, 0], [50, 0]] },
    [{ ...joint(), Feature_Role: "spannode" }])) {
    fail("a span node was treated as a joint");
  }
}

/* Written at the drop, read by the drag, released only on purpose. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");

  /* It takes the index of the vertex that moved now: an end, or the
     middle of a main being put onto a service joint. */
  if (!/async function joinEndToJoint\(line, vertexIndex = null\)/.test(canvas)) {
    fail("nothing records a cable end dropped on a joint");
  }
  /* The drag path is the one people actually use: grab an end, drag it,
     drop it. */
  if (!/await joinEndToJoint\(f, d\.index\);/.test(canvas)) {
    fail("dragging a cable end onto a joint does not join it");
  }
  /* ANY joint, not only the ones that join ends: a cable snapped to a
     service joint is held by it too. */
  if (!/const told = new Set\(jointCables\(pt\)\);/.test(canvas)) {
    fail("the drag reads the record for only some kinds of joint");
  }
  if (!/async function disconnectCable\(jointId, cableId\)/.test(canvas)) {
    fail("there is no way to release a cable, so a wrong join is permanent");
  }
  /* Named per cable: a breech holds several, and releasing the wrong
     one silently would be worse than the accident this prevents. */
  if (!/onDisconnectCable\?\.\(feature\.Feature_ID, id\)/.test(editor)) {
    fail("Disconnect does not say which cable it releases");
  }
  if (!/onDisconnectCable=\{disconnectCable\}/.test(canvas)) {
    fail("the editor's Disconnect is not wired to anything");
  }
}

// 3. What is standing at a joint, whether or not it holds it.
//
//    Every joint drawn before connections were recorded holds nothing,
//    so a panel listing only what is HELD shows nothing on the joints
//    somebody already has — and the feature reads as missing on every
//    kind of joint but the one that writes the record when it is placed.
//
//    Offered rather than assumed: a cable ending at a fitting is
//    usually joined to it, and on a shared trench sometimes is not.
{
  const j = joint();
  const line = (id, g) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g, Attributes: {} });
  const world = [
    line(11, [[0, 0], [50, 0]]),        // ends on it
    line(99, [[50, 0], [100, 0]]),      // ends on it
    line(5, [[0, 0], [100, 0]]),        // passes across it
    line(7, [[0, 40], [40, 40]]),       // nowhere near
    { ...line(8, [[0, 0], [50, 0]]), Layer_Key: "trench" }, // another layer
  ];
  const at = cableEndsAt(j, world).map((f) => f.Feature_ID).sort();
  if (at.join() !== "11,99") {
    fail(`cables at the joint came out as ${at.join(", ")} \u2014 wanted the two `
      + "whose ends are on it, and nothing that passes across or lies on "
      + "another layer");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  /* The panel shows on a joint holding nothing, or the feature is
     invisible on every joint already drawn. */
  if (!/jointCables\(feature\)\.length > 0\n\s*\|\| cableEndsAt\(feature, allFeatures \|\| \[\]\)\.length > 0/.test(editor)) {
    fail("the panel is hidden on a joint that holds nothing, which is every "
      + "joint drawn before this");
  }
  if (!/onConnectCable\?\.\(feature\.Feature_ID, c\.Feature_ID\)/.test(editor)) {
    fail("there is no way to join a cable that is standing at the fitting");
  }
  /* Already held is not offered again. */
  if (!/\.filter\(\(c\) => !jointCables\(feature\)\.includes\(Number\(c\.Feature_ID\)\)\)/.test(editor)) {
    fail("a cable already held is offered to be connected again");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/async function connectCable\(jointId, cableId\)/.test(canvas)) {
    fail("Connect is not wired to anything");
  }
}

// 4. A MIDPOINT dragged onto a joint is joined to it too.
//
//    `jointAtEnd` asks about a cable's two ends, which is right when a
//    cable is drawn to a fitting. It is not the only way a cable meets
//    one: a service joint sits ON a main, at a vertex in the middle of
//    it, and somebody dragging that vertex onto the fitting is joining
//    them just as deliberately. Asked about by position, because the
//    caller knows which vertex it moved.
{
  const j = joint();
  const main = { Feature_ID: 11, Feature_Type: "line", Layer_Key: "electric",
    Geometry: [[0, 0], [50, 0], [100, 0]], Attributes: {} };

  if (!jointAtPoint(main.Geometry[1], [j])) {
    fail("a midpoint dropped on a joint is not seen as joined to it");
  }
  /* Which the ends alone cannot find \u2014 the whole reason for asking by
     position. */
  if (jointAtEnd(main, [j])) {
    fail("the fixture is wrong: this main has an END on the joint, so it "
      + "proves nothing about midpoints");
  }
  /* Still bounded: a vertex two metres away was not dropped on it. */
  if (jointAtPoint([52, 0], [j])) {
    fail("a vertex two metres off the fitting counts as joined to it");
  }
  if (jointAtPoint(null, [j])) fail("nothing at all counts as a point");

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* The vertex that MOVED, passed in by the drag that moved it. */
  if (!/await joinEndToJoint\(f, d\.index\);/.test(canvas)) {
    fail("the drag does not say which vertex it dropped, so a midpoint "
      + "dragged onto a joint is never recorded");
  }
  /* And a named cable follows at whatever vertex stands on the joint,
     or a service joint moves out from under the main it is let into. */
  if (!/\|\| \(isJoint && told\.has\(Number\(line\.Feature_ID\)\)\)/.test(canvas)) {
    fail("a cable the joint says it holds follows only by its ends, so a "
      + "main joined at its middle is left behind");
  }
}

// 5. Followed at the distance it was joined at.
//
//    A vertex was RECORDED as joined within 0.35 m and FOLLOWED within
//    0.25 m. So a vertex snapped a third of a metre from the fitting
//    was written down as held and then never moved with it: glued on
//    paper, adrift on the drawing. Two numbers for one question.
{
  if (JOIN_REACH_M <= 0.25) {
    fail("the join reach is no wider than the touch tolerance, so the two "
      + "cannot be told apart \u2014 this test proves nothing");
  }
  const j = joint();
  /* Recorded at a distance the old follow test would have rejected. */
  if (!jointAtPoint([50 + 0.3, 0], [j])) {
    fail("a vertex a third of a metre from the fitting is not recorded as "
      + "joined, so this fault cannot arise \u2014 check the fixture");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/const near = namedHere \? JOIN_REACH_M : CONNECT_M;/.test(canvas)) {
    fail("a cable the fitting NAMES is followed at the tighter touch "
      + "tolerance, so one joined at arm's length is left behind");
  }
  /* And the record is asked BEFORE the guesses, or a joint carrying one
     circuit's stamp refuses to move a cable from another that somebody
     deliberately joined to it. */
  if (!/const namedHere = told\.has\(Number\(line\.Feature_ID\)\);\n\s*if \(told\.size && !namedHere\) continue;/.test(canvas)) {
    fail("the record is not consulted before the circuit guard, so an "
      + "inference overrules what somebody stated");
  }
  if (!/if \(!namedHere\) \{\n\s*const ptCid/.test(canvas)) {
    fail("the circuit guard still applies to a cable the fitting names");
  }
}

// 6. A joint the BUILD placed holds what the build joined.
//
//    Auto Place Feeder Joints puts a fitting where a service leaves a
//    main and recorded none of it, so the editor said "nothing joined
//    to this fitting yet" on a joint the app had just placed between
//    two cables it had just laid.
//
//    Read at the moment of placement, which is the one moment the
//    drawing is exactly what the build laid. Inferring the same thing
//    later, off a drawing somebody has been editing, is the guess this
//    area keeps being bitten by.
{
  const j = { Feature_Role: "joint", Layer_Key: "electric", Geometry: [[50, 0]],
    Attributes: { Joint_Type: "service", Circuit_ID: 3, Generated: true } };
  const line = (id, g, type, cid) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g,
    Attributes: { Line_Type: type, Circuit_ID: cid } });

  const world = [
    line(11, [[0, 0], [50, 0], [100, 0]], "elec_main", 3),
    line(22, [[50, 0], [50, 8]], "elec_service", null),
    line(44, [[0, 0], [50, 0], [100, 0]], "elec_main", 2),
    line(55, [[60, 0], [60, 8]], "elec_service", null),
    { ...line(66, [[50, 0], [50, 8]], "trench_service", null), Layer_Key: "trench" },
  ];
  const held = cablesHeldAt(j, world).sort();

  /* The main it is let into, by an INTERIOR vertex, and the service
     leaving it by its end. */
  if (held.join() !== "11,22") {
    fail(`a built joint holds ${held.join(", ") || "nothing"} \u2014 wanted the `
      + "main it is let into and the service leaving it");
  }
  /* Another circuit's main on the same route is NOT what this fitting
     holds, however close it lies. */
  if (held.includes(44)) {
    fail("a built joint holds another circuit's main, so moving it drags a "
      + "cable it has nothing to do with");
  }
  if (held.includes(55)) fail("a service ten metres away counts as held");
  if (held.includes(66)) fail("a trench counts as a cable");

  /* A joint with no circuit takes what is there: a hand-placed fitting
     on a drawing with one circuit should not be excluded for saying
     nothing about which. */
  const loose = cablesHeldAt({ ...j, Attributes: { ...j.Attributes, Circuit_ID: null } },
    world);
  if (!loose.includes(44)) {
    fail("a joint naming no circuit refuses a main that names one \u2014 it has "
      + "no basis to");
  }

  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  if (!/cablesHeldAt\(j, all\)/.test(canvas)) {
    fail("the build does not record what its joints hold");
  }
  /* Written only where it changes something: a rebuild finding the same
     joints holding the same cables must not be a hundred needless
     writes. */
  if (!/was\.join\(","\) !== \[\.\.\.held\]\.sort\(\)\.join\(","\)/.test(canvas)) {
    fail("every joint is rewritten on every build, changed or not");
  }
  /* And only its OWN joints: one somebody placed by hand is theirs. */
  if (!/f\.Feature_Role === "joint" && f\.Attributes\?\.Generated/.test(canvas)) {
    fail("the build overwrites the connections on a hand-placed joint");
  }
}

// 7. "Nothing here" and "here but unnamed" are two different facts.
//
//    `servedPlots` answers "which plots", and returns nothing for a
//    cable that names none — so a fitting with a service ending exactly
//    on it reported "no service cable reaches this point". On a live
//    drawing that was all EIGHTY-TWO service joints, each with a cable
//    touching it: not one of the eighty-four services carried a Plot_ID
//    or a Seed_Feature_ID.
//
//    The first sends somebody looking for a missing cable. The second
//    tells them where to look.
{
  const j = { Feature_Role: "joint", Layer_Key: "electric", Geometry: [[50, 0]],
    Attributes: { Joint_Type: "service" } };
  const svc = (id, g, plot) => ({ Feature_ID: id, Feature_Type: "line",
    Layer_Key: "electric", Geometry: g, ...(plot != null ? { Plot_ID: plot } : {}),
    Attributes: { Line_Type: "elec_service" } });

  /* A cable ending on it that names no plot: present, unnamed. */
  const unnamed = [svc(1, [[50, 0], [50, 8]])];
  if (servicesAt(j, unnamed).length !== 1) {
    fail("a service ending on the fitting is not seen at all");
  }
  if (servedPlots(j, unnamed).length !== 0) {
    fail("the fixture is wrong: this service names a plot, so it cannot "
      + "show the difference between absent and unnamed");
  }

  /* One that does name its plot is still counted by both. */
  const withPlot = [svc(2, [[50, 0], [50, 8]], 12)];
  if (!servicesAt(j, withPlot).length || !servedPlots(j, withPlot).length) {
    fail("a service that names its plot is not counted");
  }

  /* And a cable ten metres away is neither. */
  if (servicesAt(j, [svc(3, [[60, 0], [60, 8]])]).length) {
    fail("a service ten metres off counts as reaching the fitting");
  }

  const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
  if (!/servicesAt\(feature, allFeatures \|\| \[\]\)\.length/.test(editor)) {
    fail("the panel cannot tell a missing cable from an unnamed one, so it "
      + "reports a cable that is there as absent");
  }
  if (!/none says which plot it feeds/.test(editor)) {
    fail("the panel does not say what is actually wrong");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Joints hold their cables (joined on the drop, released on purpose).");
process.exit(bad ? 1 : 0);
