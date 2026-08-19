/* Marking lengths of trench as existing, planned, to be removed or
   as-built.

   A trench is drawn as one continuous run because that is how it is
   drawn, not because the whole of it is at the same stage. Half a road
   may be in the ground and half still to dig, and the drawing has to be
   able to say so.

   ── Why this splits the trench ──

   A status belongs to a length, and the only way to give a length its
   own status is for it to be its own feature. Marking part of a run
   therefore breaks it at the two points chosen and leaves three
   features where there was one — which is a real change to the drawing
   and is why it asks before doing it.

   The alternative, keeping one feature and storing a list of ranges
   along it, was considered and rejected: every other thing that reads a
   trench — the router, the trace, the bill of materials, the call-offs —
   would have to learn about ranges, and each would be a place to get it
   wrong. */

export const BUILD_STATUSES = [
  { key: "existing", label: "Existing", colour: "#64748b" },
  { key: "planned", label: "Planned", colour: "#8b5e34" },
  { key: "remove", label: "To be Removed", colour: "#dc2626" },
  /* "As-Laid", not "As-Built".

     The key stays `asbuilt`: it is what every drawing already stores
     and what the bill, the labour rows and the trench splitting all
     read. Renaming it would be a migration of every trench on every
     project to say the same thing a different way.

     The label is what anybody sees, and it now matches what a main
     says when it is in the ground — which is the same fact about the
     same length of road. */
  { key: "asbuilt", label: "As-Laid", colour: "#16a34a" },
];

/* ── What stage a main is at ──

   A separate list, because a main's stages are not a trench's and the
   two genuinely diverge.

   On a lay-only project the developer digs and we lay: the trench is
   As-Built or Existing before anything is in it, and reading the pipe's
   stage from the hole around it would say every one of those mains was
   laid on the day the trench was finished.

   And Live is not a property of a hole at all. A trench is dug or it is
   not; a main is charged or energised separately, often weeks later and
   by somebody else. That is the distinction the whole of this is for:
   a gang sent to connect a plot off a main nobody has made live has
   been sent to do something that cannot be done.

   ── Why the same attribute ──

   Build_Status on both, rather than a second attribute name. It is the
   same question — what stage is this length at — asked of two different
   things, and one name means one place to look. The lists are what
   differ, and statusesFor says which applies. */
export const MAIN_STATUSES = [
  { key: "planned", label: "Planned", colour: "#8b5e34" },
  { key: "aslaid", label: "As-Laid", colour: "#0891b2" },
  { key: "live", label: "Live", colour: "#16a34a" },
];

/* Which list applies to a feature.

   Mains carry their own; everything else — trenches, and anything that
   has never had a stage — carries the trench list. A main set to
   "existing" or a trench set to "live" is a value from the wrong list,
   which is what keeping them apart is meant to prevent. */
export function statusesFor(feature, lineTypes = []) {
  return isMainFeature(feature, lineTypes) ? MAIN_STATUSES : BUILD_STATUSES;
}

/* A main: a mains cable or pipe on one of the three utility layers.

   Not a service. A service takes its liveness from the main feeding it
   — it is connected in the same visit as the plot it serves, and asking
   somebody to set a stage on every one would be a hundred fields nobody
   fills in. */
/* Whether a line type is a main rather than a service.

   By the type, not the layer. A gas main and a gas service are both
   gas, both drawn by the application, and both marked Generated — so a
   rebuild that matched on layer alone deleted every service on the site
   along with the mains it meant to replace.

   Trusts the configured list first and the naming second, because a
   type can be renamed in admin and the suffix is what survives when
   somebody has. */
export function isMainType(typeKey, lineTypes = []) {
  const key = String(typeKey ?? "");
  if (!key) return false;
  if (/service/i.test(key)) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  if (t && /service/i.test(t.Label ?? "")) return false;
  return /_main$/.test(key) || /main/i.test(t?.Label ?? "");
}

export function isMainFeature(f, lineTypes = []) {
  if (!f || f.Feature_Type !== "line") return false;
  const key = String(f.Attributes?.Line_Type ?? "");
  if (!/_main$/.test(key)) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f.Layer_Key;
  return ["electric", "gas", "water"].includes(layer);
}

export const statusOf = (f) => f?.Attributes?.Build_Status ?? null;

/* How a main's stage is marked on the drawing.

   Hatched over the trench it runs in, the same way an easement is —
   green for live, red for anything else. A dashed cable is easy to miss
   at the zoom somebody plans at; a red band across the road is not.

   Narrower than an easement band, which is a legal strip of land. This
   is marking a line, and at easement width two mains in one trench
   would each hatch over the other. */
/* Halfway to white from the solid green and red the plot marks use.

   The band covers a length of road at every zoom, so at full strength
   it was the loudest thing on the drawing and the plan underneath it
   could not be read — which is the opposite of useful, because the plan
   is what somebody is checking the main against.

   The marks beside the plots stay solid: they are small, and small
   things need the contrast that large ones do not. */
export const LIVE_COLOUR = "#8bd1a5";
export const DEAD_COLOUR = "#ee9393";


/* A main nobody has given a stage.

   Not live, and hatched — a main left out of the marking reads as "no
   main here" rather than "nobody has said". But grey rather than red,
   because the two want different things done about them: red is a main
   waiting to be energised, grey is a main waiting for somebody to say
   what stage it is at.

   Light, so a drawing where nothing has been set yet is legible rather
   than covered. It is the state most sites start in, and a wall of
   colour on day one is a marking people learn to ignore. */
export const UNSET_COLOUR = "#cbd5e1";
export const LIVE_BAND_M = 1.4;

/* Whether a main is live, which is the question everything else asks.

   Only a main can be: a trench has no such stage, and something with
   no stage set has not been made live by omission. */
export const isLive = (f, lineTypes = []) =>
  isMainFeature(f, lineTypes) && statusOf(f) === "live";

/* Both lists, so a colour or a label can be looked up without the
   caller knowing which kind of feature it came from. The keys that
   appear in both — planned — carry the same colour in both, so there is
   nothing to choose between them. */
const ALL_STATUSES = [...BUILD_STATUSES, ...MAIN_STATUSES];

export function statusColour(key) {
  return ALL_STATUSES.find((s) => s.key === key)?.colour ?? null;
}

export function statusLabel(key) {
  return ALL_STATUSES.find((s) => s.key === key)?.label ?? null;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/* How far along a line a point is, and how far off it. */
export function alongLine(p, g = []) {
  let run = 0;
  let best = { m: null, d: Infinity, point: null };
  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const segLen = dist(a, b);
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const len2 = vx * vx + vy * vy;
    if (len2) {
      let u = ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2;
      u = Math.max(0, Math.min(1, u));
      const q = [a[0] + vx * u, a[1] + vy * u];
      const d = dist(p, q);
      if (d < best.d) best = { m: run + segLen * u, d, point: q };
    }
    run += segLen;
  }
  return best;
}

export function lengthOf(g = []) {
  let t = 0;
  for (let i = 0; i + 1 < g.length; i++) t += dist(g[i], g[i + 1]);
  return t;
}

/* A line cut at a distance along it, as two lines.

   The cut point appears in both halves, so the two still meet — a split
   that left a gap would break the network at the very place somebody was
   trying to describe. */
export function cutAt(g = [], m) {
  if (g.length < 2) return null;
  const total = lengthOf(g);
  /* A cut at either end is not a cut. Returning one empty piece would
     give the drawing a feature with a single point on it. */
  if (m <= 0.01 || m >= total - 0.01) return null;

  const before = [];
  const after = [];
  let run = 0;
  let cutPoint = null;

  for (let i = 0; i + 1 < g.length; i++) {
    const a = g[i];
    const b = g[i + 1];
    const segLen = dist(a, b);

    if (cutPoint) {
      after.push(b);
      run += segLen;
      continue;
    }

    before.push(a);
    if (run + segLen >= m) {
      const u = segLen ? (m - run) / segLen : 0;
      cutPoint = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
      before.push(cutPoint);
      after.push(cutPoint, b);
    }
    run += segLen;
  }

  if (!cutPoint) return null;
  return { before, after, at: cutPoint };
}

/* What marking a stretch does to a trench.

   Given the two points somebody clicked, this says which features to
   write: the piece being marked, and whatever is left either side of it.

   Nothing is written here. The caller applies it, and can show what will
   happen first — splitting a run is not something to do silently. */
export function planMark(trench, fromPoint, toPoint, status) {
  const g = trench?.Geometry || [];
  if (g.length < 2) return { error: "That is not a line." };

  const a = alongLine(fromPoint, g);
  const b = alongLine(toPoint, g);
  if (a.m == null || b.m == null) return { error: "Both points must be on the trench." };

  const lo = Math.min(a.m, b.m);
  const hi = Math.max(a.m, b.m);
  const total = lengthOf(g);

  if (hi - lo < 0.1) {
    return { error: "Those two points are the same place." };
  }

  /* The whole run: no split needed, just a status. */
  if (lo <= 0.01 && hi >= total - 0.01) {
    return {
      ok: true,
      wholeRun: true,
      update: { Feature_ID: trench.Feature_ID, status },
      creates: [],
      splits: 0,
    };
  }

  /* Cut at the far end first, so the near cut's distance still means
     what it did — cutting at the near end first would shorten the piece
     the far distance was measured along. */
  let head = null;
  let marked = null;
  let tail = null;

  if (hi < total - 0.01) {
    const cut = cutAt(g, hi);
    marked = cut.before;
    tail = cut.after;
  } else {
    marked = g;
  }

  if (lo > 0.01) {
    const cut = cutAt(marked, lo);
    head = cut.before;
    marked = cut.after;
  }

  /* The original feature keeps the marked piece, so whatever else is on
     it — its type, its locks, anything referring to it — stays with the
     length somebody was pointing at. */
  return {
    ok: true,
    wholeRun: false,
    update: { Feature_ID: trench.Feature_ID, geometry: marked, status },
    creates: [head, tail].filter(Boolean).map((geometry) => ({
      geometry,
      /* The offcuts keep whatever status the run had, which may be
         nothing — they have not been marked, only separated. */
      status: statusOf(trench),
    })),
    splits: [head, tail].filter(Boolean).length,
    markedM: Math.round(lengthOf(marked) * 10) / 10,
  };
}


/* Off-site trench.

   A length dug away from the site itself — through an adopted road, a
   third party's land, a verge outside the boundary. It carries a
   different rate, different notice and often a different permit, and
   whoever is scheduling the work needs to know before they book a gang
   rather than after.

   A flag on the trench rather than a fifth build status: a length can be
   off site and as-built at the same time, and the two answer different
   questions. Making it a status would have forced a choice between
   them. */
export const isOffSite = (f) => f?.Attributes?.Off_Site === true;

/* Whether any part of a run of trench is off site.

   Given the features a span crosses, so an assignment can be marked
   without anybody working it out from the drawing. */
export function anyOffSite(trenches = []) {
  return trenches.some((t) => isOffSite(t));
}

/* ── What stage a thing starts at ──

   Planned. Everything drawn is proposed work until somebody says
   otherwise: that is what drawing it means.

   It was not stored. A trench drawn by hand got "planned" written into
   it, and nothing else did — so a main laid by Build LV Network, a gas
   main, a water main and every main drawn by hand all arrived with the
   attribute absent. The editor covered for it by showing "Planned"
   where nothing was set, which papered over the trench case and made
   the mains case worse: that field was later changed to show a blank
   instead, precisely because a main reading Planned on screen with an
   empty attribute sent somebody looking for why their plots would not
   connect and gave them no way to see that the drawing disagreed.

   Writing the value settles both. The screen and the stored attribute
   say the same thing because there is only one thing, and a main that
   has genuinely never been given a stage stops being indistinguishable
   from one that has.

   ── Why not everything ──

   Only what has somewhere to put it. A trench and a main each have a
   stage field and a list of stages; a plot seed, a boundary, a POC do
   not, and writing an attribute nothing reads onto them would be
   litter that later has to be explained.

   A service is left out for the reason isMainFeature gives: it takes
   its liveness from the main feeding it, and asking somebody to set a
   stage on every one of them would be a hundred fields nobody fills
   in. */
function isTrenchLine(f, lineTypes = []) {
  if (!f || f.Feature_Type !== "line") return false;
  const key = String(f.Attributes?.Line_Type ?? "");
  if (!key) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f.Layer_Key;
  return layer === "trench" || /^trench_/.test(key);
}

export function defaultStatusOf(f, lineTypes = []) {
  if (!f) return null;
  if (isTrenchLine(f, lineTypes)) return "planned";
  if (isMainFeature(f, lineTypes)) return "planned";
  return null;
}

/* The same feature, with a stage on it where one belongs and none was
   given.

   Whatever was set is left alone, so this can sit on the path every
   created feature takes without overwriting a deliberate choice — a
   length drawn as Existing stays Existing. An empty string counts as
   unset: it is what a cleared select leaves behind. */
export function withDefaultStatus(f, lineTypes = []) {
  if (!f) return f;
  const has = f.Attributes?.Build_Status;
  if (has != null && has !== "") return f;

  const status = defaultStatusOf(f, lineTypes);
  if (!status) return f;

  return { ...f, Attributes: { ...(f.Attributes || {}), Build_Status: status } };
}
