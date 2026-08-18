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

/* Which revision of this rule is in the build.

   The files here are copied in one at a time, so "is the fix live?" has
   been an unanswerable question more than once — a half-applied change
   looks exactly like a change that does not work. Printed by
   checkseedlive.mjs and shown in the delete message when nothing is
   found, so the answer is on screen rather than inferred. */
export const CASCADE_REV = 4;
import { SERVED_NEAR_M, METER_CLEARANCE_M, METER_SPACING_M } from "./autoService.js";

/* How far past the seed a meter of its own can sit.

   Auto Service lays them in a column starting METER_CLEARANCE_M beyond
   the seed and stepping METER_SPACING_M each time, so four utilities
   reach 1.5 + 3 × 0.8 = 3.9 m. Rounded up to 4.5 m for a column placed
   by hand or nudged afterwards.

   Only ever used on a meter carrying no link at all. A meter that says
   which plot it belongs to is read, not measured. */
export const METER_REACH_M = 4.5;

/* How close a joint must sit to the end of a cable to be its joint.

   Not as close as it first looks. A service cable begins at the foot of
   the perpendicular from the seed to the *mains trench*, while the
   joint is placed at a node on the *feeder cable* — two different
   features that run together but are not the same line. Half a metre
   assumed they were, and left the joint standing on drawings where
   everything else went.

   1.5 m is the same allowance the trench end uses, and for the same
   reason: it asks whether a fitting belongs to this plot's service, not
   which of two adjacent fittings it is. What keeps a neighbour's joint
   safe is not the radius but the test below — any other service cable
   still on the drawing ending at the same joint keeps it there. */
export const JOINT_NEAR_M = 1.5;

const at = (f) => (f?.Geometry || [])[0] || null;
const gap = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : Infinity);

/* Whether a line ends at a point. Either end, since a service may have
   been drawn from the plot outwards as easily as towards it — the same
   reading meterHasService takes of the same question. */
function endsAt(f, point, near) {
  const g = f?.Geometry || [];
  if (g.length < 2 || !point) return false;
  return gap(g[0], point) <= near || gap(g[g.length - 1], point) <= near;
}

/* Which part of a plot's service a feature is, or null for anything
   that is not part of one.

   A meter is a role. A service is a line type reading "service" —
   `elec_service`, `gas_service`, `trench_service` — and whether it is
   the dig or what lies in it is settled by the layer, which is what
   isTrenchFeature asks. Same question the bulk delete asks, so the two
   agree about what a service trench is. */
/* Which part of a plot's service a feature is, or null for anything
   that is not part of one.

   `stamped` says the feature already carries this seed's mark. That
   settles *whether* it goes; this only has to say what to call it.
   Seed_Feature_ID is written in four places, all of them Auto Service
   drawing a service, and nowhere on the server — so a stamped feature
   is part of a service whatever else is or is not filled in on it.

   That distinction matters because the type can be missing. A generated
   cable takes its Line_Type from a lookup that returns null when no
   service type is configured for the layer, and the code that writes it
   says as much: get it wrong and "every generated cable" is left with
   an unrecognised type. Those cables are still cables. Read strictly,
   the rule below would call them nothing at all and leave them on the
   drawing — which is the failure this is written to avoid. */
export function servicePartOf(f, lineTypes = [], stamped = false) {
  if (!f) return null;
  if (f.Feature_Role === "meter") return "meter";

  /* A service joint: the fitting on the main where this plot's cable
     leaves it.

     Only one typed "service". A joint holds every reason it exists for,
     and the largest wins the type — so a breech that also takes a
     service off it is typed "breech", and a bottle end that does the
     same is typed "bottleend". Those stay: the feeder still divides, or
     still ends, once this plot has gone. A joint typed "service" has no
     other reason to be there, which is exactly the one to remove.

     Not the lighting ones. A column's service joint is typed the same
     way but feeds a lamp, not a plot, and it carries For_Lighting to
     say so. */
  if (f.Feature_Role === "joint") {
    if (f.Attributes?.For_Lighting) return null;
    const kind = String(f.Attributes?.Joint_Type ?? "").toLowerCase();
    const code = String(f.Attributes?.Joint_Code ?? "").toUpperCase();
    return (kind === "service" || code === "SVC") ? "joint" : null;
  }

  if (f.Feature_Type !== "line") return stamped ? "cable" : null;

  const key = String(f.Attributes?.Line_Type ?? "");
  if (!key && stamped) {
    /* No type at all, but stamped. The layer is the only thing left to
       read, and it is enough: the trench layer is the dig, anything
       else is what was laid in it. */
    return f.Layer_Key === "trench" ? "trench" : "cable";
  }
  if (!/service/i.test(key)) {
    if (!stamped) return null;
    return isTrenchFeature(f, lineTypes) ? "trench" : "cable";
  }

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
   seeds in it.

   ── Found in two passes, because half of it carries no label ──

   The first pass reads the links: the stamp Auto Service writes, or the
   plot number. That finds everything the application drew itself.

   It finds nothing at all on work drawn by hand, which is most of what
   is actually on an older drawing — and a rule that only tidies up
   after itself leaves exactly the mess somebody has been living with.
   This is the same lesson isServed learned: a trench dug to a meter by
   somebody who then ran Auto Service got a second trench laid over the
   first, because the stamp was the only thing being read.

   So the second pass goes by position, through the meters. A service
   trench ending at this plot's meter is this plot's dig whoever drew
   it, and a cable ending there is its cable. The meters are the anchor
   because they are the one part that is nearly always linked — and
   where even they are not, one sitting in the column just beyond the
   seed and belonging to no plot at all is taken as this plot's.

   Position is only ever a fallback. Anything that says who it belongs
   to is believed, so a neighbour's stamped trench is never claimed by
   proximity. */
export function seedCascade(ids = [], features = [], lineTypes = []) {
  const asked = new Set(ids.map(Number));

  const seeds = features.filter((f) =>
    f.Feature_Role === "plot" && asked.has(Number(f.Feature_ID)));

  const out = { meter: [], cable: [], trench: [], joint: [] };
  if (!seeds.length) return { seeds, ...out, all: [], ids: [], summary: "" };

  const seedIds = new Set(seeds.map((s) => Number(s.Feature_ID)));

  /* Whether a feature already carries one of these seeds' marks. Asked
     before the kind is decided, because the mark is what allows a
     feature with no usable type to be recognised at all. */
  const isStamped = (f) => {
    const stamp = f.Attributes?.Seed_Feature_ID;
    return stamp != null && stamp !== "" && seedIds.has(Number(stamp));
  };

  const parts = features
    .map((f) => ({ f, stamped: isStamped(f), part: servicePartOf(f, lineTypes, isStamped(f)) }))
    .filter((x) => x.part);

  /* Whether something is spoken for elsewhere: stamped with a seed that
     is not going, or carrying a different plot number. Those are never
     taken by position — the drawing has said whose they are. */
  const claimedElsewhere = (f) => {
    const stamp = f.Attributes?.Seed_Feature_ID;
    if (stamp != null && stamp !== "") return !seedIds.has(Number(stamp));
    if (f.Plot_ID != null) {
      return !seeds.some((s) => Number(s.Plot_ID) === Number(f.Plot_ID));
    }
    return false;
  };

  /* Pass one: the meters, by link, then by position for a meter that
     names no owner at all. */
  const meters = parts.filter((x) => x.part === "meter");
  const mine = new Set(meters
    .filter((x) => seeds.some((s) => belongsToSeed(x.f, s)))
    .map((x) => x.f));

  for (const { f } of meters) {
    if (mine.has(f) || claimedElsewhere(f)) continue;
    const p = at(f);
    if (seeds.some((s) => gap(p, at(s)) <= METER_REACH_M)) mine.add(f);
  }

  /* Pass two: the dig and what lies in it. Linked, or ending at one of
     the meters found above.

     SERVED_NEAR_M is too tight here. That figure exists to tell two
     meters 0.8 m apart from one another; this asks whether a trench
     runs to this plot at all, where landing on the meter beside the
     right one is still the right plot. isServed makes the same
     distinction, with the same two numbers. */
  const REACH = 1.5;
  const meterPts = [...mine].map(at).filter(Boolean);
  const seedPts = seeds.map(at).filter(Boolean);

  const takes = (f) => {
    if (seeds.some((s) => belongsToSeed(f, s))) return true;
    if (claimedElsewhere(f)) return false;
    return meterPts.some((p) => endsAt(f, p, REACH))
      || seedPts.some((p) => endsAt(f, p, REACH));
  };

  const taken = new Set();
  for (const { f, part } of parts) {
    const id = Number(f.Feature_ID);
    if (asked.has(id) || taken.has(id)) continue;
    if (part === "joint") continue;                 // decided below
    if (part === "meter" ? !mine.has(f) : !takes(f)) continue;

    out[part].push(f);
    taken.add(id);
  }

  /* Pass three: the joint on the main where this plot's cable leaves
     it.

     Found from the cables rather than from the seed. A service joint
     sits at the tee — the far end of the run from the meter, often
     tens of metres from the plot it feeds — so distance to the seed
     says nothing about which plot it serves. The end of a cable that is
     already going is the one thing that does.

     A joint feeding more than one plot stays. Two services leaving the
     same fitting is ordinary on a terrace, and removing it because one
     of them has gone would cut the other off at the main. `Services` is
     the count the joint placer recorded; where it is absent the cables
     still on the drawing are counted instead, so a joint written before
     that attribute existed is still judged on what it actually feeds. */
  /* The dig counts as well as the cable. Both start at the same tee, and
     on a drawing where the cable's own start has drifted the trench end
     is often the truer of the two. */
  const goingRuns = [...out.cable, ...out.trench];
  const stillHere = parts.filter((x) => x.part === "cable" && !taken.has(Number(x.f.Feature_ID)));

  /* What the dig and its cables say they touch.

     Every service trench and cable is written with a Connects list —
     the ids of the features its ends actually meet, at the 0.25 m the
     drawing treats as joined rather than merely near. Where the joint
     is in that list there is nothing to measure: the trench has already
     recorded what it is connected to, which is the question being
     asked.

     Only ever additional. The list is written when the run is drawn, so
     a joint placed afterwards is not in it and the measurement below is
     what finds that one. Neither alone covers both cases. */
  const connected = new Set();
  for (const r of goingRuns) {
    for (const cid of (r.Attributes?.Connects || [])) connected.add(Number(cid));
  }

  for (const { f } of parts.filter((x) => x.part === "joint")) {
    const id = Number(f.Feature_ID);
    if (asked.has(id) || taken.has(id)) continue;

    const p = at(f);
    if (!p) continue;
    if (!connected.has(id) && !goingRuns.some((c) => endsAt(c, p, JOINT_NEAR_M))) continue;

    /* Anything else still teeing in here keeps it. This is what makes
       the radius above safe: a joint a neighbour is still using is held
       by the neighbour's own cable, however loose the measurement. */
    if (stillHere.some((x) => endsAt(x.f, p, JOINT_NEAR_M)
      || (x.f.Attributes?.Connects || []).some((cid) => Number(cid) === id))) continue;

    /* And the count the joint placer recorded, where it disagrees with
       what is actually leaving. Compared against the cables going, not
       the trenches — a dig is not a service off a fitting. */
    const leaving = out.cable.filter((c) => endsAt(c, p, JOINT_NEAR_M)
      || (c.Attributes?.Connects || []).some((cid) => Number(cid) === id)).length;
    const recorded = Number(f.Attributes?.Services);
    if (Number.isFinite(recorded) && recorded > Math.max(leaving, 1)) continue;

    out.joint.push(f);
    taken.add(id);
  }

  const all = [...out.meter, ...out.cable, ...out.trench, ...out.joint];
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
    [parts.joint?.length ?? 0, "service joint", "service joints"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);

  if (!bits.length) return "";
  if (bits.length === 1) return bits[0];
  return `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}`;
}
