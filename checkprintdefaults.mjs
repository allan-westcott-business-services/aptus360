/* What Print to Scale is allowed to change.

   Opening it sets the drawing up for issue: trench, plot seeds, span
   nodes and feeder end points off, mains and service labels on. Both
   label switches default to OFF, and a sheet issued with anonymous
   cables is the fault the print's label pass was written to fix, so
   turning them on is a sensible default.

   It was not a default, though. It was insistence: somebody who
   switched service labels off and pressed Print to Scale got them
   back, every time, with no way to issue a sheet without them.
   Reported from use.

   ── A default is where to start, not what to insist on ──

   So a switch NOBODY HAS TOUCHED takes the issue default, and a
   switch somebody has SET keeps what they set — whichever way they
   set it. The two cases have to be told apart, because "off" means
   different things when it is the factory setting and when it is a
   decision.

   The trap on the other side is just as easy: if turning a switch on
   for issue counts as touching it, the first Print to Scale marks
   both and every later one leaves them alone — the same bug pointing
   the other way. */
import { readFileSync } from "node:fs";
import { LABEL_KINDS, DEFAULT_LABEL_KINDS } from "./src/features/gis/labelKinds.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

// 1. The premise: both label kinds are off out of the box.
{
  for (const k of ["mains", "services"]) {
    if (!LABEL_KINDS.some((x) => x.key === k)) fail(`there is no ${k} switch`);
    if (DEFAULT_LABEL_KINDS[k] !== false) {
      fail(`${k} labels are on by default now, so Print to Scale has nothing `
        + "to turn on and this whole case is about a problem that has moved");
    }
  }
}

// 2. A switch somebody set is left alone.
{
  const at = canvas.indexOf("function openPrintToScale");
  const ends = canvas.indexOf("\n  }", canvas.indexOf("setPrintOpen(true)", at));
  const body = at < 0 ? "" : canvas.slice(at, ends > at ? ends : at + 3000);
  if (!body) fail("openPrintToScale has gone");
  else {
    if (!/labelKindSet\.current\.has\(k\)/.test(body)) {
      fail("Print to Scale turns the label switches on without asking whether "
        + "somebody has already decided about them \u2014 so a sheet cannot be "
        + "issued without service labels");
    }
    /* Not through setLabelKind, which records a decision. Using it
       here would make the first Print to Scale look like a choice by
       the operator and every later one would skip the default. */
    if (/setLabelKind\("mains", true\)|setLabelKind\("services", true\)/.test(body)) {
      fail("Print to Scale sets the switches through setLabelKind, which "
        + "records them as decided \u2014 after one print the issue default never "
        + "applies again");
    }
    if (!/labelKindSet\.current\.has\("__master"\)/.test(body)) {
      fail("the master Labels switch is forced on even when somebody has "
        + "turned it off");
    }
  }
}

// 3. Setting one by hand records it.
{
  if (!/labelKindSet\.current\.add\(key\)/.test(canvas)) {
    fail("nothing records that a label switch was set by hand, so every "
      + "switch looks untouched and Print to Scale overrides all of them");
  }
  if (!/const setLabelsShown = useCallback/.test(canvas)) {
    fail("the master switch is not recorded when it is set by hand");
  }
  /* Every menu offers the same setter, or the one that does not is a
     switch Print to Scale will quietly override. */
  const raw = (canvas.match(/onShowLabels=\{setShowLabels\}/g) || []).length;
  if (raw > 0) {
    fail(`${raw} menu(s) still set the master switch directly, so turning it `
      + "off there is not recorded as a decision");
  }
  const wired = (canvas.match(/onShowLabels=\{setLabelsShown\}/g) || []).length;
  if (wired < 4) {
    fail(`only ${wired} menus route the master switch through the recorder`);
  }
}

// 4. The app's own use of the switch is not a decision by anybody.
{
  /* The call-off flow turns labels off while plots are being picked
     and back on afterwards. That is the app managing a view, not
     somebody choosing, and marking it would make Print to Scale stop
     labelling sheets for anyone who had ever raised a call-off. */
  const off = canvas.indexOf("setShowLabels(false)");
  if (off < 0) {
    fail("the call-off flow no longer quiets the labels, so this case has "
      + "stopped testing the difference between the app and a person");
  }
}

// 5. What it says it did matches what it did.
{
  const at = canvas.indexOf("Set up for issue");
  const line = at < 0 ? "" : canvas.slice(at, at + 400);
  if (!line) fail("Print to Scale no longer says what it changed");
  else if (!/wanted\.length \?/.test(line)) {
    fail("the message claims it turned the labels on whether it did or not \u2014 "
      + "which reads as the drawing lying about itself to somebody who has "
      + "just turned them off");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Print to Scale defaults what nobody set, and keeps what somebody did.");
process.exit(bad ? 1 : 0);
