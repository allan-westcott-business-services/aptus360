/* A cross-section of the trench at one point along it.

   The trench already knows what runs in it — `contentsOf` answers that
   from the drawing rather than from anybody's memory — and NJUG says
   how deep each should be and where across a footway it belongs. This
   puts the two together and draws the section somebody would otherwise
   sketch on the back of the drawing.

   ── What it is FOR ──

   Two questions, and they are different. "What is in this trench, and
   how should it be laid" — a section for issue, drawn to the
   recommended positions. And "what have we actually drawn" — the same
   section with the contents at their designed depths, showing where
   that departs from the guidance.

   This builds the first and reports the second as findings, because a
   drawing that silently redraws the design to match a standard is
   worse than useless: it hides the thing somebody needed to see.

   ── Pure ──

   Contents in, model out, and an SVG from the model. No canvas, no
   DOM, so what it draws can be checked. */

import {
  NJUG_FOOTWAY_ORDER, NJUG_FOOTWAY_WIDTH_MM, NJUG_COLOUR,
  coverFor, njugKeyFor, njugSurface,
} from "./njug.js";

/* Which position across the footway an apparatus takes. HV and LV both
   sit in the electricity position: the figure draws them as one group
   near the boundary, which is what a section should show. */
const POSITION_OF = {
  electric_hv: "electric",
  electric_lv: "electric",
  gas: "gas",
  water: "water",
  water_non_potable: "water",
  communications: "communications",
  communications_catv: "communications_catv",
};

/* A diameter to draw, in millimetres.

   From the size on the feature where it has one — "63mm", "180mm",
   "90 mm" — because that is the size somebody ordered. Where there is
   none, a nominal 100mm, drawn as nominal and said so: a section that
   invents a diameter and does not admit it is the kind of drawing that
   gets measured off. */
export function diameterMm(f) {
  const raw = String(f?.Attributes?.Size ?? "");
  const m = /(\d+(?:\.\d+)?)\s*mm/i.exec(raw);
  if (m) return { mm: Number(m[1]), stated: true };
  const bare = /^(\d+(?:\.\d+)?)$/.exec(raw.trim());
  if (bare) return { mm: Number(bare[1]), stated: true };
  return { mm: 100, stated: false };
}

/* The section model.

   `items` are what the trench holds, each with the position the
   guidance gives it across the footway and the cover it should have.
   `findings` are the things worth saying out loud — a utility the
   guidance has no position for, a sewer whose depth follows its fall,
   an oil pipeline's approval requirement, two services sharing a
   position. */
export function trenchSection(contents = [], opts = {}) {
  const {
    lineTypes = [],
    surface = "footway",
    widthMm = NJUG_FOOTWAY_WIDTH_MM,
    label = "",
    atM = null,
    /* Viewed from the other side. The cut is the same cut — the same
       pipes at the same depths — but left and right swap, because that
       is what looking at it the other way means. Carried on the model
       rather than applied to the items, so the positions stay the
       positions the guidance gives and only the DRAWING is mirrored. */
    flip = false,
  } = opts;

  const items = [];
  const findings = [];
  const takenBy = new Map();

  for (const c of contents) {
    const f = c.feature ?? c;
    const njugKey = njugKeyFor(f, { lineTypes });
    if (!njugKey) {
      findings.push({
        kind: "unknown",
        text: `${f.Label || "A line"} is not something the guidance places `
          + "— it is drawn to one side and its depth is left to the design.",
      });
      continue;
    }

    const cover = coverFor(njugKey, surface);
    const posKey = POSITION_OF[njugKey] ?? njugKey;
    const slot = NJUG_FOOTWAY_ORDER.find((p) => p.key === posKey);
    const dia = diameterMm(f);

    if (cover?.warning) findings.push({ kind: "warning", text: cover.warning });
    if (!cover) {
      findings.push({
        kind: "no-cover",
        text: `${cover?.label || njugKey} has no recommended cover — its `
          + "depth follows its levels, so the section shows it without one.",
      });
    }
    if (!dia.stated) {
      findings.push({
        kind: "nominal",
        text: `${f.Label || "A run"} has no size on the drawing; it is drawn `
          + "at a nominal 100mm.",
      });
    }

    /* Two runs in the same position — two LV cables, say — are stacked
       rather than overlapped, because a section showing one circle
       where two cables lie is the drawing somebody digs through. */
    const n = takenBy.get(posKey) ?? 0;
    takenBy.set(posKey, n + 1);

    items.push({
      id: f.Feature_ID ?? null,
      label: f.Label ?? null,
      njugKey,
      utility: cover?.label ?? njugKey,
      /* Across the footway from the boundary. Nothing the guidance
         places goes at the far edge, out of the way and marked as
         unplaced by the finding above. */
      xMm: slot ? slot.fromBoundaryMm : widthMm - 120,
      placed: !!slot,
      /* To the CROWN, which is what the guidance measures. */
      coverMm: cover ? cover.min : null,
      coverMaxMm: cover ? cover.max : null,
      diameterMm: dia.mm,
      diameterStated: dia.stated,
      /* Stacked below the one before it in the same position, clear of
         it by its own diameter. */
      stack: n,
      colour: NJUG_COLOUR[njugKey] ?? "#475569",
    });
  }

  for (const [key, n] of takenBy) {
    if (n > 1) {
      findings.push({
        kind: "shared",
        text: `${n} runs share the ${key} position; they are drawn stacked, `
          + "and the spacing between them is a matter for the asset owner.",
      });
    }
  }

  /* What the drawing calls the surface, and which of the guidance's
     three columns was actually read. A section that silently used the
     verge figures for "unmade" would be a depth somebody trusts
     without knowing where it came from. */
  const surf = njugSurface(surface);

  return {
    surface: surf.key,
    surfaceSaid: String(surface || "").trim() || surf.said,
    surfaceAssumed: surf.assumed,
    /* Mapped by a decision of yours rather than by the guidance — said
       differently from an assumption, because it is not a guess. */
    surfacePolicy: !!surf.policy,
    widthMm,
    label,
    atM,
    flip: !!flip,
    items,
    findings,
  };
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* The section as SVG.

   To scale both ways, at the same scale — a section stretched to fill
   a box misrepresents the one thing it exists to show.

   Laid out so nothing lands on anything else, which the first version
   got wrong in three ways worth naming: the cover figures were all
   written at the top of the drawing instead of beside the runs they
   measured, the Boundary and Carriageway labels sat where a title
   would go, and two runs in the same position had their names printed
   over each other. A section is read by somebody deciding where to
   dig; a collision in it is not a cosmetic fault. */
export function sectionSvg(model, opts = {}) {
  const { pxPerMm = 0.2, depthMm = 1500 } = opts;
  const padL = 56;
  const padR = 56;
  /* Room above for the two side labels, which belong INSIDE the frame
     beside the surface rather than over the heading. */
  const padT = 34;
  const padB = 58;

  const gw = model.widthMm * pxPerMm;
  const gh = depthMm * pxPerMm;
  const w = Math.round(gw) + padL + padR;
  const h = Math.round(gh) + padT + padB;
  /* Mirrored when the mark is turned about: the boundary moves to the
     right, the carriageway to the left, and every run with them. The
     section is unchanged — this is the same cut seen from the other
     side, which is the whole reason for being able to turn the mark. */
  const X = (mm) => padL + (model.flip ? (model.widthMm - mm) : mm) * pxPerMm;
  const Y = (mm) => padT + mm * pxPerMm;

  const P = [];
  P.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" `
    + `width="${w}" height="${h}" `
    + `font-family="ui-sans-serif, system-ui, sans-serif">`);
  P.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);

  /* The ground, and the made surface over it. */
  P.push(`<rect x="${X(0)}" y="${Y(0)}" width="${gw}" height="${gh}" `
    + `fill="#f8fafc" stroke="#e2e8f0"/>`);
  P.push(`<rect x="${X(0)}" y="${Y(0) - 9}" width="${gw}" height="9" `
    + `fill="#64748b"/>`);

  /* The two sides, inside the frame and hard against their own edges,
     so they cannot be read as belonging to the other one. */
  const left = model.flip ? "Carriageway" : "Boundary";
  const right = model.flip ? "Boundary" : "Carriageway";
  P.push(`<text x="${padL + 4}" y="${padT - 12}" font-size="10" `
    + `fill="#64748b">${left}</text>`);
  P.push(`<text x="${padL + gw - 4}" y="${padT - 12}" font-size="10" `
    + `text-anchor="end" fill="#64748b">${right}</text>`);
  P.push(`<line x1="${X(0)}" y1="${padT - 22}" x2="${X(0)}" y2="${Y(depthMm)}" `
    + `stroke="#cbd5e1" stroke-dasharray="5 4"/>`);
  P.push(`<line x1="${X(model.widthMm)}" y1="${padT - 22}" `
    + `x2="${X(model.widthMm)}" y2="${Y(depthMm)}" `
    + `stroke="#cbd5e1" stroke-dasharray="5 4"/>`);

  /* Each run: its circle at its own depth, the cover figure ON its own
     dimension line, and its name beneath it. Names alternate above and
     below the circle where two sit close together, which is what stops
     a stack of cables printing one name over another. */
  const placed = [];
  for (const it of model.items) {
    const r = Math.max(3, (it.diameterMm / 2) * pxPerMm);
    const cover = it.coverMm ?? 300;
    const crown = cover + it.stack * (it.diameterMm + 200);
    const cx = X(it.xMm);
    const cy = Y(crown) + r;

    /* The dimension, from the surface to the crown, with the figure
       written ON the line at its own height — not queued at the top
       with every other run's. */
    P.push(`<line x1="${cx.toFixed(1)}" y1="${Y(0)}" x2="${cx.toFixed(1)}" `
      + `y2="${(cy - r).toFixed(1)}" stroke="#cbd5e1" stroke-width="0.8"/>`);
    const dimY = (Y(0) + (cy - r)) / 2;
    P.push(`<text x="${(cx + 4).toFixed(1)}" y="${dimY.toFixed(1)}" `
      + `font-size="9" fill="#64748b">`
      + `${it.coverMm != null ? `${it.coverMm}mm` : "by levels"}</text>`);

    P.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" `
      + `r="${r.toFixed(1)}" fill="${it.colour}" stroke="#0f172a" `
      + `stroke-width="0.8"/>`);

    /* Two lines of name: what it is called and how big, then which
       utility. Pushed down past anything already written within a few
       millimetres either side. */
    let ty = cy + r + 12;
    for (const q of placed) {
      if (Math.abs(q.x - cx) < 64 && Math.abs(q.y - ty) < 22) ty = q.y + 24;
    }
    placed.push({ x: cx, y: ty });

    const size = it.diameterStated
      ? `${it.diameterMm}mm`
      : `${it.diameterMm}mm nominal`;
    const name = [it.label, size].filter(Boolean).join("  ");
    P.push(`<text x="${cx.toFixed(1)}" y="${ty.toFixed(1)}" font-size="9" `
      + `text-anchor="middle" fill="#0f172a">${esc(name)}</text>`);
    P.push(`<text x="${cx.toFixed(1)}" y="${(ty + 11).toFixed(1)}" `
      + `font-size="8" text-anchor="middle" fill="#64748b">`
      + `${esc(it.utility)}</text>`);
  }

  /* Running dimensions across the bottom, between the things that are
     actually there. */
  const y = Y(depthMm) + 18;
  const stops = [...new Set([0, ...model.items.filter((i) => i.placed)
    .map((i) => i.xMm), model.widthMm])].sort((a, b) => a - b);
  P.push(`<line x1="${X(0)}" y1="${y}" x2="${X(model.widthMm)}" y2="${y}" `
    + `stroke="#cbd5e1"/>`);
  for (const mm of stops) {
    P.push(`<line x1="${X(mm)}" y1="${y - 4}" x2="${X(mm)}" y2="${y + 4}" `
      + `stroke="#cbd5e1"/>`);
  }
  for (let i = 1; i < stops.length; i++) {
    const mid = (X(stops[i - 1]) + X(stops[i])) / 2;
    P.push(`<text x="${mid.toFixed(1)}" y="${(y + 14).toFixed(1)}" `
      + `font-size="9" text-anchor="middle" fill="#64748b">`
      + `${Math.round(stops[i] - stops[i - 1])}</text>`);
  }
  P.push(`<text x="${(padL + gw / 2).toFixed(1)}" y="${(y + 32).toFixed(1)}" `
    + `font-size="9" text-anchor="middle" fill="#94a3b8">`
    + `${model.widthMm}mm across \u00b7 depths are cover to the crown</text>`);

  P.push("</svg>");
  return P.join("");
}
