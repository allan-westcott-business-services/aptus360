/* Which phases a call-off asks for.

   A service call-off came out with Excavation & Lay and Reinstatement
   on it and neither is booked there: the dig and the cable are done
   before jointing starts, so the service goes into a trench already
   open, and the ground is reinstated once for the street rather than
   plot by plot. Two sections nobody fills in, on every one of them,
   above the section they came to use.

   ── Why this file now reads the migrations ──

   All of the above was already true, and already implemented, and did
   nothing at all. The filter matched a work type called "Electric
   Service". `Work_Type` holds three rows — "Mains Call Off", "Service
   Call Off" and "Street Light Call Off" — and not one of them says
   "electric", so the filter never fired and the two sections stayed on
   the page.

   This check passed the whole time, because every case in it fed the
   function "Electric Service" as well. A check that invents the input
   it is testing against only proves the function agrees with the check.
   The names now come out of the seed migrations, and a name tested here
   that the database cannot produce is itself a failure. */
import { readFileSync, readdirSync } from "node:fs";
import {
  isServiceCallOff, phasesToShow, phasesHidden,
} from "./src/features/calloffs/callOffPhases.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

/* The work type names the database actually holds, read from the
   INSERT INTO "Work_Type" statements in the migrations. That folder is
   the only record of the schema there is — there is no migration
   runner — so it is also the only place to learn what a work type is
   called. */
const WORK_TYPES = (() => {
  const dir = "./supabase/migrations";
  const found = new Set();
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql"))) {
    const sql = readFileSync(`${dir}/${f}`, "utf8");
    for (const m of sql.matchAll(/INSERT\s+INTO\s+"Work_Type"[\s\S]*?;/gi)) {
      for (const v of m[0].matchAll(/\(\s*'([^']+)'/g)) found.add(v[1]);
    }
  }
  return [...found];
})();

if (!WORK_TYPES.length) {
  fail("no work type names found in the migrations — this check is blind");
}

/* Every name used below must be one the database can produce. This is
   the line that would have caught the original fault. */
const REAL = (name) => {
  if (!WORK_TYPES.includes(name)) {
    fail(`"${name}" is not a work type any migration creates`
      + ` — known: ${WORK_TYPES.join(", ")}`);
  }
  return name;
};

const SERVICE = REAL("Service Call Off");
const MAINS = REAL("Mains Call Off");
const LIGHTING = REAL("Street Light Call Off");

/* And the seeded service call-off must be caught by the filter. The
   two together are the fault: a predicate that is right about names
   nobody uses, checked against names nobody uses. */
if (!isServiceCallOff(SERVICE)) {
  fail(`the seeded "${SERVICE}" is not recognised as a service call-off`);
}
for (const wt of WORK_TYPES.filter((w) => w !== SERVICE)) {
  if (isServiceCallOff(wt)) fail(`"${wt}" was treated as a service call-off`);
}

const PHASES = [
  { Task_Type_ID: 1, Task_Type_Name: "Excavation and Lay" },
  { Task_Type_ID: 2, Task_Type_Name: "Jointing" },
  { Task_Type_ID: 3, Task_Type_Name: "Reinstatement" },
  { Task_Type_ID: 4, Task_Type_Name: "Energisation" },
];
const names = (list) => list.map((p) => p.Task_Type_Name).join(", ");

// 1. A service call-off drops the dig and the reinstatement.
{
  const got = names(phasesToShow(PHASES, SERVICE));
  if (got !== "Jointing, Energisation") fail(`a service call-off shows ${got}`);

  /* And says which two are missing, so the sections do not simply
     vanish for somebody who knew they were there. */
  const gone = names(phasesHidden(PHASES, SERVICE));
  if (gone !== "Excavation and Lay, Reinstatement") {
    fail(`the ones left out came back as ${gone}`);
  }
}

// 2. Every other work type keeps all of them.
//
//    Driven from the migrations rather than from a list written here,
//    so a work type added later is covered without this file being
//    edited — and so the names cannot drift from the seeded ones again,
//    which is the fault that made all of this do nothing.
for (const wt of WORK_TYPES.filter((w) => w !== SERVICE)) {
  if (names(phasesToShow(PHASES, wt)) !== names(PHASES)) {
    fail(`${wt} lost a phase it books`);
  }
  if (phasesHidden(PHASES, wt).length) fail(`${wt} reported hidden phases`);
}

/* The mains call-off in particular, since that is where the dig and the
   reinstatement the service call-off drops are actually booked. If this
   ever fails, the two phases have nowhere left to be. */
for (const phase of ["Excavation and Lay", "Reinstatement"]) {
  if (!phasesToShow(PHASES, MAINS).some((p) => p.Task_Type_Name === phase)) {
    fail(`${phase} is not bookable on the mains call-off either`);
  }
}

// 3. The rule is the same for every utility.
//
//    An earlier form of this check asserted the opposite — that "Gas
//    Service" and "Electric and Gas Service" kept their dig, on the
//    argument that a gas service has its own trench to the plot. Both
//    the names and the argument were wrong. The names, because
//    `Work_Type` has a single "Service Call Off" covering every
//    utility; the argument, because a gas and water service call-off
//    does not book excavation or reinstatement any more than an
//    electric one does. The dig is ahead of the service in every case
//    and the ground goes back once for the street.
//
//    So there is nothing to vary on, and this pins that: the filter
//    must not start reading a utility out of the work type's name.
{
  /* A name qualified by any utility, or by several, is still just the
     service call-off and is filtered identically. If one of these ever
     comes back with a dig, somebody has reintroduced a per-utility
     rule keyed on the name — which cannot work, because the name is
     not where the utilities are. */
  const want = "Jointing, Energisation";
  for (const wt of ["Gas Service Call Off", "Water Service Call Off",
    "Gas and Water Service Call Off", "Electric Service Call Off",
    "Service Call Off"]) {
    const got = names(phasesToShow(PHASES, wt));
    if (got !== want) fail(`"${wt}" shows ${got}, not the same as every other service`);
    if (phasesHidden(PHASES, wt).length !== 2) {
      fail(`"${wt}" did not report both dropped phases`);
    }
  }

  /* And the utilities are on the row, not in the name — so nothing in
     the module may take them as an argument or read them off one. If a
     per-utility rule is ever genuinely wanted, it needs `utility_ids`
     passed in from the call sites, and this check should be rewritten
     rather than deleted. */
  const src = readFileSync("./src/features/calloffs/callOffPhases.js", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  if (/utility_ids|Utility_ID/i.test(src)) {
    fail("the phase filter reads utilities — the rule is the same for all of them");
  }
}

// 4. What the predicate does and does not catch.
{
  if (isServiceCallOff(MAINS)) fail("a mains call-off matched");
  if (isServiceCallOff(LIGHTING)) fail("a street lighting call-off matched");
  if (isServiceCallOff("")) fail("a call-off with no work type matched");
  if (isServiceCallOff(null)) fail("a missing work type matched");
  if (!isServiceCallOff(SERVICE)) fail("the seeded name did not match");

  /* Renamings a site might plausibly make. Not asserted as real names
     — they are not in WORK_TYPES and must not be — but the predicate
     should survive them. */
  if (!isServiceCallOff("SERVICE CALL OFF")) fail("an upper-case name did not match");
  if (!isServiceCallOff("Electric Service Call Off")) {
    fail("a name qualified by utility did not match");
  }
  /* A work type that is both digs, so it keeps its dig. */
  if (isServiceCallOff("Mains and Service Call Off")) {
    fail("a combined mains and service call-off lost its dig");
  }
  /* Lighting under another name. A column has no mains gang ahead of
     it and is dug for on its own call-off. */
  if (isServiceCallOff("Street Lighting Services")) {
    fail("a lighting call-off lost its dig");
  }
}

// 5. Order is the work type's own.
//
//    The same phase sits at a different point in different work types,
//    so filtering must not reorder what is left.
{
  const shown = phasesToShow(PHASES, SERVICE);
  const order = PHASES.filter((p) => shown.includes(p));
  if (names(shown) !== names(order)) fail("the remaining phases were reordered");
}

// 6. Nothing to filter is not an error.
{
  if (phasesToShow([], SERVICE).length) fail("phases appeared from nothing");
  if (phasesToShow(undefined, SERVICE).length) fail("an absent list produced phases");
  if (phasesHidden([], SERVICE).length) fail("hidden phases appeared from nothing");
  /* A work type whose phases are all filtered out still returns a list
     rather than throwing \\u2014 the page has a message for an empty one. */
  const only = [{ Task_Type_ID: 1, Task_Type_Name: "Excavation and Lay" }];
  if (phasesToShow(only, SERVICE).length !== 0) {
    fail("a work type of nothing but digging kept a section");
  }
}

/* ── Both places that draw phases go through this ──

   The rule being right is no use where it is not asked. The detail
   page filtered from the day the module was written; the list table's
   Assigned column did not, so one call-off showed two different phase
   sets depending on which screen you were on — and because the worst
   phase drives that column's sort and filter, every service call-off
   sat permanently Unassigned with its jointing fully booked.

   Counted rather than merely present: one call site passing is what
   the page looked like when this was reported. */
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  const calls = [...page.matchAll(/phasesToShow\(/g)].length;
  if (calls < 2) {
    fail(`phasesToShow is called ${calls} time(s) — the list and the`
      + " detail page each need it, or they disagree");
  }

  /* The list table's Assigned column specifically. It builds its own
     phase list from the work type mapping, so it is the one that can
     silently go back to showing all of them. */
  if (!/phasesToShow\(phases,\s*r\.Work_Type/.test(page)) {
    fail("the call-off list's Assigned column does not filter its phases");
  }
  /* And the detail page's assignment sections. */
  if (!/phasesToShow\(phases,\s*row\.Work_Type/.test(page)) {
    fail("the call-off detail page does not filter its phases");
  }

  /* Nothing maps straight off an unfiltered list into pills or
     sections. Both cover-state builds must read the filtered one. */
  if (/const states = phases\.map\(/.test(page)) {
    fail("the Assigned column builds its pills from the unfiltered phases");
  }
}

/* ── No hook below an early return ──

   React counts the hooks a component runs and throws #310 \u2014 "rendered
   more hooks than during the previous render" \u2014 when the count
   changes between renders.

   The breech panel's `useState` and `useEffect` were added below
   `if (!row.Work_Type_ID) return ...`, so a call-off with no work type
   ran two fewer hooks than one with it. Opening a newly raised call-off
   from the table, after having had a different kind open, was enough to
   change the count and blank the page.

   Checked by position rather than by mounting: the fault is structural
   and shows in the source, and mounting would need a call-off of each
   kind and the render to happen in the wrong order to catch it. */
{
  const page = readFileSync("./src/features/calloffs/CallOffsPage.jsx", "utf8");

  /* Every component in the file, not only the one that broke. */
  const starts = [...page.matchAll(/\nfunction ([A-Z][A-Za-z0-9_]*)\s*\(/g)];
  for (let i = 0; i < starts.length; i++) {
    const from = starts[i].index;
    const to = i + 1 < starts.length ? starts[i + 1].index : page.length;
    const body = page.slice(from, to);
    const name = starts[i][1];

    /* An early return: a guard at the top level of the component that
       returns markup. Nested returns inside handlers are indented
       further and are not this. */
    const guard = body.search(/\n  if \([^)]*\) \{\n    return \(/);
    if (guard < 0) continue;

    const below = [...body.matchAll(/\buse(State|Effect|Memo|Callback|Ref|Reducer)\(/g)]
      .filter((m) => m.index > guard);
    if (below.length) {
      const which = [...new Set(below.map((m) => `use${m[1]}`))].join(", ");
      fail(`${name} calls ${below.length} hook(s) (${which}) below an early`
        + " return \u2014 a render that takes the early path runs fewer of them,"
        + " which is React #310 and a blank page");
    }
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Call-off phases behave (a service call-off books no dig and no reinstatement).");
process.exit(bad ? 1 : 0);
