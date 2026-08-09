import {
  trimStr, toDateOrNull, formatDate, sameDay, looksLikeEmail, splitEmails,
} from "./pipeline.js";

/* Who gets told what, and when.

   A port of SendWaterConnectionEmails_ByOperativeAndDate. The macro ran
   for the next day's visits and grouped by operative and date, one draft
   per group. It emailed straight out of Outlook; a browser cannot, so
   each group offers a mailto draft and a copy of the same text.

   ── Why tomorrow ──

   The whole point is to tell a gang what to record before they set off,
   so the run is for the next day's work. The date is adjustable because
   the day before a bank holiday is not the day before the visit. */

export function defaultTargetDate() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/* What a plot is called in the email. AP number first where there is
   one: it is the quicker cross-reference for anyone scanning the list. */
export function plotDisplayText(row) {
  const ap = trimStr(row.apNumber);
  const disp = trimStr(row.plotDetails);
  if (disp === "") return ap;
  return ap !== "" ? `${ap}, ${disp}` : disp;
}

const dateKey = (d) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;

/* Groups ready to send: a valid operative email, a VYN recording link,
   and a planned date matching the target. All three are needed — a
   draft with no link tells the operative nothing they can act on. */
export function buildEmailGroups(siteRows, target) {
  const groups = new Map();
  for (const row of siteRows || []) {
    const email = trimStr(row.operativeEmail);
    const url = trimStr(row.vynRecordingLink);
    const engineer = trimStr(row.engineer);
    const planned = toDateOrNull(row.plannedDate);

    if (!looksLikeEmail(email)) continue;
    if (url === "") continue;
    if (!planned || !sameDay(planned, target)) continue;

    const key = `${email.toLowerCase()}||${dateKey(planned)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        key, email, plannedDate: planned,
        subjectDateText: formatDate(planned),
        engineers: new Set(), items: [],
      });
    }
    const g = groups.get(key);
    if (engineer !== "") g.engineers.add(engineer);
    const disp = plotDisplayText(row);
    g.items.push({
      url, text: disp !== "" ? disp : url,
      apNumber: trimStr(row.apNumber), plotNumber: trimStr(row.plotNumber),
    });
  }
  return [...groups.values()];
}

/* Plots that qualify in every respect except the email address.

   Without this they simply vanish: they fail the filter above and
   nothing says why, so a gang silently gets no message. Grouped by team
   name, because when the email is the missing thing that is the only
   identifier left. The rows themselves are carried so filling an address
   in can write back and the plots move into the real groups. */
export function buildMissingEmailGroups(siteRows, target) {
  const groups = new Map();
  for (const row of siteRows || []) {
    const engineer = trimStr(row.engineer);
    const url = trimStr(row.vynRecordingLink);
    const planned = toDateOrNull(row.plannedDate);

    if (engineer === "" || url === "") continue;
    if (!planned || !sameDay(planned, target)) continue;
    if (looksLikeEmail(row.operativeEmail)) continue;

    if (!groups.has(engineer)) {
      groups.set(engineer, {
        engineer, subjectDateText: formatDate(planned), items: [], rows: [],
      });
    }
    const g = groups.get(engineer);
    const disp = plotDisplayText(row);
    g.items.push({ url, text: disp !== "" ? disp : url });
    g.rows.push(row);
  }
  return [...groups.values()];
}

export const engineerList = (g) =>
  g.engineers.size ? [...g.engineers].join(", ") : "Unknown Engineer";

export const subjectFor = (g) =>
  `Water Connections for ${engineerList(g)} for ${g.subjectDateText}`;

/* The draft body, deliberately plain.

   No "- " or "1." line prefixes: Outlook runs a plain-text mailto body
   through its normal compose editor, and AutoFormat turns a leading
   dash into a real bulleted list the moment the draft opens. Plot text
   and link go on their own lines instead, which most clients auto-link
   anyway. */
export function buildEmailBody(g) {
  const lines = g.items.map((it) => `${it.text}\n${it.url}`).join("\n\n");
  return `Hi,\n\nPlease find the planned water connections for ${engineerList(g)} `
    + `on ${g.subjectDateText}:\n\n${lines}\n\n`
    + "Sent automatically by the UU VYN Tracker.";
}

export function mailtoFor(g) {
  const to = splitEmails(g.email).join(",");
  return `mailto:${encodeURIComponent(to)}`
    + `?subject=${encodeURIComponent(subjectFor(g))}`
    + `&body=${encodeURIComponent(buildEmailBody(g))}`;
}

/* For the copy button: recipient and subject as their own lines above
   the body, so it can be pasted into a message the user started
   themselves — which keeps their signature, as a mailto draft never
   does. */
export const copyTextFor = (g) =>
  `To: ${g.email}\nSubject: ${subjectFor(g)}\n\n${buildEmailBody(g)}`;
