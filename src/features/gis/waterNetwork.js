/* Laying the water main, and sizing it.

   The third of the three network builders, and it sits between the
   other two. Gas is a covering problem — one pipe, no sizing. Electric
   is a design problem — load, impedance and volt drop, worked out.
   Water is a counting problem: how many plots are fed beyond this
   point, and which pipe carries that many.

   ── The count is the whole design ──

   Nothing else enters into it. Not length, not fall, not pressure — the
   size follows from the number of water meters downstream of the point
   being sized, read against a table somebody configures. So the work
   here is accumulating meters back towards the POC, which is the same
   walk the feeder does for load and the gas builder does for presence,
   and then cutting the network where the answer changes.

   ── Where a run ends ──

   At a junction, at the end, and where the size changes.

   The last of those is what makes this different from the gas builder.
   Walking out from the POC the count falls as each service tees off, so
   a single length of trench can cross two or three size bands. Cutting
   only at junctions would mean one pipe carrying one size where the
   ground holds a taper; cutting at every tee would mean a schedule of
   two hundred pipes on an estate that has four. Cutting where the size
   changes is the schedule somebody would write by hand.

   ── What is not here ──

   The table itself. Sizes come in as an argument, read from
   Water_Pipe_Size, because the standard is the customer's and not this
   application's — twenty per 63mm is a row in a table somebody can
   change, not a constant in a source file.

   And no fallback. Where the table stops short of the network the run
   is reported rather than given the largest pipe: a spine needing more
   than the configured maximum is a design question, and answering it by
   silently rounding up is how a drawing goes out with a pipe on it that
   nobody chose. */

import { CONNECT_EPS, SNAP_TOL, isTrenchLine, isServiceLine } from "./feeder.js";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

const lengthOf = (pts = []) => {
  let t = 0;
  for (let i = 0; i + 1 < pts.length; i++) t += dist(pts[i], pts[i + 1]);
  return t;
};

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

/* The sizes that apply to this project, smallest capacity first.

   ── Sorted by capacity, not diameter ──

   That is what is being chosen against, and the two orders only agree
   while somebody keeps them agreeing. A 90mm row carrying fewer plots
   than the 63mm row is a mistake in the table, but sorting by capacity
   means the sizing still picks a pipe that fits rather than one that
   does not.

   ── Whose rule ──

   A rule may name any number of operators, because the standard belongs
   to the adopting operator rather than to the industry — one NAV allows
   twenty plots on 63mm where another allows sixteen — and because
   operators mostly agree, so one rule usually covers several of them.
   The names live in Water_Pipe_Size_Operator, a row per operator, and
   arrive here as `operators`.

   An operator is an organisation, not an IDNO row and not a DNO row.
   The same company can hold both roles, and which one it is being dealt
   with as has nothing to do with what size pipe it will adopt — 0069
   makes that argument for agreements and it is the same argument here.

   Naming nobody is the house standard and applies anywhere.

   Rules naming operators this project is not with are dropped. Of what
   is left, where a diameter appears more than once the one naming the
   operator wins — per diameter, so an operator differing on 63mm alone
   needs one rule and still inherits the 90 and the 125. Keeping only
   the most specific *tier* would have been fewer lines and would
   silently drop every size that operator had not restated.

   Two equally specific rules for one diameter is an untidy table rather
   than an unanswerable question: the lower Display_Order wins, so the
   drawing is the same every time it is built. */
export function sizeTable(rows = [], opts = {}) {
  /* Operators, plural: a project has an adopting operator and a DNO,
     and a rule may be written against either. Both are organisations,
     so this is one list rather than two fields to compare separately. */
  const { operatorIds = [], operators = [] } = opts;
  const mineIds = operatorIds.filter((x) => x != null).map(Number);

  /* The operators each rule names, gathered once rather than scanned
     per rule per diameter. */
  const named = new Map();
  for (const o of operators) {
    const key = Number(o.Water_Pipe_Size_ID);
    if (!named.has(key)) named.set(key, []);
    named.get(key).push(o);
  }

  /* 1 where the rule names this project's operator, 0 where it names
     nobody at all — the house standard. A rule naming only other
     operators scores -1 and is dropped: it is somebody else's. */
  const rank = (r) => {
    const mine = named.get(Number(r.Water_Pipe_Size_ID)) || [];
    if (!mine.length) return 0;
    return mine.some((o) => mineIds.includes(Number(o.Organisation_ID))) ? 1 : -1;
  };

  const applies = rows.filter((r) =>
    r.Is_Active !== false && Number(r.Max_Meters) > 0 && rank(r) >= 0);

  const best = new Map();
  for (const r of applies) {
    const key = Number(r.Diameter_mm);
    const held = best.get(key);
    if (!held) { best.set(key, r); continue; }
    const drop = rank(r) - rank(held)
      || (Number(held.Display_Order ?? 100) - Number(r.Display_Order ?? 100))
      || (Number(held.Water_Pipe_Size_ID) - Number(r.Water_Pipe_Size_ID));
    if (drop > 0) best.set(key, r);
  }

  return [...best.values()]
    .map((r) => ({
      id: r.Water_Pipe_Size_ID,
      diameter: Number(r.Diameter_mm),
      label: r.Size_Label || `${Number(r.Diameter_mm)}mm`,
      max: Number(r.Max_Meters),
      /* Whether this rule was chosen for this operator or is the house
         standard \u2014 so the build can say which table it used, and a
         figure that looks wrong can be traced to the rule behind it. */
      forOperator: rank(r) > 0,
    }))
    .sort((a, b) => a.max - b.max || a.diameter - b.diameter);
}

/* The smallest pipe that will carry this many meters, or null where the
   table does not go that far. */
export function sizeFor(table, meters) {
  return table.find((s) => s.max >= meters) || null;
}

export function waterMainRuns(features = [], opts = {}) {
  const {
    lineTypes = [],
    pipeSizes = [],
    /* Which operators each rule names, from Water_Pipe_Size_Operator. */
    pipeSizeOperators = [],
    /* The operators this scheme is with, as organisations — whoever is
       adopting it, and the DNO. The rules are read for them. */
    operatorIds = [],
    eps = CONNECT_EPS,
    tol = SNAP_TOL,
    layerKey = "water",
  } = opts;

  const table = sizeTable(pipeSizes, { operatorIds, operators: pipeSizeOperators });
  if (!table.length) {
    /* Two different faults, and the fix differs: an empty table, or a
       table whose every row names an operator this project is not
       with. The second reads as the first unless it is said. */
    const anyActive = pipeSizes.some((r) => r.Is_Active !== false);
    return {
      error: anyActive
        ? "No water pipe size applies to this project's operator \u2014 every rule "
          + "configured names a different operator. Add a rule for this one, or "
          + "untick its operators to make it the standard."
        : "No water pipe sizes are configured \u2014 add them in Admin \u203a "
          + "Water Pipe Sizes. A size is read off that table, so there is nothing "
          + "to draw without it.",
    };
  }

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
    return { error: "Place the water POC first \u2014 the main is built out from it." };
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
    return {
      error: `The water POC is ${Math.round(rootGap)} m from the nearest mains trench.`
        + " Move it onto the trench \u2014 the main is built out from where it sits.",
      pocGap: Math.round(rootGap * 10) / 10,
    };
  }

  /* ── Outward from the POC ── */
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

  /* ── The meters, and which spur carries each ──

     Meter first, as the gas builder does and for the same reason: a
     service trench has no utility of its own, so the answerable question
     is which spur a water meter sits on. */
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

  const servedBy = new Map();
  const strandedMeters = [];
  for (const m of meters) {
    const seed = seedOf(m);
    const anchor = (seed?.Geometry || []).length ? seed.Geometry[0] : m.Geometry[0];

    let best = null;
    for (const sv of services) {
      const d = Math.min(distToLine(anchor, sv.Geometry), distToLine(m.Geometry[0], sv.Geometry));
      if (!best || d < best.d) best = { d, sv };
    }
    if (best && best.d <= tol) {
      servedBy.set(best.sv.Feature_ID, (servedBy.get(best.sv.Feature_ID) || 0) + 1);
    } else {
      strandedMeters.push({
        id: m.Feature_ID,
        label: m.Label || `Meter ${m.Feature_ID}`,
        plotId: m.Plot_ID ?? null,
        at: m.Geometry[0],
      });
    }
  }

  /* ── Where those spurs meet the main ── */
  const demand = new Array(nodes.length).fill(0);
  const tees = new Set();
  const unattachedServices = [];

  for (const sv of services) {
    const carried = servedBy.get(sv.Feature_ID) || 0;
    if (!carried) continue;

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
      tees.add(hit);
    } else {
      unattachedServices.push({
        id: sv.Feature_ID,
        label: sv.Label || `Service trench ${sv.Feature_ID}`,
        meters: carried,
        gap: Math.round(bd * 100) / 100,
        at: g[0],
      });
    }
  }

  if (!tees.size) {
    return {
      error: "No water service trench reaches a water meter from the mains trench,"
        + " so there is nothing for the main to feed.",
      strandedMeters,
      unattachedServices,
    };
  }

  /* ── What each length carries ──
     Backwards down the visit order, so a node is summed only once
     everything beyond it has been. */
  const served = demand.slice();
  for (let i = order.length - 1; i >= 0; i--) {
    const u = order[i];
    if (parent[u] >= 0) served[parent[u]] += served[u];
  }

  const children = new Map();
  for (let i = 0; i < nodes.length; i++) {
    if (parent[i] < 0) continue;
    if (!children.has(parent[i])) children.set(parent[i], []);
    children.get(parent[i]).push(i);
  }
  const kids = (u) => (children.get(u) || []).filter((c) => served[c] > 0);

  /* The size of the length arriving at v is decided by everything from v
     outward — the plots it still has to feed. */
  const sizeAt = (v) => sizeFor(table, served[v]);
  const sizeKey = (v) => sizeAt(v)?.id ?? "over";

  /* ── The runs ──
     A run ends where the main divides, where it stops, and where the
     size changes. */
  const isBreak = (u) => u === root || kids(u).length !== 1
    || sizeKey(kids(u)[0]) !== sizeKey(u);

  const runs = [];
  const covered = new Set();
  const oversized = [];
  const edgeKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);
  const walk = [root];
  while (walk.length) {
    const u = walk.shift();
    for (const first of kids(u)) {
      let cur = first;
      const pts = [nodes[u].slice(), nodes[first].slice()];
      covered.add(edgeKey(u, first));
      let teed = tees.has(first) ? 1 : 0;

      while (!isBreak(cur)) {
        const next = kids(cur)[0];
        pts.push(nodes[next].slice());
        covered.add(edgeKey(cur, next));
        if (tees.has(next)) teed += 1;
        cur = next;
      }

      /* The count at the top of the run, which is the most it carries
         and therefore what sizes it. */
      const carries = served[first];
      const size = sizeFor(table, carries);
      const run = {
        pts,
        metres: Math.round(lengthOf(pts) * 10) / 10,
        fromNode: u,
        endNode: cur,
        /* Everything this length feeds. */
        meters: carries,
        services: teed,
        size,
      };
      if (!size) {
        oversized.push({ meters: carries, metres: run.metres, at: nodes[u].slice() });
      }
      runs.push(run);
      walk.push(cur);
    }
  }

  /* ── The trench that gets no pipe ── */
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

  /* How much of each size, for the schedule. */
  const bySize = [];
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

  return {
    runs,
    bySize,
    totalM: Math.round(runs.reduce((t, r) => t + r.metres, 0) * 10) / 10,
    poc,
    pocGap: Math.round(rootGap * 10) / 10,
    services: tees.size,
    meters: served[root],
    /* Runs carrying more than the largest configured pipe will take. */
    oversized,
    largest: table[table.length - 1],
    /* The rules this was built with, and how many were chosen for the
       operator rather than inherited. */
    sizeRules: table.length,
    operatorRules: table.filter((t) => t.forOperator).length,
    strandedMeters,
    unattachedServices,
    unreachable,
    unserved,
    unservedM: Math.round(unserved.reduce((t, u) => t + u.metres, 0) * 10) / 10,
  };
}
