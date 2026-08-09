/* The shell every operator form sits in.

   ── Why these are HTML documents and not PDFs ──

   There is no PDF library here and nothing is being filled in. The
   operators' own PDFs carry no form fields — checked, zero on all four —
   so there is nothing to populate, and at 1–3 MB each they are far too
   heavy to bundle just to draw text on top of. So each form is a
   print-faithful replica built as HTML, opened in its own window, and
   turned into a PDF by the browser's own print dialogue.

   That also makes the fields editable before printing, which matters:
   these applications always have a handful of things the database does
   not know, and the alternative is printing a form with gaps in it.

   ── Why a separate window rather than a component ──

   The replicas are laid out to match printed artwork — fixed page
   boxes, exact rules and tints. Rendered inside the application they
   would fight its stylesheet, and a stray global rule would silently
   move something on a form somebody then submits to a network operator.
   A self-contained document has nothing to fight. */

export const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* An editable field. `contenteditable` rather than an <input> so it
   prints as plain text with no control chrome, and wraps the way the
   surrounding artwork expects. */
export const field = (value, extra = "") =>
  `<span class="fld" contenteditable="true"${extra ? " " + extra : ""}>${esc(value)}</span>`;

export const tick = (on) => `<span class="tick">${on ? "\u2715" : ""}</span>`;

/* Only what the printed page needs. The chrome around it is React's. */
export const PRINT_CSS = `
.fld { display: inline-block; min-width: 40px; outline: 0; }
.fld:focus { background: #fef9c3; }
.fld:empty::after { content: ""; display: inline-block; min-width: 60px; }
@media print {
  .fld:focus { background: none; }
  @page { size: A4; margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .pg { box-shadow: none !important; margin: 0 !important; }
}
`;


/* Wraps a form's pages into a self-contained printable document.

   Nothing but the form: no toolbar, no script, no submit panel. Those
   are the application's job now and live in FormPreview.jsx.

   The document is rendered inside an iframe rather than a popup window.
   Popups are blocked by default in several browsers, and a blocked
   popup is indistinguishable from a button that does nothing — which
   is exactly how this first behaved. An iframe cannot be blocked, and
   it keeps the form isolated from the application's stylesheet, which
   was the reason for a separate document in the first place. */
export function wrapDocument({ title, css, pages }) {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>`
    + `<title>${esc(title)}</title>`
    + `<style>${css}${PRINT_CSS}</style></head><body>`
    + pages
    + `</body></html>`;
}

/* The covering email. Deliberately short: the form and the site plans
   are the submission, this is just what carries them. */
export function submitPayload(data, { to, title, form }) {
  const ref = [data.projectRef, data.siteName].filter(Boolean).join(" \u2014 ");
  return {
    to, form, pocId: data.pocId,
    subject: `${title}${ref ? " \u2014 " + ref : ""}`,
    body: [
      "Hello,",
      "",
      `Please find attached our application${ref ? " for " + ref : ""}.`,
      "",
      data.siteAddress ? `Site address: ${data.siteAddress}` : "",
      data.postcode ? `Post code: ${data.postcode}` : "",
      data.totalKva ? `Total load requested: ${data.totalKva} kVA` : "",
      "",
      "Site plans are attached alongside the application form.",
      "",
      "Kind regards,",
      data.applicantName || "",
      data.applicantCompany || "Aptus Utilities",
    ].filter((l) => l !== null && l !== undefined).join("\n"),
  };
}
