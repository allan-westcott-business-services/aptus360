/* Choosing which plots an interim POC application covers.

   An interim supply serves part of a site — a first phase, a compound, a
   show home — so the application names its plots rather than taking the
   whole scheme. Every other type covers everything and needs none of
   this.

   ── The rules, and why each one is here ──

   A plot already on another interim application for the same utility
   cannot be picked. Two applications claiming the same plot means the
   operator is asked twice for one supply, and the second quotation
   contradicts the first.

   The plot count caps the selection. It is typed on the form, and it is
   what was applied for — picking more plots than that means the
   application says one thing and its selection another.

   Both are enforced here rather than only in the panel. A cap that lives
   in a disabled attribute is a cap that disappears the moment anything
   else selects a plot. */

const idsFrom = (v) => String(v ?? "")
  .split(",")
  .map((x) => Number(x.trim()))
  .filter((n) => Number.isFinite(n) && n > 0);

export const parseIds = idsFrom;

/* The list as it is stored: comma-separated, in order, no duplicates.

   Sorted numerically so the same selection always writes the same
   string — otherwise a save with no change still looks like an edit,
   and a diff of two applications is unreadable. */
export function serialiseIds(ids = []) {
  return [...new Set([...ids].map(Number).filter((n) => Number.isFinite(n) && n > 0))]
    .sort((a, b) => a - b)
    .join(",");
}

/* Plots spoken for by another interim application on the same utility.

   Keyed to the application that holds them, so the panel can say which
   one rather than only that the plot is unavailable — "already on
   another application" sends someone looking through every application
   to find out which.

   Same utility only: an interim gas application and an interim electric
   one may cover the same houses, and they are different supplies. */
export function claimedElsewhere(applications = [], { utilityId, exceptId, typeName } = {}) {
  const out = new Map();
  if (utilityId == null || utilityId === "") return out;

  for (const a of applications) {
    if (Number(a?.Utility_ID) !== Number(utilityId)) continue;
    if (exceptId != null && Number(a?.POC_Application_ID) === Number(exceptId)) continue;
    /* Only other interim applications hold a subset. A main application
       covers the whole site and does not claim individual plots. */
    if (typeName && typeName(a) !== "Interim") continue;

    const label = a?.Quote_Reference
      || a?.Applicant_Company
      || `Application #${a?.POC_Application_ID}`;
    for (const id of idsFrom(a?.Interim_Plot_IDs)) {
      if (!out.has(id)) out.set(id, label);
    }
  }
  return out;
}

/* What the panel should show for each plot.

   Returned as a plan rather than rendered, so the rules can be checked
   without a browser and the panel has no judgement of its own. */
export function plotChoices(plots = [], selectedIds = [], opts = {}) {
  const { claimed = new Map(), target = 0 } = opts;
  const chosen = new Set([...selectedIds].map(Number));
  const atCap = target > 0 && chosen.size >= target;

  return plots.map((p) => {
    const id = Number(p.Plot_ID);
    const isChosen = chosen.has(id);
    const takenBy = !isChosen ? claimed.get(id) : null;
    /* A chosen plot is never locked: it must always be possible to let
       one go, especially at the cap, or the selection cannot be
       corrected without starting again. */
    const locked = !isChosen && (!!takenBy || atCap);

    return {
      plot: p,
      id,
      chosen: isChosen,
      takenBy: takenBy ?? null,
      locked,
      why: takenBy
        ? `Already on ${takenBy}`
        : (locked ? `All ${target} plots chosen — deselect one first` : ""),
    };
  });
}

/* Ticking or unticking one, with the rules applied.

   Returns the selection unchanged where the click is not allowed, so the
   caller can set state unconditionally and a refused click simply does
   nothing. */
export function toggleChoice(selectedIds = [], id, opts = {}) {
  const { claimed = new Map(), target = 0 } = opts;
  const n = Number(id);
  const set = new Set([...selectedIds].map(Number));

  if (set.has(n)) { set.delete(n); return [...set]; }
  if (claimed.has(n)) return [...set];
  if (target > 0 && set.size >= target) return [...set];

  set.add(n);
  return [...set];
}

/* Dropping anything no longer allowed.

   The utility can change after plots are chosen, and another application
   can claim one in the meantime. Left alone, those stay in the selection
   and are saved — so the application quietly covers a plot it is not
   entitled to.

   Run whenever the inputs change rather than only on save: a selection
   that silently shrinks when the form is submitted is worse than one
   that visibly shrinks when the utility is changed. */
export function pruneChoices(selectedIds = [], plots = [], opts = {}) {
  const { claimed = new Map() } = opts;
  const valid = new Set(plots.map((p) => Number(p.Plot_ID)));
  const kept = [...selectedIds]
    .map(Number)
    .filter((id) => valid.has(id) && !claimed.has(id));
  return { ids: kept, dropped: selectedIds.length - kept.length };
}

/* Whether the selection matches what was applied for.

   Said rather than enforced: a half-finished selection is an ordinary
   state to be in mid-form, and refusing to save would lose the rest of
   the application. */
export function selectionState(selectedIds = [], target = 0) {
  const n = selectedIds.length;
  if (!target) return { ok: n > 0, note: `${n} plot(s) chosen` };
  if (n === target) return { ok: true, note: `${n} of ${target} chosen` };
  if (n < target) {
    return { ok: false, note: `${n} of ${target} chosen — ${target - n} still to pick` };
  }
  return { ok: false, note: `${n} chosen, more than the ${target} applied for` };
}
