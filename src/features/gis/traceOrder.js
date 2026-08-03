/* Putting the legs of a trace in the order the cable is laid.

   The table sorts by node label, which reads well while the labels
   number in sequence — A1, A2, A3 — and falls apart the moment they do
   not. On the advanced check most rows are called "Service joint —
   Plot 21", so alphabetical order interleaves branches and the reader
   has to hop about to follow a run.

   Ordered by connectivity instead: each row's far end is the next row's
   near end, one branch followed to its end before the next is started.
   That is the order someone walks the site in, and the order a jointer
   works in.

   Its own module because it is a graph walk with several ways to go
   wrong — a branch that never closes, a leg whose start nothing reaches,
   a circuit that loops — and none of those are visible in a table until
   a row is missing. */

/* Legs in laying order, depth first from the source.

   Ties are broken by the order the trace produced them, so the result is
   stable: the same drawing must give the same table twice, or a row
   moving between renders looks like the design changed. */
export function byConnectivity(legs = [], from = null) {
  if (!legs.length) return [];

  const out = [];
  const taken = new Set();

  /* Legs leaving each point, in their original order. */
  const leaving = new Map();
  legs.forEach((leg, i) => {
    const key = String(leg.from ?? "");
    if (!leaving.has(key)) leaving.set(key, []);
    leaving.get(key).push({ leg, i });
  });

  /* Where to begin. The trace's own start where it is given and has legs
     leaving it; otherwise the first leg's start, so a fragment of a
     table still orders sensibly rather than coming back empty. */
  const roots = [];
  const startKey = from != null ? String(from) : null;
  if (startKey != null && leaving.has(startKey)) roots.push(startKey);

  const walk = (key, guard) => {
    /* A depth counter rather than a visited-set on points: the same
       point legitimately appears twice — a joint feeding two plots — and
       refusing to visit it again would drop a row. The guard catches a
       genuine loop, which would otherwise hang the panel. */
    if (guard > legs.length + 1) return;
    for (const entry of leaving.get(key) || []) {
      if (taken.has(entry.i)) continue;
      taken.add(entry.i);
      out.push(entry);
      if (entry.leg.to != null) walk(String(entry.leg.to), guard + 1);
    }
  };

  for (const r of roots) walk(r, 0);

  /* Anything the walk could not reach: a leg whose start nothing arrives
     at, which happens on a drawing with a break in it. Appended in their
     original order rather than dropped — a row missing from a schedule
     is worse than one out of place, and their being at the end is itself
     a sign something is disconnected. */
  legs.forEach((leg, i) => {
    if (!taken.has(i)) out.push({ leg, i });
  });

  return out;
}

/* Just the ends of the runs.

   A levels check is often read for one question: does anything at the
   far end of a run fall outside its limits. Every intermediate row is
   working, and on the advanced check there are eighty of them.

   An end is a leg whose far point nothing leaves — a leaf. Worked out
   from the legs themselves rather than from the model, so it means the
   same on both checks and on a table that has already been filtered.

   Dead ends are included: a leg with no node at its far end is a run
   that stops at a meter with no span node on it, which is still the end
   of a run and usually worth knowing about. */
export function endsOnly(rows = []) {
  const departed = new Set(
    rows.map(({ leg }) => String(leg.from ?? "")).filter((x) => x !== ""),
  );
  return rows.filter(({ leg }) =>
    leg.to == null || !departed.has(String(leg.to)));
}
