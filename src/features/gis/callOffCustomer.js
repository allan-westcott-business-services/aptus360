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

/* Metres of a polyline. Its own copy rather than an import, because
   this is the only arithmetic here and a module borrowed for one line
   is a dependency to keep in step. */
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

  const dev = developers.find((d) =>
    Number(d.Project_Developer_ID ?? d.id) === lead.developerId);
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
