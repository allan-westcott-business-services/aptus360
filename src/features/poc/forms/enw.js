import { esc, field, tick, wrapDocument, submitPayload } from "./shell.js";

/* Electricity North West \u2014 "Application for electricity connections".

   A print-faithful replica of the operator's own form, built as HTML.
   Geometry taken from the artwork: A4, content inset 28pt, the ENW red
   band across the head of page one, grey section bars, entry boxes on a
   20pt rhythm.

   Scope is the form itself. The guidance notes and worked examples that
   come with it are not reproduced: they are there to be read, not
   completed, and reproducing them would triple the page count of
   something that gets printed. */

export const ENW_SUBMIT_EMAIL = "connections@enwl.co.uk";
export const ENW_POST = [
  "Connections", "Electricity North West", "Borron Street",
  "Portwood", "Stockport", "SK1 2JD",
];

const RED = "#c8102e";

export const ENW_CSS = `
body { margin: 0; background: #e5e7eb; font-family: Arial, Helvetica, sans-serif;
  color: #111827; }
.pg { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff;
  padding: 28pt; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2);
  position: relative; }
.band { background: ${RED}; color: #fff; padding: 14pt 16pt; margin: -28pt -28pt 18pt;
  display: flex; align-items: baseline; justify-content: space-between; }
.band h1 { margin: 0; font-size: 17pt; font-weight: 700; letter-spacing: -.2pt; }
.band .op { font-size: 10pt; opacity: .9; }
.sec { background: #4b5563; color: #fff; font-size: 10pt; font-weight: 700;
  padding: 5pt 8pt; margin: 16pt 0 8pt; }
.sec:first-of-type { margin-top: 0; }
.note { font-size: 8.5pt; color: #4b5563; margin: 0 0 8pt; line-height: 1.45; }
table.f { width: 100%; border-collapse: collapse; font-size: 9pt; }
table.f th, table.f td { border: .75pt solid #9ca3af; padding: 4pt 6pt;
  vertical-align: top; }
table.f th { background: #f3f4f6; text-align: left; font-weight: 700; width: 34%; }
table.f td { min-height: 16pt; }
table.g { width: 100%; border-collapse: collapse; font-size: 9pt; margin-top: 4pt; }
table.g th, table.g td { border: .75pt solid #9ca3af; padding: 4pt 6pt; text-align: left; }
table.g th { background: #f3f4f6; font-weight: 700; }
table.g td.n { text-align: right; }
table.g tr.tot td { background: #f3f4f6; font-weight: 700; }
.tick { display: inline-block; width: 11pt; height: 11pt; border: .75pt solid #374151;
  text-align: center; line-height: 11pt; font-size: 9pt; margin-right: 5pt;
  vertical-align: -1pt; }
.opts { font-size: 9pt; line-height: 1.9; }
.opts label { margin-right: 16pt; white-space: nowrap; }
.dec { border: .75pt solid #9ca3af; padding: 8pt; font-size: 9pt; margin-top: 8pt; }
.sig { display: flex; gap: 16pt; margin-top: 14pt; }
.sig > div { flex: 1; }
.sig .line { border-bottom: .75pt solid #374151; height: 26pt; }
.sig .cap { font-size: 8pt; color: #4b5563; margin-top: 3pt; }
.foot { position: absolute; bottom: 14pt; left: 28pt; right: 28pt;
  font-size: 7.5pt; color: #6b7280; display: flex; justify-content: space-between;
  border-top: .5pt solid #d1d5db; padding-top: 4pt; }
.free { border: .75pt solid #9ca3af; min-height: 60pt; padding: 6pt; font-size: 9pt; }
`;

const foot = (n) =>
  `<div class="foot"><span>Electricity North West \u2014 Application for electricity connections</span>`
  + `<span>Page ${n} of 4</span></div>`;

const row = (label, value, extra = "") =>
  `<tr><th>${esc(label)}</th><td>${field(value, extra)}</td></tr>`;

/* ── Page 1: who is applying ───────────────────────────────────── */
function page1(d) {
  return `<div class="pg">
    <div class="band">
      <h1>Application for electricity connections</h1>
      <span class="op">Electricity North West</span>
    </div>

    <div class="sec">1. Applicant details</div>
    <table class="f">
      ${row("Company name", d.applicantCompany)}
      ${row("Contact name", d.applicantName)}
      ${row("Address", d.applicantAddress)}
      ${row("Email", d.applicantEmail)}
      ${row("Telephone", d.applicantPhone)}
      ${row("Your reference", d.projectRef)}
    </table>

    <div class="sec">2. Site details</div>
    <table class="f">
      ${row("Site name", d.siteName)}
      ${row("Site address", d.siteAddress)}
      ${row("Post code", d.postcode)}
      ${row("Easting", d.easting)}
      ${row("Northing", d.northing)}
    </table>
    <p class="note">A site location plan and a site layout plan must accompany
      this application. Without them the application cannot be progressed.</p>

    <div class="sec">3. Site contact</div>
    <p class="note">Who we should speak to about access and working on site,
      if different from the applicant.</p>
    <table class="f">
      ${row("Name", "")}
      ${row("Telephone", "")}
      ${row("Email", "")}
    </table>
    ${foot(1)}
  </div>`;
}

/* ── Page 2: what is being connected ───────────────────────────── */
function page2(d) {
  const num = (v) => (v === "" || v == null ? "" : String(v));
  return `<div class="pg">
    <div class="sec">4. Connection required</div>
    <div class="opts">
      <label>${tick(/new/i.test(d.connectionType))}New connection</label>
      <label>${tick(/alter|modif/i.test(d.connectionType))}Alteration to existing</label>
      <label>${tick(/disconnect/i.test(d.connectionType))}Disconnection</label>
      <label>${tick(/temp/i.test(d.connectionType))}Temporary supply</label>
    </div>

    <div class="sec">5. Load required</div>
    <p class="note">Domestic is the plot count and its share of the load.
      Commercial is taken from the non-residential supplies on this project.
      The total is the figure applied for.</p>
    <table class="g">
      <thead><tr><th>Connection type</th><th>Number of connections</th>
        <th>Load (kVA)</th></tr></thead>
      <tbody>
        <tr><td>Domestic</td>
          <td class="n">${field(num(d.domesticCount))}</td>
          <td class="n">${field(num(d.domesticKva))}</td></tr>
        <tr><td>Commercial / industrial</td>
          <td class="n">${field(num(d.commercialCount))}</td>
          <td class="n">${field(num(d.commercialKva))}</td></tr>
        <tr><td>Unmetered</td><td class="n">${field("")}</td>
          <td class="n">${field("")}</td></tr>
        <tr class="tot"><td>Total</td>
          <td class="n">${field(num(d.totalConnections))}</td>
          <td class="n">${field(num(d.totalKva))}</td></tr>
      </tbody>
    </table>

    ${d.nrs.length ? `
      <div class="sec">5a. Non-residential supplies</div>
      <table class="g">
        <thead><tr><th>Supply</th><th>Description</th><th>Load (kVA)</th></tr></thead>
        <tbody>${d.nrs.slice(0, 12).map((n, i) => `<tr>
          <td>${i + 1}</td>
          <td>${esc(n.Description ?? n.Supply_Name ?? n.Name ?? "")}</td>
          <td class="n">${esc(n.Load_kVA ?? "")}</td></tr>`).join("")}
        </tbody>
      </table>` : ""}

    <div class="sec">6. Supply characteristics</div>
    <table class="f">
      ${row("Phases required", "")}
      ${row("Maximum demand (kVA)", num(d.totalKva))}
      ${row("Metering position", "")}
      ${row("Any generation or storage on site", "")}
      ${row("Any motor starting loads", "")}
      ${row("Electric vehicle charging", "")}
      ${row("Heat pumps", "")}
    </table>
    ${foot(2)}
  </div>`;
}

/* ── Page 3: programme and adoption ────────────────────────────── */
function page3(d) {
  return `<div class="pg">
    <div class="sec">7. Programme</div>
    <table class="f">
      ${row("Date application made", d.applicationDate)}
      ${row("Date connection required on site", "")}
      ${row("Anticipated start on site", "")}
      ${row("Phasing (if the site is being built out in stages)", "")}
    </table>

    <div class="sec">8. Adoption</div>
    <p class="note">Where the network on site is to be adopted by an
      Independent Distribution Network Operator, name them here. Electricity
      North West will connect to the adopted network at the agreed point.</p>
    <table class="f">
      ${row("Adopting IDNO", d.idnoName)}
      ${row("Point of connection requested", "")}
    </table>

    <div class="sec">9. Land and access</div>
    <table class="f">
      ${row("Is the applicant the landowner", "")}
      ${row("Landowner name, if different", "")}
      ${row("Are wayleaves or easements required", "")}
      ${row("Any known site constraints", "")}
    </table>

    <div class="sec">10. Additional information</div>
    <div class="free" contenteditable="true">${esc(d.notes)}</div>
    ${foot(3)}
  </div>`;
}

/* ── Page 4: declaration and checklist ─────────────────────────── */
function page4(d) {
  return `<div class="pg">
    <div class="sec">11. Checklist</div>
    <p class="note">Applications arriving without these are held rather than
      progressed, so it is worth confirming each one before sending.</p>
    <div class="opts">
      <div><label>${tick(false)}Site location plan (1:1250 or similar)</label></div>
      <div><label>${tick(false)}Site layout plan showing plot numbering</label></div>
      <div><label>${tick(false)}Load schedule for non-residential supplies</label></div>
      <div><label>${tick(false)}Phasing plan, where the site is staged</label></div>
      <div><label>${tick(false)}Letter of authority, where acting for the landowner</label></div>
    </div>

    <div class="sec">12. Declaration</div>
    <div class="dec">
      I confirm that the information given in this application is correct to
      the best of my knowledge, and that I am authorised to make this
      application on behalf of the applicant named in section 1.
    </div>
    <div class="sig">
      <div><div class="line"></div><div class="cap">Signature</div></div>
      <div><div class="line">${field(d.applicantName)}</div>
        <div class="cap">Name in block capitals</div></div>
      <div><div class="line">${field("")}</div><div class="cap">Date</div></div>
    </div>

    <div class="sec">Where to send this application</div>
    <p class="note">
      Email: ${esc(ENW_SUBMIT_EMAIL)}<br>
      Post: ${ENW_POST.map(esc).join(", ")}
    </p>
    ${foot(4)}
  </div>`;
}

export function buildEnwDocument(d) {
  const ref = [d.projectRef, d.siteName].filter(Boolean).join(" \u2014 ");
  return {
    html: wrapDocument({
      title: "ENW Application for electricity connections" + (ref ? " \u2014 " + ref : ""),
      css: ENW_CSS,
      pages: page1(d) + page2(d) + page3(d) + page4(d),
    }),
    ref,
    provider: "ENW",
    providerTitle: "Electricity North West",
    submit: submitPayload(d, {
      to: ENW_SUBMIT_EMAIL,
      title: "Application for electricity connections",
      form: "ENW",
    }),
  };
}
