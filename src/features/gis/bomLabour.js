/* Dig and lay time, as rows on the bill.

   ── Why this is not in gis_bom ──

   Every other row on the bill is counted in SQL, and these are not.
   That is deliberate.

   The hours come from the size of the trench, and the size comes from
   what is routed in it: the NJUG separations, the cross-section rule
   that tells consecutive runs of one main from several laid side by
   side, the coverage ratio behind it. That is trenchSize.js, and it is
   several hundred lines of judgement that took four attempts to get
   right.

   Writing it again in SQL would be a second implementation of the same
   rules, kept in step by hand, and the first thing to go wrong would be
   a bill quietly disagreeing with the panel that produced it. So the
   arithmetic stays in one place and the bill reads it, rather than the
   other way round.

   The alternative — storing the hours on each trench when it is saved —
   was rejected for the reason trenchSize gives about the width: routing
   another cable into a trench changes it, and a figure written once
   goes stale the moment the drawing moves.

   ── What the rows are ──

   Excavation is per site and surface, because that is what changes it:
   a metre of carriageway is more than twice a metre of verge. It
   carries no utility — a hole is a hole, whatever ends up in it.

   Laying is per utility, because that is the question somebody asks of
   it: how long the gas takes as against the electric. A joint trench
   carrying three mains is one dig and three lays.

   ── Split by developer, like every other row ──

   gis_bom attributes a line to a developer from Project_Developer_ID on
   the feature, and the modal treats a row with none as shared plant —
   shown in every developer's tab.

   These rows had none, so every developer's tab showed the whole site's
   labour. That is the worst way for it to be wrong: not missing, and
   not obviously too large, but exactly the total somebody would expect
   to see if they had not thought about it.

   So the dig and the lay follow the trench's own developer, and a
   trench with none stays genuinely shared — which it is, since nobody
   has said whose it is.

   ── Existing trench ──

   Left out of the excavation and kept in the laying, matching the
   estimate and the bill's own quantities: an existing section is not
   this job's to dig, but its pipes and cables still have to be laid. */

import { contentsOf } from "./trenchContents.js";
import { trenchSize } from "./trenchSize.js";
import { digEstimate } from "./digRate.js";
import { contentsOptions } from "./spanContents.js";
import { UTILITIES } from "../../lib/utilities.js";

/* What a utility is called on the bill.

   gis_bom names its sections from the Utility table, so these have to
   agree or the laying for gas lands in a section of its own next to the
   gas it belongs with. Matched on the layer key, loose on case and
   spacing and nothing else. */
function utilityName(key, utilities = []) {
  const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z]/g, "");
  const row = utilities.find((u) => norm(u.Utility) === norm(key));
  if (row?.Utility) return row.Utility;
  return UTILITIES.find((u) => norm(u.name) === norm(key))?.name ?? key;
}

/* Hours, rounded the way an hour is read.

   Two decimals through the arithmetic and one on the row: a bill adding
   up to 41.3 hours where its rows show 41.2 is the kind of thing that
   gets the whole sheet doubted. */
const round1 = (v) => Math.round(v * 10) / 10;

/* The labour on a project, as bill rows.

   Shaped exactly as gis_bom's rows are — site, utility, item, surface,
   unit, quantity, features — so the modal groups, totals, sorts and
   exports them without knowing they came from somewhere else. */
export function bomLabour(features = [], opts = {}) {
  const {
    lineTypes = [], surfaceTypes = [], lookups = null, utilities = [],
    developers = [],
    rates, depthBands, layRates,
  } = opts;

  /* What a developer is called on the bill. Matched the way gis_bom
     matches it — on Project_Developer_ID — and named from the same
     branch label the canvas uses, so a labour row and a pipe row for
     the same developer land under one heading rather than two. */
  const developerName = (id) => {
    if (id == null || id === "") return null;
    const d = developers.find((x) =>
      String(x.Project_Developer_ID ?? x.id) === String(id));
    return d?.label ?? d?.name ?? `Developer ${id}`;
  };

  const co = contentsOptions(lineTypes, lookups);
  const trenches = features.filter((f) => f.Feature_Type === "line"
    && f.Layer_Key === "trench");

  /* Keyed so the same site, surface and utility land on one row however
     many sections of trench contributed to it. */
  const dig = new Map();
  const lay = new Map();

  for (const trench of trenches) {
    const res = contentsOf(trench, features, co);
    if (res.error) continue;

    const items = (res.contents || []).map((c) => ({
      utility: c.utility,
      withinM: c.withinM,
      outsideDiameterMM: Number(String(c.feature?.Attributes?.Size ?? "")
        .replace(/[^0-9.]/g, "")) || null,
    }));
    if (!items.length) continue;

    const surfaceKey = trench.Attributes?.Surface_Type ?? null;
    const existing = trench.Attributes?.Build_Status === "existing";

    const est = digEstimate({
      lengthM: res.trenchM,
      size: trenchSize(items, { trenchM: res.trenchM }),
      surfaceKey,
      existing,
      utilities: items.map((x) => x.utility),
      rates, depthBands, layRates, surfaceTypes,
    });
    if (!est.ok) continue;

    const site = trench.Attributes?.Site || "Unclassified";
    /* Null where the trench has no developer, which the modal reads as
       shared plant — correct, because nobody has said whose it is. */
    const devId = trench.Attributes?.Project_Developer_ID ?? null;
    const devName = developerName(devId);

    /* Excavation, with the setup that goes with it — the machine being
       moved and matted is part of digging and not of laying. Nothing
       for an existing trench, which is why the row is only added when
       there is time in it: a bill line reading zero hours invites
       somebody to wonder what was meant by it. */
    const digHours = est.digHours + est.setupHours;
    if (digHours > 0) {
      const label = surfaceTypes.find((s) => s.Surface_Key === surfaceKey)?.Label
        ?? est.surfaceLabel ?? "";
      const k = `${site}\u0000${label}\u0000${devId ?? ""}`;
      const held = dig.get(k);
      if (held) { held.quantity += digHours; held.features += 1; }
      else {
        dig.set(k, {
          site,
          utility: "Labour",
          item: "Excavation",
          surface: label,
          unit: "hr",
          quantity: digHours,
          features: 1,
          developer_id: devId,
          developer_name: devName,
        });
      }
    }

    /* Laying, one row per utility. est.lays already holds the hours per
       thing laid, with the joint-trench allowance applied to the total
       — so the allowance is spread across them in proportion rather
       than dropped, which would put the rows above the total the
       estimate gives for the same trench. */
    const raw = est.lays.reduce((t, l) => t + l.hours, 0);
    const scale = raw > 0 ? est.layHours / raw : 1;
    for (const l of est.lays) {
      const name = utilityName(l.utility, utilities);
      const k = `${site}\u0000${name}\u0000${devId ?? ""}`;
      const hours = l.hours * scale;
      const held = lay.get(k);
      if (held) { held.quantity += hours; held.features += 1; }
      else {
        lay.set(k, {
          site,
          utility: "Labour",
          item: `Laying \u2014 ${name}`,
          surface: "",
          unit: "hr",
          quantity: hours,
          features: 1,
          developer_id: devId,
          developer_name: devName,
        });
      }
    }
  }

  return [...dig.values(), ...lay.values()]
    .map((r) => ({ ...r, quantity: round1(r.quantity) }))
    .filter((r) => r.quantity > 0)
    .sort((a, b) => a.site.localeCompare(b.site)
      || a.item.localeCompare(b.item)
      || a.surface.localeCompare(b.surface));
}

/* The name the bill groups these under.

   Exported so the modal can order the section rather than matching a
   string written in two places. */
export const LABOUR_UTILITY = "Labour";
