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
  coverFor, njugKeyFor,
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

  return {
    surface: String(surface || "footway").toLowerCase(),
    widthMm,
    label,
    atM,
    items,
    findings,
  };
}

const esc = (s) => String(s ?? "")
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* The section as SVG.

   Drawn to scale across and down — the same scale both ways, because a
   section stretched vertically to fill a box misrepresents the one
   thing it exists to show. Dimensions are written on rather than left
   to be measured: the note says it is not to scale on NJUG's own
   figure for exactly this reason, and a drawing that can be measured
   wrongly will be. */
export function sectionSvg(model, opts = {}) {
  const { pxPerMm = 0.18, depthMm = 1400 } = opts;
  const padL = 70;
  const padR = 20;
  const padT = 54;
  const padB = 64;

  const w = Math.round(model.widthMm * pxPerMm) + padL + padR;
  const h = Math.round(depthMm * pxPerMm) + padT + padB;
  const X = (mm) => padL + mm * pxPerMm;
  const Y = (mm) => padT + mm * pxPerMm;

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" `
    + `width="${w}" height="${h}" font-family="ui-sans-serif, system-ui, sans-serif">`);
  parts.push(`<rect width="${w}" height="${h}" fill="#ffffff"/>`);

  /* The surface, and the made-up ground under it. */
  parts.push(`<rect x="${X(0)}" y="${Y(0) - 10}" width="${model.widthMm * pxPerMm}" `
    + `height="10" fill="#475569"/>`);
  parts.push(`<rect x="${X(0)}" y="${Y(0)}" width="${model.widthMm * pxPerMm}" `
    + `height="${depthMm * pxPerMm}" fill="#f8fafc" stroke="#cbd5e1"/>`);

  /* Boundary on the left, carriageway on the right — the way the
     guidance's own figure is drawn, so the two read together. */
  parts.push(`<line x1="${X(0)}" y1="${Y(0) - 26}" x2="${X(0)}" `
    + `y2="${Y(depthMm)}" stroke="#94a3b8" stroke-dasharray="6 4"/>`);
  parts.push(`<text x="${X(0) - 6}" y="${Y(0) - 30}" font-size="11" `
    + `text-anchor="end" fill="#475569">Boundary</text>`);
  parts.push(`<text x="${X(model.widthMm)}" y="${Y(0) - 30}" font-size="11" `
    + `text-anchor="end" fill="#475569">Carriageway</text>`);

  const title = [model.label, model.atM != null
    ? `${Number(model.atM).toFixed(1)} m along` : null,
  model.surface].filter(Boolean).join(" \u00b7 ");
  parts.push(`<text x="${padL}" y="20" font-size="13" font-weight="700" `
    + `fill="#0f172a">${esc(title || "Trench section")}</text>`);
  parts.push(`<text x="${padL}" y="36" font-size="10" fill="#64748b">`
    + `Depths are cover to the crown, from finished surface level. `
    + `NJUG Vol 1 recommended minima.</text>`);

  for (const it of model.items) {
    const r = (it.diameterMm / 2) * pxPerMm;
    const cover = it.coverMm ?? 300;
    /* Stacked runs sit below one another, a clear 150mm apart. */
    const crown = cover + it.stack * (it.diameterMm + 150);
    const cx = X(it.xMm);
    const cy = Y(crown) + r;

    parts.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" `
      + `r="${Math.max(3, r).toFixed(1)}" fill="${it.colour}" `
      + `stroke="#0f172a" stroke-width="0.8"/>`);

    /* The cover dimension, drawn from the surface to the crown. */
    parts.push(`<line x1="${cx.toFixed(1)}" y1="${Y(0)}" x2="${cx.toFixed(1)}" `
      + `y2="${(cy - r).toFixed(1)}" stroke="#94a3b8" stroke-width="0.8"/>`);
    parts.push(`<text x="${(cx + 4).toFixed(1)}" y="${(Y(0) + 12 + it.stack * 12)}" `
      + `font-size="9" fill="#475569">${it.coverMm ?? "by levels"}`
      + `${it.coverMm ? "mm" : ""}</text>`);

    const name = [it.label, `${it.diameterMm}${it.diameterStated ? "" : " nom"}mm`]
      .filter(Boolean).join(" ");
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + r + 13).toFixed(1)}" `
      + `font-size="9" text-anchor="middle" fill="#0f172a">${esc(name)}</text>`);
    parts.push(`<text x="${cx.toFixed(1)}" y="${(cy + r + 24).toFixed(1)}" `
      + `font-size="8" text-anchor="middle" fill="#64748b">`
      + `${esc(it.utility)}</text>`);
  }

  /* The running dimensions across the bottom, as the guidance's figure
     gives them. */
  const y = Y(depthMm) + 16;
  const xs = [0, ...model.items.filter((i) => i.placed).map((i) => i.xMm),
    model.widthMm].sort((a, b) => a - b);
  const uniq = xs.filter((v, i) => i === 0 || v !== xs[i - 1]);
  parts.push(`<line x1="${X(0)}" y1="${y}" x2="${X(model.widthMm)}" y2="${y}" `
    + `stroke="#94a3b8"/>`);
  for (let i = 1; i < uniq.length; i++) {
    const mid = (X(uniq[i - 1]) + X(uniq[i])) / 2;
    parts.push(`<line x1="${X(uniq[i])}" y1="${y - 4}" x2="${X(uniq[i])}" `
      + `y2="${y + 4}" stroke="#94a3b8"/>`);
    parts.push(`<text x="${mid.toFixed(1)}" y="${y + 14}" font-size="9" `
      + `text-anchor="middle" fill="#475569">${Math.round(uniq[i] - uniq[i - 1])}</text>`);
  }
  parts.push(`<text x="${X(model.widthMm / 2).toFixed(1)}" y="${y + 30}" `
    + `font-size="9" text-anchor="middle" fill="#64748b">`
    + `${model.widthMm}mm across</text>`);

  parts.push("</svg>");
  return parts.join("");
}
