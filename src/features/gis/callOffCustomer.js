/* Whose call-off it is, when the runs cross a developer boundary.

   ── The question ──

   A trench is split where a developer area ends, so a run from A7 to A8
   can be two sections belonging to two developers. The call-off is one
   piece of paper and goes to one branch.

   ── Answered by length ──

   Whoever has most of the work. Not the first section, not the one the
   run starts in — a call-off that begins with three metres in one area
   and continues with ninety in the next belongs to the second, and
   picking by order would send it to the wrong office.

   Measured on the trench the runs actually cross, not on the areas
   themselves. A developer area is a shape on a drawing; the metres in
   it are what somebody is being asked to dig.

   ── Why not leave it blank ──

   That was the first answer here, on the grounds that a wrong name is
   worse than none. It is not: a blank customer on a call-off is a
   question somebody has to chase, on every crossing job, forever —
   and the answer they arrive at is the one below. Leaving the work
   undone does not make it more accurate, it just moves it.

   Ties are the one case worth being careful about. Two developers with
   the same metres is a genuine coin toss, and this returns nothing
   rather than pretending: it is rare, and a blank on the rare case is
   the question actually being open. */

/* ── The same question, asked of plots ──

   A service call-off has no runs: it is a set of plots, and the trench
   that happens to serve them is not what is being called off. So the
   length arithmetic above has nothing to measure and returned nothing,
   which left the customer blank on every service call-off — the same
   fault the mains one had, one layer down.

   The answer is the same shape: whoever owns most of what is being
   worked on. For plots that is a count rather than a length, and the
   plot's own developer is already on the drawing — a seed inside a
   developer area belongs to that developer. */

/* Metres of a polyline. Its own copy rather than an import, because
   this is the only arithmetic here and a module borrowed for one line
   is a dependency to keep in step. */
import { developerAreas, developerAt } from "./developer.js";

function lengthOf(geometry = []) {
  let total = 0;
  for (let i = 0; i + 1 < geometry.length; i++) {
    total += Math.hypot(
      geometry[i + 1][0] - geometry[i][0],
      geometry[i + 1][1] - geometry[i][1],
    );
  }
  return total;
}

/* Metres of trench per developer across a call-off's runs.

   `ranges` are what the canvas holds while a call-off is being picked —
   each with spans, each span naming the trench sections it crosses. */
export function metresByDeveloper(ranges = [], features = []) {
  const byId = new Map(features.map((f) => [Number(f.Feature_ID), f]));
  const out = new Map();

  /* Counted once per trench, however many spans cross it. A section
     shared by two runs of the same call-off is one length of dig, and
     adding it twice would let a short shared section outweigh a long
     exclusive one. */
  const seen = new Set();

  for (const r of ranges) {
    for (const sp of (r.spans || [r])) {
      for (const id of (sp.trenchIds || [])) {
        if (seen.has(Number(id))) continue;
        seen.add(Number(id));

        const trench = byId.get(Number(id));
        const dev = trench?.Attributes?.Project_Developer_ID;
        if (dev == null) continue;

        const m = lengthOf(trench.Geometry || []);
        if (!(m > 0)) continue;
        out.set(Number(dev), (out.get(Number(dev)) || 0) + m);
      }
    }
  }
  return out;
}

/* The developer with most of the work, or null.

   Null on a tie, and null where nothing is attributed — both are the
   question genuinely being open, and a name invented for either would
   be read as an answer. */
export function leadDeveloper(ranges = [], features = []) {
  const metres = metresByDeveloper(ranges, features);
  if (!metres.size) return null;

  const sorted = [...metres.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return null;

  return { developerId: sorted[0][0], metres: sorted[0][1] };
}

/* The customer and branch a call-off should carry.

   `developers` are the project's, each pointing at a branch; `branches`
   and `customers` are the lookups the canvas already holds. */
export function callOffCustomer(ranges, features, developers = [],
  branches = [], customers = []) {
  const lead = leadDeveloper(ranges, features);
  if (!lead) return {};

  return branchFor(lead.developerId, developers, branches, customers);
}

/* A developer, as the fields a call-off carries.

   Shared by both routes: a mains call-off finds its developer by
   metres of trench and a service one by count of plots, and from there
   the question is the same. Two copies would eventually name the same
   developer's branch two different ways. */
export function branchFor(developerId, developers = [], branches = [],
  customers = []) {
  const dev = developers.find((d) =>
    Number(d.Project_Developer_ID ?? d.id) === Number(developerId));
  const branch = branches.find((b) =>
    Number(b.Branch_ID) === Number(dev?.Branch_ID));
  if (!branch) return {};

  const customer = customers.find((c) =>
    Number(c.Customer_ID) === Number(branch.Customer_ID));

  return {
    Customer_ID: branch.Customer_ID ?? null,
    Customer_Name: customer?.Customer_Name ?? null,
    Branch_ID: branch.Branch_ID,
    Branch_Name: branch.Branch_Dropdown || branch.Branch_Name || null,
  };
}

/* Plots per developer, from where their seeds fall.

   `plots` are the numbers on the call-off; `plotList` maps a number to
   the seed's id so the geometry can be found. A plot whose seed is not
   on the drawing, or falls in no developer area, is counted for nobody
   rather than guessed at. */
export function plotsByDeveloper(plots = [], features = [], plotList = []) {
  const areas = developerAreas(features);
  if (!areas.length) return new Map();

  const seedFor = new Map();
  for (const f of features) {
    if (f.Feature_Role !== "plot") continue;
    seedFor.set(Number(f.Plot_ID), (f.Geometry || [])[0]);
  }

  const idOf = new Map(plotList.map((p) => [
    String(p.plot_number ?? p.Plot_Number ?? "").trim(),
    Number(p.plot_id ?? p.Plot_ID),
  ]));

  const out = new Map();
  for (const plot of plots) {
    const point = seedFor.get(idOf.get(String(plot).trim()));
    if (!point) continue;

    /* The seed's own developer where the drawing records one, and where
       it does not, the area it falls in. Both are how a plot is
       attributed elsewhere, and a plot placed before the areas were
       drawn has only the second. */
    const dev = developerAt(point, areas);
    if (dev == null) continue;
    out.set(Number(dev), (out.get(Number(dev)) || 0) + 1);
  }
  return out;
}

/* The customer and branch a service call-off should carry.

   Whoever owns most of the plots. Same rule as the mains one — most of
   the work, and nothing on a tie, because a tie is a genuine coin toss
   and a name invented for it would be read as an answer. */
export function serviceCallOffCustomer(plots, features, plotList,
  developers = [], branches = [], customers = []) {
  const counts = plotsByDeveloper(plots, features, plotList);
  if (!counts.size) return {};

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  if (sorted.length > 1 && sorted[0][1] === sorted[1][1]) return {};

  return branchFor(sorted[0][0], developers, branches, customers);
}
