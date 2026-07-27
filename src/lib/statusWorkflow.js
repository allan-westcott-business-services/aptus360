/* Status workflow, mirroring the original app's two layers.

   1. Status_Transition  — which statuses may follow which, per quote type
   2. Status_Transition_Guard — extra conditions, e.g. all designs started

   The database enforces both. These helpers exist so the dropdown can grey
   out blocked options with a reason, rather than letting someone pick one
   and meet an error on save. */

export function allowedNext(transitions = [], fromStatusId, quoteTypeId) {
  const matching = transitions.filter(
    (t) =>
      String(t.From_Status_ID) === String(fromStatusId) &&
      (t.Quote_Type_ID == null || String(t.Quote_Type_ID) === String(quoteTypeId))
  );

  /* A quote-type-specific rule replaces the general one rather than
     adding to it — otherwise a Budget project offers both sets. */
  const specific = new Set(
    matching.filter((t) => t.Quote_Type_ID != null).map((t) => String(t.To_Status_ID))
  );
  const kept = matching.filter(
    (t) => t.Quote_Type_ID != null || !specific.has(String(t.To_Status_ID))
  );

  // Deduped regardless: the dropdown must never list a status twice.
  return [...new Set(kept.map((t) => t.To_Status_ID))];
}

/* Returns null if allowed, or a human reason if a guard blocks it. */
export function guardBlock(guards = [], targetStatusId, ctx = {}) {
  const designs = ctx.designs || [];
  for (const g of guards.filter((x) => String(x.Target_Status_ID) === String(targetStatusId))) {
    const ids = new Set((g.Condition_Status_IDs || []).map(Number));
    let passed = true;

    if (g.Guard_Type === "ALL_DESIGNS_STATUS_IS") {
      // No designs fails: "all designs complete" can't be true of nothing.
      passed = designs.length > 0 && designs.every((d) => ids.has(Number(d.Design_Status_ID)));
    } else if (g.Guard_Type === "ANY_DESIGN_STATUS_IS") {
      passed = designs.some((d) => ids.has(Number(d.Design_Status_ID)));
    } else if (g.Guard_Type === "NO_DESIGN_STATUS_IS") {
      passed = !designs.some((d) => ids.has(Number(d.Design_Status_ID)));
    } else if (g.Guard_Type === "HAS_PLOTS") {
      passed = (ctx.plotCount ?? 0) > 0;
    }
    // Unknown guard types pass, so a new type added in Admin doesn't
    // silently block everything until the frontend catches up.

    if (!passed) return g.Description || "Blocked by a workflow rule.";
  }
  return null;
}

/* Options for a status dropdown: the current status (always keepable) plus
   permitted next steps, each flagged with why it's blocked if it is. */
export function statusOptions({ statuses, transitions, guards, currentId, quoteTypeId, ctx }) {
  const nextIds = allowedNext(transitions, currentId, quoteTypeId);
  const out = [];
  const seen = new Set();
  const current = statuses.find((s) => String(s.Project_Status_ID) === String(currentId));
  if (current) {
    out.push({ ...current, isCurrent: true, blocked: null });
    seen.add(String(current.Project_Status_ID));
  }
  nextIds.forEach((id) => {
    if (seen.has(String(id))) return;
    const s = statuses.find((x) => String(x.Project_Status_ID) === String(id));
    if (!s) return;
    seen.add(String(id));
    out.push({ ...s, isCurrent: false, blocked: guardBlock(guards, id, ctx) });
  });
  return out;
}
