/* Pulling plot numbers out of free text.

   GTC don't send a plot column — a row reads "Plots 1, 2 and 5-10" with
   one payment covering all of them. So plots are parsed from the text
   and ranges expanded, and the row's value belongs to the group rather
   than to any single plot.

   Ported from the original's GAV_PLOT_RE handling. The two patterns
   matter: after the word "plot" a letter prefix with a space is allowed
   ("DW 61"), but without that keyword it isn't, because "AV 66" in
   surrounding prose would otherwise read as a plot. */

const KEYWORD = /\bplots?\b/gi;
const AFTER_PLOT = /(?<![A-Za-z0-9])([A-Z]{1,2}\s\d{1,3}[A-Za-z]{0,2}|[A-Za-z]{1,2}\d{1,3}[A-Za-z]{0,2}|\d{1,3}[A-Za-z]{1,2}|\d{1,3})(?![A-Za-z0-9])/g;
const NO_PLOT = /(?<![A-Za-z0-9])([A-Za-z]{1,2}\d{1,3}[A-Za-z]{0,2}|\d{1,3}[A-Za-z]{1,2}|\d{1,3})(?![A-Za-z0-9])/g;
const RANGE_SEP = /^(?:\s*[-–—]\s*|\s+to\s+)$/i;
const PFX_SPACE = /^([A-Za-z]{1,2})\s(\d{1,3})([A-Za-z]{0,2})$/;
const PREFIX = /^([A-Za-z]{1,2})(\d{1,3})([A-Za-z]{0,2})$/;
const PLAIN = /^(\d{1,3})([A-Za-z]{0,2})$/;

/* Strip the things that produce false positives: bracketed asides,
   percentages, long numbers (dates, invoice refs), and "and" so it reads
   as a separator rather than a token boundary. */
function cleanText(text) {
  return String(text || "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\d+(?:\.\d+)?\s*%/g, " ")
    .replace(/(?<!\d)\d{4,}(?!\d)/g, " ")
    .replace(/\band\b/gi, ",");
}

/* A token becomes [prefix, number, suffix, display]. */
function parseToken(raw) {
  const t = String(raw || "").trim();
  let m = t.match(PFX_SPACE);
  if (m) return [m[1].toUpperCase(), Number(m[2]), m[3].toUpperCase(), `${m[1].toUpperCase()}${m[2]}${m[3].toUpperCase()}`];
  m = t.match(PREFIX);
  if (m) return [m[1].toUpperCase(), Number(m[2]), m[3].toUpperCase(), `${m[1].toUpperCase()}${m[2]}${m[3].toUpperCase()}`];
  m = t.match(PLAIN);
  if (m) return ["", Number(m[1]), m[2].toUpperCase(), `${m[1]}${m[2].toUpperCase()}`];
  return null;
}

/* 5-10 expands, but only when both ends share a prefix and neither has a
   suffix — "5A-10B" isn't a range anyone means. */
function expandRange(a, b) {
  const [pa, na, sa] = a;
  const [pb, nb, sb] = b;
  if (pa !== pb || sa || sb) return [a[3], b[3]];
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return [a[3], b[3]];
  const [lo, hi] = na <= nb ? [na, nb] : [nb, na];
  if (hi - lo > 500) return [a[3], b[3]];
  const out = [];
  for (let n = lo; n <= hi; n++) out.push(`${pa}${n}`);
  return out;
}

function fromSegment(text, pattern) {
  const cleaned = cleanText(text);
  pattern.lastIndex = 0;
  const found = [];
  let m;
  while ((m = pattern.exec(cleaned)) !== null) {
    const parsed = parseToken(m[1]);
    if (parsed) found.push([m.index, m.index + m[1].length, parsed]);
    if (m.index === pattern.lastIndex) pattern.lastIndex++;
  }

  const out = [];
  let i = 0;
  while (i < found.length) {
    const [, end, tok] = found[i];
    if (i + 1 < found.length) {
      const [nextStart, , nextTok] = found[i + 1];
      if (RANGE_SEP.test(cleaned.slice(end, nextStart))) {
        out.push(...expandRange(tok, nextTok));
        i += 2;
        continue;
      }
    }
    out.push(tok[3]);
    i++;
  }
  return out;
}

export function extractPlots(text) {
  const s = String(text ?? "").trim();
  if (!s) return [];

  KEYWORD.lastIndex = 0;
  const keywords = [];
  let m;
  while ((m = KEYWORD.exec(s)) !== null) {
    keywords.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === KEYWORD.lastIndex) KEYWORD.lastIndex++;
  }

  let tokens = [];
  if (keywords.length) {
    /* Only the text after a "plot" keyword is read permissively, which
       is what keeps prose from contributing numbers. */
    for (let i = 0; i < keywords.length; i++) {
      const start = keywords[i].end;
      const end = i + 1 < keywords.length ? keywords[i + 1].start : s.length;
      tokens = tokens.concat(fromSegment(s.slice(start, end), AFTER_PLOT));
    }
  } else {
    tokens = fromSegment(s, NO_PLOT);
  }

  const seen = new Set();
  return tokens.filter((t) => (seen.has(t) ? false : seen.add(t)));
}
