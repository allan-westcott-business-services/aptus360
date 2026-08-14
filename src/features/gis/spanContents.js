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
import { concurrentCount, dominantOf } from "./trenchSize.js";
import { isTrenchType } from "./snapping.js";

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
       what was laid. */
    labelOf: (x) => {
      const sizeId = x.Attributes?.Cable_Size_ID ?? x.Attributes?.VD_Cable_Size_ID;
      const size = sizeId != null
        ? (lookups?.cableSizes || []).find((c) =>
          String(c.Cable_Size_ID) === String(sizeId))?.Size_Label
        : null;
      if (size) return size;
      const pipe = String(x.Attributes?.Size ?? "").trim();
      if (pipe) return pipe;
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
