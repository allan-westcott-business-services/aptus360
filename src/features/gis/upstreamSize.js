/* Upstream pipe sizing.

   ── The rule ──

   A length of main cannot be fed through something narrower than
   itself. So when somebody sizes a pipe up by hand, every pipe between
   it and the POC has to be at least that size — anything smaller is a
   throttle, and the design would be wrong in the direction that looks
   fine on the drawing.

   Applied on the way back to the POC only. Downstream is untouched: a
   180mm spine feeding 63mm legs is ordinary, and widening those would
   be a different decision nobody asked for.

   ── Only where the trace is unambiguous ──

   The chain is followed while each step has exactly one way onward. At
   a point where several pipes meet, which of them feeds this one is not
   something geometry can answer — a ring, or a network fed from two
   sides, has more than one path back — and picking one would upsize
   somebody else's main on a guess.

   So the walk stops there and says how far it got. A partial answer
   that names its own limit is worth more than a confident wrong one.

   ── Bigger is left alone ──

   An upstream pipe already larger stays as it is. The rule is a floor,
   not an equality: 180mm feeding a 90mm leg is correct, and levelling
   it down would undo a decision somebody made deliberately. */

const near = (a, b, tol = 0.5) =>
  a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) <= tol;

const endsOf = (f) => {
  const g = f.Geometry || [];
  return g.length >= 2 ? [g[0], g[g.length - 1]] : [];
};

/* Which pipes touch this one at the given end, excluding itself. */
const touching = (pipes, at, exceptId, tol) => pipes.filter((p) =>
  Number(p.Feature_ID) !== Number(exceptId)
  && endsOf(p).some((e) => near(e, at, tol)));

/* The chain of mains from `start` back towards the POC.

   Returns the pipes in order, nearest the edited one first, and whether
   the POC was actually reached. */
export function upstreamChain(pipes = [], start, pocAt, opts = {}) {
  const { tol = 0.5, limit = 200 } = opts;
  if (!start || !pocAt) return { chain: [], reachedPoc: false, why: "no POC" };

  /* Which end of the edited pipe faces the POC. Both are tried, and the
     one that gets there wins — a pipe is drawn in whichever direction
     somebody happened to draw it, and that is not a fact about where
     the gas comes from. */
  const attempts = endsOf(start).map((end) => {
    const chain = [];
    const seen = new Set([Number(start.Feature_ID)]);
    let here = end;
    let ambiguous = false;

    for (let i = 0; i < limit; i++) {
      if (near(here, pocAt, tol)) {
        return { chain, reachedPoc: true, ambiguous: false };
      }
      const next = touching(pipes, here, null, tol)
        .filter((p) => !seen.has(Number(p.Feature_ID)));

      if (next.length === 0) break;
      if (next.length > 1) { ambiguous = true; break; }

      const step = next[0];
      seen.add(Number(step.Feature_ID));
      chain.push(step);
      /* Carry on from its far end. */
      const [a, b] = endsOf(step);
      here = near(a, here, tol) ? b : a;
    }
    return { chain, reachedPoc: false, ambiguous };
  });

  const won = attempts.find((x) => x.reachedPoc);
  if (won) return { ...won, why: null };

  /* Neither end reached it. Report the longer attempt, and say why it
     stopped — a chain that ran into a junction is a different problem
     from one that ran into open ground. */
  const best = attempts.sort((a, b) => b.chain.length - a.chain.length)[0]
    ?? { chain: [], ambiguous: false };
  return {
    chain: best.chain,
    reachedPoc: false,
    why: best.ambiguous
      ? "the route back to the POC branches, so which pipe feeds this one "
        + "cannot be told from the drawing"
      : "no continuous run of main leads back to the POC",
  };
}

/* What has to change so nothing upstream is narrower than `bore`.

   Returns one entry per pipe that is too small, with the bore it has
   and the bore it needs. Pipes already that size or larger are absent,
   because there is nothing to do about them. */
export function upstreamTooSmall(pipes = [], start, pocAt, bore, opts = {}) {
  const boreOf = opts.boreOf ?? (() => null);
  const walked = upstreamChain(pipes, start, pocAt, opts);

  const changes = walked.chain
    .map((p) => ({ feature: p, bore: boreOf(p) }))
    .filter((x) => Number.isFinite(x.bore) && x.bore < bore)
    .map((x) => ({ ...x, toBore: bore }));

  return { ...walked, changes };
}
