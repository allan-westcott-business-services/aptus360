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

/* The chain of mains from `start` back to the POC.

   A proper trace, not a walk that gives up at the first junction.

   The first version followed the pipes while each step had exactly one
   way onward and stopped at anything else. That was far too cautious: a
   junction is where a leg comes off, which is most points on a real
   network, so it refused to answer almost every time. And a junction is
   not ambiguous \u2014 one branch leads to the POC and the others lead away
   from it, and finding out which is what a trace is for.

   So it searches the network properly, shortest route first, and the
   route that arrives is the feed. Returned nearest the edited pipe
   first, which is the order somebody reads it in.

   ── What is genuinely ambiguous ──

   Two different routes of the same length, which is a ring: the gas
   arrives both ways and no upstream chain is *the* one. That is
   reported rather than guessed at. A longer second route is not
   ambiguous \u2014 gas takes both, but the short way is what feeds it. */
export function upstreamChain(pipes = [], start, pocAt, opts = {}) {
  const { tol = 0.5 } = opts;
  if (!start || !pocAt) return { chain: [], reachedPoc: false, why: "no POC" };

  const atPoc = (f) => endsOf(f).some((e) => near(e, pocAt, tol));

  /* Breadth first, so the first arrival is the shortest route. Each
     state is a pipe and the end of it the search is leaving from. */
  const queue = endsOf(start).map((end) => ({ pipe: start, from: end, chain: [] }));
  const seen = new Set([Number(start.Feature_ID)]);
  let arrived = null;
  let arrivedAgain = false;

  while (queue.length) {
    const { from, chain } = queue.shift();

    if (near(from, pocAt, tol)) {
      /* The edited pipe touches the POC itself: nothing upstream. */
      if (!arrived) arrived = chain;
      else if (chain.length === arrived.length) arrivedAgain = true;
      continue;
    }

    for (const next of touching(pipes, from, null, tol)) {
      const id = Number(next.Feature_ID);
      if (seen.has(id)) continue;

      const [a, b] = endsOf(next);
      const far = near(a, from, tol) ? b : a;
      const path = [...chain, next];

      if (atPoc(next)) {
        /* Not marked seen: a pipe touching the POC is an arrival, and
           another route reaching it by a different pipe of the same
           length is the ring worth reporting. Marking it would hide
           the second arrival behind the first. */
        if (!arrived) arrived = path;
        else if (path.length === arrived.length
          && Number(arrived[arrived.length - 1]?.Feature_ID) !== id) {
          arrivedAgain = true;
        }
        continue;
      }
      seen.add(id);
      queue.push({ pipe: next, from: far, chain: path });
    }
  }

  if (arrived) {
    return {
      chain: arrived,
      reachedPoc: true,
      /* Said, not refused: the sizing still applies to the route the
         gas actually takes, and a ring is worth knowing about. */
      why: arrivedAgain
        ? "the main forms a ring, so it is fed both ways \u2014 the shorter "
          + "route was used"
        : null,
    };
  }

  return {
    chain: [],
    reachedPoc: false,
    why: "no continuous run of main leads back to the POC",
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
