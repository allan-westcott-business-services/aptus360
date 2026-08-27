/* Where the joints go on an LV feeder, and what kind each one is.

   Three causes, and they are three different things happening at a
   point:

     breech   — the feeder divides and carries on in two directions
     service  — a service cable leaves the feeder for a plot
     straight — the run continues as one, but the cable changes: either
                the designer has specified a different size beyond this
                point, or the cumulative customer count has crossed
                another cable's worth and a new length starts here
     bottle   — the feeder stops: nothing is fed beyond this point, so
                the cable is sealed off here

   Worked out from the routed network rather than from where line ends
   happen to coincide. The existing gis_place_joints groups coincident
   endpoints across every line in the drawing, which cannot tell a feeder
   from a water main, cannot tell a service from a spur, and knows
   nothing about cable counts — so it reports "tee" or "straight" on
   geometry alone. The information needed to classify properly is in the
   feeder model, which is where this lives.

   Same definitions as the router, deliberately. A joint sits where a run
   divides, and feederSections decides where a run divides; two
   implementations of that would drift, and the drawing would show a
   breech joint where the cable schedule shows none. */

import {
  buildFeederModel, circuitMembership, cablesFor, METERS_PER_CABLE, digEndBeyond,
} from "./feeder.js";

/* What each kind is called, and its code from the Electric_Joint
   catalogue. Kept here rather than looked up by name at the point of
   use: a lookup renamed in Admin should change the label on screen, not
   silently stop matching and leave joints unclassified. */
export const JOINT_KINDS = {
  bottleend: { code: "BTL", label: "Bottle End" },
  breech: { code: "BRE", label: "Breech Joint" },
  service: { code: "SVC", label: "Service Joint" },
  straight: { code: "STR", label: "Straight Joint" },
};

/* Which way a bottle end faces, as an angle for ctx.rotate.

   The stem carries on the way the cable was going and the bars close it
   off, so unlike every other joint this symbol has a front and a back.
   Pointing it the wrong way lays the seal back along its own cable,
   between the joint and the substation.

   ── The direction ──

   Taken from the run's own end, not from the segment under the point:
   the last vertex minus the one before it, which is where the cable was
   heading when it stopped. Whichever end of the run is nearer the joint
   is the end it seals — a line's stored direction says only which way
   somebody drew it, and a feeder joined from two drawn pieces can hold
   either.

   ── The sign ──

   Not negated, and this is the whole of the bug the drawing had. The
   canvas and the drawing share an axis convention: toPx is

       x = m[0] * scale + view.x
       y = m[1] * scale + view.y

   with no flip, so a vector's angle in metres is already its angle in
   pixels, and atan2(vy, vx) is what ctx.rotate wants. Negating it
   reflects the symbol about the horizontal, which for a run heading
   north-east draws the seal to the south-east instead.

   Kept here rather than in the canvas so it can be tested against a
   known cable. It is geometry, not drawing. */
export function bottleEndAngle(joint, features = [], opts = {}) {
  const { reach = 10 } = opts;
  const at = (joint?.Geometry || [])[0];
  if (!at) return null;

  let best = null;
  for (const f of features) {
    if (f.Feature_Type !== "line") continue;
    if (f.Layer_Key !== joint.Layer_Key) continue;
    if (f.Attributes?.Line_Type !== "elec_main") continue;
    const g = f.Geometry || [];
    if (g.length < 2) continue;

    const dA = Math.hypot(g[0][0] - at[0], g[0][1] - at[1]);
    const dZ = Math.hypot(g[g.length - 1][0] - at[0], g[g.length - 1][1] - at[1]);
    const atStart = dA <= dZ;
    const d = atStart ? dA : dZ;
    if (d > reach) continue;

    const tip = atStart ? g[0] : g[g.length - 1];
    const prev = atStart ? g[1] : g[g.length - 2];
    const vx = tip[0] - prev[0];
    const vy = tip[1] - prev[1];
    if (!vx && !vy) continue;
    if (!best || d < best.d) best = { d, vx, vy };
  }

  if (!best) return null;
  const along = Math.atan2(best.vy, best.vx);

  /* A quarter turn for a temporary one, so the cable reads as running
     past it rather than terminating in it. The seal is across the
     cable's line instead of along it, which is the difference somebody
     sees at a glance without being told. */
  return isTemporaryBottleEnd(joint) ? along + Math.PI / 2 : along;
}

/* Whether a joint is a bottle end.

   In joints.js rather than in the canvas because three places ask it —
   the drawing, the editor and the placement buttons — and a test on
   Attributes.Joint_Type written out three times is three chances to
   compare against the label instead of the key, or to forget the role. */
export function isBottleEnd(feature) {
  return feature?.Feature_Role === "joint"
    && String(feature?.Attributes?.Joint_Type ?? "") === "bottleend";
}

/* ── Two kinds of bottle end ──

   The design one is where the feeder genuinely ends: nothing is fed
   beyond it and nothing ever will be. planJoints works those out from
   the network and owns them.

   The temporary one is where the *programme* stops. The cable is sealed
   five metres past the last plot a call-off connects, because the plots
   beyond it are not being built yet — the design says the feeder
   carries on, and one day a straight joint will be made here and it
   will.

   Told apart by rotation rather than by a symbol of its own: a quarter
   turn from the cable it sits on, so the planned cable reads as
   continuing past it rather than stopping at it. Somebody who knows the
   symbol needs no key to see which is which.

   Written by the call-off that caused it, so it can be taken away again
   if that call-off is cancelled — which is the whole reason it is not a
   design joint. */
export function isTemporaryBottleEnd(feature) {
  return isBottleEnd(feature) && feature?.Attributes?.Temporary === true;
}

/* Which call-off put it there, or null for a design joint. */
export const bottleEndSubmission = (feature) =>
  (isTemporaryBottleEnd(feature)
    ? (feature.Attributes?.Submission_ID ?? null)
    : null);

/* Whether a joint is of a given kind.

   Beside isBottleEnd and for its reason: a test on Attributes.Joint_Type
   written out where it is wanted is a chance to compare against the
   label rather than the key.

   The code as well as the kind, because a joint placed from the
   catalogue carries Joint_Code and one placed from the menu carries
   Joint_Type, and both are the same fitting. Cased both ways for the
   same reason \u2014 the two routes have never agreed on it, and a delete
   that missed half the joints because one wrote "Service" and the other
   wrote "service" would look like the filter not working.

   One function rather than four. isBreechJoint was the only kind that
   needed asking about; the bulk delete now asks about all of them, and
   four near-identical predicates is three chances for one of them to
   drift. */
export function isJointOfKind(feature, kind) {
  if (feature?.Feature_Role !== "joint") return false;
  const want = JOINT_KINDS[kind];
  if (!want) return false;

  const type = String(feature?.Attributes?.Joint_Type ?? "").toLowerCase();
  const code = String(feature?.Attributes?.Joint_Code ?? "").toUpperCase();
  return type === kind || code === want.code;
}

export function isBreechJoint(feature) {
  return isJointOfKind(feature, "breech");
}

/* Which wins where more than one cause meets at a point.

   A feeder can divide at the same place a service leaves it, and the
   ground holds one joint however many reasons there are for it. The
   larger item wins: a breech joint can take a service off it, and a
   straight joint cannot do the work of a breech.

   Every reason is recorded on the feature regardless, so the drawing can
   say a breech joint is also serving a plot rather than losing that.

   ── Why a bottle end outranks everything ──

   It can only ever meet one other reason. A breech needs two loaded ways
   onward and a straight needs one; the end of a run has none, so neither
   can occur there. The only thing that can share the point is a service,
   and in practice one always does — the load that makes the node part of
   the feeder at all arrives through it.

   So the choice at a terminal is not "which of several", it is "service
   or bottle end", and the cable stopping is the larger fact about the
   fitting that goes in the ground. The service is still recorded in
   reasons, so the drawing can say a bottle end also serves a plot. */
const PRIORITY = ["bottleend", "breech", "straight", "service"];
const rank = (kind) => PRIORITY.indexOf(kind);

/* Reasons are not the same as kinds: a drum running out produces a
   straight joint, and saying so on the feature is more use than the word
   "straight" alone when someone asks why it is there. */
export const REASON_TEXT = {
  bottleend: "the feeder ends here, with nothing fed beyond it",
  breech: "the feeder divides here",
  service: "a service leaves the feeder here",
  straight: "the cable changes here",
  drum: "the previous drum ends here",
};

const key = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/* Every joint one circuit needs, before duplicates across circuits are
   resolved. */
function jointsForCircuit(features, circuit, opts) {
  const {
    lineTypes = [], plotById = () => null, perCable = METERS_PER_CABLE,
    /* A non-residential supply's load is on its own record. Without it
       the supply attaches to the network carrying nothing, and a node
       with no load beyond it is not part of the feeder — so the service
       joint at its take-off was never planned and the bottle end sealed
       the run at the last dwelling instead, mid-cable. */
    nrsById = () => null,
  } = opts;

  /* Both kinds, from the one walk spanTrace uses. This asked for seeds
     only, so every supply on the circuit was pruned out of the model. */
  const { seedIds, meterIds } = circuitMembership(features, circuit.id);
  if (!seedIds.size && !meterIds.size) return [];

  const M = buildFeederModel(features, {
    lineTypes, plotById, nrsById, seedIds, meterIds });
  if (M.error) return [];

  /* ── Meters the network could not find ──

     A meter attaches where its plot meets the trench. One that lands
     more than the snap tolerance from any node attaches nowhere, so the
     load beyond its service spur is zero — and a spur with no load
     beyond it is not part of the feeder. No take-off, so no service
     joint, and nothing said.

     That is why missing service joints look random: it depends on how
     close each seed happens to be to the dig, which varies plot by plot
     and has nothing to do with the joint rules.

     The model has named them since it was written. Nothing read the
     list. Carried out here so the command can say which plots to go and
     look at, rather than leaving somebody to find a pattern in it. */
  if (M.skipped?.length && Array.isArray(opts.missed)) {
    for (const m of M.skipped) opts.missed.push({ ...m, circuit: circuit.id });
  }
  const { nodes, parent, parSvc, cum, S } = M;

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  const kidsOf = (u) => children.get(u) || [];
  const mainsChildren = (u) => kidsOf(u).filter((c) => !parSvc[c]);
  /* Only the branches this circuit draws load through — the graph is the
     whole trench network and every circuit sees every fork in it. */
  const loadChildren = (u) => mainsChildren(u).filter((c) => cum[c] > 0);
  /* A service spur that actually feeds something. A spur drawn to a plot
     on another circuit is not this circuit's joint. */
  const serviceChildren = (u) => kidsOf(u).filter((c) => parSvc[c] && cum[c] > 0);

  /* ── A take-off is where a service leaves the MAIN ──

     Not any node with a service running on from it. A spur is often
     several features — splitByBoundary cuts one where it crosses the
     site boundary, and a service teed off a main in the road is always
     cut that way. Every cut leaves a vertex, and therefore a node, and
     that node has a service child carrying load exactly as the take-off
     does.

     So a joint was planned at the boundary of every split spur: a
     second service joint a few metres down the garden, on a length of
     cable with no joint in it. One per service cable is the rule; that
     made two.

     `parSvc[u]` is the whole test. It says the way INTO this node is
     itself a service, which is true of every point along a spur and
     false at the main it comes off. */
  const isTakeOff = (u) => !parSvc[u] && serviceChildren(u).length > 0;

  const out = [];
  for (let u = 0; u < nodes.length; u++) {
    /* Nothing is jointed at the substation: the run starts there. */
    if (u === S) continue;
    if (cum[u] <= 0) continue;

    const reasons = [];
    const loaded = loadChildren(u);

    if (loaded.length > 1) reasons.push("breech");

    /* The end of the run.

       No loaded way onward, on a node the feeder does reach: the cable
       stops here and has to be sealed. Read from the loaded ways rather
       than from the drawn ends, because the graph is the whole trench
       network and most of its ends are trenches this circuit never
       feeds — testing geometry would put a bottle end on every stub in
       the site.

       `!parSvc[u]` is the other half, and it is not optional. A service
       spur ends at the plot it serves, and that end satisfies every
       other condition here: the circuit reaches it, it carries load, and
       nothing is fed beyond it. Without this test a bottle end appeared
       at every plot connection on the drawing — more of them than there
       were feeders, each one on a cable that ends in a cut-out rather
       than a seal.

       `cum[u] > 0` above is what keeps the rest honest. A node the
       circuit carries no load through is not part of this feeder, so its
       being an end says nothing about where this cable stops. */
    if (!loaded.length && !parSvc[u]) reasons.push("bottleend");

    if (loaded.length === 1) {
      const next = loaded[0];
      /* A new cable starts when the customer count beyond this point
         needs one more than the count arriving at it — the same rule
         that ends a section in feederSections.

         A change of specified size is the other reason for a straight
         joint, and it is not visible here: the model carries the shape
         of the network and its loads, not which cable anyone chose. That
         is read from the drawn sections instead, in sizeChangeJoints
         below. */
      const countChanged = cablesFor(cum[next], perCable) !== cablesFor(cum[u], perCable);
      if (countChanged) reasons.push("straight");
    }

    if (isTakeOff(u)) reasons.push("service");

    if (!reasons.length) continue;

    /* ── The seal goes where the dig ends ──

       A run stops carrying at the last plot, so this loop finds the end
       of the cable at that take-off — and put the bottle end there, on
       the same point as the service joint serving that plot.

       The designer lays the main two or three metres past the last
       plot. The cable follows it (see spanTrace), and the seal belongs
       at its end, not back at the last cut-out. The same walk answers
       both, so the cable's end and its bottle end cannot land in
       different places.

       Only the bottle end moves. The service joint at this node serves
       the plot HERE and stays, which is what separates the pair that
       used to sit on top of one another.

       Where the main was not laid past the last plot the walk returns
       this node, the seal stays put, and the drawing goes on saying
       what it always said about a main that stops dead. */
    let sealAt = nodes[u];
    if (reasons.includes("bottleend")) {
      const on = digEndBeyond(M, u);
      if (on.points.length) sealAt = on.points[on.points.length - 1];
    }

    const here = reasons.filter((r) => r !== "bottleend" || sealAt === nodes[u]);

    if (here.length) {
      const kind = here.slice().sort((a, b) => rank(a) - rank(b))[0];
      out.push({
        point: nodes[u],
        kind,
        reasons: here,
        circuitId: circuit.id,
        circuitName: circuit.name,
        ways: loaded.length + serviceChildren(u).length,
        services: serviceChildren(u).length,
        meters: cum[u] || 0,
      });
    }

    /* Moved down the run, so it is its own joint at its own point. */
    if (sealAt !== nodes[u]) {
      out.push({
        point: sealAt,
        kind: "bottleend",
        reasons: ["bottleend"],
        circuitId: circuit.id,
        circuitName: circuit.name,
        /* One way in and nothing off it \u2014 which is what a seal is. The
           ways and services at the take-off belong to the take-off. */
        ways: 1,
        services: 0,
        meters: cum[u] || 0,
      });
    }
  }
  return out;
}

/* Straight joints where one drawn run meets another of a different
   cable.

   Read from the sections rather than from the model, because the model
   knows the network and its loads and nothing about which cable was
   specified — that lives on the feature. Two runs of the same circuit
   meeting end to end with different sizes need a joint between them, and
   the count-based rule above will not find it: a size changed by hand
   leaves the customer count exactly as it was.

   Only where both sizes are known. A run with none set is not a change
   of cable, it is a run nobody has specified yet. */
export function sizeChangeJoints(features = [], tolM = 0.25) {
  const runs = features.filter((f) =>
    f.Feature_Type === "line"
    && f.Layer_Key === "electric"
    && f.Attributes?.Line_Type === "elec_main"
    && f.Attributes?.Circuit_ID != null
    && f.Attributes?.VD_Cable_Size_ID != null
    && (f.Geometry || []).length >= 2);

  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolM;
  const out = [];

  for (let i = 0; i < runs.length; i++) {
    for (let j = i + 1; j < runs.length; j++) {
      const a = runs[i];
      const b = runs[j];
      if (String(a.Attributes.Circuit_ID) !== String(b.Attributes.Circuit_ID)) continue;
      if (String(a.Attributes.VD_Cable_Size_ID) === String(b.Attributes.VD_Cable_Size_ID)) continue;

      const ae = [a.Geometry[0], a.Geometry[a.Geometry.length - 1]];
      const be = [b.Geometry[0], b.Geometry[b.Geometry.length - 1]];
      const meet = ae.find((p) => be.some((q) => near(p, q)));
      if (!meet) continue;

      out.push({
        point: meet,
        kind: "straight",
        reasons: ["straight"],
        circuitId: a.Attributes.Circuit_ID,
        circuitName: a.Attributes.Circuit_Name ?? null,
        ways: 2,
        services: 0,
        meters: 0,
        sizes: [a.Attributes.VD_Cable_Size_ID, b.Attributes.VD_Cable_Size_ID],
      });
    }
  }
  return out;
}

/* Where a drum runs out.

   Cable is delivered in drums of a set length, so a run longer than a
   drum has to be jointed part way along it — not at anything the network
   does, but at the point the previous length ended. A 700 m run on 500 m
   drums needs a straight joint at 500 m even though nothing forks,
   nothing tees, and the cable does not change.

   Distinct from the customer-count rule above, which is about how many
   properties one cable serves. Both produce straight joints and they
   fire at different places for different reasons.

   Measured from the start of each drawn run rather than from the
   substation: every run already begins at a joint or at the substation,
   so a fresh drum starts there. Carrying a part-used drum through a
   joint would be a jointing decision, not a drawing one.

   Only where a drum length is recorded against the cable. A size with
   none is not a size with an infinite drum — it is one nobody has
   entered a figure for, and inventing one would put joints on the
   drawing that no schedule justifies. */
export function drumJoints(features = [], cableById = () => null) {
  const runs = features.filter((f) =>
    f.Feature_Type === "line"
    && f.Layer_Key === "electric"
    && f.Attributes?.Line_Type === "elec_main"
    && (f.Geometry || []).length >= 2);

  const out = [];
  for (const run of runs) {
    const cable = cableById(run.Attributes?.VD_Cable_Size_ID);
    const drum = Number(cable?.Drum_Length_m);
    if (!Number.isFinite(drum) || drum <= 0) continue;

    const g = run.Geometry;
    let total = 0;
    for (let i = 1; i < g.length; i++) {
      total += Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
    }
    if (total <= drum) continue;

    /* A joint at each drum boundary. The last one is skipped when it
       lands within a metre of the far end: a joint and a termination in
       the same place is one item, and the run already ends at a joint. */
    for (let d = drum; d < total - 1; d += drum) {
      const p = pointAlong(g, d);
      if (!p) continue;
      out.push({
        point: p,
        kind: "straight",
        reasons: ["drum"],
        circuitId: run.Attributes?.Circuit_ID ?? null,
        circuitName: run.Attributes?.Circuit_Name ?? null,
        ways: 2,
        services: 0,
        meters: 0,
        atM: Math.round(d * 10) / 10,
        drumM: drum,
      });
    }
  }
  return out;
}

/* A point a given distance along a polyline. */
export function pointAlong(g = [], target) {
  if (g.length < 2 || !(target > 0)) return null;
  let acc = 0;
  for (let i = 1; i < g.length; i++) {
    const a = g[i - 1];
    const b = g[i];
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg <= 0) continue;
    if (acc + seg >= target) {
      const t = (target - acc) / seg;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    acc += seg;
  }
  return null;
}

/* Every joint the drawing needs, across every circuit.

   Keyed by circuit and position, not position alone.

   An earlier version merged on position, on the reasoning that two
   circuits sharing a trench meet at the same coordinates and the ground
   holds one joint. That is wrong: two circuits are separate networks
   taking separate ways off the substation, and a joint that served both
   would connect them. Where their cables pass the same point they each
   need their own joint.

   It also miscounted. Merging two circuits' service joints into one and
   taking the greater service count left a drawing with 72 services and
   70 joints, each claiming to serve one — which is how the miscount was
   found.

   Within one circuit the merge is still right and still happens: a fork
   that is also a cable change is one joint with two reasons. */
export function planJoints(features = [], circuits = [], opts = {}) {
  const found = new Map();

  /* Filled by jointsForCircuit as it goes. An array on the options
     rather than a second return value, because planJoints returns a
     list of joints to twelve call sites and changing its shape to carry
     a warning would be a change to all of them for the sake of one. */
  const missed = opts.missed ?? [];
  const withMissed = { ...opts, missed };

  const all = [
    ...circuits.flatMap((c) => jointsForCircuit(features, c, withMissed)
      .map((j) => ({ ...j, _circuit: c.id }))),
    ...sizeChangeJoints(features, opts.tolM ?? 0.25)
      .map((j) => ({ ...j, _circuit: j.circuitId })),
    ...drumJoints(features, opts.cableById ?? (() => null))
      .map((j) => ({ ...j, _circuit: j.circuitId })),
  ];

  for (const j of all) {
    const k = `${j._circuit ?? "none"}@${key(j.point)}`;
    const prev = found.get(k);
    if (!prev) { found.set(k, { ...j, circuitId: j._circuit ?? null }); continue; }
    prev.reasons = [...new Set([...prev.reasons, ...j.reasons])];
    prev.ways = Math.max(prev.ways, j.ways);
    prev.services = Math.max(prev.services, j.services);
    /* The stronger reason wins the type; the weaker one is kept in
       reasons so the drawing can still say a breech is also serving a
       plot. */
    if (rank(j.kind) < rank(prev.kind)) prev.kind = j.kind;
  }
  /* ── A bottle end cannot take a service off it ──

     The merge above keeps the strongest reason and files the rest under
     `reasons`, on the argument that the larger fitting does the smaller
     one's job: a breech joint can take a service off it, so a fork that
     also serves a plot is one breech.

     That does not extend to a bottle end. A bottle end seals the end of
     a cable; it is a termination, not a tee, and nothing comes off it.
     Where a service leaves the point a run ends, the site needs both
     fittings \u2014 and the merge issued one, so the service joint was
     missing from the drawing and from the take-off, one per plot at the
     end of every run.

     Split rather than re-ranked: making service beat bottleend would
     lose the bottle end instead, which is the same fault the other way
     round. Two fittings at one point, because two fittings is what gets
     fitted.

     reconcileJoints matches on position AND circuit and will not match
     one existing joint twice, so the second plan at a point is added
     rather than swallowed. */
  const out = [];
  for (const { _circuit, ...j } of found.values()) {
    const both = j.reasons?.includes("bottleend") && j.reasons?.includes("service");
    if (!both) { out.push(j); continue; }

    /* The bottle end keeps the other reasons \u2014 a fork that also ends a
       run is still one breech plus this \u2014 and the service joint carries
       only its own, so nothing reads either as doing two jobs. */
    out.push({ ...j, kind: "bottleend",
      reasons: j.reasons.filter((r) => r !== "service") });
    out.push({ ...j, kind: "service", reasons: ["service"] });
  }

  /* ── The bottle end goes at the end of the tail ──

     A run stops at the service joint serving the last plot. The gang
     digs a little further, lays a short tail and buries the bottle end
     in it, because a bottle end has to sit in trench like everything
     else. feederSections draws that tail and the build records its
     length on the cable as `Tail_M`.

     ── Why this is a move and not a suppression ──

     The obvious build was to place the bottle end from the canvas at
     the tail end and stop this planning one at the take-off. That needs
     a condition — "only where a tail was drawn" — and getting it wrong
     puts two bottle ends on every leg, or none.

     There is no condition here. The bottle end is planned where it
     always was, at the node ending the run, and then moved to the end
     of the cable that carries a tail. One before, one after. A drawing
     with no tail has nothing to move it to and is untouched, which is
     what a setting of 0 produces and what every drawing made before
     this looks like.

     The service joint does not move. It belongs at the take-off, which
     is where the service leaves.

     Matched on the cable's second-to-last vertex, not its last: the
     take-off is where the tail STARTS, and the bottle end is going to
     where it ends. A cable claiming a tail whose last vertex is already
     the take-off therefore moves nothing, which is the right answer for
     a run that was never extended. */
  const tails = features.filter((f) => f.Feature_Type === "line"
    && f.Layer_Key === "electric"
    && Number(f.Attributes?.Tail_M) > 0
    && (f.Geometry || []).length >= 3);

  if (tails.length) {
    for (const j of out) {
      if (j.kind !== "bottleend") continue;
      for (const t of tails) {
        const g = t.Geometry;
        const from = g[g.length - 2];
        const to = g[g.length - 1];
        if (Math.hypot(from[0] - j.point[0], from[1] - j.point[1]) > 0.25) continue;
        /* Same circuit, so a tail on one circuit cannot move another's
           bottle end where two runs end at one point. */
        const c = t.Attributes?.Circuit_ID;
        if (c != null && j.circuitId != null
          && Number(c) !== Number(j.circuitId)) continue;
        j.point = to.slice();
        j.onTail = true;
        break;
      }
    }
  }

  return out;
}

/* What is already on the drawing, so a second run adds nothing and
   changes nothing that is still right.

   Matched on position rather than on identity, because a joint placed by
   hand has no link to the run it sits on. The tolerance is the drawing's
   own joining tolerance: two points closer than that are the same place
   as far as the network is concerned. */
export function reconcileJoints(planned = [], existing = [], tolM = 0.25) {
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolM;

  const add = [];
  const update = [];
  const matched = new Set();

  for (const p of planned) {
    /* Matched on circuit as well as position. Two circuits passing the
       same point need a joint each, and matching on position alone let
       the second find the first, update it, and leave the drawing one
       joint short. */
    const here = (e) =>
      (e.Geometry || [])[0]
      && near(e.Geometry[0], p.point)
      && String(e.Attributes?.Circuit_ID ?? "") === String(p.circuitId ?? "")
      && !matched.has(e.Feature_ID);

    /* Its own kind first, then any unmatched joint at the point.

       Two fittings can share a point \u2014 a bottle end and the service
       joint beside it \u2014 and matching on position alone let the bottle
       end plan claim the service feature and rewrite it, while the
       service plan claimed the bottle end and rewrote that. The pair
       swapped types on every run and neither was ever settled. */
    const hit = existing.find((e) =>
      here(e) && String(e.Attributes?.Joint_Type ?? "") === p.kind)
      || existing.find(here);
    if (!hit) { add.push(p); continue; }
    matched.add(hit.Feature_ID);
    /* Already the right kind: leave it entirely alone rather than
       rewriting a row to the same value. */
    if (String(hit.Attributes?.Joint_Type ?? "") === p.kind) continue;
    update.push({ feature: hit, plan: p });
  }

  /* Joints the network no longer calls for — a fork that has been
     rerouted away, a service deleted. Reported rather than removed:
     one may have been placed deliberately, and deleting someone's work
     because the router disagrees is not this function's decision. */
  const stale = existing.filter((e) => !matched.has(e.Feature_ID));

  return { add, update, stale };
}

/* Which plots a joint serves.

   A joint records how many services leave the feeder at its point but
   not which — so the only link back to a plot is position: a service
   cable with an end at the joint is a service that joint makes.

   Resolved by every route the drawing uses, because a service cable
   names its plot in more than one way depending on what drew it: its own
   Plot_ID, or the seed it was drawn for. Following only one of them left
   half the cables unattributed, which is the same fault that made
   circuit isolation miss them. */
export function servedPlots(joint, features = [], opts = {}) {
  const { tolM = 0.25, plotById = () => null } = opts;
  const at = (joint?.Geometry || [])[0];
  if (!at) return [];

  /* Seed feature id to plot id, for cables that name a seed rather than
     a plot. */
  const seedToPlot = new Map();
  for (const f of features) {
    if (f.Feature_Role === "plot" && f.Plot_ID != null) {
      seedToPlot.set(String(f.Feature_ID), f.Plot_ID);
    }
  }

  const near = (p) => p && Math.hypot(p[0] - at[0], p[1] - at[1]) <= tolM;

  const ids = new Set();
  for (const f of features) {
    if (f.Feature_Type !== "line" || f.Layer_Key !== "electric") continue;
    if (!String(f.Attributes?.Line_Type || "").endsWith("_service")) continue;

    const g = f.Geometry || [];
    if (g.length < 2) continue;
    /* Either end: a service is drawn from the main to the meter, but a
       redrawn one can run the other way. */
    if (!near(g[0]) && !near(g[g.length - 1])) continue;

    const pid = f.Plot_ID
      ?? (f.Attributes?.Seed_Feature_ID != null
        ? seedToPlot.get(String(f.Attributes.Seed_Feature_ID))
        : null);
    if (pid != null) ids.add(Number(pid));
  }

  return [...ids]
    .map((id) => ({ plotId: id, number: plotById(id)?.plot_number ?? String(id) }))
    .sort((a, b) => {
      const na = Number(String(a.number).replace(/\D/g, ""));
      const nb = Number(String(b.number).replace(/\D/g, ""));
      return (Number.isFinite(na) && Number.isFinite(nb) && na !== nb)
        ? na - nb
        : String(a.number).localeCompare(String(b.number));
    });
}
