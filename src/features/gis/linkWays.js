/* Which output of a link box a thing is on.

   A box splits one input into several outputs, each fused on its own and
   each serving its own plots. On a drawing they are three cables in one
   trench wearing three colours, and past a certain density that is not
   enough: to read one output you have to be able to put the others
   away.

   ── What says which output something is on ──

   The build stamps `Link_Box_ID` and `Link_Way` on every run it lays
   for an output, and the lasso stamps the same pair on the meters
   assigned to it. That covers the cables and the meters.

   Everything else on an output's network is there because of a meter:
   a service tees off to feed one, a plot holds one. So anything
   carrying a Plot_ID takes the output of that plot's meter. Nothing
   else is guessed — a feeder point at a junction is not stamped, and
   inventing an output for it from its position would be the geometry
   guessing this repo keeps being bitten by.

   ── What isolating hides ──

   The OTHER outputs of the same box, and nothing else. Not the trunk
   feeding it, not the trenches, not another circuit: somebody reading
   output 3 wants to see what feeds it and where it runs. An unstamped
   feature stays, because "not known to be on another output" is not
   the same as "on this one", and hiding on a guess loses work. */

export function metersByPlot(features = []) {
  const out = new Map();
  for (const f of features) {
    if (f.Feature_Role !== "meter") continue;
    const plot = f.Plot_ID ?? f.Attributes?.Plot_ID;
    if (plot != null) out.set(Number(plot), f);
  }
  return out;
}

/* The box and output a feature is on, or null where the drawing does
   not say. */
export function wayOf(feature, byPlot = new Map()) {
  const a = feature?.Attributes || {};
  if (a.Link_Box_ID != null && a.Link_Way != null) {
    return { box: Number(a.Link_Box_ID), way: Number(a.Link_Way) };
  }
  /* A link box is not ON one of its own outputs — it is where they
     start. Isolating an output must not hide the box itself. */
  if (feature?.Feature_Role === "linkbox") return null;

  const plot = feature?.Plot_ID ?? a.Plot_ID;
  if (plot == null) return null;
  const m = byPlot.get(Number(plot));
  const ma = m?.Attributes || {};
  if (ma.Link_Box_ID == null || ma.Link_Way == null) return null;
  return { box: Number(ma.Link_Box_ID), way: Number(ma.Link_Way) };
}

/* Hidden by an isolate: on the same box, on a different output. */
export function outsideWay(feature, iso, byPlot = new Map()) {
  if (!iso || iso.box == null || iso.way == null) return false;
  const mine = wayOf(feature, byPlot);
  if (!mine) return false;
  return mine.box === Number(iso.box) && mine.way !== Number(iso.way);
}

/* ── The colour a stop on an output is drawn in ──

   A feeder end point on a link box output wears that output's colour,
   not the circuit's: a stop on a coloured output drawn in the circuit's
   colour reads as belonging to something else, which is the whole
   reason the outputs are coloured.

   Taken from the box's own `Way_Colours` — where the runs get theirs —
   so the cable, the stop standing on it and any list naming it cannot
   disagree. Null where the point is not on an output, which is the
   caller's cue to fall back to the circuit.

   Here rather than in the canvas because two places ask: the drawing,
   and the "objects here" picker. The picker asked the STYLE and got
   amber for every one of them — on a dialog whose whole job is telling
   apart things that lie on top of each other. */
export function wayColourOf(feature, features = []) {
  const boxId = feature?.Attributes?.Link_Box_ID;
  const way = feature?.Attributes?.Link_Way;
  if (boxId == null || way == null) return null;
  const box = (features || []).find((x) => x.Feature_Role === "linkbox"
    && Number(x.Feature_ID) === Number(boxId));
  return box?.Attributes?.Way_Colours?.[String(way)] || null;
}

/* ── Which cable is on a link box's INPUT ──
 *
 * The input is the one termination that does not say which cable it
 * belongs to: the outputs each wear their way's colour, so the trunk —
 * the cable a designer traces back — was the one dot drawn slate.
 *
 * Giving it the cable's colour means first deciding WHICH cable, and
 * that was being done by measuring. The canvas walked the mains and
 * took the first whose end fell within SNAP_TOL — 12 metres — of the
 * box, excluding only that box's own outputs.
 *
 * Drawing 35 broke it. Two boxes, one per circuit, standing 1.73 m
 * apart at the end of the POC trench. Each box's 12 m circle holds the
 * other box's input cable and the other box's output as well as its
 * own, and the walk returned whichever came first by id: cable A1
 * before cable B1. Box A1 was right by luck. Box B1 drew its input in
 * circuit 1's green with circuit 2's orange cable sitting on it.
 *
 * So the drawing is asked before the ruler:
 *
 *   1. `Connects`, either direction. It already records which cable
 *      lands here and is exact.
 *   2. Failing that, the NEAREST end inside the tolerance — not the
 *      first one found, which is an ordering accident.
 *
 * and two filters apply to both, because neither can ever be the input:
 *
 *   * a cable carrying a way, from ANY box. The old test only
 *     excluded this box's own outputs, so the neighbour's output was a
 *     candidate. A way claimed through `Link_Connections` counts as
 *     well — that is the editor's route — unless it says "in", which
 *     is the input naming itself.
 *   * a cable on another circuit, where both are known.
 *
 * Returns the cable feature, or null. The caller turns it into ink, so
 * the dot and the run cannot disagree. */
export function inputCableOf(box, features = [], opts = {}) {
  const { tol = 12, isMain = (f) => /main/i.test(String(f?.Attributes?.Line_Type ?? "")) } = opts;
  if (!box) return null;

  const boxId = Number(box.Feature_ID);
  const boxCct = box.Attributes?.Circuit_ID;
  const anchor = box.Attributes?.Span_Anchor || box.Geometry?.[0];

  const carriesAWay = (line) => {
    if (line.Attributes?.Link_Way != null) return true;
    const lc = line.Attributes?.Link_Connections || {};
    return ["start", "end"].some((k) =>
      lc[k] && lc[k].way != null && lc[k].way !== "in");
  };

  const sameCircuit = (line) => boxCct == null
    || line.Attributes?.Circuit_ID == null
    || Number(line.Attributes.Circuit_ID) === Number(boxCct);

  const candidates = (features || []).filter((line) =>
    line.Feature_Type === "line"
    && line.Layer_Key === "electric"
    && isMain(line)
    && (line.Geometry || []).length >= 2
    && !carriesAWay(line)
    && sameCircuit(line));

  /* ── A cable that SAYS it is the input ──
   *
   * `Link_Connections: { end: { box: 57959, way: "in" } }` is the cable
   * declaring which box's input it lands on. Every main on drawing 35
   * carries one, both the inputs and the outputs, so this is the
   * ordinary case rather than an edge one — and it was being settled by
   * Connects and proximity while the drawing held the answer outright.
   *
   * Ahead of Connects because the two are not the same kind of fact.
   * Connects is rebuilt on every run from what a cable TOUCHES, so a
   * cable passing close to a box it has nothing to do with can appear
   * in its list. A way of "in" naming this box is a statement about
   * what the cable IS. */
  const declared = candidates.filter((line) => {
    const lc = line.Attributes?.Link_Connections || {};
    return ["start", "end"].some((k) =>
      lc[k] && lc[k].way === "in" && Number(lc[k].box) === boxId);
  });
  if (declared.length) return declared[0];

  const named = candidates.filter((line) =>
    (line.Attributes?.Connects || []).map(Number).includes(boxId)
    || (box.Attributes?.Connects || []).map(Number).includes(Number(line.Feature_ID)));
  if (named.length) return named[0];

  if (!anchor) return null;
  let best = null;
  let bestD = Infinity;
  for (const line of candidates) {
    const g = line.Geometry;
    for (const q of [g[0], g[g.length - 1]]) {
      const d = Math.hypot(q[0] - anchor[0], q[1] - anchor[1]);
      if (d <= tol && d < bestD) { best = line; bestD = d; }
    }
  }
  return best;
}
