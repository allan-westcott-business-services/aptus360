/* How the planning board is grouped, and which orders make sense.

   The board used to group by one thing: team, or region, or work type,
   or call-off, or manager. This lets somebody stack them — region, then
   sub region, then manager — and choose the order.

   ── Not every order is meaningful ──

   Region inside Team is not a view of anything: a team works in one
   region, so every team row would contain exactly one region row and
   the extra level would say nothing. The same is true of any pair where
   the second level is broader than the first.

   Rather than list the allowed combinations — there are dozens once
   three levels are in play, and a list is something that goes stale
   when a level is added — the levels are ranked from broadest to
   narrowest and the rule is simply that each level must be narrower
   than the one above it.

   That rank produces exactly the hierarchies asked for:

       Region > Sub Region                    1 < 2
       Region > Team                          1 < 4
       Region > Sub Region > Manager          1 < 2 < 3
       Manager > Team                         3 < 4
       Work Type > Region                     0 < 1
       Work Type > Team                       0 < 4

   and refuses the ones that are not, including Team > Region.

   ── Where the ranks come from ──

   Each is a containment question: can one of these contain several of
   the other? A work type spans regions. A region holds sub regions. A
   sub region is worked by several managers' sites. A manager runs
   several teams. A team works several call-offs. Where the answer is
   "no", the two are the same rank and cannot be stacked. */

export const LEVELS = [
  { id: "worktype", label: "Work type", rank: 0 },
  { id: "region", label: "Region", rank: 1 },
  { id: "subregion", label: "Sub region", rank: 2 },
  { id: "pm", label: "Project manager", rank: 3 },
  { id: "team", label: "Team", rank: 4 },
  { id: "ref", label: "Call-off", rank: 5 },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id) ?? null;

/* Which levels may follow the ones already chosen.

   Only the last choice matters — a level narrower than the last is
   narrower than everything above it, because the ranks are ordered. */
export function allowedNext(levels = []) {
  const last = levelById(levels[levels.length - 1]);
  const floor = last ? last.rank : -1;
  return LEVELS.filter((l) => l.rank > floor && !levels.includes(l.id));
}

export function isValidHierarchy(levels = []) {
  if (!levels.length) return false;
  let floor = -1;
  for (const id of levels) {
    const l = levelById(id);
    if (!l || l.rank <= floor) return false;
    floor = l.rank;
  }
  return true;
}

/* Trim a hierarchy back to its longest valid start.

   Called when a level is changed part way down: choosing Team at level
   one has to drop a Region sitting at level two, because that is no
   longer a view of anything. Silently dropping is better than refusing
   the change — the person has said what they want at the level they
   touched, and the levels below are the ones that have to give. */
export function pruneHierarchy(levels = []) {
  const out = [];
  let floor = -1;
  for (const id of levels) {
    const l = levelById(id);
    if (!l || l.rank <= floor) break;
    out.push(id);
    floor = l.rank;
  }
  return out;
}

/* The label a hierarchy reads as, for the button that opens the picker. */
export const describeHierarchy = (levels = []) =>
  levels.map((id) => levelById(id)?.label ?? id).join(" \u203a ") || "Nothing";
