/* Laying a levels check out as a schematic.

   The table is a list of legs and reads as one; a network is a tree and
   reads as one. The same figures arranged as the cable actually runs
   show at a glance where a branch is long, where the volts fall away,
   and which end is the worst — none of which a column of numbers gives
   up without effort.

   The layout only. Nothing here draws: the caller renders, and a
   function that both places and paints cannot be checked without a
   canvas.

   ── The rule ──
   Depth is distance from the source in legs, so every node sits on the
   row matching how far down the network it is. Across, leaves are spread
   evenly and every parent is centred over its children — the classic
   tidy-tree arrangement, which keeps branches from crossing and puts
   equal space between things at the same level. */

const KEY = (v) => String(v ?? "");

/* The tree the legs describe.

   Built from labels rather than node indices, because that is what the
   legs carry and what the boxes are named for — and because a levels
   check across several circuits has several models but one set of
   labels. */
export function treeFromLegs(legs = [], rootLabel = null) {
  const children = new Map();
  const legTo = new Map();
  const seen = new Set();

  for (const leg of legs) {
    const from = KEY(leg.from);
    const to = leg.to == null ? null : KEY(leg.to);
    seen.add(from);
    if (to == null) continue;
    seen.add(to);
    if (!children.has(from)) children.set(from, []);
    /* A leg repeated — the same two points reached twice — is one edge.
       Without this a joint feeding two plots would draw two identical
       lines on top of each other. */
    if (!children.get(from).includes(to)) children.get(from).push(to);
    if (!legTo.has(to)) legTo.set(to, leg);
  }

  /* The root: the label given, or the one nothing arrives at. A drawing
     with a break in it can have several; the first is taken and the rest
     are reported rather than dropped. */
  const arrivedAt = new Set(legTo.keys());
  const roots = [...seen].filter((x) => !arrivedAt.has(x));
  const root = (rootLabel != null && seen.has(KEY(rootLabel)))
    ? KEY(rootLabel)
    : roots[0] ?? [...seen][0] ?? null;

  return { children, legTo, root, roots, all: seen };
}

/* Positions for every node, and the edges between them.

   Sizes are passed in rather than assumed so the caller can size a box
   to its longest label without this having to know about fonts. */
export function layoutTree(tree, opts = {}) {
  const {
    boxW = 104, boxH = 46, gapX = 26, gapY = 118,
  } = opts;

  if (!tree?.root) return { nodes: [], edges: [], width: 0, height: 0 };

  const { children, legTo, root } = tree;
  const pos = new Map();
  let cursor = 0;
  const depthOf = new Map();

  /* Depth first, placing leaves left to right as they are met and
     centring each parent over the span of its children.

     Iterative rather than recursive: a long radial circuit is hundreds
     of nodes deep, and a recursive walk on one would overflow the stack
     on a real drawing rather than in a test. */
  const stack = [{ label: root, depth: 0, phase: 0 }];
  /* A node already on the stack must not be pushed again, or a circuit
     that loops back on itself walks for ever. The guard alone was not
     enough: it stopped the walk but left every node unplaced, so a
     drawing with one bad connection produced an empty diagram rather
     than a diagram with one odd line in it. */
  const onStack = new Set([root]);
  const guard = tree.all.size * 8 + 64;
  let steps = 0;

  while (stack.length && steps++ < guard) {
    const top = stack[stack.length - 1];
    const kids = children.get(top.label) || [];

    if (top.phase === 0) {
      depthOf.set(top.label, Math.max(depthOf.get(top.label) ?? 0, top.depth));
      top.phase = 1;
      /* Pushed in reverse so they are visited left to right. */
      for (let i = kids.length - 1; i >= 0; i--) {
        if (pos.has(kids[i]) || onStack.has(kids[i])) continue;
        onStack.add(kids[i]);
        stack.push({ label: kids[i], depth: top.depth + 1, phase: 0 });
      }
      continue;
    }

    stack.pop();
    onStack.delete(top.label);
    const placed = kids.map((k) => pos.get(k)).filter((p) => p != null);
    if (!placed.length) {
      pos.set(top.label, cursor);
      cursor += 1;
    } else {
      pos.set(top.label, (Math.min(...placed) + Math.max(...placed)) / 2);
    }
  }

  /* Anything the walk could not reach — a node beyond a break, or one
     cut off by the loop guard. Placed on its own row at the end rather
     than left out: a box missing from a schematic is a run someone
     cannot see, which is worse than one drawn apart from the rest. */
  const orphanDepth = Math.max(0, ...[...depthOf.values()]) + 1;
  for (const label of tree.all) {
    if (pos.has(label)) continue;
    pos.set(label, cursor);
    depthOf.set(label, orphanDepth);
    cursor += 1;
  }

  const step = boxW + gapX;
  const nodes = [...pos].map(([label, col]) => ({
    label,
    x: col * step,
    y: (depthOf.get(label) ?? 0) * gapY,
    w: boxW,
    h: boxH,
    leg: legTo.get(label) ?? null,
  }));

  const byLabel = new Map(nodes.map((n) => [n.label, n]));
  const edges = [];
  for (const [from, kids] of children) {
    const a = byLabel.get(from);
    if (!a) continue;
    for (const to of kids) {
      const b = byLabel.get(to);
      if (!b) continue;
      edges.push({ from: a, to: b, leg: legTo.get(to) ?? null });
    }
  }

  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  return {
    nodes,
    edges,
    width: nodes.length ? Math.max(...xs) + boxW : 0,
    height: nodes.length ? Math.max(...ys) + boxH : 0,
  };
}

/* What a box says: where it is, and how the supply is holding up there.

   The percentage and the volts together, because one is the rule and the
   other is the thing being ruled on — a designer checks the percentage
   against a limit and hands the voltage to whoever is asking what they
   will get. */
export function nodeFigures(leg, voltageV = 400) {
  if (!leg?.vd) return { pct: null, volts: null, over: false };
  const pct = Number(leg.vd.pct);
  return {
    pct: Number.isFinite(pct) ? Math.round(pct * 1000) / 1000 : null,
    volts: Number.isFinite(pct)
      ? Math.round(voltageV * (1 - pct / 100) * 10) / 10
      : null,
    over: !!(leg.vd.overOhms || leg.vd.overPct),
  };
}

/* And what a line says: the run between two boxes. */
export function edgeFigures(leg) {
  if (!leg) return null;
  return {
    metres: leg.metres != null ? Math.round(leg.metres * 10) / 10 : null,
    cable: leg.cable ?? null,
    pct: leg.vd?.pct != null ? Math.round(Number(leg.vd.pct) * 1000) / 1000 : null,
    ohms: leg.vd?.ohms != null ? Math.round(Number(leg.vd.ohms) * 10000) / 10000 : null,
  };
}

/* Touched 2026-08-03 10:22 UTC to force a rebuild. */
