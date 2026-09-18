/* A note written on the drawing.

   Free text somebody types onto the plan: "existing main to be
   abandoned", "NB. depth to be confirmed on site", a reference to a
   detail sheet. Annotation rather than apparatus — it carries nothing,
   connects nothing and no build reads it — so it goes on the
   `annotation` layer with the section marks, and hiding a utility can
   never hide it. 0215 set that layer up and named notes as the thing
   it was waiting for.

   ── Measured in metres of ground ──

   Text size, box width and the leader are all in metres, like the
   section mark's two-metre bar and for the same reason: the drawing is
   printed to scale, and a note sized in screen pixels is a different
   size on every sheet. A note set at 1.2 m reads the same at 1:200 as
   at 1:500, which is what lets somebody set up a drawing once.

   ── Why the wrap is measured here and not by the renderer ──

   The screen measures glyphs with `ctx.measureText`, the sheet with
   pdf-lib's font metrics, and DXF hands the text to whatever the
   receiving CAD is set to. Three measurers wrap the same note in three
   places, and a note that reads as four lines on screen and five on
   paper is a note whose box somebody has sized against the wrong one.

   So the wrap is one deterministic table here, and every renderer
   wraps through it. The glyphs the canvas actually draws are within a
   few per cent of these widths — the padding absorbs it — and being
   slightly out everywhere in the same way is worth far more than being
   exactly right in one place and different in the others.

   ── Where a note IS ──

   Its `Geometry[0]` is the TOP-LEFT corner of the box, not its centre.
   Text grows down and to the right from where it starts, so a note
   resized from the bottom-right corner keeps the corner somebody
   aligned it by. A centre would move every time a line was added.

   Pure: a feature in, rectangles and points out. The canvas, the print
   and the checks all read the same box. */

export const NOTE_ROLE = "textnote";

/* Defaults for a note just placed.

   1.2 m of text height is about 2.4 mm on an A3 sheet at 1:500, which
   is the smallest annotation anybody wants to read, and 14 m of wrap
   is a couple of short sentences — wide enough that a note is not a
   column of single words, narrow enough that it does not run across
   the site. Both are editable; these are where somebody starts. */
export const NOTE_DEFAULTS = {
  sizeM: 1.2,
  widthM: 14,
  /* A white plate by default. A note is written over a basemap, and
     black text on an aerial photograph is not text. Set to null for
     no plate where the drawing underneath is clear. */
  fill: "#ffffff",
  colour: "#0f172a",
};

/* Air around the text, as a fraction of the text size, so the plate
   grows with the letters rather than gripping them at 4 m and swimming
   round them at 0.4 m. */
export const NOTE_PAD = 0.45;

/* Line spacing, likewise proportional. 1.35 is the ordinary setting
   for a sans face and the one both renderers step by. */
export const NOTE_LINE = 1.35;

/* The smallest and largest a note may be made by dragging. A note at
   0.05 m is invisible at every scale this drawing is printed at, and
   one at 50 m is somebody having dragged the wrong handle across the
   site — both are easier to prevent than to notice and undo. */
export const NOTE_MIN_SIZE_M = 0.15;
export const NOTE_MAX_SIZE_M = 25;
export const NOTE_MIN_WIDTH_M = 1;
export const NOTE_MAX_WIDTH_M = 400;

/* ── How wide a string is ──

   Em widths for a sans face, by character class. Not a font metric and
   not trying to be: what matters is that every reader of a note gets
   the SAME answer, and that the answer is close enough that the
   padding covers the difference.

   Measured against Inter and DM Sans, which are what the app sets, and
   near enough to the Helvetica a PDF is drawn with. */
const NARROW = "ijltfIrT.,;:'`!|[](){}/\\-";
const WIDE = "mwMW@%";

function emWidth(ch) {
  if (ch === " ") return 0.29;
  if (NARROW.includes(ch)) return 0.32;
  if (WIDE.includes(ch)) return 0.92;
  if (ch >= "A" && ch <= "Z") return 0.68;
  if (ch >= "0" && ch <= "9") return 0.57;
  return 0.54;
}

/* A string's width in metres at a given text height.

   `sizeM` is the em size — what a renderer sets its font to, and what
   CAD calls the text height. Every width here is a fraction of it. */
export function measureTextM(str, sizeM) {
  const s = Number(sizeM) || NOTE_DEFAULTS.sizeM;
  let em = 0;
  for (const ch of String(str ?? "")) em += emWidth(ch);
  return em * s;
}

/* ── The note, broken into lines ──

   Newlines the writer typed are kept: somebody who pressed return
   meant a new line, and re-flowing their paragraph would be the
   drawing arguing with them. Within each of those, words wrap at the
   box width.

   A single word longer than the box is left to overhang rather than
   broken mid-word. A reference like "DRG/2026/114-A" split across two
   lines is a different reference, and a note is short enough that one
   long line is a smaller fault than a wrong one. */
export function wrapNote(text, { widthM, sizeM } = {}) {
  const w = Math.max(NOTE_MIN_WIDTH_M, Number(widthM) || NOTE_DEFAULTS.widthM);
  const s = Number(sizeM) || NOTE_DEFAULTS.sizeM;
  const src = String(text ?? "");
  if (!src) return [""];

  const out = [];
  for (const para of src.split(/\r?\n/)) {
    const words = para.split(/ +/).filter((x) => x !== "");
    if (!words.length) { out.push(""); continue; }

    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && measureTextM(next, s) > w) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}

/* ── The box a note occupies ──

   In metres, about its own top-left corner. `w` is the plate, which is
   the wrap width plus the padding either side — NOT the width of the
   longest line: a note whose plate shrank to its text would change
   shape as it was typed into, and the wrap width is the thing somebody
   set by dragging.

   `h` follows the lines, because a plate taller than its text is empty
   space nobody asked for and no way to say what it is for. */
export function noteBox(feature) {
  const a = feature?.Attributes || {};
  const at = (feature?.Geometry || [])[0];
  const x = Array.isArray(at) ? Number(at[0]) || 0 : 0;
  const y = Array.isArray(at) ? Number(at[1]) || 0 : 0;

  const sizeM = clamp(Number(a.Text_Size_M) || NOTE_DEFAULTS.sizeM,
    NOTE_MIN_SIZE_M, NOTE_MAX_SIZE_M);
  const widthM = clamp(Number(a.Text_Width_M) || NOTE_DEFAULTS.widthM,
    NOTE_MIN_WIDTH_M, NOTE_MAX_WIDTH_M);

  /* The note's words live in `Label`, like every other feature's name.
     A second place to hold text is a second thing to keep in step —
     and the DXF export, the search box and the schedule all read Label
     already, so a note put anywhere else would be invisible to all
     three. */
  const lines = wrapNote(feature?.Label ?? "", { widthM, sizeM });

  const padM = sizeM * NOTE_PAD;
  const lineH = sizeM * NOTE_LINE;

  return {
    x, y, at: [x, y],
    w: widthM + padM * 2,
    h: lines.length * lineH + padM * 2,
    lines, sizeM, widthM, padM, lineH,
    fill: a.Note_Fill === null ? null : (a.Note_Fill ?? NOTE_DEFAULTS.fill),
    colour: a.Note_Colour ?? null,
    leaderAt: Array.isArray(a.Leader_At) && a.Leader_At.length === 2
      ? [Number(a.Leader_At[0]), Number(a.Leader_At[1])] : null,
  };
}

/* The baseline of line `i`, in metres. Both renderers set text on a
   baseline, so this is the one place the first line's drop is decided
   — and it is `padM + sizeM` rather than `padM + lineH`, or every note
   would sit low in its own plate by the leading. */
export function lineBaseline(box, i) {
  return box.y + box.padM + box.sizeM + i * box.lineH;
}

/* ── The two handles ──

   Both on the right-hand side, where a note grows to.

   `width` is the middle of the right edge and sets the wrap: the text
   re-flows and the letters stay the size they were.

   `scale` is the bottom-right corner and sets the SIZE: the letters
   grow and the wrap grows with them in proportion, so a note made
   bigger is the same note bigger rather than the same note re-flowed.

   Two handles because they are two intentions, and one handle doing
   both by a modifier key is a thing nobody discovers. */
export function noteHandles(box) {
  return {
    width: [box.x + box.w, box.y + box.h / 2],
    scale: [box.x + box.w, box.y + box.h],
  };
}

/* Is this point inside the plate? `padM` widens the target for a
   pointer, the way the label hit test allows six pixels of slack. */
export function insideNote(box, point, slackM = 0) {
  if (!Array.isArray(point)) return false;
  return point[0] >= box.x - slackM && point[0] <= box.x + box.w + slackM
    && point[1] >= box.y - slackM && point[1] <= box.y + box.h + slackM;
}

/* ── A wrap width from where the pointer is ──

   The width is what lies between the left edge and the cursor, less
   the padding on both sides — so the plate's right edge ends up under
   the cursor, which is the handle somebody is holding. */
export function widthFrom(box, point) {
  const raw = (Number(point?.[0]) || 0) - box.x - box.padM * 2;
  return clamp(raw, NOTE_MIN_WIDTH_M, NOTE_MAX_WIDTH_M);
}

/* ── A size from where the pointer is ──

   Scaled about the top-left corner, which is the one that does not
   move. The factor is taken from both axes together: dragging out and
   down enlarges, and a drag that is mostly horizontal still reads as
   one, which a factor taken from the diagonal alone would not.

   `start` is the box as it was when the drag began. Working from the
   start rather than from the last frame is what keeps the note the
   same size when the pointer comes back to where it set off. */
export function scaleFrom(start, point) {
  const dx = (Number(point?.[0]) || 0) - start.x;
  const dy = (Number(point?.[1]) || 0) - start.y;
  const fx = start.w > 0 ? dx / start.w : 1;
  const fy = start.h > 0 ? dy / start.h : 1;
  const factor = Math.max(0.05, (fx + fy) / 2);
  return {
    sizeM: round2(clamp(start.sizeM * factor, NOTE_MIN_SIZE_M, NOTE_MAX_SIZE_M)),
    widthM: round2(clamp(start.widthM * factor, NOTE_MIN_WIDTH_M, NOTE_MAX_WIDTH_M)),
  };
}

/* ── Where the leader leaves the note ──

   From the edge of the plate facing what it points at, not from the
   note's centre: a line drawn from the middle crosses the text it is
   supposed to be introducing.

   Worked out as the point where the segment from the centre to the
   target crosses the rectangle. A target inside the plate gives the
   centre back, and the renderers draw nothing in that case — a leader
   from a note to itself points at nothing. */
export function leaderFrom(box, target) {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  if (!Array.isArray(target)) return [cx, cy];

  const dx = Number(target[0]) - cx;
  const dy = Number(target[1]) - cy;
  if (!dx && !dy) return [cx, cy];
  if (insideNote(box, target)) return [cx, cy];

  /* How far along the ray each edge lies, taking the nearer of the two
     it could cross. */
  const tx = dx ? (box.w / 2) / Math.abs(dx) : Infinity;
  const ty = dy ? (box.h / 2) / Math.abs(dy) : Infinity;
  const t = Math.min(tx, ty);
  return [cx + dx * t, cy + dy * t];
}

/* The arrowhead at the pointing end, as three points in metres.

   Here rather than in either renderer, so the head on the sheet is the
   head on the screen. Sized from the text, because a note set large is
   read from further away and its arrow has to be seen from there too. */
export function leaderHead(from, to, sizeM) {
  const dx = Number(to?.[0]) - Number(from?.[0]);
  const dy = Number(to?.[1]) - Number(from?.[1]);
  const len = Math.hypot(dx, dy);
  if (!len) return null;
  const ux = dx / len;
  const uy = dy / len;
  const h = Math.max(0.2, (Number(sizeM) || NOTE_DEFAULTS.sizeM) * 0.9);
  const half = h * 0.32;
  const base = [Number(to[0]) - ux * h, Number(to[1]) - uy * h];
  return [
    [Number(to[0]), Number(to[1])],
    [base[0] - uy * half, base[1] + ux * half],
    [base[0] + uy * half, base[1] - ux * half],
  ];
}

/* Where a leader goes when somebody first asks for one.

   Below and to the left of the note, a couple of text heights clear of
   it, so the arrow is visible and grabbable the moment it appears. A
   leader that started under the plate would look like a leader that
   had not been created. */
export function defaultLeader(box) {
  return [
    round2(box.x - box.sizeM * 3),
    round2(box.y + box.h + box.sizeM * 3),
  ];
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
