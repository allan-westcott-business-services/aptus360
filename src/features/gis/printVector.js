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

import {
  resolveStyle, appearance, subjectOf, symbolPath, STROKE_ONLY, SYMBOL_TEXT,
} from "../../lib/gisStyle.js";
import { isBottleEnd, symbolSpin } from "./joints.js";
import { VALVE_WIDTH_M } from "./serviceValves.js";
import { lineLabelText } from "./lineLabel.js";
import { labelShown, DEFAULT_LABEL_KINDS } from "./labelKinds.js";
import { mmPerMetre } from "./printSheet.js";
import {
  NOTE_ROLE, NOTE_DEFAULTS, noteBox, lineBaseline, leaderFrom, leaderHead,
} from "./textNotes.js";

/* Line widths on paper. A cable drawn 4 px wide on screen is not 4 mm
   on paper; screen pixels are a viewing convenience and paper is a
   measurement. These are what a plan is normally drawn with, and the
   style's relative weights are kept: a main stays heavier than a
   service. */
const MM_PER_PX = 0.18;
const MIN_W_MM = 0.12;
const MAX_W_MM = 1.6;

/* ── Symbols on paper ──

   The screen draws a point with the symbol its style cascade resolves:
   a meter is a square, a joint a circle, a bottle end its three bars,
   and a DNO that draws meters as hexagons gets hexagons. The sheet drew
   a shape looked up from a table of roles kept here \u2014 so a service
   valve, which has no row in it, printed as a filled disc where the
   screen showed a bar across the main, and a style that changed a
   symbol changed the screen and nothing else.

   So the symbol comes from the same place the screen's does, and is
   drawn by the same `symbolPath`, replayed onto the page through the
   recorder below. One drawer, two surfaces: a symbol added to
   gisStyle.js appears on paper without anything here being touched.

   Sizes still need a rule of their own. A style says either "this many
   millimetres of ground", which the page scale turns into millimetres
   of paper directly, or "this many pixels", which is a screen
   measurement and is converted at MM_PER_PX like every width here. */
const SYMBOL_FALLBACK_MM = 1.6;

/* How big a symbol is on paper, in millimetres of radius.

   Two kinds of style, and the difference matters here in a way it
   does not on screen:

     to scale    a real size in ground metres \u2014 multiplied by the page
                 scale, so a 0.9 m chamber is 1.8 mm at 1:500 and half
                 that at 1:1000, which is what "to scale" means

     fixed       a size in SCREEN pixels \u2014 a screen measurement, so it
                 is converted at MM_PER_PX like every width on the sheet

   The clamps Min_Symbol_Px and Max_Symbol_Px are pixels by their own
   names, so they are converted before they are applied. Applying them
   raw to a millimetre figure is what printed centimetre-wide meters:
   a floor meant to keep a symbol visible at site zoom became a floor
   of 8 mm on paper. */
function symbolRadiusMm(style = {}, k) {
  const mmOf = (px) => (px == null || !Number.isFinite(Number(px))
    ? null : Number(px) * MM_PER_PX);

  if (style.Scale_Symbol && style.Symbol_Size_M != null) {
    const lo = mmOf(style.Min_Symbol_Px);
    const hi = mmOf(style.Max_Symbol_Px);
    let mm = Number(style.Symbol_Size_M) * k;
    if (lo != null) mm = Math.max(lo, mm);
    if (hi != null) mm = Math.min(hi, mm);
    return Math.max(0.2, mm);
  }

  const px = Number(style.Symbol_Size_Px);
  if (Number.isFinite(px) && px > 0) return Math.max(0.2, px * MM_PER_PX);
  return SYMBOL_FALLBACK_MM / 2;
}

/* A canvas-shaped sink that keeps the path instead of painting it.

   `symbolPath` speaks the 2D context's language \u2014 beginPath, moveTo,
   rect, arc \u2014 and this answers to the same names, recording points in
   millimetres about the symbol's own centre. Arcs become twelve-sided
   rings, which at 1.5 mm on paper is a circle to any eye and to most
   printers.

   The alternative was a second symbol drawer for the PDF, which is
   exactly the drift this file's header warns about: the screen would
   gain a shape and the sheet would keep drawing the old one. */
function pathRecorder() {
  const subs = [];
  let cur = null;
  const push = (x, y) => { if (cur) cur.pts.push([x, y]); };
  return {
    subs,
    beginPath() { subs.length = 0; cur = null; },
    moveTo(x, y) { cur = { pts: [[x, y]], closed: false }; subs.push(cur); },
    lineTo(x, y) { if (!cur) this.moveTo(x, y); else push(x, y); },
    closePath() { if (cur) cur.closed = true; },
    rect(x, y, w, h) {
      this.moveTo(x, y);
      push(x + w, y); push(x + w, y + h); push(x, y + h);
      this.closePath();
      cur = null;
    },
    arc(x, y, r, a0, a1) {
      const n = 12;
      const span = a1 - a0;
      for (let i = 0; i <= n; i++) {
        const a = a0 + (span * i) / n;
        const px = x + r * Math.cos(a);
        const py = y + r * Math.sin(a);
        i ? push(px, py) : this.moveTo(px, py);
      }
      this.closePath();
      cur = null;
    },
  };
}

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
  /* Size id to the cable's name, from the caller's own catalogue. A
     sheet given none labels a cable as it always did \u2014 by its tag
     alone \u2014 rather than inventing a second source for the name. */
  cableName = null,
  layers = [],
  styles = [],
  lineTypes = [],
  scaleDenom = 500,
  marginMm = 5,
  labels = true,
  showLabels = true,
  labelKinds = DEFAULT_LABEL_KINDS,
  utilities = [],
  organisationId = null,
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
     same thing on the sheet as on screen.

     The operator standard travels too. An operator-scoped rule is the
     strongest claim in the cascade, so a drawing being worked to one
     looked one way on screen and another on paper \u2014 the sheet quietly
     fell back to the base styles, which is the wrong drawing to hand
     to that operator's inspector. */
  const styleOf = (f) => {
    const subject = subjectOf(f, layers);
    const st = resolveStyle(subject, styles, { utilities, organisationId });
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
    const { st, ap } = styleOf(f);
    if (ap.visible === false) continue;
    const role = String(f.Feature_Role || "");
    const p0 = toPage(at);

    /* ── A service valve ──

       A bar across the pipe, a metre of real ground wide, turned to the
       main it sits in. Not a symbol from the style table for the reason
       the canvas gives beside the same code: every symbol there is
       drawn about its own centre with no direction, and a valve means
       nothing except square to its pipe. This is what printed as a
       filled green disc.

       No "SV" written here. The canvas draws those two letters because
       a valve's Label is not otherwise shown at that zoom; on the sheet
       the label pass writes "SV 10" already, and drawing both gives
       "SV SV 10". */
    /* ── A note ──

       Plate, leader and words, from the same textNotes.js the canvas
       draws from — so a note that fits its gap on screen fits it on
       the sheet, and the leader leaves the box at the same corner.
       Wrapping in particular has to be shared: a note that reads as
       four lines on screen and five on paper is a note somebody sized
       against the wrong one.

       It is the whole reason this feature exists. A drawing is
       annotated in order to be ISSUED, so a note the sheet dropped
       would be the one place it mattered.

       No symbol and no label pass — this writes both, and the label
       pass is told to leave notes alone below. */
    /* ── A meter that is not on the drawing ──

       `withAssumedMeters` invents one per flat behind a board, so the
       build, the levels and the circuit report can work from a load
       that exists. They are not features: they have no Feature_ID,
       they are never saved, and the CANVAS does not draw them.

       The print was handed them and drew them, all at the board's own
       anchor, so every MSDB on an issued sheet wore a stack of filled
       meter symbols the screen had never shown. A print is of the
       drawing as shown; an invented meter is not part of the drawing.

       Skipped here rather than by not passing them, because a later
       pass may legitimately want to count them. */
    if (f.Attributes?.Assumed) continue;

    if (role === NOTE_ROLE) {
      const box = noteBox(f);
      const ink = f.Attributes?.Note_Colour
        ?? ap.labelColour ?? ap.colour ?? NOTE_DEFAULTS.colour;
      const mm = (m) => toPage(m);

      if (box.leaderAt) {
        const a = leaderFrom(box, box.leaderAt);
        out.push({
          kind: "paths",
          subs: [{ pts: [mm(a), mm(box.leaderAt)], closed: false }],
          colour: ink,
          fill: false,
          widthMm: Math.max(0.2, box.sizeM * k * 0.07),
          id: f.Feature_ID,
        });
        const head = leaderHead(a, box.leaderAt, box.sizeM);
        if (head) {
          out.push({
            kind: "paths",
            subs: [{ pts: head.map(mm), closed: true }],
            colour: ink,
            fill: true,
            widthMm: 0.2,
            id: f.Feature_ID,
          });
        }
      }

      /* The plate, where there is one. Drawn before the words for the
         obvious reason, and skipped entirely where the fill is off —
         a border round transparent text is a box on the sheet nobody
         asked for. */
      if (box.fill) {
        out.push({
          kind: "paths",
          subs: [{
            pts: [
              mm([box.x, box.y]), mm([box.x + box.w, box.y]),
              mm([box.x + box.w, box.y + box.h]), mm([box.x, box.y + box.h]),
            ],
            closed: true,
          }],
          colour: box.fill,
          fill: true,
          widthMm: 0.15,
          id: f.Feature_ID,
        });
      }

      box.lines.forEach((row, i) => {
        if (!row) return;
        out.push({
          kind: "text",
          at: mm([box.x + box.padM, lineBaseline(box, i)]),
          text: row,
          /* Metres to millimetres to points, in that order. `k` is
             millimetres per metre at this sheet's scale, which is what
             makes a note set at 1.2 m come out at 2.4 mm on an A3
             sheet at 1:500 — the figure the editor quotes. */
          sizePt: Math.max(1.2, box.sizeM * k * 2.83465),
          colour: ink,
          align: "left",
          id: f.Feature_ID,
        });
      });
      continue;
    }

    /* ── A board is a square with DB in it ──

       Drawn as the canvas draws it: a white square, upright rather
       than turned to the cable, with the letters inside. A board is a
       thing in a riser cupboard and a building does not lean with the
       trench.

       Without this branch it fell through to the symbol cascade,
       which gave it a square filled in the default slate — a solid
       black block on the sheet where the screen shows an outlined
       one you can read. It carried no letters either, so four boards
       on a page were four identical blocks.

       White fill and not none: it sits over the cable that feeds it,
       and a transparent box with a line through it does not read as
       a board. */
    if (role === "msdb") {
      const half = Math.max(1.6, symbolRadiusMm(st, k) * 1.05);
      const box = [
        [p0[0] - half, p0[1] - half], [p0[0] + half, p0[1] - half],
        [p0[0] + half, p0[1] + half], [p0[0] - half, p0[1] + half],
      ];
      out.push({
        kind: "paths",
        subs: [{ pts: box, closed: true }],
        colour: "#ffffff",
        fill: true,
        widthMm: 0.1,
        id: f.Feature_ID,
      });
      out.push({
        kind: "paths",
        subs: [{ pts: box, closed: true }],
        colour: "#0f172a",
        fill: false,
        widthMm: 0.3,
        id: f.Feature_ID,
      });
      out.push({
        kind: "text",
        /* Roughly centred: the writer sets text from its left on a
           baseline, so the box's middle less half the glyphs' width
           and a third of their height. */
        at: [p0[0] - half * 0.62, p0[1] + half * 0.38],
        text: "DB",
        sizePt: Math.max(3, half * 2.83465 * 0.9),
        colour: "#0f172a",
        align: "left",
        id: f.Feature_ID,
      });
      /* Its name beside it, the way the canvas writes one. The label
         pass below skips a role it has already written. */
      if (f.Label) {
        out.push({
          kind: "text",
          at: [p0[0] + half + 0.8, p0[1] + 0.9],
          text: String(f.Label),
          sizePt: 6,
          colour: ap.labelColour ?? "#0f172a",
          id: f.Feature_ID,
        });
      }
      continue;
    }

    if (role === "servicevalve") {
      const deg = Number(f.Attributes?.Angle_Deg);
      const rad = Number.isFinite(deg) ? (deg * Math.PI) / 180 : 0;
      const halfMm = (VALVE_WIDTH_M / 2) * k;
      /* Square to the pipe. The page's y grows downward exactly as the
         screen's does — toPage is a scale and a translate with no flip
         — so the normal is (-sin, cos) with no sign correction, which
         is the note the canvas records against this same line. */
      const nx = -Math.sin(rad) * halfMm;
      const ny = Math.cos(rad) * halfMm;
      out.push({
        kind: "paths",
        subs: [{ pts: [[p0[0] - nx, p0[1] - ny], [p0[0] + nx, p0[1] + ny]],
          closed: false }],
        colour: ap.colour ?? "#334155",
        fill: false,
        /* Proportional to the bar, floored so it survives a small
           scale: a hairline valve on an A3 site plan is not there. */
        widthMm: Math.max(0.35, halfMm * 0.22),
        id: f.Feature_ID,
      });
      continue;
    }

    /* Everything else takes the symbol its style resolves, drawn by
       the drawer the screen draws with.

       A bottle end draws as itself whatever the cascade says, exactly
       as on screen: the three bars are what the fitting is called on a
       drawing, and one rendered as the layer's default circle cannot be
       told from a POC. A seed plot with no symbol set falls back to the
       house, which is the canvas's own default for one. */
    const sym = isBottleEnd(f) ? "bottleend"
      : (ap.symbol ?? (role === "plot" ? "house" : "circle"));

    /* The radius on paper.

       Worked out from the raw style rather than read off `appearance`,
       because `appearance`'s clamps are in SCREEN PIXELS —
       Min_Symbol_Px and Max_Symbol_Px, by their names. Handing it
       millimetres-per-metre as its scale makes the scaled size come
       out in millimetres, which is what this file wants, but it then
       holds that millimetre figure between pixel bounds: a floor of
       8 px became a floor of 8 MM, so every meter on the sheet printed
       as a centimetre-wide blob sitting over the plot it belonged to.

       So the clamps are converted before they are applied, at the same
       MM_PER_PX every width here uses. A style sizing its symbol in
       ground metres is drawn to scale and held between those bounds in
       paper terms; a style sizing it in pixels is a screen measurement
       converted once. A meter draws at six tenths, as on screen. */
    const rMm = (role === "meter" ? symbolRadiusMm(st, k) * 0.6
      : symbolRadiusMm(st, k));

    /* Recorded about the origin, turned the way the screen turns it,
       then carried to where the point lands on the page. Turning the
       recorded points rather than the page keeps this a plain list of
       coordinates the writer can stroke without a transform. */
    const rec = pathRecorder();
    symbolPath(rec, sym, 0, 0, rMm);
    const spin = symbolSpin(f, features);
    const cos = Math.cos(spin);
    const sin = Math.sin(spin);
    const subs = rec.subs.map((sub) => ({
      closed: sub.closed,
      pts: sub.pts.map(([x, y]) => [
        p0[0] + x * cos - y * sin,
        p0[1] + x * sin + y * cos,
      ]),
    }));

    out.push({
      kind: "paths",
      subs,
      colour: ap.colour ?? "#334155",
      /* Filled like the screen fills it: a cross and a bottle end have
         no inside, and a hollow diamond reads as a joint on every plan
         anybody has drawn. */
      /* ── Filled exactly as the screen fills it ──

         `STROKE_ONLY` and nothing else. This carried three more roles
         — joint, hdcutout, openpoint — on the argument that a hollow
         diamond reads as a joint on a plan. It may, but the screen
         fills them, and a sheet that draws a fitting differently from
         the drawing it was taken from is a sheet somebody has to
         learn to read twice. Reported from use, on both the joints
         and the heavy duty cut-outs.

         If hollow fittings are wanted on paper, that is a style
         choice and belongs in the style table where the screen will
         honour it too. */
      fill: !STROKE_ONLY.has(sym),
      widthMm: STROKE_ONLY.has(sym) ? Math.max(0.3, rMm * 0.3) : 0.25,
      id: f.Feature_ID,
    });

    /* ── Letters inside the symbol ──

       A wash out is a disc with WO in it, and the letters are what make
       it one. Emitted from the same SYMBOL_TEXT the screen writes from,
       centred on the point: the writer measures the glyphs and sets
       them about the middle, which is the only way two letters land
       inside a 2 mm disc rather than beside it.

       White, to be read against a disc filled with the main's colour,
       and sized from the symbol's own radius so shrinking a wash out in
       the style editor shrinks its letters with it. A symbol too small
       to hold them legibly goes without, as on screen \u2014 the shape and
       the colour still say which fitting it is. */
    const glyph = SYMBOL_TEXT[sym];
    if (glyph && rMm >= 0.9) {
      out.push({
        kind: "text",
        at: [p0[0], p0[1]],
        text: glyph,
        /* Points from millimetres: a cap height of about six tenths of
           the radius, which is what the canvas draws. */
        sizePt: Math.max(2.5, rMm * 0.95 * 2.83465),
        colour: "#ffffff",
        align: "centre",
        id: f.Feature_ID,
      });
    }
  }

  if (labels) {
    for (const f of here) {
      /* A line composes its own tag below and may carry none of its
         own Label, so the Label test belongs to points only. */
      const text = f.Label;
      if (!text && !isLine(f)) continue;
      const at = (f.Geometry || [])[0];
      if (!Array.isArray(at)) continue;
      const { ap } = styleOf(f);
      if (ap.visible === false) continue;
      const role = String(f.Feature_Role || "");
      /* ── The labels the screen would write, and only those ──

         The canvas never writes a generic label against a meter, a
         span node or a feeder point \u2014 a meter's name is answered on
         selection, and the nodes' codes are a drawing of their own \u2014
         so a sheet that wrote them carried a column of "Water Meter
         19" down every street that the screen had never shown anyone.
         The rest answer to the same switches the screen answers to:
         the master Labels layer and the per-kind switches, through the
         one rule in labelKinds.js, so a joint's name obeys the Joint
         labels switch on paper exactly as it does on screen. Selection
         is the one part of the screen's rule with no meaning here \u2014
         nothing on a sheet is selected. */
      if (role === "meter" || role === "spannode" || role === "feederpoint") {
        continue;
      }

      /* ── And a note, which has already written itself ──

         A note's Label IS the note, and the pass above has already set
         it as wrapped lines at its own size. Left in this pass it
         would be written a second time — one unwrapped line at label
         size, over the top of the real one. The canvas skips it for
         the same reason and in the same words. */
      if (role === NOTE_ROLE) continue;
      /* ── And a board, which has already written its own ──

         The board branch above draws the square, the DB inside it and
         the name beside it, because it alone knows how big its box
         came out and therefore where the name clears it. Left in this
         pass as well, the name was written TWICE — once clear of the
         square and once at the symbol radius the cascade would have
         given a board that does not use one, a millimetre or two
         apart. Two greys overlapping reads as a smudge, which is how
         it was reported.

         Same rule as the note and the wash out directly either side:
         whoever writes the symbol writes the words that belong to
         it. */
      if (role === "msdb") continue;
      /* And a wash out, which writes WO inside its own symbol: the
         screen stopped putting the number beside it for want of room on
         a dense plan, and a sheet that kept doing so would be labelling
         by rules of its own again. */
      if (role === "washout") continue;
      if (!labelShown(f, { lineTypes, showLabels, kinds: labelKinds })) {
        continue;
      }

      /* ── A main and a service say what they are ──

         The sheet labelled points and skipped every line, so a drawing
         went out with its pipes and cables anonymous \u2014 the one drawing
         somebody digs from, and which main was which had to be counted
         back from the POC. The screen has always tagged them, behind
         the Mains labels and Service labels switches, and those
         switches are already honoured above: this writes what they
         switch on.

         Composed by lineLabel.js, the rule the screen composes with,
         and set half way ALONG the run rather than at a vertex \u2014 the
         middle of a vertex list is only the middle of the cable when
         the vertices happen to be evenly spaced, which a tee makes sure
         they are not. */
      if (isLine(f)) {
        const txt = lineLabelText(f, { lineTypes, cableName });
        if (!txt) continue;
        const pts = (f.Geometry || []).filter(Array.isArray).map(toPage);
        if (pts.length < 2) continue;
        let total = 0;
        for (let i = 1; i < pts.length; i++) {
          total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        }
        /* A run too short to carry its tag legibly is left alone, as it
           is on screen: text longer than the line it names reads as
           belonging to whatever it crosses. */
        if (total < 8) continue;
        let acc = 0;
        let midAnchor = pts[0];
        for (let i = 1; i < pts.length; i++) {
          const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
          if (acc + seg >= total / 2) {
            const t = seg ? (total / 2 - acc) / seg : 0;
            midAnchor = [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
              pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t];
            break;
          }
          acc += seg;
        }

        /* ── Where somebody PUT the label ──

           A run carries one automatic label at its midpoint and any
           number placed by hand, kept in `Attributes.Labels` as points
           and offsets in METRES. Ground units, not pixels, which is
           exactly why they survive onto paper: a position in metres
           means the same thing at any zoom and at any sheet scale.

           Honoured here, or a drawing somebody had arranged to be
           readable — tags pulled off the pipes they crowded, moved
           clear of a boundary — printed with every one of them snapped
           back to the middle of its run. The arranging is the work, and
           the sheet is what it was done for.

           Legacy `Label_At` / `Label_Offset` read as one placement, so
           a pipe labelled before the list existed keeps its label where
           it was put. */
        const placements = (() => {
          const list = f.Attributes?.Labels;
          if (Array.isArray(list) && list.length) return list;
          const at0 = f.Attributes?.Label_At;
          const off0 = f.Attributes?.Label_Offset;
          if (at0 || off0) return [{ at: at0, off: off0 }];
          return [null];            // the automatic one, at the midpoint
        })();

        /* Stacked upward from the line, so a three-line tag grows away
           from the run rather than across it. */
        const rows = String(txt).split("\n");
        for (const pl of placements) {
          const put = Array.isArray(pl?.at) && pl.at.length === 2
            ? toPage([Number(pl.at[0]), Number(pl.at[1])])
            : midAnchor;
          const off = Array.isArray(pl?.off) && pl.off.length === 2
            ? [Number(pl.off[0]) * k, Number(pl.off[1]) * k]
            : [0, 0];
          const mid = [put[0] + off[0], put[1] + off[1]];
          rows.forEach((line, i) => {
            out.push({
              kind: "text",
              at: [mid[0] + 0.8, mid[1] - 1.2 - (rows.length - 1 - i) * 2.2],
              text: line,
              sizePt: 6,
              colour: ap.labelColour ?? "#0f172a",
              id: f.Feature_ID,
            });
          });
        }
        continue;
      }
      /* Offset by the symbol the point actually drew, so a label sits
         clear of a 3 mm substation square and tight against a 1 mm
         joint rather than at one distance from both. */
      const drawn = out.find((i) => i.kind === "paths" && i.id === f.Feature_ID);
      const r = drawn
        ? Math.max(...drawn.subs.flatMap((sub) =>
          sub.pts.map(([x, y]) => Math.hypot(x - toPage(at)[0], y - toPage(at)[1]))))
        : SYMBOL_FALLBACK_MM / 2;
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
