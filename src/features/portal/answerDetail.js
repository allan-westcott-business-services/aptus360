/* An answer that asks for more: "Other - please specify".

   ── What was asked for ──

   "Sometimes we will have radio buttons and/or check boxes that, if
   selected, will require a supporting text box in which additional
   information is required."

   The case on screen is "Other - please specify" under "What load does
   your compound require?", beside "Standard - 20 kVA". Choosing Other
   answers nothing on its own — the figure is the answer — so the box is
   not an optional extra, and the developer cannot go on without it.

   ── Three things, from one place ──

   The box is SHOWN for a chosen answer that wants detail, the Next
   button is HELD until it has something in it, and the text ends up in
   what is submitted. Those are three readings of one fact, and written
   separately they drift: a box the screen stops showing while its text
   is still in the submission puts words into an enquiry that nobody can
   see they are sending. So the portal asks here for all three.

   ── Where the text goes ──

   Appended to the option's label, because that is how an answer is
   already stored — `Enquiry_Answer.Answer_Text`, a sentence that has to
   read years later beside the question it answered:

     Other - please specify: 11 kVA three phase

   A field of its own would need every reader of an answer to know to
   look in two places, and the one that forgot would show half an
   answer. */

const asId = (v) => String(v?.Enquiry_Option_ID ?? v);

export const needsDetail = (option) => option?.Needs_Detail === true;

/* What to label the box. The prompt somebody wrote, or the plain
   default — a bare box leaves the developer guessing what is wanted. */
export const detailPrompt = (option) =>
  (typeof option?.Detail_Prompt === "string" && option.Detail_Prompt.trim())
    ? option.Detail_Prompt.trim()
    : "Please specify";

/* The chosen answers that want detail, in the question's order.

   `chosen` is whatever the portal holds for the question: one id for a
   radio, several for checkboxes, and either may arrive as a number or a
   string. Flattened and compared as strings for the same reason
   everything else here does it. */
export function wantingDetail(options = [], chosen) {
  const picked = new Set([].concat(chosen ?? []).filter((v) => v != null).map(String));
  return options.filter((o) => needsDetail(o) && picked.has(asId(o)));
}

/* Which of those have nothing typed in them yet.

   Whitespace is nothing. Somebody who has pressed space has not said
   what load their compound requires, and an enquiry carrying
   "Other - please specify:  " is worse than one carrying the question
   unanswered — it reads as an answer. */
export function detailsMissing(options = [], chosen, details = {}) {
  return wantingDetail(options, chosen)
    .filter((o) => String(details?.[asId(o)] ?? "").trim() === "");
}

/* The answer as it will be stored: every chosen label, with its detail
   written after it.

   The question's order, not the clicking order, and the same join the
   portal used before this existed — so a question with no detail on it
   produces exactly the string it always did. */
export function answerText(options = [], chosen, details = {}) {
  const picked = new Set([].concat(chosen ?? []).filter((v) => v != null).map(String));
  return options
    .filter((o) => picked.has(asId(o)))
    .map((o) => {
      const text = String(details?.[asId(o)] ?? "").trim();
      return needsDetail(o) && text ? `${o.Label}: ${text}` : o.Label;
    })
    .join(", ");
}

/* Detail typed against answers that are no longer chosen.

   Dropped rather than kept. Somebody who ticks Other, types a figure,
   then changes to Standard has withdrawn the figure, and carrying it
   silently would submit a sentence they cannot see on the screen. The
   portal calls this whenever a choice changes. */
export function pruneDetails(options = [], chosen, details = {}) {
  const keep = new Set(wantingDetail(options, chosen).map(asId));
  const out = {};
  for (const [id, text] of Object.entries(details ?? {})) {
    if (keep.has(String(id))) out[id] = text;
  }
  return out;
}
