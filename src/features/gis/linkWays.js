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
