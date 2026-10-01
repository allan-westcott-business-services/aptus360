/* Ticking boxes on a question where one answer rules the others out.

   ── What was asked for ──

   A "Several choices" question reading "Do you require temporary
   electric and water supplies?", answered with

     No - we do not require any
     Yes, electric
     Yes, water

   "If the user selects Yes to the first answer, I want the checkboxes
   underneath to become visible ... selecting 'No - we do not require
   any' would mean that the 'Yes, electric' and 'Yes, water' checkboxes
   would be disabled. I want to do this in a single question rather than
   split across 2 questions."

   So one answer carries `Is_Exclusive` (0243) and the rules are:

     tick an exclusive answer   → every other is cleared, and disabled
     tick an ordinary answer    → every exclusive one is cleared
     untick the exclusive one   → the others come back, still empty

   ── Why it is a function and not three lines in the component ──

   Both halves have to agree about the same moment. The rule that CLEARS
   and the rule that DISABLES are the same fact asked twice, and written
   separately they drift: a box disabled by one and still ticked by the
   other is an answer somebody cannot see and cannot remove, submitted
   with the sheet. `disabledIds` is derived from the selection `toggle`
   produces, so there is one answer to "is this ruled out" and the
   screen and the submission read it from the same place.

   ── Ids as strings ──

   The portal keeps its selections as strings, because they come back
   from a checkbox and go into JSON. Compared as strings here for the
   same reason the cascade does it: 11 and "11" are the same answer. */

const asId = (v) => String(v?.Enquiry_Option_ID ?? v);

export const isExclusive = (option) => option?.Is_Exclusive === true;

/* Which answers cannot be ticked right now.

   Empty unless an exclusive answer is currently chosen; then everything
   else on the question. The exclusive answer itself is never disabled,
   or it could be chosen and never undone — the same reason a chosen
   plot is never locked on the interim picker. */
export function disabledIds(options = [], chosen = []) {
  const picked = new Set([...chosen].map(String));
  const exclusiveChosen = options.filter(
    (o) => isExclusive(o) && picked.has(asId(o)));
  if (exclusiveChosen.length === 0) return new Set();
  const keep = new Set(exclusiveChosen.map(asId));
  return new Set(options.map(asId).filter((id) => !keep.has(id)));
}

/* Ticking or unticking one answer, with the rule applied.

   Returns the new selection. Order is the options' own, not the order
   somebody clicked in: an answer list that reshuffles as it is filled
   in is a list people lose their place in, and the submitted answer
   reads the same way the question does. */
export function toggle(options = [], chosen = [], id, on) {
  const target = String(id);
  const picked = new Set([...chosen].map(String));
  const option = options.find((o) => asId(o) === target);

  if (!on) {
    picked.delete(target);
  } else if (isExclusive(option)) {
    /* It rules out everything else, including another exclusive answer:
       "None" and "Not yet decided" are both answers to the whole
       question and cannot both be true. */
    picked.clear();
    picked.add(target);
  } else {
    /* An ordinary answer clears whatever ruled it out. Clearing rather
       than refusing the click: somebody ticking "Yes, electric" after
       "No - we do not require any" has changed their mind, and a click
       that silently does nothing reads as a broken checkbox. */
    for (const o of options) if (isExclusive(o)) picked.delete(asId(o));
    picked.add(target);
  }

  return options.map(asId).filter((x) => picked.has(x));
}
