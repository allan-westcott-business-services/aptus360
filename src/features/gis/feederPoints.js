/* Which point stands at each stop on a circuit, and what it is called.

   Build LV Network walks a circuit from its origin outward and breaks
   the run at every stop: the origin, junctions, leaf ends, and where
   the cable count changes. Each stop wants exactly one feeder end
   point, numbered in walk order — A0 at the origin, A1 the first stop
   after it — carrying the circuit's id and the cable arriving there.

   Some of those points already exist. The ones the last build laid are
   the build's own and are replaced. The ones somebody placed by hand
   are not: a hand-placed feeder point is a break a designer chose, and
   a link box is a physical thing in the ground with fuses set in it.
   Those are ADOPTED — they keep their id, their name and their own
   cable, and take the number of the stop they stand on.

   ── Why this is a module ──

   It was ninety lines inside buildLvNetwork, which is a function that
   deletes rows, calls the database and reports progress, so nothing
   could drive it and every fault in it was found on a live drawing.
   The decisions are here; the writing stays there. checklinkboxseq
   drives this. */

/* How near a point has to stand to a stop to BE that stop.

   Two metres for a link box, one for anything else. A box is placed by
   eye on the run and lands a foot or so from the node the walk stops
   at — far enough to miss a one-metre reach, so the build made a point
   of its own beside it: a meaningless two-metre leg into a generated
   A10, with the box standing next to it holding nothing. The joint rule
   already reaches two metres for exactly this reason, and where a link
   box stands it IS the feeder end point, so the two reaches agree. */
export const ADOPT_REACH_M = 1;
export const ADOPT_REACH_BOX_M = 2;

export const spanLabelFor = (letter, seq) => `${letter}${seq}`;

const at = (f) => {
  const a = f.Attributes?.Span_Anchor;
  if (Array.isArray(a) && a.length === 2) return a;
  return (f.Geometry || [])[0] ?? null;
};

/* ── Who this circuit may consider ──

   Its own feeder points, its own boxes, and a box that has no circuit
   at all.

   That last one is the fix for the stray duplicate. A box placed in
   open ground gets no circuit and no sequence — there was no cable
   under the click, and the cables are drawn to it afterwards. The
   build only looked at points that already had both, so the box was
   invisible to it and the walk made a generated point standing on top
   of it: two points at one place, one holding the figures and one
   holding the fuses.

   A feeder point with no circuit is NOT considered. It cannot be
   placed without one — placement refuses a click in open ground,
   because a point belonging to no circuit stops no trace and shows no
   level. A box can, because a box is a thing in the ground whether or
   not a cable has reached it yet. */
const mineFor = (existing, circuitId, claimed) => (existing || []).filter((f) => {
  if (claimed?.has(f.Feature_ID)) return false;
  const cid = f.Attributes?.Circuit_ID;
  if (f.Feature_Role === "feederpoint") return Number(cid) === Number(circuitId);
  if (f.Feature_Role !== "linkbox") return false;
  return cid == null || Number(cid) === Number(circuitId);
});

/* ── Where a newly placed point goes in the sequence ──

   A0 is the origin, A1 the first stop reached from it, A2 the next.
   The number IS the position on the run, which is why the editor
   refuses to let anyone type it.

   Placement did not do that. It took the highest number on the circuit
   and added one, so a link box put on the cable just past the POC — the
   first stop there is — came out A10 on a circuit that already had
   nine. The drawing then read A0, A10, A2, A3: a jump over A1, with the
   first thing reached after the POC carrying the last number in the
   schedule. "Max plus one" is a count of how many points exist, written
   into a field that means position; the two agree only if every point
   is placed in order from the origin outward and none is ever added in
   the middle, which is not how anybody draws.

   So a new point is INSERTED. How far along the cable it stands decides
   which slot it drops into; the points beyond it move up. The existing
   ORDER is not re-derived — it came from the build's own walk, and
   working it out again here would be a second writer of one fact, which
   is fault 13 in a new place. All this decides is the slot. */

/* Metres along the circuit's mains from the origin, by Dijkstra over
   the cable vertices. Along the cable rather than across the site: a
   stop up a long branch is further out than one close by in a straight
   line, and a schedule ordered by how the crow flies describes no route
   anybody drives. */
const JOIN_M = 0.25;

function mainsGraph(features, circuitId) {
  const runs = (features || []).filter((f) => f.Feature_Type === "line"
    && f.Layer_Key === "electric"
    && String(f.Attributes?.Line_Type ?? "").includes("main")
    && (f.Attributes?.Circuit_ID == null
      || Number(f.Attributes.Circuit_ID) === Number(circuitId)));

  const pts = [];
  const idx = (p) => {
    for (let i = 0; i < pts.length; i++) {
      if (Math.hypot(pts[i][0] - p[0], pts[i][1] - p[1]) <= JOIN_M) return i;
    }
    pts.push([p[0], p[1]]);
    return pts.length - 1;
  };
  const adj = new Map();
  const segs = [];
  const link = (a, b, w) => {
    if (!adj.has(a)) adj.set(a, []);
    adj.get(a).push([b, w]);
  };
  for (const r of runs) {
    const g = r.Geometry || [];
    for (let i = 1; i < g.length; i++) {
      const a = idx(g[i - 1]); const b = idx(g[i]);
      const w = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]);
      link(a, b, w); link(b, a, w);
      segs.push({ a, b, w, pa: g[i - 1], pb: g[i] });
    }
  }
  if (!pts.length) return null;

  /* Distances along the cable from any point standing on it, by
     Dijkstra from a virtual node spliced into the segment that point
     projects onto \u2014 so a box mid-span measures from where it stands
     rather than from the nearest corner. */
  const project = (p) => {
    if (!Array.isArray(p)) return null;
    let best = null;
    for (const s of segs) {
      const vx = s.pb[0] - s.pa[0]; const vy = s.pb[1] - s.pa[1];
      const len2 = vx * vx + vy * vy;
      const t = len2 ? Math.max(0, Math.min(1,
        ((p[0] - s.pa[0]) * vx + (p[1] - s.pa[1]) * vy) / len2)) : 0;
      const qx = s.pa[0] + vx * t; const qy = s.pa[1] + vy * t;
      const off = Math.hypot(p[0] - qx, p[1] - qy);
      if (best && off >= best.off) continue;
      best = { off, s, t };
    }
    return best && best.off <= ADOPT_REACH_BOX_M ? best : null;
  };

  const distancesFrom = (p) => {
    const at = project(p);
    if (!at) return null;
    const n = pts.length;
    const dist = new Array(n + 1).fill(Infinity);
    const virt = n;
    const extra = new Map([[virt, [
      [at.s.a, at.s.w * at.t],
      [at.s.b, at.s.w * (1 - at.t)],
    ]]]);
    dist[virt] = 0;
    const left = new Set([...pts.map((_, i) => i), virt]);
    while (left.size) {
      let u = null;
      for (const i of left) if (u == null || dist[i] < dist[u]) u = i;
      if (dist[u] === Infinity) break;
      left.delete(u);
      for (const [v, w] of (extra.get(u) || adj.get(u) || [])) {
        if (dist[u] + w < dist[v]) dist[v] = dist[u] + w;
      }
    }
    return (q) => {
      const to = project(q);
      if (!to) return null;
      const d = Math.min(
        dist[to.s.a] + to.s.w * to.t,
        dist[to.s.b] + to.s.w * (1 - to.t),
      );
      return Number.isFinite(d) ? d : null;
    };
  };

  return { distancesFrom };
}

export function planInsertion({ features = [], circuit, at, excludeId = null }) {
  const letter = circuit?.letter ?? "A";
  const none = { seq: null, label: null, writes: [] };
  if (!Array.isArray(at)) return none;

  const onCircuit = features.filter((f) =>
    (f.Feature_Role === "feederpoint" || f.Feature_Role === "linkbox")
    && Number(f.Attributes?.Circuit_ID) === Number(circuit?.id)
    && Number(f.Feature_ID) !== Number(excludeId));

  const originPt = (() => {
    const o = onCircuit.find((f) => Number(f.Attributes?.Span_Seq) === 0);
    const a = o?.Attributes?.Span_Anchor ?? o?.Geometry?.[0];
    return Array.isArray(a) ? a : null;
  })();
  if (!originPt) return none;

  const graph = mainsGraph(features, circuit?.id);
  const fromOrigin = graph?.distancesFrom(originPt) ?? null;
  const fromNew = graph?.distancesFrom(at) ?? null;
  /* No cable under it yet — a box placed in open ground before the
     feeders are drawn. It gets no number rather than a guessed one; the
     next build gives it one when a run reaches it. */
  if (!fromOrigin || !fromNew) return none;
  const mine = fromOrigin(at);
  if (mine == null) return none;

  /* ── Which points it goes after ──

     The ones BETWEEN the origin and it along the cable, which on a
     branched circuit is not the same as the ones with a smaller
     distance. The first cut compared distances alone, so a point 70 m
     up one branch was numbered against a point 150 m down another and
     landed at A2 when A3 already stood at 60 m on its own branch.
     Nothing about that is readable on a drawing: the number is supposed
     to say what order the cable reaches things in.

     A point P is on the way to N when the distance out to P plus the
     distance on from P to N is the distance out to N. Within a metre,
     because both are measured through projections onto segments and two
     routes to one place will not agree to the millimetre. */
  const onTheWay = (p) => {
    const out = fromOrigin(p);
    const on = fromNew(p);
    if (out == null || on == null) return false;
    if (out >= mine) return false;
    return Math.abs(out + on - mine) <= 1;
  };

  const stops = onCircuit
    .filter((f) => Number(f.Attributes?.Span_Seq) !== 0)
    .map((f) => ({
      f,
      seq: Number(f.Attributes?.Span_Seq) || 0,
      up: onTheWay(f.Attributes?.Span_Anchor ?? f.Geometry?.[0]),
    }))
    .sort((a, b) => a.seq - b.seq);

  /* Straight after the last thing on the way to it. Everything from
     that number outward moves up, so the sequence stays unbroken. */
  const slot = stops.reduce((m, s) => (s.up ? Math.max(m, s.seq + 1) : m), 1);

  const writes = [];
  for (const s of stops) {
    if (s.seq < slot) continue;
    const seq = s.seq + 1;
    const label = spanLabelFor(letter, seq);
    writes.push({
      Feature_ID: s.f.Feature_ID,
      /* A link box keeps its own name; a feeder point has none but its
         code, so its Label moves with it. */
      Label: s.f.Feature_Role === "linkbox" ? s.f.Label : `Point ${label}`,
      Attributes: { ...s.f.Attributes, Span_Seq: seq, Span_Label: label },
    });
  }

  return { seq: slot, label: spanLabelFor(letter, slot), writes };
}

export function planFeederPoints({
  nodes = [],
  existing = [],
  circuit,
  claimed = new Set(),
  startCableId = null,
  overrideFor = () => null,
}) {
  const letter = circuit?.letter ?? "A";
  const mine = mineFor(existing, circuit?.id, claimed);

  /* The build's own, replaced every run. A link box is never Generated,
     so it can never fall in here. */
  const remove = mine.filter((f) => f.Attributes?.Generated).map((f) => f.Feature_ID);
  const manual = mine.filter((f) => !f.Attributes?.Generated);

  const adopt = [];
  const create = [];
  const took = new Set();

  let seq = 0;
  for (const nd of nodes) {
    const num = nd.kind === "origin" ? 0 : (seq += 1);
    const label = spanLabelFor(letter, num);

    /* Nearest within reach, ties on the lower id — "first found" is
       scan order deciding a schedule. */
    let match = null, best = Infinity;
    for (const f of manual) {
      if (took.has(f.Feature_ID)) continue;
      const pAt = at(f);
      if (!pAt) continue;
      const reach = f.Feature_Role === "linkbox" ? ADOPT_REACH_BOX_M : ADOPT_REACH_M;
      const d = Math.hypot(pAt[0] - nd.point[0], pAt[1] - nd.point[1]);
      if (d > reach) continue;
      if (match && d > best) continue;
      if (match && d === best && Number(f.Feature_ID) >= Number(match.Feature_ID)) continue;
      match = f; best = d;
    }

    if (match) {
      took.add(match.Feature_ID);
      claimed.add(match.Feature_ID);
      const w = writeFor(match, {
        num, label, kind: nd.kind, circuit,
      });
      if (w) adopt.push(w);
      continue;
    }

    create.push({
      Layer_Key: "electric",
      Feature_Type: "point",
      Feature_Role: "feederpoint",
      Geometry: [nd.point],
      Label: `Point ${label}`,
      Attributes: {
        Circuit_ID: circuit?.id, Circuit_Name: circuit?.name, Circuit_Letter: letter,
        Span_Seq: num, Span_Label: label, Span_Kind: nd.kind,
        Span_Anchor: nd.point,
        ...(nd.kind !== "origin" && startCableId != null
          ? { VD_Cable_Size_ID: startCableId } : {}),
        ...((() => {
          const m = overrideFor(nd.point);
          return m != null ? { Manual_VD_Cable_Size_ID: m } : {};
        })()),
        Generated: true,
      },
    });
  }

  /* Hand-placed points the walk did not land on — mid-run breaks
     somebody chose. Sequenced after the planned positions, left
     otherwise alone.

     A box with no circuit is skipped: it was considered above only in
     case the walk stopped on it, and one standing in a field is not
     this circuit's to number. Numbering it would give every unplaced
     box on the site a place in the first circuit's schedule. */
  for (const f of manual) {
    if (took.has(f.Feature_ID)) continue;
    if (Number(f.Attributes?.Span_Seq) === 0) continue;
    if (f.Attributes?.Circuit_ID == null) continue;
    seq += 1;
    const w = writeFor(f, { num: seq, label: spanLabelFor(letter, seq), circuit });
    if (w) { adopt.push(w); claimed.add(f.Feature_ID); }
  }

  return { adopt, create, remove };
}

/* What an adopted point takes, and whether it is worth a write.

   Only where something actually changes — rewriting every point on
   every build would churn the drawing for nothing.

   ── The name goes with the number ──

   This wrote Span_Seq and Span_Kind and not Span_Label, so a box that
   took A10 at placement — max sequence plus one, which is all
   placement can know — was resequenced to 1 on every build since and
   went on being called A10 everywhere a stop is named: the circuit
   report, the call-off spans, the levels table. A feeder point had it
   worse, carrying the stale code in its own Label as well.

   A link box keeps its own Label. "Link Box 3" is its name and the
   span code is what it is called on the run; a feeder point has no
   name but its code, so its Label follows. */
function writeFor(f, { num, label, kind, circuit }) {
  const a = f.Attributes || {};
  const wantKind = kind === undefined ? a.Span_Kind : kind;
  const isBox = f.Feature_Role === "linkbox";
  const wantLabel = isBox ? f.Label : `Point ${label}`;

  const same = String(a.Span_Seq) === String(num)
    && a.Span_Label === label
    && a.Span_Kind === wantKind
    && Number(a.Circuit_ID) === Number(circuit?.id)
    && (isBox || f.Label === wantLabel);
  if (same) return null;

  return {
    Feature_ID: f.Feature_ID,
    Label: wantLabel,
    Attributes: {
      ...a,
      Circuit_ID: circuit?.id,
      Circuit_Name: circuit?.name,
      Circuit_Letter: circuit?.letter,
      Span_Seq: num,
      Span_Label: label,
      ...(kind === undefined ? {} : { Span_Kind: kind }),
    },
  };
}

/* ── What a build part may mark ──

   Each part of a build — the trunk to a link box, then each output —
   walks its own model and marks the junctions and ends it finds. The
   trunk's model is the WHOLE circuit's, deliberately, so the origin
   rules answer as they do for the circuit entire; its sections are one
   chain, origin to the box.

   Marking straight off that model marked every fork of the DIG anywhere
   on the circuit. Where two outputs leave a box down one trench and part
   company further along, the trench forks and the full model calls it a
   junction — but no cable divides there, each output simply carries on.
   The mark became a numbered point in the middle of an output's run,
   splitting one 90 m cable into two legs and lending the first the other
   output's size.

   A part marks what stands on the cable it lays. A bend is not a stop,
   and a fork of the dig is not a fork of the cable. */
export function marksOnPart(marks = [], sections = [], tol = 0.5) {
  const near = (p, pts) => {
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      const vx = bx - ax; const vy = by - ay;
      const len2 = vx * vx + vy * vy;
      let t = len2 ? ((p[0] - ax) * vx + (p[1] - ay) * vy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      if (Math.hypot(p[0] - (ax + t * vx), p[1] - (ay + t * vy)) <= tol) return true;
    }
    return false;
  };
  return (marks || []).filter((m) => Array.isArray(m?.point)
    && (sections || []).some((sec) => near(m.point, sec.pts || [])));
}

/* ── Where a part's own cable ends ──

   A part lays a length of cable, and the far end of it is a stop by
   definition: for an output that is a leaf or a junction the model
   already knows about, and for the TRUNK it is the link box the cable
   is run to.

   `marksOnPart` filters marks the model produced. It cannot add the one
   the model never made — and the full-circuit model does not call a
   link box anything, because a box standing mid-network is neither a
   fork of the dig nor an end of it. Before parts were filtered at all
   the trunk marked every junction on the circuit, which happened to
   include the box whenever it sat on a trench junction. It worked by
   accident, and stopped the moment a box was placed mid-span.

   The symptom: the box keeps whatever number placement gave it — C10 on
   a circuit with nine points — because no stop is ever offered at its
   position for it to be adopted onto. The whole sequence then starts at
   C10 instead of C1.

   So the terminus is marked explicitly. Nearest model node to the last
   point the part lays, which is the node the walk would have used. */
export function partEndMark(model, sections = [], tol = 2) {
  const last = sections[sections.length - 1];
  const pts = last?.pts || [];
  const end = pts[pts.length - 1];
  const nodes = model?.nodes || [];
  if (!Array.isArray(end) || !nodes.length) return null;

  let best = null;
  for (let i = 0; i < nodes.length; i++) {
    const d = Math.hypot(nodes[i][0] - end[0], nodes[i][1] - end[1]);
    if (!best || d < best.d) best = { d, i };
  }
  if (!best || best.d > tol) return null;
  return { index: best.i, point: nodes[best.i], kind: "end" };
}
