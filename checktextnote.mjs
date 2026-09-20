/* A note written on the drawing.

   Free text somebody types onto the plan, moved and resized by hand,
   coloured, and given a leader that points at what it is about.

   The three things worth holding hardest, all of them faults that
   would be found on an issued drawing rather than on screen:

     1. ONE WRAP. The canvas, the sheet and the DXF all break a note
        into lines through textNotes.js. Three measurers wrapping the
        same note three ways is a note somebody sized against the wrong
        one.
     2. ONE PLACE TO WRITE IT. The note's words are its Label, and
        every pass that would ALSO write a point's Label has to skip
        it — or the note is drawn twice, once properly and once as an
        unwrapped line of label-sized text over the top.
     3. IT IS ANNOTATION. On the annotation layer, so hiding a utility
        — or printing to scale, which hides the trench deliberately —
        cannot take it with them. That is the fault 0215 was written
        to fix for the section marks. */
import { readFileSync } from "node:fs";
import {
  NOTE_ROLE, NOTE_DEFAULTS, NOTE_MIN_SIZE_M, NOTE_MAX_SIZE_M,
  NOTE_MIN_WIDTH_M, measureTextM, wrapNote, noteBox, noteHandles,
  insideNote, lineBaseline, widthFrom, scaleFrom, leaderFrom, leaderHead,
  defaultLeader,
} from "./src/features/gis/textNotes.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const near = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const editor = readFileSync("./src/features/gis/FeatureEditor.jsx", "utf8");
const print = readFileSync("./src/features/gis/printVector.js", "utf8");
const dxf = readFileSync("./src/features/gis/dxf.js", "utf8");

const noteOf = (text, attrs = {}, at = [10, 20]) => ({
  Feature_ID: 501,
  Feature_Type: "point",
  Feature_Role: NOTE_ROLE,
  Layer_Key: "annotation",
  Geometry: [at],
  Label: text,
  Attributes: { Text_Size_M: 1, Text_Width_M: 10, ...attrs },
});

// 1. The wrap: the writer's own line breaks are kept.
{
  const lines = wrapNote("First line\nSecond line", { widthM: 100, sizeM: 1 });
  if (lines.length !== 2) {
    fail("a return the writer typed is re-flowed away \u2014 somebody who "
      + "pressed return meant a new line");
  }

  /* And words wrap at the width. */
  const long = wrapNote("one two three four five six seven eight nine ten",
    { widthM: 6, sizeM: 1 });
  if (long.length < 2) fail("nothing wraps at the box width");
  for (const row of long) {
    if (measureTextM(row, 1) > 6 && row.split(" ").length > 1) {
      fail(`a wrapped line is wider than the box: "${row}"`);
    }
  }

  /* A single word longer than the box overhangs rather than breaking.
     "DRG/2026/114-A" split across two lines is a different reference,
     and a wrong reference on an issued drawing is worse than an untidy
     one. */
  const word = wrapNote("DRG/2026/114-A-REVISION-C", { widthM: 2, sizeM: 1 });
  if (word.length !== 1) {
    fail("a single long word is broken mid-word, which can change what it "
      + "says");
  }

  /* An empty note still occupies a line, or its box collapses to the
     padding and there is nothing on screen to click and type into. */
  if (wrapNote("", { widthM: 10, sizeM: 1 }).length !== 1) {
    fail("an empty note has no line at all, so there is nothing to grab");
  }
}

// 2. The box: width is the wrap plus padding, height follows the lines.
{
  const one = noteBox(noteOf("short"));
  const three = noteBox(noteOf("short\nshort\nshort"));

  if (!near(one.w, three.w)) {
    fail("the plate changes width as lines are added \u2014 the width is what "
      + "somebody set by dragging, not what the longest line happens to be");
  }
  if (!(three.h > one.h)) {
    fail("the plate does not grow with the text, so the words run out of "
      + "the bottom of it");
  }
  if (!near(one.w, one.widthM + one.padM * 2)) {
    fail("the plate is not the wrap width plus its padding");
  }

  /* The corner it is placed by does not move as it is typed into. */
  if (one.x !== three.x || one.y !== three.y) {
    fail("the note's top-left corner moves when a line is added \u2014 that is "
      + "the corner somebody aligned it by");
  }

  /* The first line sits a text height below the top of the plate, not a
     whole line height, or every note sits low in its own box by the
     leading. */
  if (!near(lineBaseline(one, 0), one.y + one.padM + one.sizeM)) {
    fail("the first line's baseline is not one text height below the "
      + "padding");
  }
  if (!near(lineBaseline(one, 1) - lineBaseline(one, 0), one.lineH)) {
    fail("the lines are not one line height apart");
  }
}

// 3. The two handles are two intentions.
{
  const box = noteBox(noteOf("a note that is long enough to wrap twice over"));
  const hs = noteHandles(box);

  if (!near(hs.width[0], box.x + box.w) || !near(hs.width[1], box.y + box.h / 2)) {
    fail("the wrap handle is not at the middle of the right edge");
  }
  if (!near(hs.scale[0], box.x + box.w) || !near(hs.scale[1], box.y + box.h)) {
    fail("the scale handle is not at the bottom-right corner");
  }

  /* Re-wrapping leaves the letters the size they were. That is the
     whole difference between the two handles: one changes the shape of
     the note, the other changes how big it reads. */
  const wider = widthFrom(box, [box.x + 30, box.y]);
  const rewrapped = noteBox(noteOf("a note that is long enough to wrap twice over",
    { Text_Size_M: box.sizeM, Text_Width_M: wider }));
  if (rewrapped.sizeM !== box.sizeM) {
    fail("re-wrapping a note changes its text size");
  }
  if (!(wider > box.widthM)) fail("dragging the edge out does not widen the note");

  /* Scaling changes both, in proportion, so a note made bigger is the
     same note bigger rather than the same note re-flowed. */
  const s = scaleFrom(box, [box.x + box.w * 2, box.y + box.h * 2]);
  const ratio = s.widthM / s.sizeM;
  if (!near(ratio, box.widthM / box.sizeM, 0.05)) {
    fail("scaling does not keep the note's proportions, so it re-flows as "
      + "it grows");
  }
  if (!(s.sizeM > box.sizeM)) fail("dragging the corner out does not enlarge");

  /* Both are scaled about the top-left corner, which is the one that
     does not move. */
  const back = scaleFrom(box, [box.x + box.w, box.y + box.h]);
  if (!near(back.sizeM, box.sizeM, 0.02)) {
    fail("a drag back to where it started does not leave the note the size "
      + "it was \u2014 each frame must work from the start, not from the last");
  }

  /* And neither can be dragged to a size nobody meant. */
  if (scaleFrom(box, [box.x - 500, box.y - 500]).sizeM < NOTE_MIN_SIZE_M) {
    fail("a note can be dragged smaller than it can be seen at any scale");
  }
  if (scaleFrom(box, [box.x + 1e6, box.y + 1e6]).sizeM > NOTE_MAX_SIZE_M) {
    fail("a note can be dragged bigger than the site");
  }
  if (widthFrom(box, [box.x - 100, box.y]) < NOTE_MIN_WIDTH_M) {
    fail("a note can be dragged narrower than one word");
  }
}

// 4. The leader leaves the edge, not the middle.
{
  const box = noteBox(noteOf("mind the culvert"));
  const target = [box.x + box.w + 40, box.y + box.h / 2];
  const from = leaderFrom(box, target);

  if (!near(from[0], box.x + box.w)) {
    fail("the leader starts inside the note rather than at its edge, so it "
      + "is drawn across the words it introduces");
  }
  if (!insideNote(box, from, 0.001)) {
    fail("the leader does not start on the plate at all");
  }

  /* Above, below and behind it too \u2014 a note is annotated from
     whichever side the thing it is about happens to be on. */
  for (const t of [[box.x + box.w / 2, box.y - 50],
    [box.x + box.w / 2, box.y + box.h + 50], [box.x - 50, box.y + box.h / 2]]) {
    const q = leaderFrom(box, t);
    if (!insideNote(box, q, 0.001)) fail("a leader leaves the note off the plate");
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    if (near(q[0], cx) && near(q[1], cy)) {
      fail("a leader starts at the note's centre, under its own text");
    }
  }

  /* A target on top of the note gives the centre back, and the
     renderers draw nothing: a leader from a note to itself points at
     nothing. */
  const inside = leaderFrom(box, [box.x + 1, box.y + 1]);
  if (!near(inside[0], box.x + box.w / 2) || !near(inside[1], box.y + box.h / 2)) {
    fail("a leader aimed inside the note is not collapsed to its centre");
  }

  /* The head is at the pointing end, and sized from the text \u2014 a note
     set large is read from further away and its arrow has to be seen
     from there too. */
  const head = leaderHead(from, target, box.sizeM);
  if (!head || head.length !== 3) fail("the leader has no arrowhead");
  else if (!near(head[0][0], target[0]) || !near(head[0][1], target[1])) {
    fail("the arrowhead is not at the end that does the pointing");
  }
  const bigger = leaderHead(from, target, box.sizeM * 4);
  const span = (h) => Math.hypot(h[1][0] - h[2][0], h[1][1] - h[2][1]);
  if (!(span(bigger) > span(head))) {
    fail("the arrowhead does not grow with the text");
  }

  /* A leader asked for appears clear of the note, where it can be seen
     and taken hold of. One that started under the plate would look
     like one that had not been created. */
  if (insideNote(box, defaultLeader(box))) {
    fail("a new leader starts underneath the note it belongs to");
  }
}

// 5. A note is caught by its plate, not by the corner it is stored at.
{
  const box = noteBox(noteOf("a note somebody wants to click on"));
  const middle = [box.x + box.w / 2, box.y + box.h / 2];
  if (!insideNote(box, middle)) fail("clicking the middle of a note misses it");
  if (insideNote(box, [box.x + box.w + 5, box.y])) {
    fail("a click well clear of the note catches it");
  }

  if (!/if \(f\.Feature_Role === NOTE_ROLE\) \{\s*\n\s*if \(insideNote\(noteBox\(f\)/
    .test(canvas)) {
    fail("the canvas hit test does not use the note's box, so a note can "
      + "only be picked up within ten pixels of its top-left corner");
  }
}

// 6. The note is drawn once, in its own pass.
{
  if (!/for \(const f of visible\) \{\s*\n\s*if \(f\.Feature_Role !== NOTE_ROLE\) continue;/
    .test(canvas)) {
    fail("the canvas has no pass of its own for notes, so a note is covered "
      + "by whatever is drawn after it");
  }
  if (!/if \(f\.Feature_Role === NOTE_ROLE\) return;/.test(canvas)) {
    fail("the feature loop still draws notes, so each one is drawn twice \u2014 "
      + "as a dot, and as its own text at label size");
  }

  /* Its Label is the note. Every pass that writes a point's Label has
     to leave it alone. */
  const printSkips = /if \(role === NOTE_ROLE\) continue;/.test(print);
  if (!printSkips) {
    fail("the sheet's label pass writes the note a second time, unwrapped "
      + "and at label size, over the top of the real one");
  }
  if (!/f\.Feature_Role === NOTE_ROLE \? ""/.test(dxf)) {
    fail("the DXF label pass writes the note a second time");
  }
}

// 7. Placed as annotation, and nowhere else.
{
  const at = canvas.indexOf("if (role === NOTE_ROLE) {");
  if (at < 0) fail("nothing places a note");
  else {
    /* To the end of this branch and no further. Taking a fixed slice
       ran into the section mark's branch below it and reported the
       note as snapping, which is the check accusing the wrong code. */
    const ends = canvas.indexOf('if (role === "sectionmark")', at);
    const block = canvas.slice(at, ends > at ? ends : at + 1600);
    if (!/Layer_Key: "annotation"/.test(block)) {
      fail("a note is not placed on the annotation layer \u2014 on a utility "
        + "layer it disappears whenever that utility is hidden, and Print "
        + "to Scale hides the trench deliberately");
    }
    if (!/Feature_Type: "point"/.test(block)) fail("a note is not a point");
    if (!/Label:/.test(block)) {
      fail("a note is placed with no words at all, so it is an invisible "
        + "plate somebody has to find again");
    }
    /* No snap. Every other hand-placed thing belongs ON something and
       refuses a click in open ground; a note is the opposite, and the
       leader is what says what it is about. */
    if (/snapForSection|snapToMain|resolve\(/.test(block)) {
      fail("placing a note snaps it onto something \u2014 a note goes in the "
        + "space beside the work, which is where there is room to read it");
    }
  }

  /* And it cannot be moved off that layer afterwards. */
  if (!/!isMsdb && !isNote/.test(editor)) {
    fail("the editor still offers a note a Layer dropdown, which is an "
      + "offer to re-make the fault 0215 fixed");
  }

  /* ── On Tools & Reporting, not on a utility's menu ──

     A note belongs to no utility, so it was given a menu of its own
     called Annotation. That menu held one item, which is a menu
     somebody opens to find out there is nothing else in it, and it
     was moved. What matters is unchanged: not under Electric, Gas,
     Water or Street Lighting, because a note on a gas drawing should
     not be asked for from the electric menu.

     The LAYER is still `annotation` and that is the part that must
     not drift — it is what keeps a note visible when a utility is
     hidden, and what Print to Scale relies on. */
  if (!/placeNode\(NOTE_ROLE, "annotation"\)/.test(canvas)) {
    fail("nothing arms a note placement");
  }
  const menuAt = canvas.indexOf('label="Place Text Note"');
  if (menuAt < 0) fail("the note cannot be placed from any menu");
  else {
    const toolsAt = canvas.indexOf('<Menu id="tools"');
    if (!(menuAt > toolsAt)) {
      const before = canvas.slice(0, menuAt);
      const inUtility = ["electric", "gas", "water", "lighting"]
        .filter((u) => before.lastIndexOf(`<Menu id="${u}"`)
          > before.lastIndexOf("</Menu>"));
      fail(`the note is placed from the ${inUtility[0] ?? "wrong"} menu \u2014 it `
        + "belongs to no utility, and a note on a gas drawing should not be "
        + "asked for from another trade's menu");
    }
  }
}

// 8. Resized, re-wrapped and aimed, and each one saved.
{
  for (const mode of ["notewidth", "notescale", "noteleader"]) {
    if (!canvas.includes(`"${mode}"`)) fail(`nothing arms the ${mode} drag`);
  }

  const up = canvas.indexOf('if (d?.mode === "notewidth"');
  if (up < 0) fail("a resized note is never saved, so it springs back on reload");
  else {
    const block = canvas.slice(up, up + 1600);
    if (!/if \(!d\.moved\) return;/.test(block)) {
      fail("touching a handle writes a row to the database, so reading a "
        + "note costs a save");
    }
    if (!/updateFeature\(/.test(block) || !/recordAction\(/.test(block)) {
      fail("a resize is not saved, or is saved with nothing for undo to "
        + "put back");
    }
    if (!/startAttrs/.test(block)) {
      fail("a failed save leaves the new size on screen, so the note "
        + "changes size on the next reload for no visible reason");
    }
  }

  /* Each frame works from the start rather than from the last one, or a
     drag back to where it began leaves the note a different size. */
  const move = canvas.indexOf('if (d.mode === "notewidth" || d.mode === "notescale")');
  if (move < 0) fail("the note drags do nothing as the pointer moves");
  else if (!/widthFrom\(d\.startBox|scaleFrom\(d\.startBox/.test(canvas.slice(move, move + 900))) {
    fail("a note drag nudges what it finds rather than working from the "
      + "box as it was when the drag began");
  }

  /* The leader is not snapped. It points at gaps, corners and ground
     with nothing drawn on it, and a point that jumped to the nearest
     cable would be the drawing deciding what the note meant. */
  const leadAt = canvas.indexOf('if (d.mode === "noteleader")');
  if (leadAt > 0 && /resolve\(raw\[0\]/.test(canvas.slice(leadAt, leadAt + 600))) {
    fail("the leader snaps to the network, so it cannot point at a gap");
  }
}

// 9. The editor writes all five things, and in the units they mean.
{
  for (const [re, what] of [
    [/id="fe-note-text"/, "the note's words"],
    [/id="fe-note-size"/, "the text size"],
    [/id="fe-note-width"/, "the wrap width"],
    [/id="fe-note-fill"/, "the fill colour"],
    [/id="fe-note-ink"/, "the text colour"],
    [/Leader_At/, "the leader"],
  ]) {
    if (!re.test(editor)) fail(`the editor cannot set ${what}`);
  }

  /* A textarea, not an input. A note is prose, and in a one-line box
     the beginning scrolls out of sight while the end is typed. */
  if (!/<textarea id="fe-note-text"/.test(editor)) {
    fail("the note is written in a one-line box");
  }

  /* ── And the panel offers nothing that has no meaning on a note ──

     The shared Notes box is somewhere to say something about a feature
     that its fields do not cover. On a note the words ARE the feature,
     so a Notes field on a Note is a second place to write — and the
     one place that never reaches the drawing, since the canvas, the
     sheet and the DXF all draw the Label. Reported from use. The
     Label box and the Layer dropdown are suppressed for the same
     reason, each covered above. */
  if (!/\{!isNote && \(\s*\n\s*<div className="fld">\s*\n\s*<label htmlFor="fe-notes">/
    .test(editor)) {
    fail("the note panel still carries the shared Notes box, which is a "
      + "second place to write on a thing whose whole purpose is being "
      + "written on \u2014 and nothing typed there ever appears on the drawing");
  }

  /* Off is null and not white. They look identical on screen and print
     as two different things \u2014 one hides what is under it, the other
     does not. */
  if (!/Note_Fill: e\.target\.checked \? null :/.test(editor)) {
    fail("turning the fill off sets it to a colour, so the plate still "
      + "prints over what is beneath it");
  }
}

// 10. It prints, and at the size it was set to.
{
  const at = print.indexOf("if (role === NOTE_ROLE) {");
  if (at < 0) {
    fail("a note does not print at all \u2014 a drawing is annotated in order "
      + "to be issued");
  } else {
    const block = print.slice(at, at + 2600);
    if (!/noteBox\(f\)/.test(block) || !/lineBaseline\(box, i\)/.test(block)) {
      fail("the sheet lays a note out its own way rather than through "
        + "textNotes.js, so it wraps differently from the screen");
    }
    if (!/box\.sizeM \* k \* 2\.83465/.test(block)) {
      fail("the note does not print at its own size, so the metres somebody "
        + "set mean nothing on paper");
    }
    if (!/leaderFrom\(box, box\.leaderAt\)/.test(block)) {
      fail("the leader is not printed, or leaves the note somewhere other "
        + "than where the screen draws it");
    }
  }

  /* And into CAD as text rather than as a node. */
  const dat = dxf.indexOf("} else if (f.Feature_Role === NOTE_ROLE) {");
  if (dat < 0) fail("a note goes into the DXF as a bare POINT");
  else {
    const block = dxf.slice(dat, dat + 2600);
    if (!/pair\(40, num\(box\.sizeM\)\)/.test(block)) {
      fail("the DXF writes the note at the standard half-metre label height "
        + "rather than at the height somebody set");
    }
    if (/pair\(0, "POINT"\)/.test(block)) {
      fail("the DXF still marks the note's corner with a node a CAD user "
        + "has to find and delete");
    }
    if (!/mapped\?\.textLayer/.test(block)) {
      fail("the note is not on the text layer, so freezing the annotation "
        + "leaves this one piece of writing behind");
    }
  }
}

// 11. The role is in the constraint, with every role that came before.
{
  let sql = "";
  try {
    sql = readFileSync("./supabase/migrations/0228_text_note.sql", "utf8");
  } catch { /* reported below */ }

  if (!sql) {
    fail("0228 is missing, so nothing has told the database the role "
      + "exists \u2014 every note insert is rejected");
  } else {
    if (!/'textnote'/.test(sql)) fail("0228 does not add the role");
    /* A CHECK is replaced wholesale, so a list missing an older role
       silently revokes it. 0213 and 0214 each record nearly making
       this mistake. */
    for (const role of ["sectionmark", "washout", "openpoint", "hdcutout",
      "msdb", "reducer", "feederpoint", "spannode", "plot", "meter"]) {
      if (!new RegExp(`'${role}'`).test(sql)) {
        fail(`0228 rewrites the role constraint without '${role}', which `
          + "revokes it");
      }
    }
    if (!/"GIS_Style"/.test(sql)) {
      fail("0228 seeds no style row, so a drawing full of notes cannot be "
        + "turned off at a zoom");
    }
  }
}

// 12. The defaults are written down once.
{
  if (NOTE_DEFAULTS.sizeM <= 0 || NOTE_DEFAULTS.widthM <= 0) {
    fail("the defaults are not a usable note");
  }
  /* The canvas reads them rather than repeating them: a second copy of
     the starting size is how a note placed from the menu comes to be a
     different size from one the editor resets. */
  if (!/Text_Size_M: NOTE_DEFAULTS\.sizeM/.test(canvas)) {
    fail("the canvas writes its own default size rather than the module's");
  }
  if (!/NOTE_DEFAULTS/.test(editor)) {
    fail("the editor writes its own defaults rather than the module's");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Notes wrap one way, sit on the annotation layer, and print as set.");
process.exit(bad ? 1 : 0);
