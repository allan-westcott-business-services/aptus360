/* Raising a call-off: two ways, and neither with a step in it that
   asks nothing.

   The list's New call-off button used to pick a project and land
   somebody on that project's Call-offs tab, where their next act was
   always to press New call-off again. A step that can only be taken one
   way is not a decision.

   And there are two jobs behind one button. A call-off somebody can
   describe — plots, dates, a work type — is a form. One they have to
   point at, where the answer is which runs between which span nodes, is
   only legible on a drawing. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
const tab = readFileSync("./src/features/calloffs/CallOffsTab.jsx", "utf8");
const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
const intent = readFileSync("./src/lib/projectIntent.js", "utf8");

// 1. The way is chosen before the project.
//
//    The choice does not depend on the project, and asking afterwards
//    would mean going back.
{
  if (!/setPicking\("how"\)/.test(page)) {
    fail("New call-off does not ask how it should be raised");
  }
  if (!/picking === "how"/.test(page)) fail("there is no choice step");
  for (const route of ["editor", "canvas"]) {
    if (!new RegExp(`setPicking\\("${route}"\\)`).test(page)) {
      fail(`there is no ${route} route`);
    }
  }
  /* Both routes then pick a project — the same picker, not two. */
  if (!/picking === "editor" \|\| picking === "canvas"/.test(page)) {
    fail("the project picker is not shared by both routes");
  }
  /* Each option says what it is for. Two labels alone would not tell
     somebody meeting them for the first time which is which. */
  const how = page.slice(page.indexOf('picking === "how"'));
  const block = how.slice(0, how.indexOf("</div>\n        </div>"));
  if ((block.match(/co-how-opt/g) || []).length < 2) {
    fail("the two routes are not offered as described options");
  }
}

// 2. The editor route opens the editor, not the tab it lives on.
{
  if (!/openProject\(project, "calloffs", \{ newCallOff: true \}\)/.test(page)) {
    fail("picking a project does not ask for the editor");
  }
  /* The intent carries it. */
  if (!/opts = \{\}/.test(intent) || !/\.\.\.opts/.test(intent)) {
    fail("the project intent cannot carry what to do on arrival");
  }
  /* And the tab acts on it. */
  if (!/saved\?\.newCallOff/.test(tab)) {
    fail("the call-offs tab ignores the request to open the editor");
  }
  if (!/openForm\(\)/.test(tab)) fail("nothing opens the form on arrival");

  /* Consumed once. Left set, coming back to this tab later would reopen
     a form nobody asked for. */
  if (!/newCallOff: false/.test(tab)) {
    fail("the request is not cleared, so the form reopens on every visit");
  }
  /* Waits for the work types: openForm reads workTypes[0] for its
     default, and an empty list opens a form with no work type in it. */
  /* Scoped to the guard itself, not to everything after it: the tab
     mentions workTypes.length elsewhere, so a search from that point on
     passed while the guard had lost it. */
  const guardAt = tab.indexOf("if (!wanted.current");
  const guard = guardAt < 0 ? "" : tab.slice(guardAt, tab.indexOf("\n", guardAt));
  if (!/workTypes\.length/.test(guard)) {
    fail("the form can open before the work types have loaded");
  }
}

// 3. The canvas route opens the drawing with only the call-off live.
{
  if (!/openGis\(\{ project, callOffOnly: true \}\)/.test(page)) {
    fail("the canvas route does not ask for a call-off-only drawing");
  }
  if (!/intent\.callOffOnly/.test(canvas)) {
    fail("the canvas ignores the request");
  }
  /* The project may arrive as a row rather than an id — the call-offs
     page has the row and nothing else. */
  if (!/intent\.project\?\.Project_ID/.test(canvas)) {
    fail("the canvas cannot read a project sent as a row");
  }
  /* And the panel that was asked for is the one on screen. */
  if (!/callOffOnly && projectId\) setCallOffOpen\(true\)/.test(canvas)) {
    fail("the call-off panel is not opened on arrival");
  }
}

// 4. Only Tools & Reporting, and only the call-off within it.
{
  /* Every other menu is behind the flag. Hidden rather than disabled:
     eight greyed menus say "you cannot do any of this" over and over,
     while their absence says the page is doing one job. */
  const bar = canvas.slice(canvas.indexOf("<MenuBar>"));
  if (!/\{!callOffOnly && \(/.test(bar.slice(0, 2000))) {
    fail("the other menus are shown while raising a call-off");
  }

  /* The tools menu itself is not behind the flag — it is the one that
     stays. */
  const toolsAt = canvas.indexOf('<Menu id="tools"');
  const before = canvas.slice(Math.max(0, toolsAt - 400), toolsAt);
  if (/\{!callOffOnly && \(\s*<>\s*$/.test(before)) {
    fail("the tools menu is hidden too, leaving nothing at all");
  }

  /* Inside it, the call-off is live and the rest is not. */
  const tools = canvas.slice(toolsAt, canvas.indexOf("</Menu>", toolsAt));
  const callOffAt = tools.indexOf('label="New Mains Call-off"');
  if (callOffAt < 0) fail("the call-off item is gone from the tools menu");
  else {
    const item = tools.slice(callOffAt, tools.indexOf("/>", callOffAt));
    if (/callOffOnly/.test(item)) {
      fail("the one item somebody was sent here for is itself gated");
    }
  }
  if ((tools.match(/!callOffOnly/g) || []).length < 2) {
    fail("the rest of the tools menu is left live");
  }
}

// 5. There is a way out, and nothing was locked.
//
//    A canvas with no menus looks broken to somebody who does not know
//    why, and whoever chose this route ten seconds ago may have changed
//    their mind.
{
  if (!/setCallOffOnly\(false\)/.test(canvas)) {
    fail("there is no way back to the whole drawing");
  }
  if (!/Show everything/.test(canvas)) {
    fail("the way back is not offered in words");
  }
  if (!/drawing tools are off/.test(canvas)) {
    fail("nothing says why the drawing tools are missing");
  }
  /* State, not a saved preference: it belongs to how this visit
     started and goes when the page is left. */
  if (/remember\("callOffOnly"|recall\("callOffOnly"/.test(canvas)) {
    fail("the restriction is remembered beyond this visit");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Raising a call-off behaves (two routes, no step that asks nothing).");
process.exit(bad ? 1 : 0);
