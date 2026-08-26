/* Finding a feature on a drawing too big to look at.

   An estate plan is thousands of features across a square kilometre.
   When one has gone missing — dragged off, hidden under another, or
   simply somewhere nobody remembers — the only way to it is to know
   where it is already, which is the thing being asked.

   ── What can be typed ──

   Whatever someone would say out loud: a plot number, a span node code,
   a name, a kind of thing. "34" finds plot 34; "A12" finds the span
   node; "substation" finds the substation; "service trench" finds all of
   them. No syntax and no field to choose first — a search box that has
   to be configured is a search box that gets used once.

   ── Ranking ──

   Exact beats prefix beats contains, and a plot number beats a
   coincidental digit in a feature id. Someone typing "12" means plot 12,
   not feature 1200-and-something, and putting the latter first is how a
   list of forty results becomes useless. */

const norm = (v) => String(v ?? "").trim().toLowerCase();

/* Everything about a feature worth matching against, and what to call it
   in a list of results. */
export function searchable(f, { lineTypes = [], layers = [], plotById = () => null } = {}) {
  const lt = f.Attributes?.Line_Type
    ? lineTypes.find((t) => t.Type_Key === f.Attributes.Line_Type)
    : null;
  const layer = layers.find((l) => l.Layer_Key === f.Layer_Key);
  const plot = f.Plot_ID != null ? plotById(f.Plot_ID) : null;
  const plotNo = plot?.plot_number ?? plot?.Plot_Number ?? null;
  const span = f.Attributes?.Span_Label ?? null;

  /* The name shown against a result. What the thing is, then which one —
     "Service Trench" alone is no use in a list of seventy. */
  /* Roles spelled the way they are said. Capitalising the stored value
     gave "Spannode", which is not a word anyone would search for or
     recognise in a list. */
  const ROLE = {
    plot: "Plot", nrs: "Supply", meter: "Meter", joint: "Joint", spannode: "Span node",
    servicevalve: "Service valve",
    poc: "Point of connection", substation: "Substation", governor: "Gas governor",
    linkbox: "Link box", column: "Lighting column", source: "Source", shape: "Shape",
  };
  const kind = lt?.Label
    ?? (f.Feature_Role ? ROLE[f.Feature_Role]
      ?? f.Feature_Role.replace(/^./, (c) => c.toUpperCase()) : null)
    ?? layer?.Label
    ?? "Feature";

  /* The number alone where the kind already says what it is — "Plot 12"
     rather than "Plot — Plot 12". */
  const which = span
    ?? (plotNo != null ? (kind === "Plot" ? String(plotNo) : `Plot ${plotNo}`) : null)
    ?? f.Label ?? null;

  return {
    feature: f,
    label: which ? `${kind} \u2014 ${which}` : kind,
    where: layer?.Label ?? f.Layer_Key ?? "",
    /* Each field kept separate rather than joined into one string, so a
       match on a plot number can outrank a match on an id. */
    fields: {
      plotNo: plotNo != null ? String(plotNo) : null,
      span,
      label: f.Label ?? null,
      kind,
      id: String(f.Feature_ID),
    },
  };
}

/* How well one entry answers the query. Higher is better; 0 is no
   match. */
export function score(entry, q) {
  const t = norm(q);
  if (!t) return 0;
  const f = entry.fields;

  const hit = (v, weight) => {
    const s = norm(v);
    if (!s) return 0;
    if (s === t) return weight * 4;
    if (s.startsWith(t)) return weight * 2;
    if (s.includes(t)) return weight;
    return 0;
  };

  /* A plot number and a span code are what people actually say, so they
     outrank everything. The feature id is last: it is a database key
     that happens to be a number, and letting it compete with plot
     numbers buries the answer. */
  return Math.max(
    hit(f.plotNo, 100),
    hit(f.span, 100),
    hit(f.label, 40),
    hit(f.kind, 10),
    hit(f.id, 1),
  );
}

/* The results, best first.

   Capped, because a query of one letter matches half the drawing and a
   list nobody can read is the same as no list. The cap is on what is
   shown, not on what is searched — the best twenty of everything, not
   the first twenty found. */
export function find(features = [], q, opts = {}) {
  const t = norm(q);
  if (t.length < 1) return [];
  const limit = opts.limit ?? 20;

  const out = [];
  for (const f of features) {
    const entry = searchable(f, opts);
    const s = score(entry, t);
    if (s > 0) out.push({ ...entry, score: s });
  }

  out.sort((a, b) => b.score - a.score
    /* Stable within a score, so the same query gives the same list
       twice — a result moving between keystrokes is impossible to
       click. */
    || (Number(a.feature.Feature_ID) || 0) - (Number(b.feature.Feature_ID) || 0));

  return { shown: out.slice(0, limit), total: out.length };
}

/* Features a long way from everything else.

   The shape of an accident: something dragged off the site and left
   there. Found by distance from the middle of the drawing rather than
   from the boundary, so it works before a boundary has been drawn.

   The threshold is a multiple of how spread out the drawing already is,
   not a fixed distance — a rural scheme spanning three kilometres is not
   full of strays because it is large. */
export function strays(features = [], { factor = 3 } = {}) {
  const pts = features
    .map((f) => (f.Geometry || [])[0])
    .filter(Boolean);
  if (pts.length < 4) return [];

  const cx = pts.reduce((t, p) => t + p[0], 0) / pts.length;
  const cy = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const d = pts.map((p) => Math.hypot(p[0] - cx, p[1] - cy)).sort((a, b) => a - b);

  /* The middle distance, not the average: one feature ten kilometres out
     drags an average far enough to hide itself. */
  const median = d[Math.floor(d.length / 2)] || 0;
  if (median <= 0) return [];

  const limit = median * factor;
  return features.filter((f) => {
    const p = (f.Geometry || [])[0];
    if (!p) return false;
    return Math.hypot(p[0] - cx, p[1] - cy) > limit;
  });
}

/* Trench ends that nearly touch something and do not.

   A route that goes the long way round, or a section carrying nothing
   when it plainly should, is almost always a junction that is not a
   junction. Two trenches drawn to the same corner a few centimetres
   apart look joined at any working zoom and are two separate networks
   as far as the trace is concerned.

   This finds them: an end point close enough to another trench to have
   been meant to meet it, but not close enough for the router to treat
   them as one node.

   The lower bound matters as much as the upper. Below it the two are
   already joined and there is nothing to report; above it they are far
   enough apart to be a deliberate gap rather than a miss. */
export function gaps(features = [], opts = {}) {
  const {
    joinedM = 0.25, nearM = 2.0, isTrench = () => true,
    /* Which trenches are services. A service is judged as a whole
       rather than end by end \u2014 see below. */
    isService = () => false,
  } = opts;

  const trenches = features.filter((f) =>
    f.Feature_Type === "line" && (f.Geometry || []).length >= 2 && isTrench(f));

  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

  /* The nearest point on a segment, clamped to its ends. */
  const nearestOn = (p, a, b) => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (!len2) return { point: a, d: dist(p, a) };
    let t = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const point = [a[0] + vx * t, a[1] + vy * t];
    return { point, d: dist(p, point) };
  };

  const mains = trenches.filter((x) => !isService(x));

  const out = [];
  for (const f of trenches) {
    const g = f.Geometry;

    /* ── A service is checked as a whole, not end by end ──

       A service trench is joined to the main at one end and stops at
       the property boundary at the other. The boundary end is meant to
       be loose \u2014 but on an estate it lands within a couple of metres of
       the next plot's service, so every one of them was reported as a
       near miss. On forty-five plots that is ninety complaints about
       correct work, which buries the one that matters.

       So the only question worth asking of a service is whether it
       reaches a main at all. One that does is finished, whatever its
       far end is near; one that does not is broken however tidy it
       looks. */
    if (isService(f)) {
      const reaches = [g[0], g[g.length - 1]].some((end) =>
        mains.some((m) => {
          const og = m.Geometry;
          for (let i = 0; i + 1 < og.length; i++) {
            if (nearestOn(end, og[i], og[i + 1]).d <= joinedM) return true;
          }
          return false;
        }));
      if (reaches) continue;

      /* Not joined to any main. Reported against the end nearest one,
         so the panel can zoom to the place the join is missing rather
         than to whichever end was drawn first. */
      let near = null;
      for (const end of [g[0], g[g.length - 1]]) {
        for (const m of mains) {
          const og = m.Geometry;
          for (let i = 0; i + 1 < og.length; i++) {
            const hit = nearestOn(end, og[i], og[i + 1]);
            if (!near || hit.d < near.d) {
              near = { d: hit.d, point: hit.point, other: m, end };
            }
          }
        }
      }
      if (near) {
        out.push({
          feature: f,
          at: [near.end[0], near.end[1]],
          to: near.point,
          other: near.other,
          gapM: Math.round(near.d * 100) / 100,
          why: "not joined to a mains trench",
        });
      }
      continue;
    }

    for (const end of [g[0], g[g.length - 1]]) {
      let best = null;

      for (const other of trenches) {
        if (other.Feature_ID === f.Feature_ID) continue;
        const og = other.Geometry;
        for (let i = 0; i + 1 < og.length; i++) {
          const hit = nearestOn(end, og[i], og[i + 1]);
          if (hit.d > nearM) continue;
          if (!best || hit.d < best.d) {
            best = { d: hit.d, point: hit.point, other };
          }
        }
      }

      /* Already joined, or nothing near. Neither is a gap. */
      if (!best || best.d <= joinedM) continue;

      out.push({
        feature: f,
        at: [end[0], end[1]],
        to: best.point,
        other: best.other,
        gapM: Math.round(best.d * 100) / 100,
      });
    }
  }

  /* Narrowest first, and the comment used to say "widest first" while
     the code did the opposite. The code was right and the first three
     words were not.

     A hairline gap is the one costing routes: it looks joined at any
     sensible zoom, so nobody goes looking, and the network is severed
     there. A two-metre gap is usually somebody's intention, and if it
     is not, it is visible. So the ones needing attention come first. */
  return out.sort((a, b) => a.gapM - b.gapM);
}
