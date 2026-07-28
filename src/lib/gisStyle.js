/* Resolving what an object looks like right now.

   Styles cascade rather than replace. Every row whose scope matches is
   collected, ordered least specific to most, and its non-null fields
   laid over what came before. So a DNO's row can say "our gas mains are
   yellow" and nothing else, and still inherit the width, dash and zoom
   band from the base gas main style. Replacing wholesale would mean
   restating every field on every override, which is how they drift.

   Specificity is scored rather than ordered by hand: naming the operator
   is the strongest claim, then the line type, then the role, then the
   utility, then the layer. A row naming the operator and the line type
   beats one naming the line type alone, whatever order they were
   entered in. */

const WEIGHT = {
  Organisation_ID: 32,
  Line_Type: 8,
  Feature_Role: 4,
  /* Above the line type on purpose. Off site is a fact about consent and
     cost that should read at a glance whatever the run happens to be, so
     it wins over "this is a gas main" — but still loses to an operator's
     own standard, which is the whole point of choosing one. */
  Site: 16,
  Utility_ID: 2,
  Layer_Key: 1,
};

/* The fields a style can carry. Anything null on a row is inherited
   from the row below it rather than overriding with a blank. */
const FIELDS = [
  "Colour", "Dashed", "Dash_Pattern", "Symbol",
  "Width_Px", "Width_M", "Scale_Width", "Min_Width_Px", "Max_Width_Px",
  "Symbol_Size_Px", "Min_Scale", "Max_Scale", "Label_Min_Scale",
];

const same = (a, b) => String(a) === String(b);

/* Null scope column means "any", so it matches without narrowing.
   A non-null one must match exactly or the row is out. */
export function styleMatches(style, subject, ctx = {}) {
  if (style.Is_Active === false) return false;
  if (style.Layer_Key != null && !same(style.Layer_Key, subject.Layer_Key)) return false;
  if (style.Line_Type != null && !same(style.Line_Type, subject.Line_Type)) return false;
  if (style.Feature_Role != null && !same(style.Feature_Role, subject.Feature_Role)) return false;
  if (style.Site != null && !same(style.Site, subject.Site)) return false;
  if (style.Utility_ID != null && !same(style.Utility_ID, subject.Utility_ID)) return false;
  /* An operator-scoped row only applies when drawing to that operator's
     standard. With no standard chosen, none of them apply and the base
     styles stand. */
  if (style.Organisation_ID != null && !same(style.Organisation_ID, ctx.organisationId)) return false;
  return true;
}

export function styleScore(style) {
  let n = 0;
  for (const k of Object.keys(WEIGHT)) if (style[k] != null) n += WEIGHT[k];
  return n;
}

/* What a feature is, for matching purposes. Utility comes from the
   layer, which is where 0051 put it — a feature doesn't carry one. */
export function subjectOf(feature, layers = []) {
  const layer = layers.find((l) => l.Layer_Key === feature.Layer_Key);
  return {
    Layer_Key: feature.Layer_Key ?? null,
    Line_Type: feature.Attributes?.Line_Type ?? null,
    Feature_Role: feature.Feature_Role ?? null,
    Site: feature.Attributes?.Site ?? null,
    Utility_ID: layer?.Utility_ID ?? null,
  };
}

export function resolveStyle(subject, styles = [], ctx = {}) {
  const out = {};
  styles
    .filter((s) => styleMatches(s, subject, ctx))
    .map((s) => ({ s, score: styleScore(s) }))
    .sort((a, b) => a.score - b.score
      || (a.s.GIS_Style_ID ?? 0) - (b.s.GIS_Style_ID ?? 0))
    .forEach(({ s }) => {
      for (const k of FIELDS) if (s[k] != null) out[k] = s[k];
    });
  return out;
}

const clamp = (v, lo, hi) => {
  let n = v;
  if (lo != null) n = Math.max(n, Number(lo));
  if (hi != null) n = Math.min(n, Number(hi));
  return n;
};

function parseDash(pattern) {
  if (!pattern) return [9, 6];
  const parts = String(pattern).split(/[,\s]+/).map(Number).filter((x) => x > 0);
  return parts.length ? parts : [9, 6];
}

/* Turn a resolved style into what the canvas needs at this zoom.

   scale is canvas pixels per metre — the same number the zoom readout
   comes from. A width given in metres is a real width and is drawn to
   scale; the clamps are what stop a 0.45 m trench from being a hairline
   at 10% and a wall at 800%. */
export function appearance(style, scale, fallback = {}) {
  const visible =
    (style.Min_Scale == null || scale >= Number(style.Min_Scale)) &&
    (style.Max_Scale == null || scale <= Number(style.Max_Scale));

  let widthPx;
  if (style.Scale_Width && style.Width_M != null) {
    widthPx = clamp(Number(style.Width_M) * scale, style.Min_Width_Px, style.Max_Width_Px);
  } else if (style.Width_Px != null) {
    widthPx = clamp(Number(style.Width_Px), style.Min_Width_Px, style.Max_Width_Px);
  } else {
    widthPx = fallback.widthPx ?? 2;
  }

  return {
    visible,
    colour: style.Colour ?? fallback.colour ?? "#64748b",
    widthPx: Math.max(0.5, widthPx),
    dash: style.Dashed ? parseDash(style.Dash_Pattern) : [],
    symbol: style.Symbol ?? fallback.symbol ?? "circle",
    symbolPx: Number(style.Symbol_Size_Px ?? fallback.symbolPx ?? 6),
    showLabel: style.Label_Min_Scale == null || scale >= Number(style.Label_Min_Scale),
  };
}

/* Drawing a symbol. Kept here rather than in the canvas so the admin
   preview and the plan can't diverge — a swatch that lies about what
   you'll get is worse than no swatch. */
export function symbolPath(ctx, symbol, x, y, r) {
  ctx.beginPath();
  switch (symbol) {
    case "square":
      ctx.rect(x - r, y - r, r * 2, r * 2);
      break;
    case "triangle":
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r);
      ctx.closePath();
      break;
    case "diamond":
      ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y);
      ctx.closePath();
      break;
    case "cross":
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      break;
    case "plus":
      ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
      break;
    /* r is the half-width, as it is for a circle, so a house and a
       circle at the same size setting are the same width across. */
    case "house": {
      const w = r * 2, h = r * 1.44;
      const l = x - r, rt = x + r;
      const base = y + h / 2;
      const eaves = base - h * 0.62;
      ctx.moveTo(l, base);
      ctx.lineTo(l, eaves);
      ctx.lineTo(x, y - r * 0.52 - h * 0.05);
      ctx.lineTo(rt, eaves);
      ctx.lineTo(rt, base);
      ctx.closePath();
      break;
    }
    case "hexagon":
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        const px = x + r * Math.cos(a), py = y + r * Math.sin(a);
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    default:
      ctx.arc(x, y, r, 0, Math.PI * 2);
  }
}

export const SYMBOLS = ["house", "circle", "square", "triangle", "diamond", "cross", "plus", "hexagon"];
/* Outlines only — a cross has no inside to fill. */
export const STROKE_ONLY = new Set(["cross", "plus"]);
