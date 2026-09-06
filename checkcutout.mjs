/* The figure at the cut-out, drawn at the cut-out.

   A stop's levels are the drop to that POINT on the main. What a
   customer actually gets is that plus their own service, and the levels
   already work it out — `atCutout`, for the worst-served meter on the
   stop, whose id is recorded with it.

   It was in the report and nowhere on the drawing, so the one figure a
   design is judged on could only be read by finding a row in a table
   and then finding the plot.

   ── One per stop, not one per plot ──

   The worst of the meters a stop serves is the one that has to pass.
   Drawing the same figure against every plot on the leg would be twenty
   labels saying one thing, on a drawing already carrying the plan. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* ── Read from the levels CHECK, not from the live levels ──

   The canvas keeps its own figures for the labels beside each node, and
   they come from `levelsForParts`, which has its own `figureAt`: the
   volt drop and nothing else. The service and the cut-out are added by
   the canvas's own figureAt, which only the levels check calls.

   So reading a cut-out off the live levels found `service` undefined
   and drew nothing at all \u2014 two functions of one name computing
   different things, and the one in scope was the wrong one. */
{
  const at = canvas.indexOf("const cutoutAtMeter = useMemo");
  const fn = at < 0 ? "" : canvas.slice(at, canvas.indexOf("}, [trace]);", at));
  if (!fn) fail("nothing maps a cut-out figure to the meter it belongs to");
  else {
    if (/elecLevelsAt/.test(fn)) {
      fail("the figures are read from the live levels, whose figureAt "
        + "computes no service and no cut-out \u2014 nothing will be drawn");
    }
    if (!/trace\?\.levels \? \(trace\.legs \|\| \[\]\) : \[\]/.test(fn)) {
      fail("the figures do not come from the levels check, so the drawing "
        + "and the sheet can disagree about them");
    }
    /* ── Every meter, not one per leg ──

       The leg's worst is what the leg has to pass on, and it was the
       only figure kept \u2014 so one meter in a leg carried a number and the
       rest carried nothing. On a drawing a MISSING figure reads as a
       good figure: two plots on one street, one labelled and one blank,
       and the blank looks better when it may be worse. Reported as "why
       is 41 worse than 39" when 39 had no figure at all. */
    if (!/l\?\.cutouts\?\.length/.test(fn)) {
      fail("only the leg's worst meter is labelled, so every other plot "
        + "shows nothing and a blank reads as a good figure");
    }
    /* A result from before every meter was kept still gives its one
       figure rather than none. */
    if (!/l\?\.service\?\.meterId != null && l\.atCutout/.test(fn)) {
      fail("an older levels result draws nothing at all");
    }
    /* A service with no cable spec has no figure, and drawing one would
       be inventing it. */
    if (!/if \(r\.missingSpec\)/.test(fn)) {
      fail("a service with no cable specified still gets a figure");
    }
    /* Where two legs serve one meter, the worse is the one that has to
       pass. */
    if (!/r\.pct > was\.pct/.test(fn)) {
      fail("a meter served by two legs keeps whichever was found first "
        + "rather than the worse figure");
    }
    /* And the tally, so an empty drawing is an answer rather than a
       question. */
    if (!/out\.why = \{ legs: legs\.length, noService, noSpec \}/.test(fn)) {
      fail("nothing counts the figures, so when none appear there is no way "
        + "to tell which of three things failed");
    }
  }
}

/* Drawn at the meter, behind the same switch as the other levels. */
{
  /* To the end of the block, not a fixed number of characters: the
     block grew when the figure was made draggable and a 1600-character
     window stopped short of the halo, reporting two things missing that
     were there. Fault 33, again. */
  const at = canvas.indexOf("if (isMeter && cutoutAtMeter.size");
  const ends = canvas.indexOf("if (isMeter && (circuitRings", at);
  const draw = at < 0 ? "" : canvas.slice(at, ends > at ? ends : at + 4000);
  if (!draw) fail("the cut-out figure is never drawn");
  else {
    /* ── The gate that actually controls it ──

       `labelShown` takes a FEATURE and asks whether that feature's
       label shows. Passing it the string "levels" asked about a feature
       that does not exist, and it answered no every time \u2014 so the
       figures were never drawn at all, on a build where everything else
       was right.

       The switch these belong to is `labelKinds.levels`, which is what
       the node levels beside them use. */
    if (/labelShown\("levels"\)/.test(draw)) {
      fail("the gate asks labelShown for a kind, which answers no every "
        + "time \u2014 nothing is drawn");
    }
    if (!/labelKinds\.levels !== false/.test(draw)) {
      fail("it cannot be turned off with the other level labels");
    }
    /* And nothing is drawn before the levels check has run. */
    if (!/cutoutAtMeter\.size/.test(draw)) {
      fail("it draws without figures to draw");
    }
    if (!/vs > 1\.2/.test(draw)) {
      fail("it draws at every zoom, so a whole estate is covered in "
        + "percentages when zoomed out");
    }
    /* Red past the limit, and only then: every figure in red is a
       drawing nobody reads. */
    if (!/co\.pct > lim \? "#b91c1c" : "#334155"/.test(draw)) {
      fail("the figure is not marked when it is over the limit, or is "
        + "marked when it is not");
    }
    /* The limit is the main's allowance plus the service's, which is
       what atCutout includes \u2014 judging it against the main's alone
       would fail every plot. */
    if (!/Max_Volt_Drop_Pct/.test(draw) || !/Max_Service_Volt_Drop_Pct/.test(draw)) {
      fail("the limit does not include the service allowance, so a figure "
        + "that includes the service is judged against the main's alone");
    }
    if (!/ctx\.strokeText\(text, tx, ty\)/.test(draw)) {
      fail("no halo, so the figure is unreadable over the plan beneath it");
    }
  }
}

/* ── It says which kind of figure it is, and it moves ──

   A percentage beside a meter and a percentage beside a stop looked
   identical apart from the impedance, and nothing said one includes a
   service and the other does not. Two numbers a few metres apart then
   read as disagreeing when they agree \u2014 the node figure plus the
   service IS the cut-out figure. Reported as "how can 58 be worse than
   59", which it was not.

   And it moves: on a terrace the meters sit a few metres apart and the
   figures land on the plan and on each other. */
{
  const at = canvas.indexOf("if (isMeter && cutoutAtMeter.size");
  const ends = canvas.indexOf("if (isMeter && (circuitRings", at);
  const draw = at < 0 ? "" : canvas.slice(at, ends);

  if (!/% cut-out`/.test(draw)) {
    fail("the figure does not say what kind it is, so it reads as a node "
      + "level that disagrees with the node beside it");
  }
  /* Its OWN offset. A meter can carry a name and a cut-out figure, and
     one offset would move the pair. */
  if (!/f\.Attributes\?\.Cutout_Offset/.test(draw)) {
    fail("the figure cannot be moved off the plan");
  }
  if (!/Cutout_Offset: moved/.test(canvas)) {
    fail("dragging the figure writes nothing");
  }
  if (!/lab\.kind === "cutout"/.test(canvas)) {
    fail("the drag does not know where the figure started, so it jumps on "
      + "the first movement");
  }
  if (!/kind: "cutout"/.test(draw)) {
    fail("the figure is not registered as something that can be picked up");
  }
  /* Moved clear, it still says which meter it belongs to. */
  if (!/ctx\.lineTo\(tx - 2, ty\)/.test(draw)) {
    fail("a figure dragged clear has no leader back to its meter");
  }
}

/* And the levels keep every meter's figure, not only the worst. */
{
  const at = canvas.indexOf("const each = [];");
  if (at < 0) fail("the levels keep only the worst meter on each leg");
  if (!/cutouts: each\.map\(\(r\) => \(\{/.test(canvas)) {
    fail("the per-meter figures are gathered and never returned");
  }
  /* ── At the plot's own tee, not the leg's end ──

     Every meter on a leg was given the leg's figure, which is measured
     at the leg's END. A plot teeing in thirty metres earlier was
     charged the whole leg, so the only thing separating two plots was
     the length of their services — and a plot UPSTREAM with a longer
     service came out worse than one downstream with a shorter one.
     Reported exactly that way, twice. */
  if (!/const foot = m\.foot;/.test(canvas)) {
    fail("a meter does not know which node on the main its service leaves "
      + "from, so every plot on a leg shares one figure");
  }
  if (!/targetIdx: foot, spanNodes: part\.spanNodes/.test(canvas)) {
    fail("the drop is not measured at the plot's own tee");
  }
  if (!/r\.mainPct != null \? r\.mainPct : \(Number\(leg\.vd\?\.pct\) \|\| 0\)/.test(canvas)) {
    fail("a plot whose tee is unknown gets no figure rather than the leg's, "
      + "which is the conservative answer");
  }
  /* The worst is still the leg's figure and still what the sheet
     reports \u2014 this adds to it rather than replacing it. */
  if (!/atCutout: service \? \{/.test(canvas)) {
    fail("the leg's own worst figure has gone, which is what the sheet "
      + "reports and what the limit is judged on");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Cut-out figures behave (one at every meter, its own service in it).");
process.exit(bad ? 1 : 0);
