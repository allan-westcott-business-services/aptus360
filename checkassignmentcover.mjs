/* How much of a call-off is booked, phase by phase.

   A call-off with a team against it looks dealt with, and may be a
   morning booked against a day's dig, or one span of four. Nothing on
   the list said so, so it had to be opened to find out — and a thing you
   open to check is a thing that gets missed.

   Two ways to fall short. A span with no assignment is obvious once
   looked for; time is the one that hides, because a day's excavation
   booked as a morning reads as assigned everywhere until the gang runs
   out of day. */
import { readFileSync } from "node:fs";
import {
  phaseCover, halvesBooked, isListedPhase, COVER_LABEL,
} from "./src/features/calloffs/assignmentCover.js";
import {
  callOffCustomer, metresByDeveloper, leadDeveloper,
} from "./src/features/gis/callOffCustomer.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const span = (id, halves) => ({ Span_ID: id, Estimated_Half_Days: halves });
const asg = (id, spanId) => ({ Assignment_ID: id, Span_ID: spanId });
const day = (id, part) => ({ Assignment_ID: id, Part: part });

// 1. Nothing booked is unassigned.
{
  if (phaseCover([span(1, 2)], [], []) !== "unassigned") {
    fail("a phase with no assignments is not unassigned");
  }
  /* Even with days lying around from another phase. */
  if (phaseCover([span(1, 2)], [], [day(9, "Full")]) !== "unassigned") {
    fail("days belonging to another phase count as an assignment");
  }
}

// 2. Time is the failure that hides.
//
//    The case that raised this: one span, one team, a day's work booked
//    as a morning. It read as assigned on every screen.
{
  if (phaseCover([span(1, 2)], [asg(9, 1)], [day(9, "AM")]) !== "part") {
    fail("half a day booked against a day's work reads as assigned");
  }
  if (phaseCover([span(1, 2)], [asg(9, 1)], [day(9, "Full")]) !== "assigned") {
    fail("a full day booked against a day's work is not assigned");
  }
  /* More than the estimate is still assigned — the estimate is a
     planning figure, not a quota. */
  if (phaseCover([span(1, 2)], [asg(9, 1)],
    [day(9, "Full"), day(9, "Full")]) !== "assigned") {
    fail("booking more than the estimate is not counted as assigned");
  }
}

// 3. A span with nothing against it is part assigned.
{
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, 1)], [day(9, "Full")]) !== "part") {
    fail("one span of two booked reads as assigned");
  }
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, 1), asg(8, 2)],
    [day(9, "Full"), day(8, "Full")]) !== "assigned") {
    fail("both spans booked with enough time is not assigned");
  }
}

// 4. An assignment with no span covers them all.
//
//    That is what "all spans" means on the assignment editor, and it is
//    the ordinary case on a call-off with one section.
{
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, null)],
    [day(9, "Full"), day(9, "Full")]) !== "assigned") {
    fail("an all-spans booking with enough time is not assigned");
  }
  /* And is still judged on its time. */
  if (phaseCover([span(1, 2), span(2, 2)], [asg(9, null)],
    [day(9, "Full")]) !== "part") {
    fail("an all-spans booking short of the estimate reads as assigned");
  }
}

// 5. Two teams on one span have booked it between them.
//
//    Asking each to meet the whole estimate would call a fully booked
//    job short — which is the split the assignment panel exists to
//    allow.
{
  if (phaseCover([span(1, 4)], [asg(9, 1), asg(8, 1)],
    [day(9, "Full"), day(8, "Full")]) !== "assigned") {
    fail("two teams splitting a span between them reads as short");
  }
}

// 6. No estimate means coverage is the whole test.
//
//    Only excavation and lay is estimated. Reinstatement has no figure,
//    and a call-off raised before 0159 has none at all — marking those
//    "part assigned" would be a warning nobody could act on.
{
  if (phaseCover([span(1, null)], [asg(9, 1)], [day(9, "AM")]) !== "assigned") {
    fail("a phase with no estimate is judged against one anyway");
  }
  if (phaseCover([span(1, 0)], [asg(9, 1)], []) !== "assigned") {
    fail("a zero estimate is treated as work outstanding");
  }
  /* A phase estimated at nothing and booked at nothing is assigned by
     arithmetic alone — 0 >= 0 — so the early return above it is for the
     reader rather than the result. Worth having, and worth knowing it
     is not what makes this pass. */
  /* But coverage still applies. */
  if (phaseCover([span(1, null), span(2, null)], [asg(9, 1)], []) !== "part") {
    fail("an unestimated phase ignores a span nobody is booked for");
  }
}

// 7. Half-days are counted the way the rest of the app counts them.
{
  if (halvesBooked([day(1, "Full")]) !== 2) fail("a full day is not two halves");
  if (halvesBooked([day(1, "AM")]) !== 1) fail("a morning is not one half");
  if (halvesBooked([day(1, "AM"), day(1, "PM")]) !== 2) {
    fail("two halves of a day do not come to a full day");
  }
  /* A row with no part is a full day, which is what the editor writes
     when nobody splits it. */
  if (halvesBooked([{ Assignment_ID: 1 }]) !== 2) {
    fail("a day with no part recorded is not counted as a full one");
  }
}

// 8. Only the phases worth a pill.
//
//    A work type may have half a dozen, and a row carrying six says less
//    than one carrying two.
{
  for (const n of ["Excavation and Lay", "Lay", "Reinstatement", "reinstate",
    /* Jointing is real work on a service call-off: a plot takes about
       two hours to connect, so twelve plots is three days. It costs
       mains nothing, because no jointing phase is mapped against that
       work type. */
    "Jointing"]) {
    if (!isListedPhase(n)) fail(`${n} is not shown on the list`);
  }
  /* Energisation is listed now (0180): the first electric service
     call-off on a site switches the substation on, which is a day's
     work and belongs on the row that carries it. It was excluded here
     when no such phase existed. */
  if (!isListedPhase("Energisation")) {
    fail("the energisation phase is not shown on the list");
  }
  for (const n of ["Survey", "Traffic Management", ""]) {
    if (isListedPhase(n)) fail(`${n} is shown on the list`);
  }

  /* The pill says the phase's own name where nothing shorter has been
     chosen for it — "Jointing" needs no abbreviating, and falling
     through to the first word would have made it "Jointing" by luck
     rather than by rule. */
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const fn = page.slice(page.indexOf("function shortPhase"));
  if (!/return n;/.test(fn.slice(0, fn.indexOf("\n}")))) {
    fail("a phase with no short name is not shown as itself");
  }
}

// 9. The state is named, not only coloured.
//
//    Three shades of pill is a legend somebody has to learn, and part
//    assigned is exactly the state a colour alone would not tell from
//    done.
{
  for (const k of ["unassigned", "part", "assigned"]) {
    if (!COVER_LABEL[k]) fail(`${k} has no label`);
  }
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  /* The visible label, not the tooltip. Removing the words from the
     pill left COVER_LABEL in the title attribute, and a search of the
     whole file passed while the pill showed nothing but a colour.

     Matched loosely on what is inside the <b>, because the state now
     comes from a precomputed row rather than being worked out in the
     cell — the shape moved, the requirement did not. */
  if (!/<b>\{COVER_LABEL\[[^\]]+\]\}<\/b>/.test(page)) {
    fail("the pill shows a colour without the words");
  }
  /* And on hover as well, which is where the full phase name is: the
     pill says "Excavate & Lay" in a column narrower than the task
     type's own name. */
  if (!/title=\{`\$\{[^}]+\}: \$\{COVER_LABEL\[[^\]]+\]\}`\}/.test(page)) {
    fail("the pill does not name its phase in full anywhere");
  }
  if (!/co-cov c-\$\{[^}]+\}/.test(page)) {
    fail("the pill is not coloured by its state");
  }
  /* And the rule comes from the module rather than being worked out
     again on the page — the same question is asked on the call-off
     itself, and two answers would eventually differ. */
  if (!/phaseCover\(/.test(page)) fail("the page works the coverage out itself");
}

// 10. The list is given what it needs to work it out.
{
  const api = readFileSync("./netlify/functions/calloffs-all.js", "utf8");
  for (const t of ["Call_Off_Assignment", "Call_Off_Work_Day", "Task_Type"]) {
    if (!api.includes(t)) fail(`the list endpoint does not fetch ${t}`);
  }
  /* Named, not matched as a whole object — the response has gained a
     field since and pinning the exact shape made adding one look like a
     regression. */
  for (const f of ["rows", "workDays", "taskTypes"]) {
    if (!new RegExp(`json\\(\\{[^}]*\\b${f}\\b`).test(api)) {
      fail(`${f} is fetched but not sent`);
    }
  }
  /* Tolerated missing, like the utilities before them: an older
     database has no such tables, and a list that failed to load over a
     status pill would be worse than one that cannot show it. */
  const asgFetch = api.slice(api.indexOf('from("Call_Off_Assignment")'));
  if (!/\(\) => \(\{ data: \[\] \}\)/.test(asgFetch.slice(0, 400))) {
    fail("a database without the assignment tables cannot load the list");
  }
}

// 11. The pills are named as the trade names them.
//
//     "Dig" and "Reinstate" were shorter and were not what anybody calls
//     them. A pill on a list is read in passing, and a word somebody has
//     to translate is worse than one taking a little more room.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const fn = page.slice(page.indexOf("function shortPhase"));
  const body = fn.slice(0, fn.indexOf("\n}"));

  if (!/"Excavate & Lay"/.test(body)) fail("the excavation pill is not named Excavate & Lay");
  if (!/"Reinstatement"/.test(body)) fail("the reinstatement pill is not named Reinstatement");
  if (/"Dig"|"Reinstate"(?!ment)/.test(body)) {
    fail("a pill still uses the old short name");
  }
  /* A phase nobody has named appears as itself rather than as its first
     word — which turned "Traffic Management" into "Traffic". */
  if (/split\(\/\\s\+\/\)\[0\]/.test(body)) {
    fail("an unnamed phase is cut to its first word");
  }
}

// 12. A call-off raised from the drawing knows whose work it is.
//
//     The customer column was empty on every one, because nothing set
//     it — and a list with a blank on every row is a column nobody
//     reads.
{
  const canvas = readFileSync("./src/features/gis/GISCanvasPage.jsx", "utf8");
  /* The mains submission, identified by what it sends rather than by
     being the first one found.

     A service call-off now raises through the same function and is
     defined earlier in the file, so indexOf found that one and reported
     the mains rule missing from a payload that never had it. */
  const calls = [...canvas.matchAll(/const created = await createCallOff\(/g)]
    .map((m) => m.index);
  const mainsAt = calls.find((i) =>
    canvas.slice(i, i + 2500).includes('Selection_Mode: "Span"'));
  if (mainsAt == null) fail("cannot find where a mains call-off is raised");
  const call = mainsAt == null ? "" : canvas.slice(mainsAt);
  const payload = call.slice(0, call.indexOf("items:"));

  /* The fields the module returns, checked where they are produced —
     the page now spreads them in rather than naming them, which is the
     improvement, so asserting on the payload would be asserting on the
     old shape. */
  const mod = readFileSync("./src/features/gis/callOffCustomer.js", "utf8");
  for (const f of ["Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name"]) {
    if (!new RegExp(`\\b${f}:`).test(mod)) {
      fail(`a call-off raised from the drawing does not set ${f}`);
    }
  }
  /* Resolved through the branch, which is what links a developer to a
     customer. */
  if (!/branches\.find/.test(mod)) {
    fail("the customer is not resolved through the developer's branch");
  }
  /* Decided by length, in a module rather than on the page. */
  if (!/callOffCustomer\(/.test(payload)) {
    fail("the page works the customer out itself rather than using the rule");
  }
}

// 13. A call-off crossing a boundary goes to whoever has most of it.
//
//     A trench is split where a developer area ends, so a run can hold
//     sections belonging to two developers — and it is still one piece
//     of paper going to one branch.
{
  const tr = (id, dev, len) => ({
    Feature_ID: id, Geometry: [[0, 0], [len, 0]],
    Attributes: { Project_Developer_ID: dev },
  });
  const site = [tr(1, 7, 3), tr(2, 8, 90), tr(3, 7, 40)];
  const branches = [
    { Branch_ID: 1, Customer_ID: 10, Branch_Dropdown: "Barratt (Yorkshire East)" },
    { Branch_ID: 2, Customer_ID: 20, Branch_Dropdown: "Anwyl (Wales)" },
  ];
  const customers = [
    { Customer_ID: 10, Customer_Name: "Barratt Homes" },
    { Customer_ID: 20, Customer_Name: "Anwyl Homes" },
  ];
  const devs = [
    { Project_Developer_ID: 7, Branch_ID: 1 },
    { Project_Developer_ID: 8, Branch_ID: 2 },
  ];
  const who = (ranges) =>
    callOffCustomer(ranges, site, devs, branches, customers);

  /* Three metres one side of the boundary, ninety the other. Picking by
     order would send it to the wrong office. */
  const crossing = who([{ spans: [{ trenchIds: [1, 2] }] }]);
  if (crossing.Branch_Name !== "Anwyl (Wales)") {
    fail(`a crossing call-off went to ${crossing.Branch_Name}`);
  }
  if (crossing.Customer_Name !== "Anwyl Homes") {
    fail("the customer does not follow the branch");
  }

  /* Still the longer one when the shorter side is substantial. */
  if (who([{ spans: [{ trenchIds: [1, 2, 3] }] }]).Branch_Name !== "Anwyl (Wales)") {
    fail("43m against 90m did not go to the longer");
  }
  /* And the other way, so it is measuring rather than always picking
     the same developer. */
  if (who([{ spans: [{ trenchIds: [1, 3] }] }]).Branch_Name
    !== "Barratt (Yorkshire East)") {
    fail("a call-off wholly in one area went elsewhere");
  }

  /* A section crossed by two runs of one call-off is one length of dig.
     Counted twice, a short shared section could outweigh a long
     exclusive one. */
  const shared = metresByDeveloper(
    [{ spans: [{ trenchIds: [1, 2] }, { trenchIds: [2] }] }], site);
  if (shared.get(8) !== 90) {
    fail(`a shared section was counted as ${shared.get(8)}m rather than 90m`);
  }

  /* A tie is a genuine coin toss, and answering it would be inventing
     one. Rare, and a blank on the rare case is the question being open. */
  const even = [tr(1, 7, 50), tr(2, 8, 50)];
  if (leadDeveloper([{ spans: [{ trenchIds: [1, 2] }] }], even)) {
    fail("an even split picked a developer anyway");
  }
  /* As is a call-off whose trenches nobody has been assigned. */
  if (leadDeveloper([{ spans: [{ trenchIds: [9] }] }], site)) {
    fail("a call-off on unassigned trench picked a developer");
  }

  /* And the endpoint accepts them: a payload writing columns the
     endpoint drops is a change that looks made and is not. */
  const api = readFileSync("./netlify/functions/calloffs.js", "utf8");
  const cols = api.slice(api.indexOf("const SUB_COLS"), api.indexOf("].join"));
  for (const f of ["Customer_ID", "Customer_Name", "Branch_ID", "Branch_Name"]) {
    if (!cols.includes(`"${f}"`)) fail(`${f} is not writable on a call-off`);
  }
}

// 14. The call-off list is a table like the others.
//
//     It was hand-written markup: a fixed run of th and td in one order,
//     with no filters and no sort. Every other list is driven by a
//     column list and gets moving, resizing, hiding, filtering and
//     sorting from useTableLayout and FilterCell without asking.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  if (!/useTableLayout\("calloffs", COLS\)/.test(page)) {
    fail("the call-off table does not use the shared layout");
  }
  for (const [what, pattern] of [
    ["move", /layout\.reorderProps\(c\.key\)/],
    ["resize", /layout\.startResize\(e, c\.key\)/],
    ["hide", /<ColumnsMenu/],
    ["filter", /<FilterCell col=\{c\}/],
    ["sort", /toggleSort\(c\.key\)/],
  ]) {
    if (!pattern.test(page)) fail(`the call-off table cannot ${what} its columns`);
  }
  /* Driven by the column list, not a fixed run of cells — otherwise a
     moved header leaves its data behind, which is the failure the other
     tables' comments warn about. */
  /* Drawn from the layout, by way of `cols` — which is the layout
     minus whatever the grouping folds away. Asserting on
     layout.visible.map directly was right until grouping arrived and
     then failed on correct code. */
  if (!/\{cols\.map\(\(c\) => \(\s*\n?\s*<th key=\{c\.key\} \{\.\.\.layout\.reorderProps/.test(page)) {
    fail("the header is drawn from a fixed list, so moving a column would misalign it");
  }
  const body = page.slice(page.indexOf("<tbody>"), page.indexOf("</tbody>"));
  if (!/\{cols\.map\(\(c\) => \{/.test(body)) {
    fail("the body is a fixed run of cells, so a moved column shows the wrong data");
  }

  /* The column filters narrow on top of the search box and the status
     dropdown rather than replacing either. */
  /* Called with the whole column list and the whole filter object.

     rowPasses walks both itself. Called once per column with one of
     each it threw "e is not iterable" on the first render, because a
     single column is not a list — and the page would not load at all.
     Every other table calls it this way. */
  if (!/rowPasses\(r, FILTERABLE, filters\)/.test(page)) {
    fail("the column filters are not applied the way rowPasses expects");
  }
  if (/rowPasses\([^)]*filters\[c\.key\]\)/.test(page)) {
    fail("rowPasses is called per column, which throws before the page renders");
  }
  /* And the actions column is left out, since it has no value to match
     and raw() would be called on it for every row. */
  if (!/const FILTERABLE = COLS\.filter\(\(c\) => c\.type !== "none"\)/.test(page)) {
    fail("a column with nothing to filter on is passed to the filter");
  }
  /* The open/closed filter above the table has gone: the Status column
     filters itself, and two controls for one question could disagree.
     What must not go is the column filtering itself. */
  if (!/rowPasses\(r, FILTERABLE, filters\)/.test(page)) {
    fail("the column filters are not applied to the rows");
  }

  /* Assigned sorts and filters on the worst state on the row, so
     filtering Unassigned finds everything with anything outstanding
     rather than only the untouched ones. */
  const rank = { unassigned: 0, part: 1, assigned: 2 };
  const worst = (states) => (states.length
    ? COVER_LABEL[states.reduce((w, x) => (rank[x] < rank[w] ? x : w), "assigned")]
    : "");
  if (worst(["assigned", "part"]) !== "Part assigned") {
    fail("a part-assigned phase does not show on the row");
  }
  if (worst(["part", "unassigned"]) !== "Unassigned") {
    fail("an unassigned phase is hidden behind a part-assigned one");
  }
  if (worst([]) !== "") fail("a call-off with no phases claims a state");
  if (!/_cover\?\.worst/.test(page)) {
    fail("the Assigned column does not sort on the worst state");
  }
  /* Worked out once. The filter, the sort and the cell reading it
     separately would eventually disagree. */
  if (!/const coverFor = useMemo/.test(page)) {
    fail("the cover is recalculated per use rather than once per row");
  }
}

// 15. The Customer column shows the branch.
//
//     A customer with three regional offices is three different people
//     to send a call-off to. "Barratt Homes" on a row is true of half
//     the list and tells nobody which office.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const cols = page.slice(page.indexOf("const COLS = ["));
  const col = cols.slice(cols.indexOf('key: "customer"'));
  const entry = col.slice(0, col.indexOf("},"));

  if (!/r\.Branch_Name/.test(entry)) fail("the Customer column does not show the branch");
  if (!/r\.Branch_Name \|\| r\.Customer_Name/.test(entry)) {
    fail("the branch does not fall back to the customer");
  }
  /* The heading stays short: the column is narrow and "Customer Branch"
     would wrap. The branch name already contains the customer. */
  if (!/label: "Customer"/.test(entry)) {
    fail("the Customer heading changed with the value under it");
  }

  /* And the endpoint sends it, or the column is blank on every row. */
  const api = readFileSync("./netlify/functions/calloffs-all.js", "utf8");
  if (!/"Branch_Name"/.test(api)) {
    fail("the list endpoint does not return the branch name");
  }

  /* An older call-off has a customer and no branch. Losing what is
     known would be worse than the ambiguity it replaces. */
  const raw = (r) => r.Branch_Name || r.Customer_Name || "";
  if (raw({ Customer_Name: "Barratt Homes" }) !== "Barratt Homes") {
    fail("a call-off with no branch shows nothing at all");
  }
  if (raw({ Branch_Name: "Barratt Homes (Yorkshire East)", Customer_Name: "Barratt Homes" })
    !== "Barratt Homes (Yorkshire East)") {
    fail("the customer wins over the branch");
  }
}

// 16. A phase with nothing booked still shows.
//
//     The pills used to come from the assignments, so a call-off with
//     nothing booked showed nothing at all — and "nothing booked" is
//     the state this column exists to flag. A service call-off showed
//     one green pill and no sign of the two phases nobody had touched.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");
  const api = readFileSync("./netlify/functions/calloffs-all.js", "utf8");

  /* From the work type's phases, not from what happens to be
     assigned. */
  if (!/const phases = workTypePhases/.test(page)) {
    fail("the pills are built from the assignments rather than the phases");
  }
  if (/asg\.some\(\(a\) =>\s*\n?\s*Number\(a\.Task_Type_ID\) === Number\(t\.Task_Type_ID\)\)\s*\n?\s*\|\|/.test(page)) {
    fail("a phase is still only listed when something is booked on it");
  }
  /* Matched to this call-off's work type: a work type with no
     reinstatement should not be asked about reinstatement. */
  if (!/Number\(m\.Work_Type_ID\) === Number\(r\.Work_Type\?\.Work_Type_ID\)/.test(page)) {
    fail("every work type's phases are shown on every call-off");
  }

  /* And the endpoint sends the mapping, or the page has nothing to
     build them from. */
  if (!/from\("Work_Type_Task_Type"\)/.test(api)) {
    fail("the list endpoint does not fetch which phases a work type has");
  }
  if (!/json\(\{ rows, workDays, taskTypes, workTypePhases \}\)/.test(api)) {
    fail("the phase mapping is fetched but not sent");
  }
  if (!/setWorkTypePhases\(res\.workTypePhases/.test(page)) {
    fail("the page never reads the phase mapping it is sent");
  }

  /* The behaviour: a call-off with one phase booked of three still
     shows three. */
  const mapping = [
    { Work_Type_ID: 2, Task_Type_ID: 10 },
    { Work_Type_ID: 2, Task_Type_ID: 11 },
    { Work_Type_ID: 9, Task_Type_ID: 12 },
  ];
  const types = [
    { Task_Type_ID: 10, Task_Type_Name: "Excavation and Lay" },
    { Task_Type_ID: 11, Task_Type_Name: "Reinstatement" },
    { Task_Type_ID: 12, Task_Type_Name: "Excavation and Lay" },
  ];
  const shown = mapping
    .filter((m) => m.Work_Type_ID === 2)
    .map((m) => types.find((t) => t.Task_Type_ID === m.Task_Type_ID))
    .filter(Boolean);
  if (shown.length !== 2) {
    fail(`a work type with two phases showed ${shown.length}`);
  }
  if (shown.some((t) => t.Task_Type_ID === 12)) {
    fail("another work type's phase is shown");
  }
}

// 17. The list groups, and the status dropdown is gone.
//
//     Two controls for one question could disagree: the dropdown saying
//     open, the Status column filter saying Complete, and a table
//     showing nothing with no obvious reason why.
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  if (!/const \[groupBy, setGroupBy\]/.test(page)) fail("the list cannot be grouped");
  for (const g of ["customer", "worktype", "status"]) {
    if (!new RegExp(`value="${g}"`).test(page)) fail(`there is no grouping by ${g}`);
  }

  /* The dropdown is gone, and so is the filter behind it — filtering to
     open with no control on screen would hide finished call-offs with
     nothing to say so, and somebody would think they had lost one. */
  if (/setStatus\(/.test(page)) fail("the status control is still there");
  if (/status === "open" && CLOSED\.has/.test(page)) {
    fail("the list still hides closed call-offs with no way to say so");
  }

  /* The grouped column folds away: repeating the branch on every row
     under a heading that says the branch is noise. */
  if (!/const cols = layout\.visible\.filter\(\(c\) => c\.key !== groupedCol\)/.test(page)) {
    fail("the column being grouped by is repeated on every row");
  }
  /* And the table draws from that list, or a folded column leaves a
     hole where its cells were. */
  if (/layout\.visible\.map/.test(page)) {
    fail("part of the table still draws every column, including the grouped one");
  }

  /* Groups shut, and say what is in them when shut. */
  if (!/collapsed\[label\]/.test(page)) fail("groups cannot be collapsed");
  if (!/call-off\$\{list\.length === 1/.test(page)) {
    fail("a shut group does not say how many are in it");
  }

  /* Status groups read in the order the office works through, not
     alphabetically: Pending Review before Complete says something about
     progress that P-before-C does not. */
  if (!/statusRank\(a\[0\]\) - statusRank\(b\[0\]\)/.test(page)) {
    fail("status groups are sorted alphabetically");
  }
  /* The order is read out of the page rather than imported: node
     cannot load a .jsx module, and a copy of the list here would be a
     second answer to what order statuses go in. */
  const listed = page.match(/export const STATUSES = \[([\s\S]*?)\];/);
  const STATUSES = listed
    ? [...listed[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]) : [];
  const statusRank = (n) => {
    const i = STATUSES.indexOf(n);
    return i < 0 ? STATUSES.length : i;
  };
  if (!STATUSES.length) fail("the page no longer says what order statuses go in");

  const order = ["Complete", "Pending Review", "Submitted"]
    .sort((a, b) => statusRank(a) - statusRank(b));
  if (order[0] !== "Pending Review" || order[2] !== "Complete") {
    fail(`status groups came out as ${order.join(" then ")}`);
  }
  /* A status the database has and this list does not sorts last, rather
     than being promoted above the ones somebody thought about. */
  if (statusRank("Something New") <= statusRank("Complete")) {
    fail("an unknown status sorts above known ones");
  }

  /* Submitted and Aborted arrived with the field app (0169) and this
     list was not updated, so neither could be set by hand on a call-off
     that needed correcting. */
  for (const st of ["Submitted", "Aborted"]) {
    if (!STATUSES.includes(st)) fail(`${st} is missing from the status list`);
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Assignment coverage behaves (spans and time, per phase).");
process.exit(bad ? 1 : 0);
