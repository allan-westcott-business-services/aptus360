/* The drawing, as sections of main.

   The Aptus Calc Sheet reads one row per leg of main, from the point
   of connection outwards, the way the submission spreadsheet's
   `regulat.xls` rows do. This is the part that turns what is drawn
   into those rows: nothing here calculates a volt drop, and nothing in
   submitSheet.js knows what a feature is.

   ── Walking out from the origin ──

   The legs form a tree whose root is the point of connection. They are
   found by their ENDS rather than by anything stored on them: a leg
   whose first or last coordinate sits on the node being visited leaves
   that node, and its other end is the node it arrives at. Coordinates
   are rounded to the millimetre before they are compared, because two
   ends that were snapped together are equal on the drawing and differ
   in the sixteenth decimal place in a float.

   The alternative was the `Connects` list each leg carries. It is not
   used, and deliberately: it lists everything the leg touches — every
   joint, every service, the trench it lies in — in no order, with no
   way to say which end. A tree cannot be built from it without
   falling back on the coordinates anyway.

   ── Distributed against terminal ──

   The spreadsheet's two customer columns. A leg's own `Meters`
   attribute is CUMULATIVE — it counts the customers on that leg and
   everything beyond it — so the two are:

     terminal    = the sum of the children's Meters, which is
                   everything that leaves at or beyond the far end
     distributed = this leg's Meters less that, which is what taps off
                   along the leg itself

   Verified against the drawing it was written from: A9 leaves the
   origin carrying 48 with 47 beyond it, so 1 taps off along it — which
   is the shape the spreadsheet's first row has, 1 distributed and 47
   terminal.

   ── What the nodes are called ──

   The spreadsheet names its sections after the designer's own node
   numbers — "POC - O1", "O1 - O3". The drawing has those names only
   where somebody has placed a span node and labelled it; the junctions
   the build generates are breech joints with no number.

   So: a node uses its span node's label where it has one, and
   otherwise gets N1, N2, N3 in the order the walk reaches it. The
   numbering will not match a spreadsheet prepared by hand, and is not
   meant to — the leg's own name is carried in the same cell, in
   brackets, because that is the thing a designer can point at on the
   canvas. */

import { runLength, drawnLength } from "./lengths.js";

/* ── How near two ends have to be to be one node ──

   Half a metre. The walk used to join legs by an exact coordinate,
   and on project 16 that worked because its mains share endpoints to
   the last decimal place. Project 20 does not: consecutive legs stop
   0.351 m short of each other and the first starts 0.351 m from the
   origin, so nothing joined to anything, every one of its sixteen
   mains came back unreached and the sheet was blank.

   A drawing is not built to a coordinate. A cable ends where it was
   drawn to end, a joint sits where somebody put it, and two legs
   meeting at a junction are the same node whether or not their last
   vertices agree. The nearest genuinely separate nodes on either
   drawing are tens of metres apart, so half a metre separates the
   cases with room to spare. */
export const NODE_EPS_M = 0.5;

const KEY_DP = 3;
const round = (n) => Math.round((Number(n) || 0) * 10 ** KEY_DP) / 10 ** KEY_DP;

/* Ends within `eps` of one another share a key.

   First come, first named: each end is compared against the ones
   already seen and takes that key if it is close enough, otherwise
   starts its own. Deliberately not a grid — two ends either side of
   a gridline are near each other and would land in different cells,
   which is the fault this replaces wearing a different hat. */
function clusterer(eps = NODE_EPS_M) {
  const seen = [];
  return (pt) => {
    const x = Number(pt?.[0]) || 0;
    const y = Number(pt?.[1]) || 0;
    for (const c of seen) {
      if (Math.hypot(c.x - x, c.y - y) <= eps) return c.key;
    }
    const key = `${round(x)},${round(y)}`;
    seen.push({ x, y, key });
    return key;
  };
}

/* Where a circuit starts.

   The origin span node first, because it is the one the build places
   and the one the levels are measured from. The POC only if there is
   no origin node — a drawing where the build has not been run yet
   still has a point of connection, and half a sheet is more use than
   none. */
/* Every origin on the drawing, in the order the walk should use them.

   A site fed from two points of connection has two, one per circuit,
   and project 20 is exactly that: A0 and B0. Walking from the first
   alone left circuit B's seven legs unreached and off the sheet —
   half a scheme missing from its own submission, which is the fault
   nobody sees. */
export function originsOf(features = []) {
  const feeders = features.filter((f) => f.Feature_Role === "feederpoint"
    && f.Layer_Key === "electric" && f.Attributes?.Span_Kind === "origin");
  if (feeders.length) return feeders;
  const spans = features.filter((f) => f.Feature_Role === "spannode"
    && f.Layer_Key === "electric" && f.Attributes?.Span_Kind === "origin");
  if (spans.length) return spans;
  const pocs = features.filter((f) => f.Feature_Role === "poc");
  return pocs;
}

export function originOf(features = []) {
  const feeder = features.find((f) => f.Feature_Role === "feederpoint"
    && f.Layer_Key === "electric" && f.Attributes?.Span_Kind === "origin");
  if (feeder) return feeder;
  const span = features.find((f) => f.Feature_Role === "spannode"
    && f.Layer_Key === "electric"
    && (f.Attributes?.Span_Kind === "origin"));
  if (span) return span;
  return features.find((f) => f.Feature_Role === "poc") || null;
}

export function calcSheetRows({
  features = [], cableById = () => null, circuitId = null,
} = {}) {
  const mains = features.filter((f) =>
    f.Feature_Type === "line"
    && f.Attributes?.Line_Type === "elec_main"
    && (circuitId == null || f.Attributes?.Circuit_ID === circuitId));

  const origin = originOf(features);
  if (!origin || !mains.length) {
    return { rows: [], origin, unreached: mains.map((f) => f.Label || f.Feature_ID) };
  }

  /* Every span node's label, by where it stands, so a node the
     designer has named keeps its name. */
  const labelAt = new Map();
  /* Gathered now, keyed after the leg ends have defined the nodes. */
  const labelSeen = [];
  const keyOf = clusterer();
  for (const f of features) {
    /* ── Feeder points first, span nodes second ──

       A feeder point is the measuring point on the CABLE and carries
       the label a designer reads off the drawing — A0, A1, A2. A span
       node belongs to the trench. Both are accepted because a drawing
       whose build has not been re-run since feeder points took over
       still has the older kind, and half a sheet is more use than
       none.

       The layer test matters: the trench has span nodes of its own,
       also labelled A1, A2, A3, standing at the same corners as the
       cable's junctions. Without it the sheet named every electric
       node after the trench node sharing its corner and reported
       "A1 - A2 (A5)" — two trench nodes and a cable leg, three
       different things in one cell.

       ── Keyed on the anchor, not on where the dot is drawn ──

       A feeder point's Geometry is where its marker sits, which the
       levels display nudges clear of the cable; `Span_Anchor` is the
       point on the cable it actually measures. A2 on the drawing this
       was checked against is drawn a metre off its anchor, so keying
       on the marker matched no leg end at all and the node came out
       unnamed. */
    const role = f.Feature_Role;
    if (f.Layer_Key !== "electric") continue;
    if (role !== "feederpoint" && role !== "spannode") continue;
    const lab = f.Attributes?.Span_Label;
    if (!lab) continue;
    const at = f.Attributes?.Span_Anchor || (f.Geometry || [])[0];
    if (Array.isArray(at)) labelSeen.push([at, { role, label: String(lab) }]);
  }

  /* Legs by each of their two ends. A leg appears under both, and is
     spent the first time the walk uses it — which is what stops a ring
     going round for ever.

     The LEG ENDS are clustered first and the labelled points second,
     so a node is defined by the cables meeting there and a feeder
     point standing a third of a metre away joins it rather than
     starting a node of its own with nothing attached to it. */
  const outOf = new Map();
  for (const f of mains) {
    const g = f.Geometry || [];
    if (g.length < 2) continue;
    for (const end of [g[0], g[g.length - 1]]) {
      const k = keyOf(end);
      if (!outOf.has(k)) outOf.set(k, []);
      outOf.get(k).push(f);
    }
  }

  for (const [at, lab] of labelSeen) {
    const k = keyOf(at);
    if (labelAt.has(k) && !String(labelAt.get(k)).startsWith("\u0000")) {
      /* A feeder point wins where both stand on one node: it is the
         one the cable's levels are measured at. */
      if (lab.role === "feederpoint") labelAt.set(k, lab.label);
    } else {
      labelAt.set(k, lab.label);
    }
  }

  const origins = originsOf(features);
  const originKeys = origins
    .map((o) => keyOf(o.Attributes?.Span_Anchor || (o.Geometry || [])[0]));
  const originKey = originKeys[0];
  const spent = new Set();
  const legs = [];
  let auto = 0;
  const nameFor = (k) => {
    if (labelAt.has(k)) return labelAt.get(k);
    auto += 1;
    const n = `N${auto}`;
    labelAt.set(k, n);
    return n;
  };
  for (const k of originKeys) nameFor(k);

  /* Breadth first, so the sheet reads outwards from the point of
     connection a ring at a time rather than diving down one branch to
     its end and coming back — which is the order somebody checking a
     design walks it in. */
  const queue = [...originKeys];
  const seen = new Set(originKeys);
  while (queue.length) {
    const here = queue.shift();
    for (const leg of outOf.get(here) || []) {
      if (spent.has(leg.Feature_ID)) continue;
      spent.add(leg.Feature_ID);
      const g = leg.Geometry;
      const far = keyOf(g[0]) === here ? keyOf(g[g.length - 1]) : keyOf(g[0]);
      legs.push({ leg, fromKey: here, toKey: far });
      if (!seen.has(far)) { seen.add(far); queue.push(far); }
    }
  }

  /* ── The node at the far end of a dead end ──

     Junctions sit exactly on the cable, so their feeder point matches
     the leg end to the millimetre. The end of a spur does not: the
     build places that feeder point at the last cut-out, `Tail_M`
     beyond where the cable is drawn — 3.0 m past A1, 2.3 m past A2,
     3.6 m past A3 on the drawing this was checked against. Keyed on
     the coordinate alone, every dead end in the scheme came back
     unnamed and was given an invented N-number while its real label
     sat three metres away.

     So an unmatched end takes the nearest labelled node within the
     leg's own tail, with half a metre of slack for the rounding the
     tail length itself carries. The leg's tail, not a constant: the
     distance is a fact about this leg, and a fixed tolerance would be
     too tight on one spur and loose enough on another to name a node
     after its neighbour. */
  const anchors = [...labelAt.entries()].map(([k, label]) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y, label };
  });
  const nearLabel = (key, withinM) => {
    if (labelAt.has(key)) return labelAt.get(key);
    if (!(withinM > 0)) return null;
    const [x, y] = key.split(",").map(Number);
    let best = null;
    let bestD = Infinity;
    for (const a of anchors) {
      const d = Math.hypot(a.x - x, a.y - y);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (best && bestD <= withinM) { labelAt.set(key, best.label); return best.label; }
    return null;
  };

  /* Names are given in walk order, after the walk, so the numbering
     follows the sheet's rows rather than the order the legs happened
     to be stored in. */
  for (const l of legs) {
    const tail = Number(l.leg.Attributes?.Tail_M) || 0;
    l.from = labelAt.get(l.fromKey) ?? nameFor(l.fromKey);
    l.to = nearLabel(l.toKey, tail + 0.5) ?? nameFor(l.toKey);
  }

  const childrenOf = new Map();
  for (const l of legs) {
    if (!childrenOf.has(l.toKey)) childrenOf.set(l.toKey, []);
  }
  for (const l of legs) {
    if (!childrenOf.has(l.fromKey)) childrenOf.set(l.fromKey, []);
    childrenOf.get(l.fromKey).push(l);
  }

  const rows = legs.map((l) => {
    const a = l.leg.Attributes || {};
    const carried = Number(a.Meters) || 0;
    /* Everything beyond the far end, from the legs that leave it. */
    const beyond = (childrenOf.get(l.toKey) || [])
      .reduce((t, c) => t + (Number(c.leg.Attributes?.Meters) || 0), 0);
    /* Guarded: a subtree that counts more than the leg feeding it is a
       drawing whose build has not been re-run, and a negative
       distributed count would quietly subtract load. */
    const distributed = Math.max(0, carried - beyond);

    const cable = cableById(a.Manual_VD_Cable_Size_ID ?? a.VD_Cable_Size_ID) || null;

    return {
      featureId: l.leg.Feature_ID,
      legLabel: l.leg.Label || "",
      /* "E0 - N1 (A9)". The node pair the sheet expects, and the leg's
         own name after it, because that is the thing that can be found
         on the canvas. */
      section: `${l.from} - ${l.to}${l.leg.Label ? ` (${l.leg.Label})` : ""}`,
      /* ── The run, not the drawing ──

         `runLength` is the measured figure where somebody has entered
         one and the geometry otherwise. `Length_m` is the trigger's
         mirror of the drawing, rewritten on every drag, and reading
         it here put the sheet on a different length from the levels
         check looking at the same leg. A submission and the check
         behind it disagreeing about how long a cable is is the worst
         of the three possible faults. */
      lengthM: Math.round(runLength(l.leg) * 100) / 100,
      drawnM: Math.round(drawnLength(l.leg) * 100) / 100,
      measured: Math.abs(runLength(l.leg) - drawnLength(l.leg)) > 0.05,
      cableType: cable?.Cable_Type ?? "",
      csa: cable?.Size_Label ?? "",
      cable,
      distributed,
      terminal: beyond,
      /* Not on the drawing anywhere yet. Entered on the sheet and kept
         on the leg it belongs to, so it survives a reload and is read
         by whoever opens the sheet next. */
      blockKva: Number(a.Block_kVA) || 0,
      /* The spreadsheet's tick box. A leg is in the calculation unless
         somebody has taken it out — a design is what is drawn, and
         defaulting to excluded would hide half a scheme from its own
         submission. */
      included: a.Calc_Exclude !== true,
      missingCable: !cable,
    };
  });

  /* ── Every route out of the origin ──

     A volt drop is a figure TO somewhere. The spreadsheet's tick box
     is how it says which somewhere: its five ticked sections form one
     unbroken path from the point of connection, and the three it
     leaves out are the other branches. Summing legs that sit in
     parallel adds up to nowhere — 274 m of 300mm main and a 52 m spur
     in the opposite direction do not make a 326 m run.

     So the routes are worked out here and the sheet ticks one. Each
     is the list of legs from the origin to a dead end, in order. */
  const leaving = new Map();
  for (const l of legs) {
    if (!leaving.has(l.fromKey)) leaving.set(l.fromKey, []);
    leaving.get(l.fromKey).push(l);
  }
  const routes = [];
  const walkRoutes = (key, sofar) => {
    const next = leaving.get(key) || [];
    if (!next.length) {
      if (sofar.length) {
        routes.push({
          to: labelAt.get(key) ?? "",
          nodes: [labelAt.get(sofar[0].fromKey) ?? "", ...sofar.map((l) => l.to)],
          featureIds: sofar.map((l) => l.leg.Feature_ID),
        });
      }
      return;
    }
    for (const l of next) walkRoutes(l.toKey, [...sofar, l]);
  };
  for (const k of originKeys) walkRoutes(k, []);

  return {
    rows,
    routes,
    origin,
    /* Legs the walk never reached: a spur drawn but not joined to
       anything, or a second circuit with no path back to this origin.
       Named rather than dropped, because a section missing from a
       submission is the fault nobody sees. */
    unreached: mains.filter((f) => !spent.has(f.Feature_ID))
      .map((f) => f.Label || String(f.Feature_ID)),
  };
}

/* The scheme's own figures, off the point of connection.

   `Output_V` is the voltage the sheet divides by. The POC on the
   drawing this was written against holds 240, which is the phase
   voltage the spreadsheet's B6 holds — but the field is used for the
   line voltage elsewhere in the app, where it defaults to 400. Both
   are returned, and the sheet says which it used rather than guessing:
   the two are 3.9% apart and the difference lands on every current in
   the table. */
export function schemeFrom(origin, poc) {
  const a = poc?.Attributes || origin?.Attributes || {};
  return {
    startPct: Number(a.Source_Volt_Drop_Pct) || 0,
    startOhms: Number(a.Source_Loop_Impedance_Ohm) || 0,
    outputV: a.Output_V != null ? Number(a.Output_V) : null,
  };
}
