/* Print to Scale sets the drawing up for issue before it opens.

   A sheet for issue is not the drawing somebody designs in. The dig,
   the plot seeds, the span nodes and the feeder end points are working
   information; on paper they crowd the pipes and cables a reader is
   trying to follow. The mains and service labels are the opposite — a
   plan whose runs are not named is a plan nobody can work from.

   Held here because the keys are easy to get subtly wrong: the hidden
   set takes four shapes of key (a layer, `lt:` a line type, `role:` a
   role, and `layer:role:` for one utility's own), and a key in the
   wrong shape hides nothing at all while looking entirely plausible in
   the source. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");

/* The keys the set-up switches off, as the source states them. */
const listed = (() => {
  const m = /const PRINT_OFF_KEYS = \[([\s\S]*?)\];/.exec(canvas);
  if (!m) return null;
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
})();

// 1. Everything asked for is switched off, in a key shape that works.
{
  if (!listed) {
    fail("the set-up lists no layers to switch off");
  } else {
    /* The dig, both mains and service. The `trench` LAYER covers both:
       a mains trench and a service trench are two line types on it, so
       naming the layer is what catches them together. */
    if (!listed.includes("trench")) {
      fail("the trench is not switched off \u2014 and it must be the layer "
        + "key, which catches mains and service trench together");
    }
    for (const [what, key] of [
      ["plot seeds", "role:plot"],
      ["span nodes", "role:spannode"],
      ["feeder end points", "role:feederpoint"],
    ]) {
      if (!listed.includes(key)) {
        fail(`${what} are not switched off for a sheet (expected ${key})`);
      }
    }

    /* Every key has to be one the hidden set can match. `classKeys`
       builds a feature's keys as the bare layer, `lt:`, `role:` and
       `layer:role:` — anything else hides nothing while looking
       perfectly reasonable in the source. */
    for (const k of listed) {
      const ok = /^(lt:|role:)[a-z_]+$/.test(k)
        || /^[a-z]+:role:[a-z_]+$/.test(k)
        || /^[a-z]+$/.test(k);
      if (!ok) fail(`${k} is not a shape of key the hidden set matches`);
    }
  }
}

// 2. The labels are switched on — including the master switch, without
//    which the per-kind ones say nothing.
{
  const fn = (() => {
    const at = canvas.indexOf("function openPrintToScale()");
    return at >= 0 ? canvas.slice(at, canvas.indexOf("\n  }", at)) : "";
  })();
  if (!fn) {
    fail("the print set-up cannot be found where it was \u2014 this check "
      + "needs re-anchoring, not deleting");
  } else {
    /* ── On for a sheet, unless somebody said otherwise ──

       This asserted the two calls literally. They are gone: a
       switch somebody has SET is now left as they set it, because
       forcing service labels back on gave no way to issue a sheet
       without them. Reported from use.

       So the case tests the intent it always meant — both kinds are
       named, and both are still turned on where nobody has decided
       — rather than the two lines that used to do it. */
    for (const kind of ["mains", "services"]) {
      if (!new RegExp(`"${kind}"`).test(fn)) {
        fail(`${kind} labels are not considered when setting up a sheet`);
      }
    }
    if (!/setLabelKinds\(/.test(fn)) {
      fail("nothing switches the labels on for a sheet, so a drawing issues "
        + "with anonymous cables");
    }
    if (!/labelKindSet\.current\.has\(k\)/.test(fn)) {
      fail("the labels are switched on whether or not somebody has already "
        + "decided about them, so a sheet cannot be issued without them");
    }
    if (!/setShowLabels\(true\)/.test(fn)) {
      fail("the master Labels switch is left alone, so turning the two "
        + "kinds on changes nothing when it is off");
    }
    /* Added to what is already hidden, not replacing it: somebody who
       has isolated a circuit or hidden another utility is telling the
       drawing something, and a print should not undo it. */
    if (!/\[\.\.\.was, \.\.\.added\]/.test(fn)) {
      fail("the set-up replaces the hidden set rather than adding to it, "
        + "so it un-hides whatever somebody had already switched off");
    }
    if (!/setPrintOpen\(true\)/.test(fn)) {
      fail("the set-up never opens the print dialogue");
    }
  }
}

// 3. Wired to every button that starts a print, so a sheet is the same
//    sheet wherever it was started from.
{
  const opens = (canvas.match(/onClick=\{openPrintToScale\}/g) || []).length;
  const raw = (canvas.match(/onClick=\{\(\) => setPrintOpen\(true\)\}/g) || []).length;
  if (opens < 2) {
    fail("Print to Scale is not offered from the utility menus, where the "
      + "work is done");
  }
  if (raw > 0) {
    fail("a Print to Scale button still opens the dialogue raw, so a sheet "
      + "started from it is set up differently from one started elsewhere");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Print to Scale sets the drawing up for issue, then opens.");
process.exit(bad ? 1 : 0);
