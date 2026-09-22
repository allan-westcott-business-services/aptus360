/* Plot numbers typed as ranges and single numbers.

   "1-20, 24, 26, 31, 48-52" — one field per house type, rather than a
   From/To box and a separate list, one house type at a time.

   Pure: text in, labels and problems out. The form shows the problems
   under the row they belong to and will not save while there are any.

   ── What counts as a problem ──

     - Something that is neither a number nor a range ("1-2-3", "abc!").
     - A range that runs backwards (20-1), or one so large it is
       probably a typo (1-20000).
     - A plot entered twice in ONE row: "1-12, 11, 16" covers 11 twice.
     - A plot entered under TWO house types.
     - A plot already on the project. Adding it again would make a
       second plot with the same number, and every schedule, levels
       report and call-off would then have two of it.

   Nothing is quietly dropped. The old form de-duplicated silently and
   skipped plots already on the project without saying which, so a
   typo that repeated a number vanished rather than being fixed. */

/* A range longer than this is almost certainly a typo — "1-2000" for
   "1-200" — and would put a thousand plots on a project in one go. */
export const MAX_RANGE = 1000;

/* Plot numbers are text: 43A and B1 are real. Natural order, so 10
   comes after 9. */
export function naturalCompare(a, b) {
  const re = /^([A-Za-z]*)(\d+)(.*)$/;
  const ma = re.exec(a);
  const mb = re.exec(b);
  if (ma && mb && ma[1] === mb[1]) {
    const d = Number(ma[2]) - Number(mb[2]);
    return d !== 0 ? d : ma[3].localeCompare(mb[3]);
  }
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/* One field's text into plot labels.

   Commas separate entries; spaces around them do not matter. A range
   is two whole numbers joined by a hyphen or a dash — an en dash is
   what a phone or Word puts in "1–20". Anything else that is letters
   and digits is a single plot label as typed (43A). The prefix goes in
   front of every one. */
export function parsePlotList(text, prefix = "") {
  const pre = String(prefix || "").trim();
  const labels = [];
  const errors = [];

  for (const raw of String(text || "").split(",")) {
    const token = raw.trim();
    if (!token) continue;

    const range = /^(\d+)\s*[-\u2013—]\s*(\d+)$/.exec(token);
    if (range) {
      const from = Number(range[1]);
      const to = Number(range[2]);
      if (from > to) {
        errors.push(`"${token}" runs backwards — did you mean ${to}-${from}?`);
        continue;
      }
      if (to - from + 1 > MAX_RANGE) {
        errors.push(`"${token}" is ${to - from + 1} plots — more than ${MAX_RANGE} in one range is `
          + "usually a typo");
        continue;
      }
      for (let n = from; n <= to; n++) labels.push(`${pre}${n}`);
      continue;
    }
    if (/^[A-Za-z0-9]+$/.test(token)) {
      labels.push(`${pre}${token}`);
      continue;
    }
    errors.push(`"${token}" isn't a plot number or a range`);
  }

  /* Repeats within the field, each named once however often it
     repeats. */
  const seen = new Set();
  const repeats = new Set();
  for (const l of labels) {
    if (seen.has(l)) repeats.add(l);
    seen.add(l);
  }

  return {
    plots: [...seen],
    repeats: [...repeats].sort(naturalCompare),
    errors,
  };
}

/* Labels back into the short form, for messages: ["1","2","3","7"]
   reads "1-3, 7". Labels that are not plain numbers after the prefix
   are listed as they are. */
export function toRanges(labels = []) {
  const byPrefix = new Map();
  const odd = [];
  for (const l of labels) {
    const m = /^([A-Za-z]*)(\d+)$/.exec(l);
    if (!m) { odd.push(l); continue; }
    if (!byPrefix.has(m[1])) byPrefix.set(m[1], []);
    byPrefix.get(m[1]).push(Number(m[2]));
  }
  const parts = [];
  for (const [pre, nums] of byPrefix) {
    nums.sort((a, b) => a - b);
    let start = nums[0];
    let prev = nums[0];
    for (let i = 1; i <= nums.length; i++) {
      if (nums[i] === prev + 1) { prev = nums[i]; continue; }
      parts.push(start === prev ? `${pre}${start}` : `${pre}${start}-${pre}${prev}`);
      start = nums[i];
      prev = nums[i];
    }
  }
  return [...parts, ...odd.sort(naturalCompare)].join(", ");
}

/* Every row at once, and the problems between them.

   rows:     [{ key, prefix, text, name }]  (name: the house type, for messages)
   existing: plot numbers already on the project

   Returns a result per row, the total, and whether it can be saved. */
export function checkBatch(rows = [], existing = []) {
  const onProject = new Set((existing || []).map(String));
  const parsed = rows.map((r) => ({ ...r, ...parsePlotList(r.text, r.prefix) }));

  /* Which rows each plot appears in. */
  const where = new Map();
  parsed.forEach((r, i) => {
    for (const l of r.plots) {
      if (!where.has(l)) where.set(l, []);
      where.get(l).push(i);
    }
  });

  const results = parsed.map((r, i) => {
    const clashes = [];
    for (const l of r.plots) {
      const others = where.get(l).filter((j) => j !== i);
      if (others.length) clashes.push({ plot: l, with: others });
    }
    const already = r.plots.filter((l) => onProject.has(l)).sort(naturalCompare);
    const problems = [...r.errors];
    if (r.repeats.length) {
      problems.push(`${toRanges(r.repeats)} ${r.repeats.length === 1 ? "is" : "are"} entered more `
        + "than once in this row");
    }
    /* Grouped by the row they clash with, so one message says
       "11, 16 are also under 4 Bed Detached" rather than one per plot. */
    const byRow = new Map();
    for (const c of clashes) {
      for (const j of c.with) {
        if (!byRow.has(j)) byRow.set(j, []);
        byRow.get(j).push(c.plot);
      }
    }
    for (const [j, plots] of byRow) {
      const other = parsed[j].name || `row ${j + 1}`;
      problems.push(`${toRanges(plots)} ${plots.length === 1 ? "is" : "are"} also under ${other}`);
    }
    if (already.length) {
      problems.push(`${toRanges(already)} ${already.length === 1 ? "is" : "are"} already on this project`);
    }
    return { key: r.key, plots: r.plots.sort(naturalCompare), count: r.plots.length, problems };
  });

  const total = new Set(parsed.flatMap((r) => r.plots)).size;
  return {
    rows: results,
    total,
    ok: total > 0 && results.every((r) => !r.problems.length),
  };
}
