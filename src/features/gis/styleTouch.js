/* Setting a style by looking at it.

   The admin form asks for pixels per metre, a size in pixels, and two
   zoom limits, and gives no sight of the drawing while you type them.
   Working out that a symbol should be 6px and hidden below 0.84 is
   arithmetic in the dark; seeing it too big and pressing Smaller is not.

   These work out what a button press means and hand back a style row to
   save. Nothing here writes: the canvas owns that, and a function that
   both decides and saves cannot be tested without a database.

   ── Which rule a press edits ──

   resolveStyle cascades: several rows can apply to one feature, most
   specific last. So "make this bigger" has to choose a row, and the only
   honest choice is one that matches exactly what was clicked — this
   layer, this role, or this layer and line type.

   An existing row of that exact shape is edited. Otherwise a new one is
   made. What is never done is editing a broader row that happened to
   match, because "make this meter bigger" would then silently resize
   every point on the drawing, and the surprise would arrive later and
   somewhere else. */

/* What a press should apply to: the narrowest description of the thing
   clicked. Points are identified by their role, lines by their type;
   that is how the catalogue is organised and how someone thinks about
   them — "meters", "LV feeders" — rather than by any one feature. */
export function styleSubject(feature) {
  if (!feature) return null;
  const layer = feature.Layer_Key ?? null;
  if (feature.Feature_Type === "point") {
    return {
      Layer_Key: layer,
      Feature_Role: feature.Feature_Role ?? null,
      Line_Type: null,
    };
  }
  return {
    Layer_Key: layer,
    Feature_Role: null,
    Line_Type: feature.Attributes?.Line_Type ?? null,
  };
}

/* The row this subject would edit, if one already exists.

   Matched on the three keys being equal — including equally null — so a
   row for "every electric point" is not mistaken for one for "electric
   meters". Site and operator scoping are deliberately left out of the
   match: a row narrowed to off-site or to one DNO answers a different
   question, and editing it from the canvas would apply the change in
   fewer places than the press implied. */
export function findExactStyle(styles = [], subject) {
  if (!subject) return null;
  const same = (a, b) => String(a ?? "") === String(b ?? "");
  return styles.find((s) =>
    s.Is_Active !== false
    && same(s.Layer_Key, subject.Layer_Key)
    && same(s.Feature_Role, subject.Feature_Role)
    && same(s.Line_Type, subject.Line_Type)
    && s.Site == null
    && s.Organisation_ID == null) || null;
}

/* A readable name for what is about to change, so the panel can say it
   before anything is pressed. */
export function subjectLabel(subject, { layers = [], lineTypes = [] } = {}) {
  if (!subject) return "";
  const layer = layers.find((l) => l.Layer_Key === subject.Layer_Key)?.Label
    ?? subject.Layer_Key ?? "";
  if (subject.Feature_Role) {
    const plural = { meter: "meters", joint: "joints", spannode: "span nodes",
      plot: "plot seeds", poc: "points of connection", substation: "substations",
      governor: "gas governors", linkbox: "link boxes", column: "lighting columns" };
    return `${layer} ${plural[subject.Feature_Role] ?? `${subject.Feature_Role}s`}`.trim();
  }
  if (subject.Line_Type) {
    const t = lineTypes.find((x) => x.Type_Key === subject.Line_Type)?.Label;
    return t ?? subject.Line_Type;
  }
  return layer || "these";
}

/* One step of size.

   Proportional rather than a fixed number of pixels, so a press does the
   same amount of work whatever size it starts from — a pixel on a 4px
   symbol is a quarter of it, and on a 20px symbol barely visible.

   Bounded at both ends: below about 2px a symbol is a speck that cannot
   be clicked, and above 60 it covers what it is standing on. */
export const MIN_SYMBOL_PX = 2;
export const MAX_SYMBOL_PX = 60;

export function stepSize(currentPx, direction, { step = 1.25 } = {}) {
  const now = Number(currentPx) > 0 ? Number(currentPx) : 6;
  const next = direction > 0 ? now * step : now / step;
  const clamped = Math.min(MAX_SYMBOL_PX, Math.max(MIN_SYMBOL_PX, next));
  /* To one decimal: the canvas draws in fractions of a pixel and a
     symbol that cannot grow because the step rounded to nothing is a
     button that appears broken. */
  return Math.round(clamped * 10) / 10;
}

/* What to write for each button.

   Returned as a patch rather than applied, so the caller can show what
   would happen and so this can be tested. Null means the press would
   change nothing — the caller disables the button rather than writing a
   row that says the same as before. */
export function planStyleChange(action, { current = {}, scale, subject } = {}) {
  if (!subject) return null;

  if (action === "bigger" || action === "smaller") {
    const now = Number(current.Symbol_Size_Px) > 0 ? Number(current.Symbol_Size_Px) : 6;
    const next = stepSize(now, action === "bigger" ? 1 : -1);
    if (next === now) return null;
    /* Fixed pixels, not the scaling fields. Someone pressing Bigger
       wants it bigger now, at the zoom they are looking at; switching
       the symbol to draw at a real size would change how it behaves at
       every other zoom as well, which is not what the press asked for. */
    return { Symbol_Size_Px: next, Scale_Symbol: false };
  }

  if (action === "hideBelow") {
    /* Hidden when further out than here. Rounded down a little so the
       feature is still visible at the zoom it was set from — setting the
       limit to exactly the current scale makes it wink out on the next
       small zoom-out, which reads as the button having gone too far. */
    const at = Math.round(Number(scale) * 100) / 100;
    if (!(at > 0)) return null;
    return { Min_Scale: at };
  }

  if (action === "hideAbove") {
    const at = Math.round(Number(scale) * 100) / 100;
    if (!(at > 0)) return null;
    return { Max_Scale: at };
  }

  if (action === "showAlways") {
    if (current.Min_Scale == null && current.Max_Scale == null) return null;
    return { Min_Scale: null, Max_Scale: null };
  }

  return null;
}

/* The row to save: the existing one with the patch applied, or a new one
   carrying just enough to identify what it applies to. */
export function styleRowFor(existing, subject, patch, { name } = {}) {
  if (existing) return { ...existing, ...patch };
  return {
    Style_Name: name || `${subject.Feature_Role ?? subject.Line_Type ?? subject.Layer_Key} (canvas)`,
    Layer_Key: subject.Layer_Key,
    Feature_Role: subject.Feature_Role,
    Line_Type: subject.Line_Type,
    Site: null,
    Utility_ID: null,
    Organisation_ID: null,
    Is_Active: true,
    /* Ordered after the seeded rules so a canvas adjustment wins over a
       general one it is narrowing. */
    Sort_Order: 500,
    ...patch,
  };
}
