/* The switches on the Layers menu, and what the picker calls things.

   Small things, and each one was reported from use rather than
   imagined:

     - "Span node levels" named one of the two kinds of node the
       switch actually governs, so the levels at feeder end points
       looked as though they had a switch somewhere else.
     - Feeder end points had NO switch at all. Span Nodes did not
       cover them — a span node belongs to the trench and a feeder end
       point to the cable, and they carry different roles — so on a
       busy drawing the only way to clear them was to hide the whole
       electric layer.

   Nothing here needed plumbing: `classKeys` already gives every
   feature a `role:` key, and hide, show and solo all work on those.
   The switch simply was not offered. That is worth remembering the
   next time something looks like it needs building. */
import { readFileSync } from "node:fs";
import { LABEL_KINDS, DEFAULT_LABEL_KINDS } from "./src/features/gis/labelKinds.js";
import { featureName } from "./src/features/gis/snapping.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const menus = readFileSync("./src/features/gis/GisMenus.jsx", "utf8");

// 1. The levels switch is named for both kinds of node.
{
  const levels = LABEL_KINDS.find((k) => k.key === "levels");
  if (!levels) fail("there is no levels switch");
  else {
    if (/span/i.test(levels.label)) {
      fail(`the levels switch reads "${levels.label}" \u2014 it governs the labels `
        + "at feeder end points too, and naming one kind reads as though the "
        + "other had a switch somewhere else");
    }
    if (!/node/i.test(levels.label)) {
      fail(`the levels switch reads "${levels.label}", which does not say what `
        + "it is the level of");
    }
    /* On by default. The levels are the reason somebody runs the
       check, and a drawing that came back with them off would look
       as though the check had not run. */
    if (DEFAULT_LABEL_KINDS.levels !== true) {
      fail("the levels switch is off by default");
    }
  }
}

// 2. Span nodes and feeder end points switch independently.
{
  for (const [what, key] of [
    ["span nodes", "role:spannode"],
    ["feeder end points", "role:feederpoint"],
  ]) {
    for (const verb of ["hideClass", "showClass", "soloClass"]) {
      if (!canvas.includes(`${verb}("${key}")`)) {
        fail(`${what} cannot be ${verb === "hideClass" ? "hidden"
          : verb === "showClass" ? "shown alone" : "isolated"} \u2014 the only way `
          + "to clear them is to hide the layer they sit on");
      }
    }
  }

  /* Two switches on two keys, which is what makes them independent.
     One switch covering both would be the fault this fixed. */
  if (canvas.includes('hideClass("role:spannode role:feederpoint")')) {
    fail("one switch covers both kinds of node");
  }
}

// 3. The feeder switch sits under Electric, and reads as belonging to it.
{
  const at = canvas.indexOf('label="Feeder End Points"');
  if (at < 0) fail("there is no feeder end point switch");
  else {
    /* Under the electric row, not beside it. The row is emitted from
       the same pass that lays out the layers, keyed on the layer it
       follows \u2014 so a layer added to ORDER cannot put itself between
       the two. */
    if (!/l\.Layer_Key === "electric"\s*\n?\s*\? \[rowFor\(l\)/.test(canvas)) {
      fail("the feeder switch is not emitted directly after the electric "
        + "layer row, so another layer can come between them");
    }
    if (!/<MenuLayer key="role:feederpoint" indent/.test(canvas)) {
      fail("the feeder switch is not stepped in, so it reads as a layer in "
        + "its own right rather than as part of Electric");
    }
    /* And the component honours the prop. Passing one a component
       drops is a step-in that is not there, which looks identical in
       the source and not at all on the screen. */
    if (!/indent = false,/.test(menus)) {
      fail("MenuLayer takes no indent, so the prop above does nothing");
    }
    if (!/gm-sub/.test(menus)) {
      fail("nothing styles the stepped-in row");
    }
  }
}

// 4. The picker says what a thing is, then what it is called.
{
  const lineTypes = [
    { Type_Key: "elec_main", Label: "Electric Main" },
    { Type_Key: "elec_service", Label: "Electric Service" },
  ];
  const cases = [
    /* Reported from use: this read "Point A5" over "feederpoint".
       Its Label really is "Point A5", so the kind cannot simply be
       pasted in front of it \u2014 the node number comes from
       Span_Label. */
    [{ Feature_Type: "point", Feature_Role: "feederpoint", Label: "Point A5",
      Attributes: { Span_Label: "A5" } }, "Feeder End Point A5"],
    [{ Feature_Type: "line", Label: "A2", Attributes: { Line_Type: "elec_main" } },
      "Electric Main A2"],
    /* Already named for what it is. "Joint Service Joint" is worse
       than either half. */
    [{ Feature_Type: "point", Feature_Role: "joint", Label: "Service Joint",
      Attributes: {} }, "Service Joint"],
    /* No label of its own: the kind alone, not a trailing space. */
    [{ Feature_Type: "line", Label: null, Attributes: { Line_Type: "elec_service" } },
      "Electric Service"],
    [{ Feature_Type: "point", Feature_Role: "spannode", Label: null,
      Attributes: { Span_Label: "A1" } }, "Span Node A1"],
  ];
  for (const [f, want] of cases) {
    const got = featureName(f, lineTypes);
    if (got !== want) fail(`the picker would read "${got}", wanted "${want}"`);
  }

  /* ── And who a service joint feeds ──

     Every service joint on a drawing is called "Service Joint",
     which is no help on a dialog asking which of four things you
     meant. The plot it feeds is what tells them apart.

     The plots are passed in rather than worked out in the name, so
     the naming stays pure; `servedPlots` produces them. */
  const joint = { Feature_Type: "point", Feature_Role: "joint",
    Label: "Service Joint", Attributes: {} };
  if (featureName(joint, lineTypes, ["54"]) !== "Service Joint Plot 54") {
    fail("a service joint does not say which plot it feeds");
  }
  if (featureName(joint, lineTypes, ["54", "55"]) !== "Service Joint Plots 54, 55") {
    fail("a joint feeding two plots does not say so, or says \"Plot\" of two");
  }
  /* A supply has a name and no plot number, and a joint feeding one
     read as an unlabelled Service Joint beside eighty others. */
  if (featureName(joint, lineTypes, ["Pump 1"]) !== "Service Joint Plot Pump 1") {
    fail("a joint feeding a non-residential supply does not name it");
  }

  /* A role key must never reach the screen. */
  if (/feederpoint|spannode/.test(featureName(
    { Feature_Type: "point", Feature_Role: "feederpoint", Attributes: {} }, []))) {
    fail("a role key is shown to the reader as though it were a name");
  }

  /* And the line under the name carries only what qualifies the
     thing \u2014 not the kind again, which is now above it. */
  /* From the name line to the end of the row, bounded by the markup
     that closes it rather than by a character count — the three
     stale windows in fault 160 all closed the moment somebody wrote
     a comment inside them. */
  const at = canvas.indexOf('className="gp-name"');
  const ends = canvas.indexOf("</button>", at);
  const block = at < 0 ? "" : canvas.slice(at, ends > at ? ends : at + 1200);
  if (!block) fail("the picker has no name line");
  else {
    /* Matched on the call, not on its whole argument list: the plots
       a joint serves were added as a third argument and the pattern
       that pinned the closing bracket stopped matching. */
    if (!/featureName\(f, lineTypes/.test(block)) {
      fail("the picker's name line does not say what the thing is");
    }
    if (/<span className="gp-kind">\s*\n?\s*\{classLabel/.test(block)) {
      fail("the kind is printed under the name as well as in it");
    }
    if (!/parts\.length/.test(block)) {
      fail("a row with nothing to qualify it still draws an empty second line");
    }
  }
}

/* ── What you place, you see ──

   Reported after a text note appeared to do nothing: the annotation
   layer was switched off, the note landed, nothing was drawn, and an
   invisible result reads as a failed save.

   A feature is hidden if ANY of its class keys is hidden — the layer,
   the role, or the two together — so clearing one is not enough. An
   isolate is widened rather than dropped: somebody who isolated a class
   and then placed something wants both, not the whole drawing back. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const revealFor = useCallback");
  const body = at < 0 ? "" : canvas.slice(at, canvas.indexOf("function placeNode", at));
  if (!body) fail("nothing switches a layer on for what is being placed");
  else {
    for (const key of ["layerKey", "`role:${role}`", "`${layerKey}:role:${role}`"]) {
      if (!body.includes(key)) {
        fail(`placing does not clear ${key}, and a feature is hidden if any one of `
          + "its keys is");
      }
    }
    if (!/setShownOnly\(\(only\) => \(only\.length/.test(body)) {
      fail("an isolate is left as it was, so the thing placed is still not drawn");
    }
    if (/setShownOnly\(\[\]\)|setSolo\(null\)/.test(body)) {
      fail("placing drops an isolate entirely, putting the whole drawing back");
    }
  }
  /* Armed, not after the click: the layer should already be on when the
     thing appears. */
  const pn = canvas.indexOf("setPlantPlace({ role, layerKey");
  const call = canvas.indexOf("revealFor(role, layerKey)", pn);
  if (call < 0 || call - pn > 200) {
    fail("the layer is not switched on when the tool is armed");
  }
  /* A cable drawn into a hidden layer is as invisible as the note was. */
  const da = canvas.indexOf("const drawAs = useCallback");
  const daBody = da < 0 ? "" : canvas.slice(da, da + 900);
  if (!/revealFor\(null, lt\.Layer_Key\)/.test(daBody)) {
    fail("choosing a drawing tool does not switch its layer on");
  }
  if (!/k !== `lt:\$\{typeKey\}`/.test(daBody)) {
    fail("a line type hidden by its own switch stays hidden while it is drawn");
  }
}

/* ── The two ends of a service, visible ──

   Placing a plot seed names four things: the seed, the property
   boundary point, the end of the service trench, and the meters. The
   boundary point was drawn only on water's drawing — a lettered ring,
   which is a water idea — and the trench end was drawn nowhere at all.
   Both are positions every service is routed through, and neither could
   be seen to be checked.

   A small brown cross at each now, on every utility, belonging to the
   service trench: they are the two ends of that dig, so they come and
   go with it. */
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  const at = canvas.indexOf("const servicePointsShown = useMemo");
  const gate = at < 0 ? "" : canvas.slice(at, at + 400);
  if (!gate) fail("nothing draws the boundary point and the service trench end");
  else {
    if (!/hidden\.includes\("trench"\)/.test(gate)
      || !/hidden\.includes\("lt:trench_service"\)/.test(gate)) {
      fail("the marks do not follow the service trench, so hiding that dig leaves "
        + "its two ends floating on the drawing");
    }
    /* Off the lighting drawing, like the boundary ring: a column has no
       service. */
    if (!/!lightingView/.test(gate)) {
      fail("the marks appear on the lighting drawing, where there are no services");
    }
    /* Not gated on water, which is the fault being fixed. */
    if (/isolatedAwayFromWater/.test(gate)) {
      fail("the marks are still water-only, which is the fault reported");
    }
  }

  const draw = canvas.indexOf("if (servicePointsShown) {");
  const body = draw < 0 ? "" : canvas.slice(draw, draw + 1400);
  for (const key of ["Boundary_At", "Trench_End_At"]) {
    if (!body.includes(key)) fail(`the ${key} point is not marked`);
  }
  /* Plot seeds AND non-residential supplies: an NRS names the same two
     points. */
  if (!/f\.Feature_Role !== "plot" && f\.Feature_Role !== "nrs"/.test(body)) {
    fail("a non-residential supply's boundary point and trench end are not marked");
  }
  /* A fixed size in pixels: a cross that grows with the zoom covers the
     join it points at. */
  if (!/const r = 4;/.test(body)) fail("the cross is not a fixed size on screen");
  if (!/SERVICE_POINT_INK/.test(body)) fail("the cross is not drawn in the brown");
  if (!/const SERVICE_POINT_INK = "#8b5a2b"/.test(canvas)) {
    fail("the brown is not one named colour, so the two marks can drift apart");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The switches say what they govern; the picker says what things are.");
process.exit(bad ? 1 : 0);
