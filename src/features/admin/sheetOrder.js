/* Ordering an enquiry sheet by dragging.

   A question's place on the sheet is its `Sort_Order`, and until now
   the editor set it by typing a number: to put a question third you
   worked out what the second and fourth were called and chose
   something between. Asked for as dragging instead.

   ── What a drag does ──

   It moves one thing and renumbers everything. Sections are TEXT on
   their questions and appear in the order their first question does,
   so the sheet is a list of sections each holding a list of questions,
   and its order is fully described by walking that structure top to
   bottom. After any move the walk is redone and every question gets
   `(position + 1) × 10`. Tens, so a row added by hand in the database
   between two neighbours still has somewhere to go.

   Only the questions whose number actually changed are written back,
   so moving one question near the top of a long sheet is a handful of
   updates rather than one per question — and a sheet that is already
   in order writes nothing.

   Pure: groups in, a new grouping and the list of writes out. The
   editor decides how to save them. */

/* The sheet as an ordered list of sections, each with ordered
   questions. `groups` is [{ title, questions: [...] }] in display
   order, the shape the editor already builds. */
export function renumber(groups) {
  const writes = [];
  let n = 0;
  for (const g of groups) {
    for (const q of g.questions) {
      n += 1;
      const want = n * 10;
      if (Number(q.Sort_Order) !== want) {
        writes.push({ id: q.Enquiry_Question_ID, Sort_Order: want });
      }
    }
  }
  return writes;
}

/* A question dragged to a new place in its section.

   `before` is the question it was dropped in front of, or null for
   the end. Dropping onto itself, or into the slot it already holds,
   is a no-op with no writes — a drag that jiggles and lands where it
   started should not cost a save. */
export function moveQuestion(groups, questionId, before) {
  const out = groups.map((g) => ({ ...g, questions: [...g.questions] }));
  const g = out.find((x) => x.questions.some((q) => q.Enquiry_Question_ID === questionId));
  if (!g) return { groups, writes: [] };

  const from = g.questions.findIndex((q) => q.Enquiry_Question_ID === questionId);
  const [q] = g.questions.splice(from, 1);
  let to = before == null
    ? g.questions.length
    : g.questions.findIndex((x) => x.Enquiry_Question_ID === before);
  if (to < 0) to = g.questions.length;
  g.questions.splice(to, 0, q);

  return { groups: out, writes: renumber(out) };
}

/* A question moved into a different section, at its end.

   The section is the text on the question, so this is a rename of
   that one field plus the renumber the new position calls for. The
   caller writes `Section` itself; this reports the order. */
export function moveToSection(groups, questionId, title) {
  const out = groups.map((g) => ({ ...g, questions: [...g.questions] }));
  const from = out.find((x) => x.questions.some((q) => q.Enquiry_Question_ID === questionId));
  if (!from) return { groups, writes: [] };
  const [q] = from.questions.splice(
    from.questions.findIndex((x) => x.Enquiry_Question_ID === questionId), 1);

  let dest = out.find((x) => x.title === title);
  if (!dest) { dest = { title, questions: [] }; out.push(dest); }
  dest.questions.push({ ...q, Section: title });

  /* A section emptied by the move disappears — it was only ever the
     text on the questions that were in it. */
  const kept = out.filter((x) => x.questions.length);
  return { groups: kept, writes: renumber(kept) };
}

/* A section (a tab) dragged to a new place among the others.

   Sections have no order of their own: they appear in the order
   their first question does. So moving a tab is renumbering every
   question in every section so the walk comes out in the new order —
   which is what `renumber` does given the sections rearranged. */
export function moveSection(groups, title, beforeTitle) {
  const out = [...groups];
  const from = out.findIndex((g) => g.title === title);
  if (from < 0) return { groups, writes: [] };
  const [g] = out.splice(from, 1);
  let to = beforeTitle == null ? out.length : out.findIndex((x) => x.title === beforeTitle);
  if (to < 0) to = out.length;
  out.splice(to, 0, g);
  return { groups: out, writes: renumber(out) };
}
