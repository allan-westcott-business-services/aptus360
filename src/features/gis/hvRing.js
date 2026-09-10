/* ── The HV ring: how the substation is actually fed ──

   The drawing used to stop at the POC. Upstream of it the model had
   one line type, `elec_hv`, and nothing to say what the cable was FOR
   — which on the standard UK arrangement is this: the substation is
   not on a dedicated way at the primary. It is looped in and out of a
   shared 11 kV (sometimes 6.6 kV) circuit, one of several substations
   in series on one way's cable, with the far end running back to a
   second way and a normally open point somewhere along the route. In
   normal running the ring is split at that point, so each substation
   is on a radial chain; a fault on the cable trips the way at the
   primary and takes every substation on the chain with it, and supply
   comes back by sectionalising and closing the open point.

   Four facts carry all of that, and each gets its own feature or
   field:

     primary     the primary substation (33/11 kV). One way of its
                 board feeds this chain; the ring usually returns to a
                 second way of the same board, or to another primary.
     ringsub     another secondary substation looped into the same
                 circuit. Not ours — drawn so the chain reads, and so
                 "two substations up the chain from the primary" is on
                 the drawing rather than in somebody's head.
     openpoint   the normally open point. The one place the walk of
                 the ring STOPS: everything before it is fed from this
                 end, everything past it from the other.
     the site's own substation carries how it hangs off the circuit —
                 looped in and out through an RMU, teed, or on a
                 dedicated way — and what protects the transformer
                 tee, because the ring switches either side of it are
                 load-break switches and cannot clear a cable fault.

   Everything here is pure so it can be tested. Placing the features
   and writing them is the canvas's job; reading the model out loud is
   the editor's. */

/* The cable of the circuit itself. Both types: the incumbent's run
   drawn as a record (`elec_hv_existing`, dashed, off the bill once
   0208 runs) and our own loop-in tails (`elec_hv`), because the chain
   is one circuit however many owners its lengths have. */
export const HV_LINE_TYPES = ["elec_hv", "elec_hv_existing"];

/* The three ways a substation hangs off the HV network. The order is
   the order the select offers them, commonest first. */
export const HV_CONNECTIONS = [
  { key: "looped", label: "Looped in and out (RMU on the ring)" },
  { key: "teed", label: "Teed off the circuit" },
  { key: "dedicated", label: "Dedicated way at the primary" },
];

/* What protects the transformer tee. The ring switches cannot clear a
   fault — they are load-break switches — so this is the one device
   whose operation takes out this substation alone. */
export const RMU_TEE_PROTECTION = [
  { key: "fuse-switch", label: "Fuse switch" },
  { key: "circuit-breaker", label: "Circuit breaker" },
];

/* ── Joining rules ──

   The same two distances upstream.js earned the hard way. Plant is a
   symbol placed NEAR the cable, not a vertex on it — a primary is
   dropped beside the board's position and the ring drawn past it — so
   plant joins the cable within five metres. Cable joins cable end to
   end within three quarters of a metre, because two lengths that meet
   are drawn to meet. */
const PLANT_M = 5;
const JOIN_M = 0.75;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* Where a point stands along a polyline: the nearest spot on it, with
   the running chainage to that spot, so stations on one line can be
   put in the order the cable meets them. */
function alongLine(point, geometry = []) {
  let best = null;
  let run = 0;
  for (let i = 0; i + 1 < geometry.length; i++) {
    const a = geometry[i];
    const b = geometry[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len = Math.hypot(vx, vy);
    if (!len) continue;
    let t = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / (len * len);
    t = Math.max(0, Math.min(1, t));
    const q = [a[0] + vx * t, a[1] + vy * t];
    const d = dist(point, q);
    if (!best || d < best.d) best = { d, chainage: run + len * t };
    run += len;
  }
  return best;
}

const roleOf = (f) => String(f?.Feature_Role ?? "");

export const isHvLine = (f) =>
  f?.Feature_Type === "line"
  && f?.Layer_Key === "electric"
  && HV_LINE_TYPES.includes(String(f?.Attributes?.Line_Type ?? ""));

/* The plant the walk knows: the ends of the chain, the stations along
   it, and the point it stops at. The site's own substation is a
   station like any ringsub — the ring passes through it, which is the
   whole arrangement being modelled. */
const NODE_ROLES = new Set(["primary", "ringsub", "substation", "openpoint"]);

export function hvNodesOf(features = []) {
  return features.filter((f) =>
    f?.Feature_Type === "point"
    && f?.Layer_Key === "electric"
    && NODE_ROLES.has(roleOf(f))
    && (f.Geometry || []).length);
}

/* ── The model ──

   Lines stitched end to end, plant attached to the line it stands on,
   and a walk from each primary in each direction it can leave. The
   walk visits stations in cable order and stops at an open point, at
   another primary, or where the cable ends.

   The result is legs: ordered lists of stations from a primary,
   each saying how it ended. Feeds are read off the legs — the first
   leg to reach a substation before any open point is its normal
   supply — and the findings are everything the drawing says that a
   drawing of an open ring should not. */
export function hvRingModel(features = []) {
  const lines = features.filter(isHvLine);
  const nodes = hvNodesOf(features);

  /* Stations: each node attached to every line it stands on, with the
     chainage along that line. One node on two lines — a substation
     with the incoming and outgoing cable each drawn to it — is the
     splice between them, which is exactly what an RMU is. */
  const stations = new Map(); // lineId -> [{ node, chainage }]
  const attached = new Set();
  for (const line of lines) {
    const list = [];
    for (const node of nodes) {
      const at = alongLine(node.Geometry[0], line.Geometry || []);
      if (at && at.d <= PLANT_M) {
        list.push({ node, chainage: at.chainage });
        attached.add(node.Feature_ID);
      }
    }
    list.sort((a, b) => a.chainage - b.chainage);
    stations.set(line.Feature_ID, list);
  }

  /* Line ends stitched by proximity, and by sharing a station: two
     lengths drawn TO the substation symbol rather than to each other
     can stand further apart than JOIN_M and still be one circuit,
     because the thing joining them is the plant between them. */
  const ends = (line) => {
    const g = line.Geometry || [];
    return [g[0], g[g.length - 1]].filter(Boolean);
  };
  const continuations = (line, fromEnd) => {
    const out = [];
    for (const other of lines) {
      if (other.Feature_ID === line.Feature_ID) continue;
      const og = other.Geometry || [];
      if (og.length < 2) continue;
      const oa = og[0];
      const ob = og[og.length - 1];
      if (dist(fromEnd, oa) <= JOIN_M) out.push({ line: other, reversed: false });
      else if (dist(fromEnd, ob) <= JOIN_M) out.push({ line: other, reversed: true });
      else {
        /* Joined through the plant: this end stands at a station the
           other line also carries. */
        const here = (stations.get(line.Feature_ID) || []).find((s) =>
          dist(fromEnd, s.node.Geometry[0]) <= PLANT_M);
        if (here) {
          const there = (stations.get(other.Feature_ID) || []).find((s) =>
            s.node.Feature_ID === here.node.Feature_ID);
          if (there) {
            const total = alongLine(ob, og)?.chainage ?? 0;
            out.push({ line: other, reversed: there.chainage > total / 2 });
          }
        }
      }
    }
    return out;
  };

  const primaries = nodes.filter((n) => roleOf(n) === "primary");
  const legs = [];

  for (const primary of primaries) {
    /* Every line the primary stands on, walked away from it in both
       directions. A primary feeding a chain usually stands at the end
       of one line; standing mid-line it feeds both ways along it. */
    for (const line of lines) {
      const here = (stations.get(line.Feature_ID) || [])
        .find((s) => s.node.Feature_ID === primary.Feature_ID);
      if (!here) continue;
      for (const dir of [+1, -1]) {
        const leg = walkLeg(primary, line, here.chainage, dir);
        if (leg) legs.push(leg);
      }
    }
  }

  function walkLeg(primary, startLine, fromChainage, dir) {
    const visited = new Set([startLine.Feature_ID]);
    const out = { primary, stations: [], endedAt: "end", endNode: null };
    let line = startLine;
    let chainage = fromChainage;
    let forward = dir > 0;
    let moved = false;

    for (let hops = 0; hops < 500; hops++) {
      const list = stations.get(line.Feature_ID) || [];
      const ahead = list
        .filter((s) => (forward ? s.chainage > chainage + 1e-9 : s.chainage < chainage - 1e-9))
        /* Not the primary the leg left from. Its in and out cables both
           stand on it, so a walk that hops between them passes its own
           start \u2014 which is the walk getting clear of the board, not
           the ring closing. A ring genuinely closing meets a primary
           along the LAST line, and ends there below; the same primary
           met again reads as a dead end once every line is visited,
           and the closed ring is caught by the double feed instead. */
        .filter((s) => s.node.Feature_ID !== primary.Feature_ID)
        .sort((a, b) => (forward ? a.chainage - b.chainage : b.chainage - a.chainage));
      for (const s of ahead) {
        moved = true;
        chainage = s.chainage;
        const role = roleOf(s.node);
        if (role === "openpoint") {
          out.stations.push(s.node);
          out.endedAt = "openpoint";
          out.endNode = s.node;
          return out;
        }
        if (role === "primary") {
          out.endedAt = "primary";
          out.endNode = s.node;
          return out.stations.length || moved ? out : null;
        }
        out.stations.push(s.node);
      }
      /* Off the end of this line and onto whatever continues it. */
      const g = line.Geometry || [];
      const endPoint = forward ? g[g.length - 1] : g[0];
      const next = continuations(line, endPoint)
        .filter((c) => !visited.has(c.line.Feature_ID));
      if (!next.length) {
        out.endedAt = "end";
        return moved || out.stations.length ? out : null;
      }
      /* A ring is a chain: one continuation. Two is a branch in the HV,
         which the findings call out; the walk takes the first and the
         drawing gets told rather than half-modelled in silence. */
      if (next.length > 1) out.branched = true;
      const c = next[0];
      visited.add(c.line.Feature_ID);
      line = c.line;
      forward = !c.reversed;
      const lg = line.Geometry || [];
      chainage = forward ? -1 : (alongLine(lg[lg.length - 1], lg)?.chainage ?? 0) + 1;
      moved = true;
    }
    return out;
  }

  /* Normal feed: the first leg to reach a station without passing an
     open point on the way. A leg's stations already stop AT the open
     point, so anything on a leg before its last entry (when that entry
     is the open point) is fed from that leg's primary. */
  const feeds = new Map();
  for (const leg of legs) {
    leg.stations.forEach((node, i) => {
      if (roleOf(node) === "openpoint") return;
      if (feeds.has(node.Feature_ID)) {
        const first = feeds.get(node.Feature_ID);
        if (first.leg !== leg) first.alsoFedBy.push(leg);
        return;
      }
      feeds.set(node.Feature_ID, {
        node, leg, primary: leg.primary,
        hops: leg.stations.slice(0, i)
          .filter((s) => roleOf(s) !== "openpoint").length,
        alsoFedBy: [],
      });
    });
  }

  /* ── What the drawing says that it should not ── */
  const findings = [];
  const say = (level, text) => findings.push({ level, text });
  const name = (f) => f?.Label || (roleOf(f) === "primary" ? "the primary"
    : roleOf(f) === "openpoint" ? "the open point" : "the substation");

  const openPoints = nodes.filter((n) => roleOf(n) === "openpoint");
  const subs = nodes.filter((n) => roleOf(n) === "substation"
    || roleOf(n) === "ringsub");

  if (lines.length && !primaries.length) {
    say("warn", "HV cable is drawn but no primary substation is placed "
      + "\u2014 the chain has no feed recorded, so nothing says which way "
      + "trips when this cable faults.");
  }
  for (const op of openPoints) {
    if (!attached.has(op.Feature_ID)) {
      say("warn", `${name(op)} does not stand on any HV cable \u2014 `
        + "an open point is a split IN the circuit, so place it on the run.");
    }
  }
  for (const sub of subs) {
    const conn = String(sub.Attributes?.HV_Connection ?? "");
    if (roleOf(sub) === "substation" && conn === "dedicated") continue;
    if (!feeds.has(sub.Feature_ID) && lines.length && primaries.length) {
      say("warn", `${name(sub)} is not reached from a primary along the `
        + "HV cable \u2014 either the run does not pass it, or a gap in the "
        + "drawing breaks the chain before it.");
    }
  }
  const closed = [...feeds.values()].filter((f) => f.alsoFedBy.length
    && roleOf(f.node) !== "openpoint");
  if (closed.length && !openPoints.length) {
    say("warn", "The ring is drawn closed \u2014 in normal running there is "
      + "a normally open point somewhere on it. Place one, so the drawing "
      + "says where the split is and which way feeds each substation.");
  }
  if (legs.some((l) => l.branched)) {
    say("note", "The HV run branches \u2014 a ring is a chain of substations "
      + "on one circuit, so a branch here is usually two circuits drawn "
      + "as one.");
  }
  for (const p of primaries) {
    if (feedsAnything(p) && sayWay(p) == null) {
      say("note", `Which way at ${name(p)} feeds this circuit is not `
        + "recorded \u2014 set it on the primary, because that way's breaker "
        + "is what protects the whole chain.");
    }
  }
  function feedsAnything(p) {
    return legs.some((l) => l.primary === p && l.stations
      .some((s) => roleOf(s) !== "openpoint"));
  }
  function sayWay(p) {
    const w = p.Attributes?.Feed_Way;
    return w == null || w === "" ? null : w;
  }

  return { lines, nodes, primaries, openPoints, legs, feeds, findings };
}

/* ── The feed, said out loud ──

   One sentence for the editor and the check both, built from the model
   rather than from the geometry twice. Null where there is nothing to
   say — a substation off the ring gets a finding, not a summary. */
export function feedSummary(model, featureId) {
  const feed = model?.feeds?.get(featureId);
  if (!feed) return null;
  const p = feed.primary;
  const way = p.Attributes?.Feed_Way;
  const from = `${p.Label || "the primary"}${way != null && way !== ""
    ? ` (way ${way})` : ""}`;
  const up = feed.hops === 0 ? "first substation on the chain"
    : `${feed.hops} substation${feed.hops === 1 ? "" : "s"} up the chain`;
  const ended = feed.leg.endedAt === "openpoint"
    ? ` The chain runs on to ${feed.leg.endNode?.Label || "the open point"}; `
      + "closing it back-feeds this substation from the other direction."
    : feed.leg.endedAt === "primary"
      ? ` The far end returns to ${feed.leg.endNode?.Label || "a primary"} `
        + "with no open point drawn between."
      : "";
  return `Fed from ${from}, ${up}.${ended}`;
}

/* What a cable fault on the chain does: everything on the leg goes
   dark together, because the ring switches at each substation cannot
   clear it — only the way's breaker at the primary can, and it takes
   the lot. The editor shows this beside the feed so the shared
   exposure is on the drawing, not just in the arrangement's name. */
export function faultCompany(model, featureId) {
  const feed = model?.feeds?.get(featureId);
  if (!feed) return null;
  const others = feed.leg.stations.filter((s) =>
    s.Feature_ID !== featureId
    && (roleOf(s) === "substation" || roleOf(s) === "ringsub"));
  return others.length;
}
