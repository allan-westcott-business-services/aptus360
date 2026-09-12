/* The drawing, as vectors on a page.

   ── Why a draw LIST and not calls into a PDF ──

   Nothing here knows what a PDF is. It turns features into primitives
   positioned in millimetres on one sheet — lines, discs, boxes, text —
   and the writer next door turns those into PDF operators.

   That split is what makes this testable. "Is the trench on page 2 in
   the right place" is a question about numbers, and a list of numbers
   can be asked it. The same question asked of a PDF is a question
   about a binary file.

   ── The honest limitation ──

   This is a SECOND renderer. The canvas draws symbols in two thousand
   lines of context calls — a board's square with DB in it, a cut-out's
   turned blade, an open point's lifted switch — and none of that is
   reachable from here. So the PDF draws the same features from the
   same styles, at the same scale, in the same colours, with simpler
   symbols: a shape per role rather than a picture per role.

   Where the two could drift, they are made to read the same source:
   colours and widths come from `resolveStyle`/`appearance` in
   gisStyle.js, which is what the canvas resolves its own from. A
   colour is never written twice.

   ── The frame ──

   Ground metres in, page millimetres out. `x` grows east and `y` grows
   SOUTH in this drawing's coordinates, and a PDF's y grows down the
   page, so the two agree and there is no flip. A flip here would print
   a mirror image of the drawing, which is the kind of fault that is
   only noticed on site. */

import { resolveStyle, appearance, subjectOf } from "../../lib/gisStyle.js";
import { mmPerMetre } from "./printSheet.js";

/* Line widths on paper. A cable drawn 4 px wide on screen is not 4 mm
   on paper; screen pixels are a viewing convenience and paper is a
   measurement. These are what a plan is normally drawn with, and the
   style's relative weights are kept: a main stays heavier than a
   service. */
const MM_PER_PX = 0.18;
const MIN_W_MM = 0.12;
const MAX_W_MM = 1.6;

/* Symbol sizes on paper, by role. Millimetres, so they are the same
   size on an A4 as on an A0 — a 2 mm disc is a 2 mm disc, which is
   what makes a printed plan readable at any sheet size. */
const SYMBOL_MM = {
  substation: 3.2,
  poc: 2.6,
  msdb: 2.8,
  hdcutout: 2.4,
  joint: 1.8,
  meter: 1.4,
  plot: 1.6,
  nrs: 1.8,
  spannode: 1.2,
  feederpoint: 1.6,
  linkbox: 2.6,
  primary: 3.4,
  ringsub: 2.8,
  openpoint: 2.2,
  default: 1.6,
};

/* Which roles are drawn as which shape. Deliberately plain: a plan is
   read by its labels and its colours, and a shape per kind is enough
   to tell a joint from a meter at a glance. */
const SHAPE = {
  substation: "square",
  primary: "square",
  ringsub: "square",
  msdb: "square",
  linkbox: "square",
  poc: "disc",
  meter: "disc",
  plot: "disc",
  nrs: "disc",
  spannode: "disc",
  feederpoint: "disc",
  joint: "diamond",
  hdcutout: "diamond",
  openpoint: "diamond",
};

const isLine = (f) => (f?.Geometry || []).length > 1;

/* Does this feature touch the page at all? A bounding-box test, so a
   site of ten thousand features does not turn into ten thousand
   clipped polylines on every page. Generous by a metre, so a symbol
   whose centre is just off the page still draws its half. */
function touches(f, tile, padM = 1) {
  const g = f?.Geometry || [];
  if (!g.length) return false;
  let minX = Infinity; let minY = Infinity;
  let maxX = -Infinity; let maxY = -Infinity;
  for (const p of g) {
    if (!Array.isArray(p)) continue;
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minY) minY = p[1];
    if (p[1] > maxY) maxY = p[1];
  }
  return maxX >= tile.minX - padM && minX <= tile.maxX + padM
    && maxY >= tile.minY - padM && minY <= tile.maxY + padM;
}

/* ── One page's worth of drawing ──

   `tile` is a rectangle of ground from `tilePlan`. `marginMm` is the
   unprintable border the tile was planned with, and it is where the
   drawing starts on the page: the tile covers the PRINTABLE area, not
   the sheet.

   Returns primitives in the order they should be drawn — trenches,
   then cables, then points, then labels — because a PDF has no
   z-order beyond the order operators are written in. */
export function pageDrawList(features = [], tile, {
  layers = [],
  styles = [],
  lineTypes = [],
  scaleDenom = 500,
  marginMm = 5,
  labels = true,
  utilities = [],
} = {}) {
  if (!tile) return [];
  const k = mmPerMetre(scaleDenom);
  const toPage = (p) => [
    (p[0] - tile.minX) * k + marginMm,
    (p[1] - tile.minY) * k + marginMm,
  ];

  /* The style the canvas would resolve, at the scale this page is
     drawn at. `appearance` wants pixels per metre; on paper the
     equivalent is millimetres per metre, and the widths that come back
     are converted below. Passing the paper scale rather than a screen
     zoom is what makes a style's Min_Scale/Max_Scale rules mean the
     same thing on the sheet as on screen. */
  const styleOf = (f) => {
    const subject = subjectOf(f, layers);
    const st = resolveStyle(subject, styles, { utilities });
    return { st, ap: appearance(st, k) };
  };

  const widthMm = (px) => Math.min(MAX_W_MM,
    Math.max(MIN_W_MM, (Number(px) || 2) * MM_PER_PX));

  const out = [];
  const here = features.filter((f) => touches(f, tile));

  /* Lines first, and trenches before cables: a cable is drawn along a
     trench and must sit on top of it, as it does on screen. */
  const lines = here.filter(isLine);
  const rank = (f) => (String(f.Layer_Key) === "trench" ? 0
    : String(f.Layer_Key) === "boundary" ? -1 : 1);
  for (const f of lines.sort((a, b) => rank(a) - rank(b))) {
    const { st, ap } = styleOf(f);
    if (ap.visible === false) continue;
    const lt = lineTypes.find((t) => t.Type_Key === f.Attributes?.Line_Type);
    out.push({
      kind: f.Feature_Type === "polygon" ? "polygon" : "polyline",
      pts: (f.Geometry || []).filter(Array.isArray).map(toPage),
      colour: ap.colour ?? lt?.Colour ?? "#64748b",
      widthMm: widthMm(ap.widthPx ?? lt?.Width_px),
      /* A dash is a fact about the line type \u2014 an existing main is
         dashed because it is not ours \u2014 so it survives onto paper. In
         millimetres, or a 9 px dash would be a different length on
         every sheet size. */
      dashMm: (st.Dashed || lt?.Dashed)
        ? (ap.dash || [9, 6]).map((n) => n * MM_PER_PX) : null,
      id: f.Feature_ID,
    });
  }

  /* Then the points, so a symbol is never buried under a cable. */
  for (const f of here) {
    if (isLine(f)) continue;
    const at = (f.Geometry || [])[0];
    if (!Array.isArray(at)) continue;
    const { ap } = styleOf(f);
    if (ap.visible === false) continue;
    const role = String(f.Feature_Role || "");
    out.push({
      kind: SHAPE[role] || "disc",
      at: toPage(at),
      rMm: (SYMBOL_MM[role] ?? SYMBOL_MM.default) / 2,
      colour: ap.colour ?? "#334155",
      /* Filled unless it is a fitting: a hollow diamond reads as a
         joint on every plan anybody has drawn. */
      fill: !(role === "joint" || role === "hdcutout" || role === "openpoint"),
      widthMm: 0.25,
      id: f.Feature_ID,
    });
  }

  if (labels) {
    for (const f of here) {
      const text = f.Label;
      if (!text) continue;
      const at = (f.Geometry || [])[0];
      if (!Array.isArray(at)) continue;
      if (isLine(f)) continue;
      const { ap } = styleOf(f);
      if (ap.visible === false) continue;
      const role = String(f.Feature_Role || "");
      const r = (SYMBOL_MM[role] ?? SYMBOL_MM.default) / 2;
      const p = toPage(at);
      out.push({
        kind: "text",
        at: [p[0] + r + 0.8, p[1] + 0.9],
        text: String(text),
        /* Points, not millimetres: type is measured in points
           everywhere else and a PDF writer expects them. 6 pt is the
           smallest a plan is normally labelled at. */
        sizePt: 6,
        colour: ap.labelColour ?? "#0f172a",
        id: f.Feature_ID,
      });
    }
  }

  return out;
}

/* Everything on the page, in the order it is drawn, for every tile.
   A convenience for the writer and for a test that wants to count
   what lands where. */
export function planDrawLists(features, plan, opts = {}) {
  if (!plan) return [];
  return plan.tiles.map((tile) => ({
    tile,
    items: pageDrawList(features, tile, {
      ...opts,
      scaleDenom: plan.scaleDenom,
      marginMm: plan.marginMm,
    }),
  }));
}
