/* Reading an Ordnance Survey tile from a DXF file.

   A bought OS tile arrives as CAD — UK Planning Maps and the other
   resellers export DXF and DWG — with every coordinate already a
   National Grid easting and northing. Read here in the browser, so
   the file never has to be stored in its raw form: what is kept is
   the linework, in grid metres, ready to draw.

   ── DXF, not DWG ──

   DWG is a closed format. The one free reader, LibreDWG, is GPL, and
   building it into this product would make its licence a legal
   question rather than a technical one. Every reseller offers DXF
   alongside DWG, and the free ODA File Converter turns one into the
   other. So the import takes DXF and says so when handed DWG.

   ── What it reads ──

   What an OS tile contains: polylines (LWPOLYLINE, and the older
   POLYLINE/VERTEX form), lines, arcs and circles (broken into short
   straight pieces), and text. Blocks are not expanded — an OS tile
   has none, and a developer's site plan, which does, is a later
   import with its own needs. Fills (HATCH, SOLID) are skipped: order
   the "noFill" version, which is the linework without them.

   ── Units are worked out from the numbers, not the header ──

   Found on real files. A developer's site plan and its XREF both
   declared millimetres in their header; the XREF's coordinates really
   were millimetres and the site plan's were metres. A reader that
   believed the header placed one of them at a thousandth of its size
   near the origin. National Grid coordinates are unmistakable — an
   easting in the hundreds of thousands of metres — so the numbers
   decide. Anything that is not grid coordinates in metres or
   millimetres is refused: an OS tile that does not know where it is
   has nothing to offer. */

const GRID_E = [0, 700000];
const GRID_N = [0, 1300000];

/* Layers the reseller adds that are not the map: its logo, a scale
   bar, a grid of its own. Brought in but switched off, so they can be
   put back. The copyright line is NOT here — OS licensing expects it
   on anything printed from the map. */
export const OS_FURNITURE_LAYERS = ["_barnding", "_branding", "_scale bar", "_grid"];

/* Group-code pairs, the whole of DXF's syntax. */
function pairs(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    out.push([code, lines[i + 1].replace(/\s+$/, "")]);
  }
  return out;
}

/* A circle or an arc as short straight pieces: one every 5°, which on
   anything an OS tile draws is well under a centimetre of error. */
function arcPoints(cx, cy, r, a0, a1) {
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 360;
  const steps = Math.max(4, Math.ceil(sweep / 5));
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = ((a0 + (sweep * i) / steps) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return pts;
}

/* The raw read: entities as found, in the file's own units. */
export function readDxf(text) {
  const g = pairs(text);
  const polylines = [];
  const texts = [];
  let insunits = null;
  let section = null;

  let i = 0;
  const at = () => g[i] || [null, null];

  while (i < g.length) {
    const [code, val] = at();
    if (code === 0 && val === "SECTION") {
      section = g[i + 1]?.[1] ?? null;
      i += 2;
      continue;
    }
    if (code === 0 && val === "ENDSEC") { section = null; i++; continue; }
    if (section === "HEADER" && code === 9 && val === "$INSUNITS") {
      insunits = Number(g[i + 1]?.[1]);
      i += 2;
      continue;
    }
    if (section !== "ENTITIES" || code !== 0) { i++; continue; }

    const type = val;
    i++;
    const f = {};
    const xs = [];
    const ys = [];
    /* Read this entity's pairs up to the next entity. Repeated 10/20
       codes are a polyline's vertices, in order. */
    while (i < g.length && g[i][0] !== 0) {
      const [c, v] = g[i];
      if (c === 10) xs.push(Number(v));
      else if (c === 20) ys.push(Number(v));
      else if (f[c] === undefined) f[c] = v;
      else if (c === 1 || c === 3) f[c] += v;
      i++;
    }
    const layer = f[8] ?? "0";

    if (type === "LWPOLYLINE") {
      const pts = xs.map((x, k) => [x, ys[k]]).filter((p) => Number.isFinite(p[1]));
      if (pts.length > 1) polylines.push({ layer, pts, closed: (Number(f[70]) & 1) === 1 });
    } else if (type === "LINE") {
      const x1 = Number(f[11]); const y1 = Number(f[21]);
      if (xs.length && Number.isFinite(x1)) {
        polylines.push({ layer, pts: [[xs[0], ys[0]], [x1, y1]], closed: false });
      }
    } else if (type === "POLYLINE") {
      /* The old form: vertices follow as their own entities until
         SEQEND. */
      const pts = [];
      const closed = (Number(f[70]) & 1) === 1;
      while (i < g.length) {
        const [c0, v0] = g[i];
        if (c0 !== 0) { i++; continue; }
        if (v0 === "SEQEND") { i++; break; }
        if (v0 !== "VERTEX") break;
        i++;
        let vx = null; let vy = null;
        while (i < g.length && g[i][0] !== 0) {
          if (g[i][0] === 10) vx = Number(g[i][1]);
          if (g[i][0] === 20) vy = Number(g[i][1]);
          i++;
        }
        if (Number.isFinite(vx) && Number.isFinite(vy)) pts.push([vx, vy]);
      }
      if (pts.length > 1) polylines.push({ layer, pts, closed });
    } else if (type === "CIRCLE" || type === "ARC") {
      const r = Number(f[40]);
      if (xs.length && r > 0) {
        const a0 = type === "ARC" ? Number(f[50]) : 0;
        const a1 = type === "ARC" ? Number(f[51]) : 360;
        polylines.push({ layer, pts: arcPoints(xs[0], ys[0], r, a0, a1), closed: type === "CIRCLE" });
      }
    } else if (type === "TEXT" || type === "MTEXT") {
      const words = String(f[1] ?? "")
        /* MTEXT formatting codes: \P is a new line, the rest is
           styling this reader does not draw. */
        .replace(/\\P/g, " ").replace(/\\[A-Za-z][^;]*;/g, "").replace(/[{}]/g, "").trim();
      if (xs.length && words) {
        texts.push({
          layer, at: [xs[0], ys[0]], text: words,
          height: Number(f[40]) || 1,
          rotationDeg: Number(f[50]) || 0,
        });
      }
    }
  }
  return { polylines, texts, insunits };
}

/* ── From the file's units to metres, by looking ──

   The median coordinate, not the extent: a drawing can carry a stray
   entity at the origin, and one stray entity moves an extent but not
   a median. */
export function unitsOf(raw) {
  const es = [];
  const ns = [];
  for (const p of raw.polylines) for (const q of p.pts) { es.push(q[0]); ns.push(q[1]); }
  if (!es.length) return { factor: null, reason: "The file has no linework in it." };
  es.sort((a, b) => a - b); ns.sort((a, b) => a - b);
  const e = es[Math.floor(es.length / 2)];
  const n = ns[Math.floor(ns.length / 2)];
  const inGrid = (x, y) => x > GRID_E[0] && x < GRID_E[1] && y > GRID_N[0] && y < GRID_N[1] && x > 1000;

  if (inGrid(e, n)) return { factor: 1, unit: "metres" };
  if (inGrid(e / 1000, n / 1000)) return { factor: 0.001, unit: "millimetres" };
  return {
    factor: null,
    reason: "This file is not drawn on the National Grid — its coordinates are "
      + `around ${Math.round(e).toLocaleString()}, ${Math.round(n).toLocaleString()}, which is `
      + "not an easting and northing in metres or millimetres. An OS tile always is.",
  };
}

/* ── The whole import: text in, linework in grid metres out ──

   Returns { polylines, texts, layers, extent, unit, hidden } or
   { error }. `hidden` is the reseller's furniture, brought in but
   switched off. */
export function readOsTile(text, fileName = "") {
  if (/\.dwg$/i.test(fileName)) {
    return {
      error: "This is a DWG file. Save it as DXF — your OS supplier offers DXF "
        + "at download, and the free ODA File Converter changes one into the other.",
    };
  }
  /* The first real pair must open a section. Comments (code 999) may
     come first — LibreDWG and several CAD programs sign the file
     that way — so they are stepped over rather than refused. */
  const first = pairs(String(text).slice(0, 4000)).find(([c]) => c !== 999);
  if (!first || first[0] !== 0 || first[1].trim() !== "SECTION") {
    return { error: "This does not look like a DXF file." };
  }

  const raw = readDxf(text);
  const units = unitsOf(raw);
  if (!units.factor) return { error: units.reason };

  const k = units.factor;
  const scale = (p) => [p[0] * k, p[1] * k];
  const polylines = raw.polylines.map((p) => ({ ...p, pts: p.pts.map(scale) }));
  const texts = raw.texts.map((t) => ({ ...t, at: scale(t.at), height: t.height * k }));

  let minE = Infinity; let minN = Infinity; let maxE = -Infinity; let maxN = -Infinity;
  for (const p of polylines) {
    if (OS_FURNITURE_LAYERS.includes(p.layer)) continue;
    for (const [e, n] of p.pts) {
      if (e < minE) minE = e; if (e > maxE) maxE = e;
      if (n < minN) minN = n; if (n > maxN) maxN = n;
    }
  }
  const layers = [...new Set([...polylines, ...texts].map((x) => x.layer))].sort();

  return {
    polylines, texts, layers,
    hidden: layers.filter((l) => OS_FURNITURE_LAYERS.includes(l)),
    extent: Number.isFinite(minE) ? { minE, minN, maxE, maxN } : null,
    unit: units.unit,
    declaredUnits: raw.insunits,
  };
}
