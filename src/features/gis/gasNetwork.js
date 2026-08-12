/* Laying the gas main.

   The gas equivalent of Build LV Network, and deliberately a much
   smaller thing than that one.

   ── Why it is smaller ──

   An LV feeder has to be designed: load accumulates from the meters
   back to the substation, the number of cables follows from the meter
   count, and impedance and volt drop decide the rest. Gas is a shorter
   argument. A gas main is one pipe and where it goes is already decided
   by where the trench was dug, so the route is a covering problem — but
   the size is not, and used not to be answered at all.

   ── Sizing: what changed ──

   This module once returned geometry and left every pipe unsized,
   because there was no table to size against. There is now: 0130 holds
   what diameter carries what load, keyed on kW rather than on a plot
   count, because a four-bed with a boiler and a hob is not the same
   demand as a flat with a combi and neither is the commercial unit at
   the end of the road.

   So the walk that already accumulated presence now accumulates load as
   well, and a run breaks where the size changes — the same three-way
   break the water builder uses, for the same reason: cutting only at
   junctions gives one pipe where the ground holds a taper, cutting at
   every tee gives a schedule of two hundred pipes on an estate that has
   four.

   ── Diversity, and why it can stop the build ──

   Forty boilers do not draw forty times one boiler, and Cadent's tables
   are keyed on the diversified figure. So the summed peak beyond a
   point is multiplied by a factor read against the number of supplies
   beyond that same point, from 0131.

   That table ships empty, and where it is empty this returns an error
   rather than a network. The rule belongs to IGE/GL/1 and is not
   something to guess at: a factor wrong in the unsafe direction
   undersizes a gas main, and the drawing looks equally confident either
   way. An unsized main was honest about knowing nothing. A main sized
   from an invented factor would not be.

   The factor is applied per node against what lies beyond that node,
   not once across the site — which is how the standard reads and also
   the only version that gets the spine and its legs right, since a leg
   feeding four houses diversifies less than the spine feeding ninety.

   ── But not every trench ──

   Not all of it, though: main goes where gas is going. A length of
   trench is worth piping only if something beyond it takes gas, and
   what says so is a service trench running from the main to a gas
   meter. So the demand is counted at each tee and accumulated back
   towards the POC, exactly as the feeder accumulates load, and a branch
   with nothing beyond it gets no pipe.

   That is what stops the main being drawn down the electric-only spur,
   and what makes it stop after the last gas service rather than
   carrying on to the end of the trench somebody drew.

   ── Up to each service trench ──

   The main runs in mains trench only. Where a service trench tees off,
   the main carries straight past it and the spur is left for the
   service pipe — a service feeds one plot and is not something the main
   runs along. Service trenches are therefore left out of the graph
   entirely, which is also what makes the tee read as an ordinary vertex
   the run passes through.

   `breakAtServices` ends a run at every tee instead, so each length
   between service connections is its own pipe. Off by default: on an
   estate of two hundred plots that is two hundred short pipes where the
   ground holds one continuous main, and a schedule of them says less
   than a schedule of the runs between junctions does. It is an option
   rather than a decision because which one is wanted depends on how the
   gas is being costed, and that is not a thing to hard-code.

   ── The same node rule as the feeder ──

   Vertices closer than CONNECT_EPS are one node, and a meter within
   SNAP_TOL of the network is on it. Both are imported rather than
   restated, because a module that agreed with the feeder builder on
   Tuesday and drifted from it on Friday is worse than one that never
   agreed: the two would disagree about whether the same drawing is
   connected, and only one of them would say so.

   ── What is not here ──

   Whether the project should have a gas main at all — a gas design, a
   gas asset value agreement — is a fact about the project rather than
   about the drawing, and is checked by the caller. This module is given
   features and returns geometry, which is what lets it be tested
   against a drawing that no database has ever seen. */

import { CONNECT_EPS, SNAP_TOL, isTrenchLine, isServiceLine } from "./feeder.js";

/* ── How far the main runs past the last tee ──

   A main does not stop at the last service it feeds. It carries on a
   little way and is capped, so the next connection has something to cut
   into rather than a live end to dig back to.

   A metre and a half of it, and it is real pipe: laid, adopted and paid
   for. So it goes in the geometry rather than being drawn on top of it,
   which is what puts it in the run's length, in the schedule against
   its own size, and in the BOM — the length trigger reads the geometry,
   so anything not in there is pipe nobody buys.

   The cap on the end is the other half of this and is *not* here: it is
   drawn from the geometry at render time, in gasEnds.js. */
export const END_EXTEND_M = 1.5;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const lengthOf = (pts = []) => {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += dist(pts[i], pts[i + 1]);
  return t;
};

/* Point to polyline, so a meter is measured against the whole spur and
   not only against the end somebody happened to draw last. */
function distToLine(p, g = []) {
  let best = Infinity;
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (!len2) { best = Math.min(best, dist(p, a)); continue; }
    let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    u = Math.max(0, Math.min(1, u));
    const d = dist(p, [a[0] + vx * u, a[1] + vy * u]);
    if (d < best) best = d;
  }
  return best;
}

/* ── The sizes that apply to this project ──

   Same resolution as the water builder's sizeTable and for the same
   reasons, which are argued at length there: a rule may name any number
   of operators, naming nobody is the house standard, rules naming other
   operators are dropped, and where an operator has restated a ceiling
   its rule takes that band from the generic one.

   Kept as its own function rather than shared with water because the
   two are keyed differently — water on a meter count, gas on kW and, for
   services, a length as well. A single parameterised resolver would
   have one argument meaning three things and would be read wrongly the
   first time somebody changed either standard. */
export function gasSizeTable(rows = [], opts = {}) {
  const {
    operatorIds = [], operators = [],
    kind = "main",
    tier = "LP",
  } = opts;
  const mineIds = operatorIds.filter((x) => x != null).map(Number);

  const named = new Map();
  for (const o of operators) {
    const key = Number(o.Gas_Pipe_Size_ID);
    if (!named.has(key)) named.set(key, []);
    named.get(key).push(o);
  }

  /* 1 where the rule names this project's operator, 0 where it names
     nobody — the house standard. Naming only other operators scores -1
     and is dropped: it is somebody else's. */
  const rank = (r) => {
    const mine = named.get(Number(r.Gas_Pipe_Size_ID)) || [];
    if (!mine.length) return 0;
    return mine.some((o) => mineIds.includes(Number(o.Organisation_ID))) ? 1 : -1;
  };

  const applies = rows.filter((r) =>
    r.Is_Active !== false
    && (r.Pipe_Kind ?? "main") === kind
    && (r.Pressure_Tier ?? "LP") === tier
    && Number(r.Max_kW) > 0
    && rank(r) >= 0);

  /* Grouped by the whole band, not by diameter alone.

     Water groups by diameter because its rules vary a ceiling against a
     fixed size. A gas service rule varies two things at once — the same
     32mm appears at 32.5 kW over 63 m and at 65 kW over 30 m — so
     diameter alone would collapse rows that say different things and
     the second would silently replace the first. */
  const bandOf = (r) =>
    `${Number(r.Diameter_mm)}|${Number(r.Max_kW)}|${r.Max_Length_m ?? ""}`;

  const best = new Map();
  for (const r of applies) {
    const key = bandOf(r);
    const held = best.get(key);
    if (!held) { best.set(key, r); continue; }
    const drop = rank(r) - rank(held)
      || (Number(held.Display_Order ?? 100) - Number(r.Display_Order ?? 100))
      || (Number(held.Gas_Pipe_Size_ID) - Number(r.Gas_Pipe_Size_ID));
    if (drop > 0) best.set(key, r);
  }

  /* Where an operator has ruled on a ceiling, the generic rules for the
     same ceiling go — so their 90mm at 1100 kW replaces the house 63mm
     rather than sitting beside it and losing on diameter. Nothing is
     dropped that the operator has not replaced. */
  const ruled = new Set([...best.values()]
    .filter((r) => rank(r) > 0)
    .map((r) => `${Number(r.Max_kW)}|${r.Max_Length_m ?? ""}`));

  const chosen = [...best.values()].filter((r) =>
    rank(r) > 0 || !ruled.has(`${Number(r.Max_kW)}|${r.Max_Length_m ?? ""}`));

  return chosen
    .map((r) => ({
      id: r.Gas_Pipe_Size_ID,
      diameter: Number(r.Diameter_mm),
      label: r.Size_Label || `${Number(r.Diameter_mm)}mm`,
      maxKw: Number(r.Max_kW),
      maxLength: r.Max_Length_m == null ? null : Number(r.Max_Length_m),
      forOperator: rank(r) > 0,
    }))
    /* Ascending diameter, because that is what is being minimised. Two
       rows can both carry the load and the smaller pipe is the answer —
       which is not the same as the lower ceiling, and sorting by kW
       would pick the wrong one on any length-banded service rule. */
    .sort((a, b) => a.diameter - b.diameter
      || a.maxKw - b.maxKw
      || (a.maxLength ?? Infinity) - (b.maxLength ?? Infinity));
}

/* The smallest pipe that carries this load over this length, or null
   where the table does not go that far.

   Length is ignored by mains rules, which carry no band — a main is cut
   where its size changes rather than where it gets long. */
export function gasSizeFor(table, kw, metres = 0) {
  return table.find((s) => s.maxKw >= kw
    && (s.maxLength == null || s.maxLength >= metres)) || null;
}

/* The smallest pipe there is.

   A build can lay everything at the minimum and let the levels check
   decide what has to grow. That is how a designer works \u2014 start small,
   upsize where the pressure says \u2014 and it makes the check the single
   arbiter rather than having two things size the same network by
   different rules.

   The trade is that capacity is no longer respected at build time: a
   63mm pipe has a kW ceiling and laying it under 1200 kW ignores that.
   The levels check reports it instead, which is the point \u2014 one place
   that says what is wrong rather than a build that quietly avoids it. */
export const smallestSize = (table) => table[0] ?? null;

/* ── Diversity ──

   Resolved the same way as the sizes: the operator's rules win, naming
   nobody is the house standard, and other operators' rules are dropped. */
export function diversityTable(rows = [], opts = {}) {
  const { operatorIds = [], operators = [] } = opts;
  const mineIds = operatorIds.filter((x) => x != null).map(Number);

  const named = new Map();
  for (const o of operators) {
    const key = Number(o.Gas_Diversity_ID);
    if (!named.has(key)) named.set(key, []);
    named.get(key).push(o);
  }
  const rank = (r) => {
    const mine = named.get(Number(r.Gas_Diversity_ID)) || [];
    if (!mine.length) return 0;
    return mine.some((o) => mineIds.includes(Number(o.Organisation_ID))) ? 1 : -1;
  };

  const applies = rows.filter((r) =>
    r.Is_Active !== false
    && Number(r.Max_Supplies) > 0
    && Number(r.Factor) > 0
    && rank(r) >= 0);

  const best = new Map();
  for (const r of applies) {
    const key = Number(r.Max_Supplies);
    const held = best.get(key);
    if (!held) { best.set(key, r); continue; }
    const drop = rank(r) - rank(held)
      || (Number(held.Display_Order ?? 100) - Number(r.Display_Order ?? 100));
    if (drop > 0) best.set(key, r);
  }

  return [...best.values()]
    .map((r) => ({
      id: r.Gas_Diversity_ID,
      max: Number(r.Max_Supplies),
      factor: Number(r.Factor),
      forOperator: rank(r) > 0,
    }))
    .sort((a, b) => a.max - b.max);
}

/* The factor for this many supplies, or null above the top of the table.

   Null rather than the last row carried onward: a table stopping at
   fifty says nothing about ninety, and a site larger than the standard
   was written for is a question for the operator. */
export const diversityFor = (table, supplies) =>
  table.find((d) => d.max >= supplies) || null;

/* Rows that undo the point of the table — a larger count diversifying
   less than a smaller one. Reported rather than corrected, because
   which of the two rows is the typo is not knowable from here. */
export function diversityInversions(table = []) {
  const bad = [];
  for (let i = 1; i < table.length; i++) {
    if (table[i].factor > table[i - 1].factor) {
      bad.push({ lower: table[i - 1], higher: table[i] });
    }
  }
  return bad;
}

/* The runs of gas main a drawing calls for.

   Pure: it reads features and returns geometry. Creating anything is
   the canvas's job, which is what lets this be tested against a made-up
   drawing rather than against a project. */
/* Build every gas network on the drawing.

   A site can be fed from more than one side: two mains in different
   roads, each serving its own part of an estate, with the networks
   never meeting. The walk below starts at one POC and reaches only what
   is connected to it, so a second network was left undrawn — no error,
   no mention, just half a site with no main on it.

   Run once per POC and the results joined. Safe precisely because the
   networks do not touch: a trench reachable from two POCs would be one
   network with two feeds, which is a different problem and one this
   would get wrong. So anything already claimed by an earlier walk is
   left to it, and a trench claimed twice is reported rather than laid
   twice.

   Run labels are made unique across the whole drawing, since G1 from
   one network and G1 from another are two different lengths of main. */
export function gasMainRuns(features = [], opts = {}) {
  const layerKey = opts.layerKey ?? "gas";
  const pocs = features.filter((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey && (f.Geometry || []).length);

  if (pocs.length > 1 && !opts.singlePoc) {
    const seen = new Set();
    const merged = {
      runs: [], unserved: [], strandedMeters: [], unattachedServices: [],
      overDiverse: [], noLoad: [], bySize: new Map(), totalM: 0,
      networks: [],
    };
    let error = null;

    pocs.forEach((poc, i) => {
      /* One POC at a time, by hiding the others from the walk: it takes
         the first it finds, and this is the only way to say which
         without rewriting how it starts. */
      const only = features.filter((f) => f.Feature_Role !== "poc"
        || f.Layer_Key !== layerKey || f === poc);
      const part = gasMainRuns(only, { ...opts, singlePoc: true });

      if (part.error) {
        /* One network failing does not stop the rest \u2014 half a drawing
           built is better than none, and the reason is reported. */
        merged.networks.push({ poc, error: part.error });
        if (!error) error = part.error;
        return;
      }

      const claimed = [];
      for (const r of part.runs || []) {
        const key = String(r.featureId ?? `${r.fromNode}|${r.endNode}`);
        if (seen.has(key)) continue;
        seen.add(key);
        /* Numbered across the drawing, so no two lengths share a name. */
        claimed.push({ ...r, id: `G${merged.runs.length + claimed.length + 1}` });
      }
      merged.runs.push(...claimed);

      for (const k of ["unserved", "strandedMeters", "unattachedServices",
        "overDiverse", "noLoad"]) {
        merged[k].push(...(part[k] || []));
      }
      merged.totalM = Math.round((merged.totalM + (part.totalM || 0)) * 10) / 10;
      merged.networks.push({ poc, runs: claimed.length, metres: part.totalM ?? 0 });
    });

    /* Only an error if nothing at all could be built. */
    return merged.runs.length ? merged : { error, networks: merged.networks };
  }

  return gasMainRunsFromOne(features, opts);
}

function gasMainRunsFromOne(features = [], opts = {}) {
  const {
    lineTypes = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    breakAtServices = false,
    /* Lay everything at the smallest pipe and let the levels check say
       what has to grow, rather than sizing each length to the load it
       carries. */
    minimumSize = false,
    /* Which utility this is. The gas POC and gas meters, because a site
       has electric ones too and they are nowhere near each other. */
    layerKey = "gas",

    /* How far the main runs past its last tee before it is capped.
       Zero lays it exactly to the last tee, which is what this did
       before — kept as a number rather than a flag so a scheme whose
       operator wants two metres is a call site, not a fork. */
    endExtendM = END_EXTEND_M,

    /* ── Sizing ──

       All optional. Given none of them this returns what it always did:
       runs, lengths and counts, with no size on anything. That is the
       behaviour a drawing built before 0130 gets, and it is a real
       answer rather than a degraded one — the route was never the part
       that needed a table. */
    pipeSizes = [],
    pipeSizeOperators = [],
    diversity = [],
    diversityOperators = [],
    /* The operators this scheme is with, as organisations: whoever is
       adopting it, and the GT. Rules are read for both and the rules
       decide which one they were meant for. */
    operatorIds = [],
    /* LP or MP. The same load takes different pipe on each, so this is
       not a display detail. */
    tier = "LP",
    /* Plot_ID to the plot row, for the gas load. A function rather than
       a map because that is how the electric side takes it and there is
       no reason for the two to differ. */
    plotById = null,
  } = opts;

  /* Sizing is asked for by supplying a table, not by a flag. A caller
     that has the rules wants them used; one that has none cannot. */
  const sizing = pipeSizes.length > 0;

  const trenches = features.filter((f) =>
    f.Feature_Type === "line"
    && isTrenchLine(f, lineTypes)
    && (f.Geometry || []).length >= 2);

  const mains = trenches.filter((f) => !isServiceLine(f));
  const services = trenches.filter(isServiceLine);

  if (!mains.length) {
    return { error: "No mains trenches drawn \u2014 there is nothing to lay the main along." };
  }

  const poc = features.find((f) => f.Feature_Role === "poc"
    && f.Layer_Key === layerKey
    && (f.Geometry || []).length);
  if (!poc) {
    return { error: "Place the gas POC first \u2014 the main is built out from it." };
  }

  /* ── The graph ── */
  const nodes = [];
  const adj = new Map();
  const intern = (p) => {
    for (let i = 0; i < nodes.length; i++) if (dist(nodes[i], p) <= eps) return i;
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };
  const addEdge = (a, b) => {
    if (a === b) return;
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a).push(b);
    adj.get(b).push(a);
  };

  const trenchNodes = new Map();
  for (const f of mains) {
    const ids = f.Geometry.map(intern);
    trenchNodes.set(f.Feature_ID, ids);
    for (let i = 0; i + 1 < ids.length; i++) addEdge(ids[i], ids[i + 1]);
  }

  /* ── Where the main starts ── */
  let root = -1;
  let rootGap = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = dist(nodes[i], poc.Geometry[0]);
    if (d < rootGap) { rootGap = d; root = i; }
  }
  if (root < 0 || rootGap > tol) {
    /* With the distance, because "not on the network" is a search and
       "forty-two metres away" is a fix. The POC is placed at the centre
       of the view and snaps to a main, so before any main exists it
       lands wherever the screen happened to be — this is the ordinary
       first-run case, not a fault. */
    return {
      error: `The gas POC is ${Math.round(rootGap)} m from the nearest mains trench.`
        + " Move it onto the trench \u2014 the main is built out from where it sits.",
      pocGap: Math.round(rootGap * 10) / 10,
    };
  }

  /* ── Outward from the POC ──
     Breadth first, so every node hangs off the shortest way back to the
     POC, which is the way the pipe runs. */
  const parent = new Array(nodes.length).fill(-1);
  const seen = new Array(nodes.length).fill(false);
  const order = [];
  seen[root] = true;
  const queue = [root];
  while (queue.length) {
    const u = queue.shift();
    order.push(u);
    for (const v of adj.get(u) || []) {
      if (seen[v]) continue;
      seen[v] = true;
      parent[v] = u;
      queue.push(v);
    }
  }

  /* ── Which services carry gas to a meter ──

     Meter first, not service first. A service trench is a hole in the
     ground with no utility of its own — the same spur carries the
     electric and the gas — so asking "is this a gas service trench" has
     no answer. Asking which spur a gas meter sits on does.

     Anchored at the plot seed where there is one, as the feeder does:
     the meter glyph is drawn beside its seed rather than on the spur,
     and measuring from the glyph puts every meter a couple of metres
     further out than it is. */
  const seedOf = (m) => {
    const sid = m.Attributes?.Seed_Feature_ID;
    if (sid != null) {
      return features.find((s) => s.Feature_Role === "plot"
        && Number(s.Feature_ID) === Number(sid));
    }
    if (m.Plot_ID == null) return null;
    return features.find((s) => s.Feature_Role === "plot"
      && Number(s.Plot_ID) === Number(m.Plot_ID));
  };

  const meters = features.filter((m) => m.Feature_Role === "meter"
    && m.Layer_Key === layerKey
    && (m.Geometry || []).length);

  /* How many gas meters each service trench carries, and what they
     draw.

     Counted and summed in the same pass because they answer to the same
     question — which spur is this meter on — and separating them would
     mean two walks that could disagree about the answer.

     A meter whose plot has no gas load is named rather than counted as
     zero. Zero is a legitimate figure for a plot that takes no gas, and
     a plot that takes gas with nobody having said how much is a gap; on
     a total they look identical, and the second one undersizes a main. */
  const servedBy = new Map();
  const kwBy = new Map();
  /* And which meters, not only how many.

     The counts answer "is this right"; the list answers "which one is
     wrong", and only the second is actionable. A total one short sends
     somebody hunting across seventy plots for a meter the build already
     knew the name of. */
  const metersBy = new Map();
  const noLoad = [];
  const loadOf = (m) => {
    if (!plotById || m.Plot_ID == null) return null;
    const plot = plotById(m.Plot_ID);
    const kw = plot?.gas_load_kw ?? plot?.Gas_Load_kW;
    return kw != null && kw !== "" ? Number(kw) : null;
  };

  const strandedMeters = [];
  for (const m of meters) {
    const seed = seedOf(m);
    const anchor = (seed?.Geometry || []).length ? seed.Geometry[0] : m.Geometry[0];

    let best = null;
    for (const sv of services) {
      /* Measured from both the seed and the glyph, and the better of
         the two taken: a meter whose seed is missing is still a meter,
         and one drawn a little inside the plot boundary should not be
         thrown away for it. */
      const d = Math.min(distToLine(anchor, sv.Geometry), distToLine(m.Geometry[0], sv.Geometry));
      if (!best || d < best.d) best = { d, sv };
    }
    if (best && best.d <= tol) {
      servedBy.set(best.sv.Feature_ID, (servedBy.get(best.sv.Feature_ID) || 0) + 1);
      if (!metersBy.has(best.sv.Feature_ID)) metersBy.set(best.sv.Feature_ID, []);
      metersBy.get(best.sv.Feature_ID).push({
        id: m.Feature_ID,
        label: m.Label || `Meter ${m.Feature_ID}`,
        plotId: m.Plot_ID ?? null,
        at: m.Geometry[0],
      });
      const kw = loadOf(m);
      if (kw == null) {
        if (sizing) {
          noLoad.push({
            id: m.Feature_ID,
            label: m.Label || `Meter ${m.Feature_ID}`,
            plotId: m.Plot_ID ?? null,
            at: m.Geometry[0],
          });
        }
      } else {
        kwBy.set(best.sv.Feature_ID, (kwBy.get(best.sv.Feature_ID) || 0) + kw);
      }
    } else {
      /* Named rather than counted: a gas meter on no service trench is
         a plot that will not get gas, and somebody has to go and look
         at it. */
      strandedMeters.push({
        id: m.Feature_ID,
        label: m.Label || `Meter ${m.Feature_ID}`,
        plotId: m.Plot_ID ?? null,
        at: m.Geometry[0],
      });
    }
  }

  /* ── Where those services meet the main ── */
  const demand = new Array(nodes.length).fill(0);
  const demandKw = new Array(nodes.length).fill(0);
  const tees = new Set();
  const unattachedServices = [];

  for (const sv of services) {
    const carried = servedBy.get(sv.Feature_ID) || 0;
    const carriedKw = kwBy.get(sv.Feature_ID) || 0;
    if (!carried) continue;                 // carries no gas meter

    const g = sv.Geometry;
    let hit = -1;
    let bd = Infinity;
    for (const end of [g[0], g[g.length - 1]]) {
      for (let i = 0; i < nodes.length; i++) {
        const d = dist(nodes[i], end);
        if (d < bd) { bd = d; hit = i; }
      }
    }

    if (hit >= 0 && bd <= eps && seen[hit]) {
      demand[hit] += carried;
      demandKw[hit] += carriedKw;
      tees.add(hit);
    } else {
      /* Reaches a meter but not the main. The gas has nowhere to come
         from, and the pipe should not be drawn to a tee that isn't
         there.

         Two ways to land here, and the gap tells them apart: a spur
         that stops short of the main, and one that meets it at a point
         the POC cannot reach. The second has a small gap and a real
         join, which is why every proximity check passes on it. */
      unattachedServices.push({
        id: sv.Feature_ID,
        label: sv.Label || `Service trench ${sv.Feature_ID}`,
        meters: carried,
        /* The meters that go with it, so the shortfall can be named
           rather than counted. */
        meterList: metersBy.get(sv.Feature_ID) || [],
        gap: Math.round(bd * 100) / 100,
        reached: hit >= 0 && bd <= eps,
        at: g[0],
      });
    }
  }

  if (!tees.size) {
    return {
      error: "No gas service trench reaches a gas meter from the mains trench, so"
        + " there is nothing for the main to feed.",
      strandedMeters,
      unattachedServices,
    };
  }

  /* ── What each branch feeds ──
     Backwards down the visit order, so a node is summed only once
     everything beyond it has been. */
  const served = demand.slice();
  const servedKw = demandKw.slice();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (parent[u] >= 0) {
      served[parent[u]] += served[u];
      servedKw[parent[u]] += servedKw[u];
    }
  }

  /* ── What sizes it ──

     Built here rather than at the top because everything above is worth
     answering whether or not a size is wanted: a caller with no rules
     still gets its runs, its lengths and the two kinds of bare trench. */
  const table = sizing
    ? gasSizeTable(pipeSizes, {
      operatorIds, operators: pipeSizeOperators, kind: "main", tier,
    })
    : [];
  const divTable = sizing
    ? diversityTable(diversity, { operatorIds, operators: diversityOperators })
    : [];

  if (sizing && !table.length) {
    /* Two faults that read as one: an empty table, or a table whose
       every row names an operator this project is not with. */
    const anyActive = pipeSizes.some((r) => r.Is_Active !== false
      && (r.Pipe_Kind ?? "main") === "main"
      && (r.Pressure_Tier ?? "LP") === tier);
    return {
      error: anyActive
        ? `No ${tier} mains pipe size applies to this project\u2019s operator \u2014 `
          + "every rule configured for that tier names a different one. Add a rule "
          + "for this operator, or untick its operators to make it the standard."
        : `No ${tier} mains pipe sizes are configured \u2014 add them in Admin \u203a `
          + "Gas Pipe Sizes. A size is read off that table, so there is nothing "
          + "to size a main with.",
    };
  }

  if (sizing && !divTable.length) {
    /* The one case where having the sizes is not enough. Said at length
       because the fix is a purchase and a decision, not a tick box. */
    return {
      error: "No gas diversity factors are configured, so a main cannot be sized "
        + "\u2014 the pipe tables are keyed on diversified load, and the summed "
        + "peak of every plot is not that figure. Add them in Admin \u203a Gas "
        + "Diversity, from IGE/GL/1 Appendix A5 or your operator\u2019s own "
        + "standard. The main can still be laid unsized in the meantime.",
    };
  }

  const inversions = diversityInversions(divTable);

  /* Diversified load beyond a node: what the plots past it draw at
     once, times the factor for how many of them there are.

     Both readings taken at the same node. A factor from the site total
     applied to a leg's load, or the reverse, would be two different
     points in the network answering one question. */
  const overDiverse = [];
  const loadAt = (v) => {
    if (!sizing) return null;
    const supplies = served[v];
    if (!supplies) return 0;
    const d = diversityFor(divTable, supplies);
    if (!d) {
      overDiverse.push({ supplies, at: nodes[v].slice() });
      return null;
    }
    return Math.round(servedKw[v] * d.factor * 100) / 100;
  };

  /* The size of the length arriving at v is decided by everything from
     v outward — the load it still has to carry. */
  const sizeAt = (v) => {
    const kw = loadAt(v);
    if (kw == null) return null;
    return minimumSize ? smallestSize(table) : gasSizeFor(table, kw);
  };
  /* "over" and "unknown" are different answers and must not collapse
     into one break: a run past the top of the pipe table and a run past
     the top of the diversity table are different faults with different
     fixes, and a size change between them is a real change. */
  const sizeKey = (v) => {
    if (!sizing) return "";
    const kw = loadAt(v);
    if (kw == null) return "nodiv";
    return sizeAt(v)?.id ?? "over";
  };

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  /* Only the branches with gas beyond them. This is the whole of the
     "where gas services connect" rule: everything else follows from it,
     including the main stopping after the last tee. */
  const kids = (u) => (children.get(u) || []).filter((c) => served[c] > 0);

  /* ── The runs ──
     A run ends where the main divides, where it stops, where the size
     changes, and — if asked — where a service tees off it. A corner is
     none of those, so the run carries on through it.

     The size break is what makes a sized main read as a taper. Without
     it the spine would be one pipe at one diameter from the POC to the
     last house, which is neither what the table says nor what gets
     laid. With sizing off, sizeKey is constant and the break is the
     three-way one this always had. */
  const isBreak = (u) => u === root
    || kids(u).length !== 1
    || (breakAtServices && tees.has(u))
    || sizeKey(kids(u)[0]) !== sizeKey(u);

  const runs = [];
  /* Runs carrying more than the largest configured pipe will take.
     Collected rather than rounded up to the biggest available, for the
     reason 0117 gives for water and Cadent's own table gives for gas:
     past the top of it the answer is "by negotiation", which is exactly
     the question a drawing must not answer on its own. */
  const oversized = [];
  const covered = new Set();
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

  /* ── The stub past a dead end ──

     Measured along the trench where there is trench to follow, and
     straight on where there is not.

     Both cases are ordinary. A main that stops after the last house
     usually has trench carrying on past it — the spur was dug to the
     end of the road whether or not gas goes that far — and pipe laid
     there follows the ground, so a trench that turns within the first
     metre and a half turns the stub with it. Where the trench really
     does end, the pipe carries on in the direction it was going, which
     is the only answer available and the one somebody drawing it by
     hand would give.

     `adj` rather than `children`, because the onward trench has no gas
     beyond it and so was filtered out of the tree the runs walk. The
     turn limit is the water builder's, for its reason: an estate road
     bends, and a spur leaves at something near a right angle. A stub
     that took the sharp turn would double back alongside the main it
     just left. */
  const EXTEND_TURN_LIMIT_DEG = 60;

  function extendPast(prevIdx, endIdx, want) {
    const out = [];
    if (!(want > 0)) return out;

    let aIdx = prevIdx;
    let bIdx = endIdx;
    let a = nodes[aIdx];
    let b = nodes[bIdx];
    let left = want;
    /* Every edge is taken at most once, so a stub that meets a loop of
       trench stops rather than circling it. */
    const walked = new Set([edgeKey(aIdx, bIdx)]);

    while (left > 1e-9) {
      const len = dist(a, b);
      if (!len) break;
      const inc = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];

      let best = null;
      for (const v of adj.get(bIdx) || []) {
        if (v === aIdx || walked.has(edgeKey(bIdx, v))) continue;
        const d = dist(nodes[bIdx], nodes[v]);
        if (!d) continue;
        const dir = [(nodes[v][0] - b[0]) / d, (nodes[v][1] - b[1]) / d];
        const dot = Math.max(-1, Math.min(1, dir[0] * inc[0] + dir[1] * inc[1]));
        const turn = (Math.acos(dot) * 180) / Math.PI;
        if (turn > EXTEND_TURN_LIMIT_DEG) continue;
        if (!best || turn < best.turn) best = { v, turn, dir, d };
      }

      /* Nowhere to follow, or the next length of trench is longer than
         what is left: either way the stub ends inside this step. */
      if (!best) {
        out.push([b[0] + inc[0] * left, b[1] + inc[1] * left]);
        break;
      }
      if (best.d >= left) {
        out.push([b[0] + best.dir[0] * left, b[1] + best.dir[1] * left]);
        break;
      }

      out.push(nodes[best.v].slice());
      left -= best.d;
      walked.add(edgeKey(bIdx, best.v));
      aIdx = bIdx; a = b;
      bIdx = best.v; b = nodes[bIdx];
    }
    return out;
  }

  const walk = [root];
  while (walk.length) {
    const u = walk.shift();
    for (const first of kids(u)) {
      let cur = first;
      /* The node the run arrives from, which is the direction the stub
         at a dead end carries on in. Tracked here rather than read back
         off `pts`, because by then the stub has been appended to it. */
      let prevIdx = u;
      const pts = [nodes[u].slice(), nodes[first].slice()];
      covered.add(edgeKey(u, first));
      let teed = tees.has(first) ? 1 : 0;
      let fed = demand[first];

      while (!isBreak(cur)) {
        const next = kids(cur)[0];
        pts.push(nodes[next].slice());
        covered.add(edgeKey(cur, next));
        if (tees.has(next)) teed += 1;
        fed += demand[next];
        prevIdx = cur;
        cur = next;
      }

      /* ── Past the last tee ──

         Only where the main stops. A run that ends because it divides,
         or because the size changes, carries straight on as the next
         run — capping it there would put an end in the middle of a
         continuous pipe.

         `endNode` stays the node it was: the run ends where the network
         ends, and the stub is pipe past it rather than a new place for
         the next run to start from. */
      const tail = kids(cur).length ? [] : extendPast(prevIdx, cur, endExtendM);
      const beforeTail = lengthOf(pts);
      if (tail.length) pts.push(...tail);

      /* Read at the top of the run, which is the most it carries and
         therefore what sizes it. The far end carries less — every tee
         along the way has taken its share — and sizing on that would
         put the thinnest pipe of the run on the whole of it. */
      const carriesKw = loadAt(first);
      /* Minimum everywhere, or sized to the load it carries. */
      const size = carriesKw == null ? null
        : (minimumSize ? smallestSize(table) : gasSizeFor(table, carriesKw));
      const run = {
        pts,
        metres: Math.round(lengthOf(pts) * 10) / 10,
        fromNode: u,
        endNode: cur,
        /* How many services come off this length, and how many meters
           they carry — the numbers somebody counts off the drawing by
           hand when checking a quantity. */
        services: teed,
        meters: fed,
        /* Everything beyond the far end of this run, which is what says
           whether it is the spine or a leg off it. */
        metersBeyond: served[cur],
        /* This run ends the main, so it gets the cap. Read by the
           canvas off the geometry rather than off this flag — the flag
           is for the counts in the confirm box, which are worked out
           before anything is written. */
        endCap: tail.length > 0,
        /* How much of `metres` is stub rather than main proper. The two
           are the same pipe and are not separated in the schedule, but
           a total that grew by six metres between one build and the
           next should say where the six metres came from. */
        extendedM: tail.length
          ? Math.round((lengthOf(pts) - beforeTail) * 10) / 10
          : 0,
        /* Null throughout where no rules were supplied, which is the
           unsized build and not a failure of one. */
        size,
        kw: carriesKw,
        /* Undiversified as well, because the two together are what
           somebody checks a factor against — a diversified figure alone
           cannot be argued with. */
        rawKw: Math.round(servedKw[first] * 100) / 100,
        supplies: served[first],
      };
      if (sizing && !size) {
        oversized.push({
          kw: carriesKw,
          supplies: served[first],
          metres: run.metres,
          at: nodes[u].slice(),
        });
      }
      runs.push(run);
      /* Carry on from the far end, so the runs come out in the order
         they leave the POC and G1 is the first length of main. */
      walk.push(cur);
    }
  }

  /* ── The trench that gets no pipe, and why ──

     Two different answers, and telling them apart is the point: a
     trench the POC cannot reach is a gap to close, and a trench with no
     gas beyond it is working as intended. Reported by name either way,
     because a build that quietly covers three quarters of a site reads
     as a build that worked. */
  const unreachable = [];
  const unserved = [];
  for (const f of mains) {
    const ids = trenchNodes.get(f.Feature_ID) || [];
    const geom = f.Geometry;

    if (!ids.some((i) => seen[i])) {
      unreachable.push({
        id: f.Feature_ID,
        label: f.Label || `Trench ${f.Feature_ID}`,
        metres: Math.round((Number(f.Attributes?.Length_m ?? 0) || lengthOf(geom)) * 10) / 10,
        at: geom[0] ?? null,
      });
      continue;
    }

    /* Reachable, so measure the part of it no run covers. Per edge
       rather than per feature: one drawn trench often runs past the
       last service and on to the end of the site, and only the tail of
       it is left out. */
    let bare = 0;
    for (let i = 0; i + 1 < ids.length; i++) {
      if (covered.has(edgeKey(ids[i], ids[i + 1]))) continue;
      bare += dist(geom[i], geom[i + 1]);
    }
    if (bare > eps) {
      unserved.push({
        id: f.Feature_ID,
        label: f.Label || `Trench ${f.Feature_ID}`,
        metres: Math.round(bare * 10) / 10,
        at: geom[0] ?? null,
      });
    }
  }

  /* How much of each size, for the schedule. Nothing to group by on an
     unsized build, so it comes back empty rather than as one nameless
     row holding everything. */
  const bySize = [];
  if (sizing) {
    for (const r of runs) {
      const key = r.size?.id ?? "over";
      let row = bySize.find((x) => x.key === key);
      if (!row) {
        row = { key, label: r.size?.label ?? "over capacity", runs: 0, metres: 0 };
        bySize.push(row);
      }
      row.runs += 1;
      row.metres = Math.round((row.metres + r.metres) * 10) / 10;
    }
  }

  return {
    runs,
    bySize,
    sized: sizing,
    totalM: Math.round(runs.reduce((t, r) => t + r.metres, 0) * 10) / 10,
    /* How many ends the main has, and how much of the total is the pipe
       run past them. Both in `totalM` and in the schedule already —
       said separately because it is the figure that changes an existing
       quantity, and a total that moved with no explanation reads as a
       drawing that changed. */
    endCaps: runs.filter((r) => r.endCap).length,
    extendedM: Math.round(runs.reduce((t, r) => t + r.extendedM, 0) * 10) / 10,
    poc,
    pocGap: Math.round(rootGap * 10) / 10,
    /* Tees the main now runs past, and the meters they carry. */
    services: tees.size,
    meters: served[root],
    /* What the site draws, before and after diversity. Both, because a
       factor is only checkable against the figure it was applied to. */
    rawKw: Math.round(servedKw[root] * 100) / 100,
    kw: loadAt(root),
    /* Runs past the top of the pipe table, and points past the top of
       the diversity table. Two different fixes, so two lists. */
    oversized,
    overDiverse,
    largest: table[table.length - 1] ?? null,
    /* Gas meters on a service trench whose plot has no gas load. They
       contribute nothing to the total, so every pipe upstream of them
       is sized light until somebody sets a figure. */
    noLoad,
    /* The rules this was built with, and how many were chosen for the
       operator rather than inherited. A figure somebody disagrees with
       is nearly always a rule they did not know applied. */
    sizeRules: table.length,
    operatorRules: table.filter((t) => t.forOperator).length,
    diversityRules: divTable.length,
    /* A descending factor that ascends. Not corrected here — which of
       the two rows is the typo is not knowable from a drawing. */
    diversityInversions: inversions,
    /* Gas meters on no service trench at all. */
    strandedMeters,
    /* Service trenches that reach a meter but not the main. */
    unattachedServices,
    /* ── Every meter the main does not reach, by name ──

       The two lists above say what is wrong with the drawing; this says
       who it costs. They are kept separate because the fixes differ —
       one is a missing spur, the other a spur that does not land — but
       a total one short is a question about meters, and answering it
       should not mean cross-referencing two lists and a plot schedule.

       `why` travels with each row so the panel can say which fix
       applies without recomputing anything. */
    unservedMeters: [
      ...strandedMeters.map((m) => ({ ...m, why: "on no service trench" })),
      ...unattachedServices.flatMap((s) => (s.meterList || []).map((m) => ({
        ...m,
        why: s.reached
          ? "its service meets the main at a point the POC can\u2019t reach"
          : `its service stops ${s.gap} m short of the main`,
        serviceId: s.id,
        serviceLabel: s.label,
      }))),
    ],
    /* Mains trench with no pipe: not joined to the POC, or nothing
       taking gas beyond it. */
    unreachable,
    unserved,
    unservedM: Math.round(unserved.reduce((t, u) => t + u.metres, 0) * 10) / 10,
  };
}
