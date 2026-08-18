/* ── What a plot seed takes with it ──

   A seed is not only a marker. Auto Service draws a service trench from
   the main to the plot boundary, a meter for each utility the plot
   takes, and a cable or pipe along the trench to each of those meters —
   and every one of them is stamped with the seed it was drawn for.

   Deleting the seed left all of it behind. A trench running to a plot
   that is no longer there, meters belonging to nothing, cables teed off
   a main to serve nobody. Worse than untidy: the bill of materials
   still counts the pipe, the dig estimate still counts the trench, and
   Auto Service will not redraw the plot because a trench stamped with
   that seed is how it knows the plot is already done. So the drawing
   quietly carries work nobody will do, and the one command that would
   fix it declines to run.

   ── What is not swept up ──

   Only the three things the seed's own service is made of. Not the
   main it tees into — that serves the whole street. Not the plot
   record behind the seed, which is a row in another table and outlives
   any number of markers: deleting a marker has always meant "unplace
   this plot", and the delete dialog says so.

   Not anything reached only by position, either. A cable that happens
   to end near this plot's meter is not this plot's cable, and guessing
   from geometry is how a delete comes to take a neighbour's service
   with it. The stamp is the link, and where there is no stamp the plot
   is — both written at the moment the thing was drawn.

   ── Why a shared trench still goes ──

   A service trench carrying two plots' cables is stamped with one seed,
   so deleting that seed takes the dig and leaves the other plot's cable
   in mid-air. The alternative is worse: a trench nobody can delete
   because something else once used it. So it goes, and the caller says
   what is going before it does — every path through this asks first,
   with the count in the question. */

import { isTrenchFeature } from "./snapping.js";

/* Which part of a plot's service a feature is, or null for anything
   that is not part of one.

   A meter is a role. A service is a line type reading "service" —
   `elec_service`, `gas_service`, `trench_service` — and whether it is
   the dig or what lies in it is settled by the layer, which is what
   isTrenchFeature asks. Same question the bulk delete asks, so the two
   agree about what a service trench is. */
export function servicePartOf(f, lineTypes = []) {
  if (!f) return null;
  if (f.Feature_Role === "meter") return "meter";
  if (f.Feature_Type !== "line") return null;

  const key = String(f.Attributes?.Line_Type ?? "");
  if (!/service/i.test(key)) return null;

  return isTrenchFeature(f, lineTypes) ? "trench" : "cable";
}

/* Whether a feature was drawn for this seed.

   The stamp wins where there is one. Auto Service writes
   Seed_Feature_ID on everything it draws, and it is exact — a meter
   stamped with a neighbour's seed is the neighbour's, whatever plot
   number it happens to carry.

   Plot_ID is the fallback, for a meter placed through the plot flow
   rather than by Auto Service: that route links by plot and leaves the
   seed stamp empty. Only consulted where the feature has no stamp at
   all, so the two cannot disagree about the same object. */
export function belongsToSeed(f, seed) {
  if (!f || !seed) return false;

  const stamp = f.Attributes?.Seed_Feature_ID;
  if (stamp != null && stamp !== "") {
    return Number(stamp) === Number(seed.Feature_ID);
  }
  return seed.Plot_ID != null && f.Plot_ID != null
    && Number(f.Plot_ID) === Number(seed.Plot_ID);
}

/* Everything that goes with a set of features being deleted.

   Given the ids somebody asked to delete, returns the ids that have to
   go with them and what they are, so the caller can say so before
   asking. Anything already in the list is left out — a seed and its own
   meter both selected is one delete, not a meter counted twice.

   Non-seeds in the list are ignored rather than refused. Deleting a
   mixed selection is ordinary, and the cascade is a fact about the
   seeds in it. */
export function seedCascade(ids = [], features = [], lineTypes = []) {
  const asked = new Set(ids.map(Number));

  const seeds = features.filter((f) =>
    f.Feature_Role === "plot" && asked.has(Number(f.Feature_ID)));

  const out = { meter: [], cable: [], trench: [] };
  if (!seeds.length) return { seeds, ...out, all: [], ids: [], summary: "" };

  const taken = new Set();
  for (const f of features) {
    const id = Number(f.Feature_ID);
    if (asked.has(id) || taken.has(id)) continue;

    const part = servicePartOf(f, lineTypes);
    if (!part) continue;
    if (!seeds.some((s) => belongsToSeed(f, s))) continue;

    out[part].push(f);
    taken.add(id);
  }

  const all = [...out.meter, ...out.cable, ...out.trench];
  return {
    seeds,
    ...out,
    all,
    ids: all.map((f) => f.Feature_ID),
    summary: cascadeSummary(out),
  };
}

/* What is going, in words, for the question that precedes it.

   Counted by kind rather than totalled. "4 other features" is a number
   somebody has to accept on trust; "2 meters, a service cable and a
   service trench" is a list they can check against the drawing in front
   of them — and the one time it says something unexpected is the one
   time it matters. */
export function cascadeSummary(parts = {}) {
  const bits = [
    [parts.meter?.length ?? 0, "meter", "meters"],
    [parts.cable?.length ?? 0, "service cable or pipe", "service cables and pipes"],
    [parts.trench?.length ?? 0, "service trench", "service trenches"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);

  if (!bits.length) return "";
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
}
