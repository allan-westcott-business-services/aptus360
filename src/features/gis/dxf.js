/* The drawing as a DXF, for AutoCAD.

   ── Why R12 ──

   DXF has had many versions and AutoCAD reads them all; everything ELSE
   reads R12. It is the version Civil 3D, MicroStation, QGIS, BricsCAD
   and every free viewer open without argument, and a drawing sent to a
   NAV or a client's CAD team goes wherever they take it. R12 costs us
   LWPOLYLINE (R13+) — a polyline is written the long way, as POLYLINE /
   VERTEX / SEQEND — and that is the whole price.

   ── Units and position ──

   Geometry is metres on the drawing's own grid, and a DXF carries no
   units of its own: it carries numbers, and the receiving drawing
   decides what they mean. So one metre becomes one drawing unit, which
   is what every CAD user in this industry expects, and INSUNITS is set
   to metres so a receiving drawing that cares can scale it.

   The grid is local. `origin` offsets every coordinate, so a project
   whose drawing origin is a known easting and northing can be exported
   straight onto the national grid; left at zero, the export is
   internally correct and to scale but arbitrary in position. That is a
   fact about the project rather than about this file, so it is asked
   for rather than guessed.

   ── And y is negated ──

   The drawing stores metres in SCREEN convention: y grows downward,
   which is what `toPx` on the canvas does and what every pixel-facing
   part of this codebase assumes. CAD is the other way up — y grows
   north. Writing the stored y straight out therefore mirrors the whole
   drawing about its X axis, which reads at a glance like a 180-degree
   rotation and is not one: text comes out the right way round, north
   and south are swapped, and a drawing that looks almost plausible is
   the worst kind of wrong to hand to a CAD team.

   So every y is negated on the way out, before the origin is added.
   The offset is therefore in CAD terms: a northing is a northing.

   ── What a CAD user gets ──

   One layer per kind of thing — WATER-MAIN, TRENCH, ELECTRIC-SERVICE —
   coloured by the drawing's own styles, so the export looks like the
   drawing rather than like a pile of white lines. Lines are polylines,
   points are POINT entities, and labels are TEXT on their own -TEXT
   layer, which is what lets somebody freeze the annotation and keep the
   geometry.

   ── What it is not ──

   Symbols are not blocks. A meter exports as a POINT with its label
   beside it, not as a meter symbol — blocks would mean shipping a
   symbol library and agreeing what each is called, which is a
   conversation with the receiving CAD team rather than a guess made
   here. The geometry, the layers and the labels are the part that
   matters for setting out, and they are exact. */

import { resolveStyle, appearance, subjectOf } from "../../lib/gisStyle.js";
import { layerFor as mappedLayerFor } from "./dxfLayerMap.js";

/* AutoCAD Color Index. The classic first seven plus a couple of greys:
   a DXF layer carries a colour NUMBER, not a hex string, so every
   colour on the drawing has to land on one of these. Nearest in plain
   RGB distance, which for a palette this coarse is as good as anything
   cleverer and is predictable — a green main comes out green. */
const ACI = [
  [1, [255, 0, 0]], [2, [255, 255, 0]], [3, [0, 255, 0]],
  [4, [0, 255, 255]], [5, [0, 0, 255]], [6, [255, 0, 255]],
  [7, [255, 255, 255]], [8, [128, 128, 128]], [9, [192, 192, 192]],
  [30, [255, 127, 0]], [140, [0, 127, 255]], [250, [51, 51, 51]],
];

export function aciFor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return 7;
  const n = parseInt(m[1], 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  let best = 7;
  let bd = Infinity;
  for (const [code, c] of ACI) {
    const d = (c[0] - rgb[0]) ** 2 + (c[1] - rgb[1]) ** 2 + (c[2] - rgb[2]) ** 2;
    if (d < bd) { bd = d; best = code; }
  }
  return best;
}

/* A layer name CAD will accept: no spaces, no punctuation it reserves,
   upper case because that is the convention every drawing in this
   industry follows. */
export function layerName(parts) {
  const name = parts
    .filter(Boolean)
    .map((p) => String(p).toUpperCase().replace(/[^A-Z0-9_-]+/g, "-"))
    .join("-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return name.slice(0, 31) || "0";
}

/* What layer a feature belongs on.

   Built from what the drawing already knows — the utility layer and the
   line type — rather than from a mapping table somebody has to keep in
   step. A type key like `water_main` becomes WATER-MAIN, and a point
   takes its role: WATER-WASHOUT, ELECTRIC-METER. */
export function layerFor(f, lineTypes = []) {
  const key = f.Attributes?.Line_Type;
  const t = lineTypes.find((x) => x.Type_Key === key);
  const layer = t?.Layer_Key ?? f.Layer_Key ?? "GENERAL";

  if (f.Feature_Type === "line") {
    /* The type key already names the utility in most drawings
       (`water_main`), so using it alone avoids WATER-WATER-MAIN. */
    if (key) return layerName([String(key).replace(/_/g, "-")]);
    return layerName([layer]);
  }
  return layerName([layer, f.Feature_Role || "POINT"]);
}

const num = (v) => {
  const n = Number(v);
  /* Three decimals is a millimetre. More is noise in a file that is
     already the largest thing we send anybody. */
  return Number.isFinite(n) ? n.toFixed(3) : "0.000";
};

/* A DXF is pairs of lines: a group code, then its value. Everything
   below is built from this, which is why the file has no template. */
const pair = (code, value) => `${code}\n${value}\n`;

export function buildDxf(features = [], opts = {}) {
  const {
    lineTypes = [],
    layers = [],
    styles = [],
    utilities = [],
    organisationId = null,
    origin = [0, 0],
    labels = true,
    /* The CAD team's own layer schedule, as rows from DXF_Layer_Map.
       Given none, the export names layers from the drawing's own
       vocabulary exactly as it always did — so this can be added to a
       live system without anybody's next export shifting. */
    layerMap = [],
    unmapped = "APTUS-UNMAPPED",
    /* The cable catalogue, so a rule can name a particular cable —
       "3c WAVE 95" — and not merely a size band. Without it a cable
       rule simply never matches, which is why the export passes them
       rather than resolving ids itself. */
    cableSizes = [],
    cableTypes = [],
  } = opts;

  const ox = Number(origin[0]) || 0;
  const oy = Number(origin[1]) || 0;

  const styleOf = (f) => {
    const st = resolveStyle(subjectOf(f, layers), styles,
      { utilities, organisationId });
    return appearance(st, 1);
  };

  /* Gathered first so the layer table can be written before the
     entities that use it — AutoCAD accepts a layer it has not been
     told about, but several other readers do not, and this file is
     meant to open everywhere. */
  const used = new Map();
  const noteLayer = (name, colour, linetype) => {
    if (used.has(name)) return;
    /* A colour already given as an index is used as given — a CAD
       schedule states ACI numbers, and converting one to a hex and back
       would move it. */
    used.set(name, {
      aci: typeof colour === "number" ? colour : aciFor(colour),
      linetype: linetype || "CONTINUOUS",
    });
  };

  /* ── Everything takes its LAYER's properties ──

     Colour 256 is BYLAYER and linetype "BYLAYER" says the same for the
     linetype. Absent, a reader is entitled to default them — and some
     do, to colour 7 white and CONTINUOUS — which is why moving an
     entity to a layer left it looking exactly as it did before: it was
     carrying its own properties, not the layer's.

     Said explicitly on every entity rather than relied upon. A DXF is
     read by many programs and the ones that matter here are the ones a
     CAD team actually uses. */
  const byLayer = pair(62, 256) + pair(6, "BYLAYER");

  let ents = "";

  for (const f of features) {
    const g = (f.Geometry || []).filter((p) => Array.isArray(p) && p.length >= 2);
    if (!g.length) continue;
    /* Style for COLOUR only.

       `appearance` also answers "is this visible", from the style's
       Min_Scale and Max_Scale — a rule about screen zoom, which a CAD
       drawing does not have. Honouring it here would drop a fitting
       from the export because of how far out somebody had zoomed, and
       silently: the file would open, look complete, and be missing
       geometry.

       What the drawing IS showing — hidden layers, a circuit isolate —
       is decided by the caller, which passes the canvas's visible set.
       That is a question about the drawing; this is a question about
       the screen. */
    const ap = styleOf(f);
    /* The schedule decides the layer, its colour and its linetype;
       what the drawing knows decides which rule applies. With no
       schedule loaded the old derived name stands as the fallback. */
    const mapped = layerMap.length
      ? mappedLayerFor(f, {
        rules: layerMap, lineTypes, organisationId,
        cableSizes, cableTypes,
        fallback: (x) => layerFor(x, lineTypes), unmapped,
      })
      : null;
    const lay = mapped ? mapped.layer : layerFor(f, lineTypes);
    noteLayer(lay, mapped?.aci != null ? mapped.aci : (ap.colour ?? "#ffffff"),
      mapped?.linetype);

    if (f.Feature_Type === "line" && g.length >= 2) {
      /* POLYLINE, its VERTEXes, then SEQEND — flat, in 2D.

         Flag 70 was 8 here and 32 on each vertex, which are the flags
         for a 3D POLYLINE and its vertices. A plan drawing is 2D: a
         CAD team working in 2D got objects they could not edit as
         lines, and the reasoning in the comment that used to sit here
         — that 3D "keeps a reader from assuming a plan projection" —
         was wrong. Zero on both is a plain 2D polyline, which is what
         a setting-out drawing is made of.

         Every z is zero for the same reason. */
      ents += pair(0, "POLYLINE") + pair(8, lay) + byLayer + pair(66, 1)
        + pair(10, "0.0") + pair(20, "0.0") + pair(30, "0.0") + pair(70, 0);
      for (const p of g) {
        ents += pair(0, "VERTEX") + pair(8, lay)
          + pair(10, num(p[0] + ox)) + pair(20, num(-p[1] + oy))
          + pair(30, "0.000") + pair(70, 0);
      }
      ents += pair(0, "SEQEND") + pair(8, lay);
    } else {
      ents += pair(0, "POINT") + pair(8, lay) + byLayer
        + pair(10, num(g[0][0] + ox)) + pair(20, num(-g[0][1] + oy))
        + pair(30, "0.000");
    }

    /* Labels on a layer of their own, so a CAD user can freeze the
       annotation and keep the geometry \u2014 which is the first thing
       anybody does with a drawing they are tracing over. */
    if (labels && f.Label) {
      const tl = mapped?.textLayer ?? layerName([lay, "TEXT"]);
      noteLayer(tl, mapped?.aci != null ? mapped.aci
        : (ap.labelColour ?? ap.colour ?? "#ffffff"), mapped?.linetype);
      const at = f.Feature_Type === "line" ? g[Math.floor(g.length / 2)] : g[0];
      ents += pair(0, "TEXT") + pair(8, tl) + byLayer
        + pair(10, num(at[0] + ox)) + pair(20, num(-at[1] + oy))
        + pair(30, "0.000")
        /* Half a metre of text: readable at the scales these drawings
           are plotted at, and a number the receiving drafter can
           change once for the whole layer. */
        + pair(40, "0.500")
        + pair(1, String(f.Label).replace(/[\r\n]+/g, " "));
    }
  }

  /* ── The tables a layer depends on ──

     A layer names a linetype, and a DXF that names one it has not
     DEFINED leaves the reader to substitute — which is one of the ways
     a drawing arrives with none of its layer properties. So every
     linetype the schedule mentions is defined here, CONTINUOUS
     included.

     LTYPE comes before LAYER because layers reference linetypes, and
     STYLE is defined because the TEXT entities reference STANDARD.
     Order matters to strict readers; AutoCAD is not one of them, and
     the point of R12 is the ones that are.

     The dash patterns are a straight line for CONTINUOUS and a plain
     dash-gap for anything else named. A house linetype with a
     particular pattern belongs in the receiving template, and when the
     drawing is inserted there its own definition wins; this is enough
     for the file to stand up on its own. */
  const linetypes = new Set(["CONTINUOUS", "BYLAYER"]);
  for (const def of used.values()) linetypes.add(def.linetype || "CONTINUOUS");
  linetypes.delete("BYLAYER");

  let table = pair(0, "SECTION") + pair(2, "TABLES")
    + pair(0, "TABLE") + pair(2, "LTYPE") + pair(70, linetypes.size);
  for (const name of linetypes) {
    if (name === "CONTINUOUS") {
      table += pair(0, "LTYPE") + pair(2, "CONTINUOUS") + pair(70, 0)
        + pair(3, "Solid line") + pair(72, 65) + pair(73, 0) + pair(40, "0.0");
    } else {
      /* 9 units on, 6 off: a dash somebody can see at the scales these
         drawings plot at. */
      table += pair(0, "LTYPE") + pair(2, name) + pair(70, 0)
        + pair(3, "__ __ __") + pair(72, 65) + pair(73, 2) + pair(40, "15.0")
        + pair(49, "9.0") + pair(49, "-6.0");
    }
  }
  table += pair(0, "ENDTAB");

  /* The text style the TEXT entities answer to. */
  table += pair(0, "TABLE") + pair(2, "STYLE") + pair(70, 1)
    + pair(0, "STYLE") + pair(2, "STANDARD") + pair(70, 0)
    + pair(40, "0.0") + pair(41, "1.0") + pair(50, "0.0") + pair(71, 0)
    + pair(42, "2.5") + pair(3, "txt") + pair(4, "")
    + pair(0, "ENDTAB");

  /* The layer table. Colour and a linetype each, because a layer with
     neither is legal and opens grey and dashed nowhere, which is not
     the drawing. */
  /* The layer table. Colour and a linetype each, because a layer with
     neither is legal and opens grey and dashed nowhere, which is not
     the drawing. Layer "0" is always defined: a DXF without it is
     malformed, whatever else is in the file. */
  table += pair(0, "TABLE") + pair(2, "LAYER") + pair(70, used.size + 1)
    + pair(0, "LAYER") + pair(2, "0") + pair(70, 0) + pair(62, 7)
    + pair(6, "CONTINUOUS");
  for (const [name, def] of used) {
    table += pair(0, "LAYER") + pair(2, name) + pair(70, 0)
      + pair(62, def.aci) + pair(6, def.linetype);
  }
  table += pair(0, "ENDTAB") + pair(0, "ENDSEC");

  /* $INSUNITS 6 is metres. A receiving drawing in millimetres can then
     scale this on insert instead of landing it a thousand times too
     small, which is the classic way a CAD handover goes wrong. */
  const header = pair(0, "SECTION") + pair(2, "HEADER")
    + pair(9, "$ACADVER") + pair(1, "AC1009")
    + pair(9, "$INSUNITS") + pair(70, 6)
    + pair(0, "ENDSEC");

  return header + table
    + pair(0, "SECTION") + pair(2, "ENTITIES") + ents + pair(0, "ENDSEC")
    + pair(0, "EOF");
}
