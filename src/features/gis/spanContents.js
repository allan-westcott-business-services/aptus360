/* What is laid in a span of a mains call-off.

   ── Why this is not a question for the person raising it ──

   A mains call-off asks for a run of trench to be dug and the mains in
   it laid. Which mains those are is already on the drawing: they are
   the pipes and cables routed along the trench sections the span
   crosses. Asking somebody to tick electric, gas and water is asking
   them to retype something the application already knows — and a tick
   box gets it wrong in a way the drawing cannot, because a hand can
   tick gas on a run with no gas in it.

   So the utilities on a call-off are read rather than chosen, and shown
   per span so somebody splitting the work between teams can see which
   run carries what.

   ── One entry per utility ──

   The same rule the trench width uses, for the same reason: a build
   cuts a main wherever the calculated size steps, so one pipe comes
   back as 180mm for most of a run and 90mm past the point the load
   drops. Two features, one pipe. Named by whichever covers most of the
   span, which is what is mostly in the ground.

   ── Across the sections, not within one ──

   A span crosses whatever trench sections lie between its two nodes,
   and each is sized on its own. A gas main running the length of the
   span is one gas main whether the span crosses one section or four, so
   the contents are pooled across the sections before they are counted
   rather than added up section by section. */

import { contentsOf } from "./trenchContents.js";
import { sizeLabelOf } from "./sizeMode.js";
import { concurrentCount, dominantOf, trenchSize } from "./trenchSize.js";
import { digEstimate } from "./digRate.js";
import { isTrenchType } from "./snapping.js";
import { UTILITIES } from "../../lib/utilities.js";

/* The options contentsOf needs, worked out once for a drawing.

   Built here rather than at each call site because three screens now
   want the same answer, and three copies of "which line types are
   services" is three chances for one of them to disagree about what is
   in a trench. */
export function contentsOptions(lineTypes = [], lookups = null) {
  const serviceLineTypes = new Set(lineTypes
    .filter((t) => t.Layer_Key !== "trench" && /service/i.test(t.Type_Key))
    .map((t) => t.Type_Key));
  const serviceTrenchTypes = new Set(["trench_service", ...lineTypes
    .filter((t) => t.Layer_Key === "trench" && /service/i.test(t.Type_Key))
    .map((t) => t.Type_Key)]);

  return {
    serviceLineTypes,
    serviceTrenchTypes,
    isTrench: (x) => x.Feature_Type === "line"
      && isTrenchType(x.Attributes?.Line_Type, lineTypes),
    /* The size, which is what somebody wants — a cable's label is its
       circuit and way, which says which run it is and nothing about
       what was laid.

       ── The size in force, not the calculated one ──

       This read Cable_Size_ID and VD_Cable_Size_ID and stopped there, so
       a length overridden to 185 was called off as the 95 the build had
       worked out. The call-off said one thing, the trench editor beside
       it said another, and the bill said a third.

       sizeLabelOf is the rule, and it already covered all three
       utilities: the override where there is one, the calculated size
       everywhere else, the catalogue's label, and the typed text where
       there is no catalogue row. Using it here rather than a second
       lookup means there is one answer to "what size is this". */
    labelOf: (x) => {
      const size = sizeLabelOf(x, {
        electric: lookups?.cableSizes || [],
        gas: lookups?.gasPipeSizes || [],
        water: lookups?.waterPipeSizes || [],
      });
      if (size) return String(size).trim();
      return lineTypes.find((t) => t.Type_Key === x.Attributes?.Line_Type)?.Label
        ?? x.Label ?? null;
    },
  };
}

/* What is laid along a set of trench sections.

   `trenchIds` are the sections a span runs on, which spansBetween
   returns on each span. Returns one entry per utility, in the order the
   layers are given, each with the size that covers most of the run.

   A section the drawing cannot answer for is skipped rather than
   failing the lot: a span crossing four sections, one of which has
   nothing routed in it yet, still says what is in the other three. */
export function spanContents(trenchIds = [], features = [], opts = {}) {
  const { lineTypes = [], lookups = null } = opts;
  const co = contentsOptions(lineTypes, lookups);

  const byUtility = new Map();
  let trenchM = 0;

  for (const id of trenchIds) {
    const trench = features.find((f) => Number(f.Feature_ID) === Number(id));
    if (!trench) continue;
    const res = contentsOf(trench, features, co);
    if (res.error) continue;
    trenchM += res.trenchM || 0;

    for (const c of res.contents || []) {
      const held = byUtility.get(c.utility);
      const item = {
        label: c.label,
        withinM: c.withinM,
        outsideDiameterMM: Number(String(c.feature?.Attributes?.Size ?? "")
          .replace(/[^0-9.]/g, "")) || null,
      };
      if (held) held.push(item);
      else byUtility.set(c.utility, [item]);
    }
  }

  const out = [];
  for (const [utility, runs] of byUtility) {
    const main = dominantOf(runs);
    out.push({
      utility,
      /* The utility's own mark, from the one list of them. A size on its
         own says nothing about what it is — "95" and "63mm" read as two
         numbers until the bolt and the droplet are in front of them. */
      icon: UTILITIES.find((u) =>
        u.name.toLowerCase().replace(/[^a-z]/g, "")
          === String(utility).toLowerCase().replace(/[^a-z]/g, ""))?.icon ?? null,
      label: main?.label ?? null,
      count: concurrentCount(runs, trenchM || null),
      /* The other sizes it is drawn in along the span. Not separate
         entries — it is the same pipe — but worth being able to see. */
      alsoSizes: [...new Set(runs.map((r) => r.label))]
        .filter((x) => x && x !== main?.label),
    });
  }
  return out;
}

/* Every utility on the call-off, as layer keys.

   The union across its spans, because a call-off asks for one visit and
   a gang laying gas on one run and water on another needs both on the
   paperwork. Deduplicated and in the order first met, so the list reads
   the way the runs were named. */
export function callOffUtilities(spans = [], features = [], opts = {}) {
  const seen = [];
  for (const sp of spans) {
    for (const c of spanContents(sp.trenchIds || [], features, opts)) {
      if (!seen.includes(c.utility)) seen.push(c.utility);
    }
  }
  return seen;
}

/* A utility layer key as the Utility_ID the call-off is saved with.

   Matched on the utility's name against the layer key, because the two
   lists are keyed differently and neither holds the other's id. Loose
   on case and spacing only — a layer called "electric" and a utility
   called "Electric" are the same thing, and nothing else is. */
export function utilityIdsFor(keys = [], utilities = []) {
  const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const out = [];
  for (const k of keys) {
    const u = utilities.find((x) => norm(x.Utility) === norm(k));
    if (u && !out.includes(Number(u.Utility_ID))) out.push(Number(u.Utility_ID));
  }
  return out;
}


/* How long a span takes to dig and lay.

   ── Why this is here and not only in digDays.js ──

   There are two ways a mains call-off gets raised. The scheduling form
   works from span rows and walks the trench graph between their ends;
   the canvas works from the runs somebody clicked, which already know
   the trench sections they cross. Both need the same answer, and the
   canvas one was missing — a call-off raised from the drawing saved no
   estimate at all, so Planning had nothing to default an end date from
   and the To box came up empty.

   Same model either way: digRate.js does the arithmetic, and the
   difference is only in how the trench sections are arrived at.

   ── Section by section ──

   A span crosses whatever sections lie between its two nodes, and each
   is sized and surfaced on its own. Scaled where the span covers only
   part of them, which is the ordinary case only until span nodes have
   been placed — once the trenches are cut at the nodes, a span is its
   sections and the scale is one. */
export function spanDigEstimate(span, features = [], opts = {}) {
  const { lineTypes = [], lookups = null, surfaceTypes = [],
    rates, depthBands, layRates } = opts;
  const co = contentsOptions(lineTypes, lookups);

  const legs = [];
  let drawnM = 0;

  for (const id of span?.trenchIds || []) {
    const trench = features.find((f) => Number(f.Feature_ID) === Number(id));
    if (!trench) continue;
    const res = contentsOf(trench, features, co);
    if (res.error) continue;
    legs.push({ trench, res });
    drawnM += res.trenchM || 0;
  }
  if (!legs.length) return { ok: false, halfDays: 0 };

  /* The span's own length against what its sections come to. One where
     the sections are the span, which is what splitting at the nodes
     makes true — and below one where a span clips the end of a longer
     section, so the metres nobody is digging are not charged. */
  const scale = drawnM > 0 && span?.lengthM > 0
    ? Math.min(1, span.lengthM / drawnM) : 1;

  const out = legs.map(({ trench, res }) => {
    const items = (res.contents || []).map((c) => ({
      utility: c.utility,
      withinM: c.withinM,
      outsideDiameterMM: Number(String(c.feature?.Attributes?.Size ?? "")
        .replace(/[^0-9.]/g, "")) || null,
    }));
    return digEstimate({
      lengthM: (res.trenchM || 0) * scale,
      size: trenchSize(items, { trenchM: res.trenchM }),
      surfaceKey: trench?.Attributes?.Surface_Type ?? null,
      /* An existing section is not this call-off's to dig, but its
         pipes and cables still have to be laid. Per section, so a run
         reusing one length and opening another is charged for the one
         it opens. */
      existing: trench?.Attributes?.Build_Status === "existing",
      utilities: items.map((x) => x.utility),
      rates, depthBands, layRates, surfaceTypes,
    });
  }).filter((e) => e.ok);

  if (!out.length) return { ok: false, halfDays: 0 };

  const hours = out.reduce((t, e) => t + e.totalHours, 0);
  return {
    ok: true,
    hours: Math.round(hours * 100) / 100,
    /* Rounded up, because a gang cannot be sent for part of a half-day.
       Four hours to the half, as digDays.js has it. */
    halfDays: Math.max(1, Math.ceil(hours / 4)),
    volumeM3: Math.round(out.reduce((t, e) => t + e.volumeM3, 0) * 100) / 100,
    sections: out.length,
  };
}

/* The same for a run of several spans, as the canvas records them.

   Summed from the spans rather than pooled, because each is its own
   length of dig with its own setup — and because the half-days on a
   run should be the half-days a planner would get by booking its spans
   one at a time. */
export function rangeDigEstimate(range, features = [], opts = {}) {
  const spans = range?.spans || [range];
  const each = spans.map((sp) => spanDigEstimate(sp, features, opts));
  const ok = each.filter((e) => e.ok);
  if (!ok.length) return { ok: false, halfDays: 0 };
  return {
    ok: true,
    halfDays: ok.reduce((t, e) => t + e.halfDays, 0),
    hours: Math.round(ok.reduce((t, e) => t + e.hours, 0) * 100) / 100,
    spans: ok.length,
    unestimated: each.length - ok.length,
  };
}

/* What is in a run, as one line of text.

   Saved on the call-off row so the scheduling side can show it without
   the drawing. It holds none of the GIS and has no way to work this out
   — and recomputing it later would be answering about the drawing as it
   is now rather than as the call-off was raised. */
export function contentsText(trenchIds = [], features = [], opts = {}) {
  const inIt = spanContents(trenchIds, features, opts);
  if (!inIt.length) return null;
  /* Written with the icons in, so what is stored is what a gang reads
     and the table needs no key to the sizes. The scheduling side holds
     none of the drawing and cannot work out which utility a "63mm" is;
     putting it in the text is what lets the column be read at a glance
     without a second column to carry it. */
  return inIt
    .map((c) => {
      const size = c.count > 1 ? `${c.count} \u00d7 ${c.label}` : c.label;
      return c.icon ? `${c.icon} ${size}` : size;
    })
    .join("  \u00b7  ");
}
