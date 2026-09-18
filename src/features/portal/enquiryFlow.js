/* Which question comes next.

   A sheet is a list of questions in order, and a handful of answers
   that send somebody somewhere else. This works out the path: what to
   show now, what follows it, and when the sheet is finished.

   Pure — questions, options and the answers so far go in; the next
   question comes out. The renderer draws what this decides, which is
   what lets the branching be tested without a browser, a database or a
   half-filled form.

   ── Where a jump comes from ──

   Three places, most specific first:

     the OPTION chosen   "if they say Yes, go to question 5", and the
                         option may end the form outright
     the QUESTION        its own Next_Question_ID, for a question that
                         always leads somewhere other than the next one
     the ORDER           the next active question by Sort_Order

   An unanswered question leads nowhere: the path stops there, which is
   what makes a half-finished sheet show exactly as far as somebody has
   got rather than guessing the rest.

   ── Forward only ──

   The editor offers only later questions as jump targets, so a loop
   cannot be built. This does not trust that: `pathOf` refuses to visit
   a question twice. A sheet edited directly in the database, or an
   older one written before that rule existed, must not be able to hang
   the form somebody is filling in. */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* The questions of a form, in order, with their options attached.
   Retired questions and options are left out: an old answer may point
   at one, but nobody is asked it again. */
export function sheetOf(questions = [], options = [], formId) {
  const mine = questions
    .filter((q) => String(q.Enquiry_Form_ID) === String(formId))
    .filter((q) => q.Is_Active !== false)
    .sort((a, b) => num(a.Sort_Order) - num(b.Sort_Order));

  return mine.map((q) => ({
    ...q,
    options: options
      .filter((o) => String(o.Enquiry_Question_ID) === String(q.Enquiry_Question_ID))
      .filter((o) => o.Is_Active !== false)
      .sort((a, b) => num(a.Sort_Order) - num(b.Sort_Order)),
  }));
}

/* What a question is answered with, from whatever the form holds.

   `answers` is keyed by question id. A choice answers with an option
   id; everything else answers with a value. Both are read here so the
   rest of this file does not care which kind a question is. */
const answerFor = (answers, q) => answers?.[q.Enquiry_Question_ID]
  ?? answers?.[String(q.Enquiry_Question_ID)]
  ?? null;

const chosenIds = (a) => {
  if (a == null) return [];
  if (Array.isArray(a)) return a.map(String);
  if (typeof a === "object" && a.chosen) return [].concat(a.chosen).map(String);
  return [String(a)];
};

/* Where this question leads, given what was answered. Returns an id, or
   "end" where the answer finishes the sheet, or null for "carry on in
   order". */
export function nextFrom(q, answers) {
  const a = answerFor(answers, q);

  /* The option chosen. For a multi-choice, the FIRST chosen option that
     carries a jump decides — a single answer cannot lead two ways, and
     picking the first in the sheet's own order is the only rule that
     does not depend on the order somebody happened to tick them. */
  if (a != null && q.options?.length) {
    const ids = chosenIds(a);
    for (const o of q.options) {
      if (!ids.includes(String(o.Enquiry_Option_ID))) continue;
      if (o.Ends_Form) return "end";
      if (o.Next_Question_ID != null) return o.Next_Question_ID;
    }
  }

  /* The question's own onward pointer. */
  if (q.Next_Question_ID != null) return q.Next_Question_ID;

  return null;
}

/* The questions somebody has actually been walked through, in order,
   given the answers so far.

   Stops at the first unanswered question: that is the one to show. A
   question whose answer is missing leads nowhere, because where it
   leads is what the answer decides. */
export function pathOf(sheet = [], answers = {}) {
  const byId = new Map(sheet.map((q) => [String(q.Enquiry_Question_ID), q]));
  const path = [];
  const seen = new Set();

  let current = sheet[0] ?? null;
  while (current) {
    /* A loop, which the editor cannot make but a hand-edited sheet
       could. Stopping is the only safe answer: carrying on would hang
       the form, and a form that hangs has no way out for the person in
       it. */
    const key = String(current.Enquiry_Question_ID);
    if (seen.has(key)) break;
    seen.add(key);
    path.push(current);

    const a = answerFor(answers, current);
    if (a == null || a === "") break;          // this is the one to answer

    const next = nextFrom(current, answers);
    if (next === "end") break;
    if (next != null) { current = byId.get(String(next)) ?? null; continue; }

    const i = sheet.indexOf(current);
    current = i >= 0 ? sheet[i + 1] ?? null : null;
  }

  return path;
}

/* The question to put in front of somebody now, or null when the sheet
   is done. */
export function currentQuestion(sheet = [], answers = {}) {
  const path = pathOf(sheet, answers);
  const last = path[path.length - 1];
  if (!last) return null;
  const a = answerFor(answers, last);
  if (a == null || a === "") return last;

  /* The last question is answered, so the sheet is finished unless the
     order has another one after it that nothing jumped over. */
  if (nextFrom(last, answers) === "end") return null;
  const next = nextFrom(last, answers);
  if (next != null) {
    return sheet.find((q) => String(q.Enquiry_Question_ID) === String(next)) ?? null;
  }
  const i = sheet.indexOf(last);
  return i >= 0 ? sheet[i + 1] ?? null : null;
}

/* Is the sheet complete? Every question ON THE PATH that must be
   answered has been.

   Only the path: a question the answers jumped over is not missing, it
   is not asked. Judging completeness against every question in the
   sheet is how a form with branching comes to be unsubmittable. */
export function missingAnswers(sheet = [], answers = {}) {
  return pathOf(sheet, answers)
    .filter((q) => q.Is_Required)
    .filter((q) => {
      const a = answerFor(answers, q);
      if (a == null || a === "") return true;
      if (Array.isArray(a) && !a.length) return true;
      return false;
    });
}

export function isComplete(sheet = [], answers = {}) {
  return currentQuestion(sheet, answers) == null
    && missingAnswers(sheet, answers).length === 0;
}
