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

/* ── A service has its own three ──

   The same keys a main uses, because they are the same three moments
   and a service that reads "aslaid" should mean on a service what it
   means on a main. Only the middle one is named differently.

   "Laid - Dead Jointed" is what the trade calls a service that is in
   the ground and jointed at the main but not yet made live. On a main
   that state is just as-laid; on a service the jointing is the point of
   the visit, and a fitter reading "As-Laid" against a service cannot
   tell whether anybody has been to the joint.

   A list rather than a relabelling of MAIN_STATUSES, so renaming this
   does not rename it on every main on every drawing. */
export const SERVICE_STATUSES = [
  { key: "planned", label: "Planned", colour: "#8b5e34" },
  { key: "aslaid", label: "Laid - Dead Jointed", colour: "#0891b2" },
  { key: "live", label: "Live", colour: "#16a34a" },
];

/* Whether a line is a service cable or pipe on a utility layer. */
export function isServiceFeature(f, lineTypes = []) {
  if (!f || f.Feature_Type !== "line") return false;
  const key = String(f.Attributes?.Line_Type ?? "");
  if (!/service/i.test(key)) return false;
  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f.Layer_Key;
  /* Not the trench of that name. `trench_service` is a dig, and a dig
     carries the trench list. */
  return ["electric", "gas", "water", "lighting"].includes(layer);
}

/* Which list applies to a feature.

   Mains carry their own, services carry theirs, and everything else —
   trenches, and anything that has never had a stage — carries the
   trench list. A main set to "existing" or a trench set to "live" is a
   value from the wrong list, which is what keeping them apart is meant
   to prevent. */
export function statusesFor(feature, lineTypes = []) {
  if (isMainFeature(feature, lineTypes)) return MAIN_STATUSES;
  if (isServiceFeature(feature, lineTypes)) return SERVICE_STATUSES;
  return BUILD_STATUSES;
}

/* ── Nothing is live before the ground it is in is closed ──

   A cable or pipe is live when it is carrying, and it cannot be
   carrying while the trench it lies in is still open. The cascade the
   other way already says so — setting a main live marks the ground
   under it as-laid — but nothing stopped somebody setting the cable
   live while the trench still read Planned, and the drawing then held
   two facts that cannot both be true.

   Answered here rather than in the canvas so the editor can grey the
   option instead of letting it be chosen and then refused, and so the
   two cannot drift apart.

   A trench that is Existing or marked for removal is not in the way: one
   was never dug by this job and the other is being taken out, and
   neither says anything about whether what is in it can carry. Only
   Planned holds it back. */
export const LIVE_KEY = "live";

/* The stages that assert the ground is closed.

   Not just Live. A cable is As-Laid when it is in the ground, which
   cannot be true while the trench it lies in is still Planned — the
   claim is about the dig as much as the cable. So both stages past
   Planned are held back by the same fact, and only Planned is left
   while the hole is only a plan.

   `asbuilt` is here as well as `aslaid` because the trench list uses
   the older key for the same moment: a length that carries either is
   saying it has been dug in. */
export const STAGES_NEEDING_GROUND = ["aslaid", "asbuilt", LIVE_KEY];

/* The trenches under something that are still only planned. */
export function blocksLive(trenches = []) {
  return trenches.filter((t) => statusOf(t) === "planned");
}

export function canGoLive(trenches = []) {
  return blocksLive(trenches).length === 0;
}

/* Whether a stage claims the ground is closed, and so needs it to be. */
export const needsGround = (key) => STAGES_NEEDING_GROUND.includes(String(key ?? ""));

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

/* ── The incumbent's network starts Existing ──

   A line drawn with a type ending `_existing` (0197) is there to show
   what is already in the ground: their trench, their LV main, their gas
   or water main. It is not proposed work, and Planned is the drawing
   saying it is.

   That mattered beyond the label. digEstimate charges excavation on a
   trench unless it reads `existing`, so an incumbent trench drawn to
   show where a self-lay plot connects would have put its whole length
   on the bill as ground to open — a price nobody could see the reason
   for, on a dig that was done years ago.

   Read from the type key rather than asked of whoever draws it. A
   default somebody has to remember to change is one they will forget,
   and the consequence of forgetting is money.

   `withDefaultStatus` still leaves a deliberate choice alone, so a
   length drawn as existing and then marked otherwise stays marked. */
export const EXISTING_TYPE_SUFFIX = "_existing";

export const isExistingLineType = (typeKey) =>
  String(typeKey ?? "").endsWith(EXISTING_TYPE_SUFFIX);

export function defaultStatusOf(f, lineTypes = []) {
  if (!f) return null;

  /* `existing` is in the list these features actually carry.

     Worth spelling out, because the obvious worry is that a MAIN's
     stages are planned, as-laid and live — and `existing` is not among
     them. It does not arise: isMainFeature matches a key ENDING
     `_main`, and `elec_main_existing` does not end there. So
     statusesFor hands the incumbent's main the trench list, the same
     one its trench gets, and `existing` is on it.

     That is coherent rather than lucky. mainsOnLayer excludes these
     for the same reason and by the same test, so the incumbent's main
     is consistently not one of ours: nothing tees into it, no joint is
     placed on it, and it takes no stage that belongs to work we are
     doing. It is a record of what is already there.

     Which is also why `live` would be wrong here even though it is
     true on the ground. The stage says what THIS job has done to a
     length, and the answer for their main is nothing.

     It matters beyond the label. digEstimate charges excavation on a
     trench unless it reads `existing`, so an incumbent trench drawn to
     show where a self-lay plot connects would have put its whole
     length on the bill as ground to open — a price with no visible
     reason, for a dig done years ago. */
  if (isExistingLineType(f.Attributes?.Line_Type)) return "existing";

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

  const attrs = { ...(f.Attributes || {}) };
  let changed = false;

  const has = attrs.Build_Status;
  if (has == null || has === "") {
    const status = defaultStatusOf(f, lineTypes);
    if (status) { attrs.Build_Status = status; changed = true; }
  }

  /* ── The incumbent's network is never on site ──

     Their trench and their mains are in the road. There is no case
     where a length drawn to show what somebody else already owns sits
     inside our boundary as our work, and asking whoever draws it to
     remember is asking them to remember it every time.

     ── Which "off site" this is ──

     Two attributes carry the words, and they are different facts:

       Site       "On-site" / "Off-site", worked out from the boundary
                  polygons when a line is drawn. It splits a run where
                  it crosses the boundary, picks the surface and feeds
                  the bill.

       Off_Site   a boolean, set by hand in the editor. A commercial
                  arrangement — a different rate, a different permit,
                  and what the call-off carries.

     A line outside the boundary gets Site "Off-site" automatically and
     Off_Site stays unset, so the drawing shows it off site while the
     editor's own dropdown reads "On site". Both are telling the truth
     about their own attribute and the pair reads as a contradiction —
     which is exactly what it looked like on an incumbent trench.

     Both are set here, because for these types both are true and
     neither is a judgement call.

     Anything already set is left alone, the same as the status above:
     this fills a blank, it does not overrule anybody. */
  if (isExistingLineType(f.Attributes?.Line_Type)) {
    if (attrs.Off_Site == null) { attrs.Off_Site = true; changed = true; }
    if (attrs.Site == null) { attrs.Site = "Off-site"; changed = true; }
  }

  return changed ? { ...f, Attributes: attrs } : f;
}

/* The stages to offer on a feature, and which of them cannot be chosen.

   One function for every status dropdown, so a rule added here reaches
   all of them. The mains field had no guard at all while the service
   field did, which is how a main could still be set live in a trench
   nobody had dug and be refused only after pressing Save.

   ── Said on the option, not after the fact ──

   An option that can be picked and then rejected teaches somebody the
   form is unreliable, and the reason arrives after the decision. A
   greyed option with the reason on it says the same thing before, and
   the field stops being a place where work is lost.

   The marker is a dash and a few words rather than a symbol: a select
   draws its options as plain text, so a glyph would have to carry the
   whole explanation and "Live \u2014 dig the trench first" carries it
   already. Browsers grey a disabled option on their own; this is the
   part they cannot supply. */
export function statusOptions(feature, lineTypes = [], trenches = []) {
  /* Only what lies in a trench is held back by one.

     A trench is not in a trench. trenchesUnder matches a trench against
     itself \u2014 a trench follows its own line perfectly \u2014 so a trench
     still Planned came back as the thing holding itself back, and
     setting one As-Laid was refused on the grounds that it was Planned.
     Which it was, and which is what was being corrected.

     Asked as "is this a main or a service" rather than "is this not a
     trench", because that is the actual scope of the rule: the stages
     of a cable or pipe make a claim about the ground around it, and
     nothing else on the drawing does. */
  const inGround = isMainFeature(feature, lineTypes)
    || isServiceFeature(feature, lineTypes);

  const held = inGround ? blocksLive(trenches) : [];

  return statusesFor(feature, lineTypes).map((s) => {
    if (!needsGround(s.key) || !held.length) return { ...s, disabled: false };
    return {
      ...s,
      disabled: true,
      /* Named, not counted.

         "2 trenches still Planned" says something is wrong and nothing
         about where, so every instance of this became a database query
         to find out which. The ids are on the features already. */
      label: `${s.label} \u2014 ${held.length === 1
        ? `trench #${held[0].Feature_ID} still Planned`
        : `${held.length} trenches still Planned`}`,
      why: held.length === 1
        ? `Trench #${held[0].Feature_ID} (${held[0].Attributes?.Line_Type
          ?? "trench"}) is still Planned. Set it As-Laid first, and these `
          + "become available."
        : `Trenches ${held.map((t) => `#${t.Feature_ID}`).join(", ")} are `
          + "still Planned. Set them As-Laid first, and these become "
          + "available.",
    };
  });
}
