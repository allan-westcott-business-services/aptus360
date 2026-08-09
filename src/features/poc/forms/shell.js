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

export const TOOLBAR_CSS = `
.tb { position: sticky; top: 0; z-index: 50; display: flex; align-items: center;
  gap: 12px; flex-wrap: wrap; padding: 10px 16px; background: #1f2937; color: #fff;
  font: 500 13px system-ui, sans-serif; }
.tb .ttl { font-weight: 700; }
.tb .hint { opacity: .75; font-weight: 400; font-size: 12px; }
.tb .sp { flex: 1; }
.tb button { font: 600 12.5px inherit; border: 0; border-radius: 6px; padding: 7px 13px;
  cursor: pointer; }
.tb .pr { background: #2563eb; color: #fff; }
.tb .sb { background: #059669; color: #fff; }
.tb .cl { background: rgba(255,255,255,.16); color: #fff; }
.tb button:disabled { opacity: .5; cursor: default; }

.sbp { display: none; padding: 14px 18px; background: #ecfdf5; border-bottom: 1px solid #a7f3d0;
  font: 400 13px system-ui, sans-serif; color: #064e3b; }
.sbp.on { display: block; }
.sbp h3 { margin: 0 0 6px; font-size: 14px; }
.sbp code { background: rgba(0,0,0,.06); padding: 1px 5px; border-radius: 4px; }
.sbp .act { margin-top: 10px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.sbp .go { background: #059669; color: #fff; border: 0; border-radius: 6px;
  padding: 7px 13px; font: 600 12.5px inherit; cursor: pointer; }
.sbp .no { background: #fff; color: #065f46; border: 1px solid #a7f3d0; border-radius: 6px;
  padding: 7px 13px; font: 600 12.5px inherit; cursor: pointer; }
.sbp .st { font-size: 12px; }

.fld { display: inline-block; min-width: 40px; outline: 0; }
.fld:focus { background: #fef9c3; }
.fld:empty::after { content: ""; display: inline-block; min-width: 60px; }

@media print {
  .no-print { display: none !important; }
  .fld:focus { background: none; }
  @page { size: A4; margin: 0; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/* Wraps a form's pages in the toolbar, the submit panel and the script
   that drives them.

   The submit flow is honest about what it cannot do: a mailto cannot
   attach anything, so it says to save the PDF first and attach it. Once
   the email is open it posts a message back to the application, which
   records the submission — and if that window has been closed since,
   it says so rather than quietly doing nothing. */
export function wrapDocument({
  title, heading, ref, css, pages, provider, providerTitle, submit, offices,
}) {
  const officeSelect = offices
    ? `<div style="margin-top:8px;">Regional office:
         <select onchange="setOffice(this)" style="font:inherit;padding:4px 8px;border-radius:6px;border:1px solid #a7f3d0;">
           ${Object.keys(offices).map((k) =>
    `<option value="${esc(offices[k].email)}">${esc(k)}</option>`).join("")}
         </select></div>`
    : "";

  /* The closing script tag is split so this string cannot terminate the
     script block of whatever bundles it. */
  /* `<` is escaped rather than merely stringified. JSON.stringify happily
     produces the characters `</script>` inside a string value, and the
     HTML parser ends the script block there — it does not care that it
     is inside JavaScript quotes. A site called "</script>..." would
     therefore break the form and put whatever followed into the page as
     live markup. \u003c is the same character to JavaScript and inert
     to the parser. */
  const script = `
    var SUB = ${JSON.stringify(submit).replace(/</g, "\\u003c")};
    function showSubmit(){ document.getElementById('sbp').classList.add('on'); }
    function hideSubmit(){ document.getElementById('sbp').classList.remove('on'); }
    function setOffice(sel){
      SUB.to = sel.value;
      document.getElementById('sbto').textContent = sel.value;
    }
    function doSubmit(){
      var st = document.getElementById('sbst');
      window.location.href = 'mailto:' + encodeURIComponent(SUB.to)
        + '?subject=' + encodeURIComponent(SUB.subject)
        + '&body=' + encodeURIComponent(SUB.body);
      st.textContent = 'Email opened \\u2014 recording in Aptus360\\u2026';
      var op = null;
      try { op = window.opener; } catch (e) { op = null; }
      if (op && !op.closed) {
        op.postMessage({ type: 'poc:formSubmitted', pocId: SUB.pocId, form: SUB.form }, '*');
        window.addEventListener('message', function (e) {
          if (!e.data || e.data.type !== 'poc:formSubmitted:done') return;
          st.textContent = e.data.ok
            ? 'Recorded in Aptus360 as submitted.'
            : 'Email opened, but Aptus360 could not be updated \\u2014 set the submitted date on the POC yourself.';
          var b = document.getElementById('sbbtn');
          if (b && e.data.ok) { b.disabled = true; b.textContent = 'Submitted'; }
        });
      } else {
        st.textContent = 'Email opened. The Aptus360 window has closed, so record the submission there yourself.';
      }
    }
  <\/script>`;

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/>`
    + `<title>${esc(title)}</title>`
    + `<style>${css}${TOOLBAR_CSS}</style></head><body>`
    + `<div class="tb no-print">`
    + `<span class="ttl">${heading}</span>`
    + (ref ? `<span class="hint">${esc(ref)}</span>` : "")
    + `<span class="sp"></span>`
    + `<span class="hint">Fields are editable \u2014 fill in anything missing, then print.</span>`
    + `<button class="pr" onclick="window.print()">Print / Save as PDF</button>`
    + `<button class="sb" id="sbbtn" onclick="showSubmit()">Submit to ${esc(provider)}</button>`
    + `<button class="cl" onclick="window.close()">Close</button>`
    + `</div>`
    + `<div class="sbp no-print" id="sbp">`
    + `<h3>Submit to ${esc(providerTitle || provider)}</h3>`
    + `<div>Email cannot attach the form for you. Save it first with `
    + `<strong>Print / Save as PDF</strong>, then attach that PDF \u2014 along with `
    + `your site plans \u2014 to the message that opens.</div>`
    + officeSelect
    + `<div style="margin-top:6px;">Goes to <code id="sbto">${esc(submit.to)}</code>. `
    + `Aptus360 will record the application as submitted.</div>`
    + `<div class="act"><button class="go" onclick="doSubmit()">Open email</button>`
    + `<button class="no" onclick="hideSubmit()">Cancel</button>`
    + `<span class="st" id="sbst"></span></div>`
    + `</div>`
    + pages
    + `<script>${script}`
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
