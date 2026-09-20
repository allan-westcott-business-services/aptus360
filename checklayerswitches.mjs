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

console.log(bad ? `\n${bad} problem(s)`
  : "The switches say what they govern; the picker says what things are.");
process.exit(bad ? 1 : 0);
