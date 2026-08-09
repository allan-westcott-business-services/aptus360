import { esc, field, wrapDocument, submitPayload } from "./shell.js";

/* Northern Powergrid — "Application for a new or modified electricity
   connection".

   Built against the operator's own PDF: ten pages, a cover of
   information requirements, a connection-type selector, then sections 1
   to 8. Palette sampled from the artwork: crimson #a20f33, grey #737373
   section bars, body text #231f20.

   ── Two field tints, and they mean something ──

   Northern Powergrid tint their required fields pink (#edd3dc) and
   leave optional ones grey (#e5e5e5). That is not decoration: it is how
   somebody completing the form knows what they cannot leave out, so the
   replica keeps it. `req()` and `opt()` below are the two.

   ── The email address ──

   Their form prints "northernpowergird.com" — the transposition is
   theirs, on the printed artwork. It is reproduced exactly on the page
   so the replica matches, but the covering email is addressed to the
   corrected spelling, because sending to the typo would bounce. */

/* As printed on their form, transposition and all. */
export const NPG_PRINTED_EMAIL = "cinc.connections@northernpowergird.com";
/* Where a message actually has to go. */
export const NPG_SUBMIT_EMAIL = "cinc.connections@northernpowergrid.com";
export const NPG_POST = [
  "Connection Input Services", "Northern Powergrid", "98 Aketon Road",
  "Castleford", "West Yorkshire WF10 5DS",
];
export const NPG_TEL = "0113 2415245";

export const NPG_CSS = `
body { margin: 0; background: #d5d5d5; color: #231f20;
  font-family: Arial, Helvetica, sans-serif; }
.pg { width: 210mm; min-height: 297mm; margin: 10px auto; background: #fff;
  box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2);
  display: flex; flex-direction: column; }
.body { flex: 1; padding: 5mm 7mm; }

/* Crimson running head, and the crimson help bar that closes every page. */
.head { background: #a20f33; color: #fff; padding: 3mm 7mm; display: flex;
  align-items: center; justify-content: space-between; }
.head .t { font-size: 10.5pt; font-weight: 700; }
.head.big { padding: 10mm 7mm 14mm; display: block; }
.head.big h1 { margin: 0; font-size: 21pt; font-weight: 700; line-height: 1.25;
  text-transform: uppercase; max-width: 120mm; }
.mark { text-align: right; line-height: 1; }
.mark .a { font-size: 12pt; letter-spacing: .2pt; }
.mark .b { font-size: 13pt; font-weight: 700; letter-spacing: -.2pt; }
.foot { background: #a20f33; color: #fff; padding: 3mm 7mm; font-size: 9pt;
  font-weight: 700; line-height: 1.5; }

/* Grey section bars. */
.sec { background: #737373; color: #fff; font-size: 10.5pt; font-weight: 700;
  padding: 2mm 4mm; margin: 0 0 3mm; }
.q { font-size: 9.5pt; margin: 0 0 1.5mm; line-height: 1.45; }
.q.b { font-weight: 700; }
.lb { font-size: 9pt; margin: 0 0 1mm; }
.info { font-size: 8.5pt; font-style: italic; color: #737373; margin: 1mm 0 2mm;
  line-height: 1.45; }
.crim { color: #a20f33; font-weight: 700; font-size: 10pt; margin: 0 0 2mm; }
.crimsm { color: #a20f33; font-size: 8pt; margin: 0 0 2mm; }
ul.reqs { font-size: 9pt; line-height: 1.5; margin: 0 0 3mm; padding-left: 6mm; }

/* The two tints. Pink is required, grey is optional — their convention. */
.f { min-height: 6.5mm; padding: 1.3mm 2mm; font-size: 9.5pt; font-weight: 700; }
.req { background: #edd3dc; }
.opt { background: #e5e5e5; }
.tall { min-height: 18mm; }
.taller { min-height: 40mm; }

.row { display: flex; gap: 3mm; margin-bottom: 2mm; }
.col { flex: 1; min-width: 0; }
.two { display: flex; gap: 6mm; }
.two > div { flex: 1; min-width: 0; }
.ask { display: flex; align-items: center; gap: 3mm; margin-bottom: 2mm; }
.ask .t { flex: 1; font-size: 9.5pt; }
.rule { border: 0; border-top: .8pt solid #d4d4d4; margin: 4mm 0; }

/* Tick boxes: real inputs so they can be corrected before printing. */
.ck { appearance: none; -webkit-appearance: none; margin: 0 2mm 0 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 4.2mm; height: 4.2mm; background: #e5e5e5; border: 0;
  vertical-align: -1mm; font: 700 9pt/1 Arial, Helvetica, sans-serif;
  color: #a20f33; cursor: pointer; flex: none; }
.ck:checked { background: #fff; box-shadow: inset 0 0 0 .8pt #a20f33; }
.ck:checked::after { content: "\\2713"; }
.ck:focus-visible { outline: 1.5pt solid #a20f33; outline-offset: .5pt; }
.pick { display: inline-flex; align-items: center; cursor: pointer;
  font-size: 9.5pt; margin-right: 6mm; }
.picks { display: flex; flex-wrap: wrap; gap: 1mm 0; margin-bottom: 2mm; }
.big-pick { display: flex; align-items: flex-start; cursor: pointer;
  font-size: 10.5pt; font-weight: 700; margin-bottom: .5mm; }
.big-pick .ck { width: 5.5mm; height: 5.5mm; background: #fff;
  box-shadow: inset 0 0 0 .8pt #a20f33; }

table.g { width: 100%; border-collapse: separate; border-spacing: 2mm 1.5mm;
  font-size: 9.5pt; }
table.g th { font-weight: 400; text-align: center; font-size: 9pt; }
table.g td.lbl { text-align: left; width: 30%; }
.mpan { display: flex; gap: 1.2mm; }
.mpan .mp { flex: 1 1 0; min-width: 0; }
/* Thirteen across the page: the default padding would push the last two
   off the edge, where they are simply not there to write in. */
.mpan .f { padding: 1.3mm .5mm; min-height: 6.5mm; }

@media print {
  body { background: #fff; }
  .pg { box-shadow: none; margin: 0; }
  .ck { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .ck:focus-visible { outline: 0; }
}
`;

const mark = () =>
  `<div class="mark"><div class="a">NORTHERN</div><div class="b">POWERGRID</div></div>`;

const head = () =>
  `<div class="head"><span class="t">APPLICATION FOR A NEW OR MODIFIED `
  + `ELECTRICITY CONNECTION</span>${mark()}</div>`;

const foot = () =>
  `<div class="foot">If you need any help we are available Monday - Friday, `
  + `08:45 - 16:45<br>\u260E ${esc(NPG_TEL)}</div>`;

/* A page: running head, body, crimson help bar. */
const page = (body) => `<div class="pg">${head()}<div class="body">${body}</div>${foot()}</div>`;

/* Required (pink) and optional (grey) fields — their own convention. */
const req = (v = "", cls = "") => `<div class="f req ${cls}">${field(v)}</div>`;
const opt = (v = "", cls = "") => `<div class="f opt ${cls}">${field(v)}</div>`;

const labelled = (label, box) => `<div class="col"><p class="lb">${esc(label)}</p>${box}</div>`;

const ck = (on, label, cls = "pick") =>
  `<label class="${cls}"><input type="checkbox" class="ck"${on ? " checked" : ""}>`
  + `<span>${label}</span></label>`;

/* On these right-aligned pairs the word comes before its box \u2014 "Yes
   [x]  No [ ]" \u2014 which is the opposite way round to the boxes inside
   a section, where the box leads. Their form does both. */
const ckAfter = (on, label) =>
  `<label class="pick"><span style="margin-right:2mm;">${label}</span>`
  + `<input type="checkbox" class="ck" style="margin:0;"${on ? " checked" : ""}></label>`;

const yesNo = (text, yes) =>
  `<div class="ask"><span class="t">${text}</span>`
  + `${ckAfter(yes === true, "Yes")}${ckAfter(yes === false, "No")}</div>`;

/* ── Page 1: cover ──────────────────────────────────────────────── */
function page1() {
  const li = (xs) => `<ul class="reqs">${xs.map((x) => `<li>${x}</li>`).join("")}</ul>`;
  return `<div class="pg">
    <div class="head big"><h1>Application for a new or modified electricity
      connection</h1>${mark()}</div>
    <div class="body">
      <p class="crim">Completing this form accurately will help us process your
        application as quickly as possible.</p>
      <p class="crimsm">To help you with completing this form we have listed our
        information requirements below:</p>

      <p class="crim">Minimum Information</p>
      ${li([
    "Customer name and address (correspondence address), and contact details",
    "Site address/location",
    "Site plan at an appropriate scale that indicates the site boundary (typically "
      + "outlined with a red line), and the proposed location of a substation(s) if applicable",
    "The service required",
    "Date when the connection(s) are to be made",
    "Total maximum capacity (kVA/MVA) requirement (import and/or export)",
    "Technical details of any electricity generator or storage device",
    "Technical details of any equipment that is likely to cause disturbance",
    "Any payment that is required to be made in advance for the service to be provided.",
  ])}

      <p class="crim">In addition, for Generation Applications of 1MW or above and Demand
        Applications of 5MVA or above</p>
      ${li([
    "Letter of authority where the applicant is acting as an agent of the Customer.",
    "Where the applicant is not the existing owner/leaseholder of the site, an "
      + "appropriately signed agreement of Heads of Terms for the land indicated on the "
      + "site plan (red line boundary).",
    "Single line diagram of any existing and/or proposed electrical plant (for Demand "
      + "Applications this is only required where there is customer owned equipment likely "
      + "to cause disturbance).",
    "A preliminary project timeline.",
    "Detailed engineering design plan for the entire site, clearly showing the location "
      + "of key infrastructure and connection points (for generation only)",
  ])}

      <p class="crim">Additional information - providing this at application stage may
        prevent delays producing your quotation</p>
      ${li([
    "If you are acting as an agent applying on behalf of the owner/occupier (or future "
      + "owner/occupier) of the site address, then you are required to provide a letter of "
      + "authority",
    "Type of connection i.e. domestic, commercial or industrial",
    "For domestic premises; what type i.e. houses, flats",
    "Total number of connections/plots",
    "Confirmation of who will be adopting the network",
    "Number of phases; i.e. single or three phase",
    "Preferred connection voltage",
    "Security of supply i.e. firm/un-firm",
    "Type and total of heating",
    "Motor &amp; welder details",
    "If there is a Northern Powergrid substation on site that you require moving, you "
      + "need to tell us as part of your application and provide a plan showing a new "
      + "substation position.",
  ])}
    </div>
    <div class="foot" style="padding:5mm 7mm;">
      <div style="font-size:14pt;margin-bottom:2mm;">Return this form:</div>
      \u2709 email: ${esc(NPG_PRINTED_EMAIL)}<br>
      \u2709 post: ${NPG_POST.join(", ")}<br><br>
      If you need any help we are available Monday - Friday, 08:45 - 16:45<br>
      \u260E ${esc(NPG_TEL)}
    </div>
  </div>`;
}

/* ── Page 2: which connection type ──────────────────────────────── */
function page2(d) {
  const idno = !!d.idnoName;
  const note = (t) => `<p class="crimsm" style="margin-left:8mm;">${t}</p>`;
  return page(`
    <p class="crim" style="font-size:11pt;">Please select the connection type you require -
      if you are applying for more than one connection type, please use separate forms</p>

    ${ck(true, "Point of Connection (POC) only", "big-pick")}
    ${note("please complete sections 1, 2, 3, 4, 5, 7, 8")}

    <div class="two"><div>${ck(false, "POC requote", "big-pick")}</div>
      <div class="ask"><span class="t">Please provide previous ENQ</span></div></div>
    ${note("please complete sections 1, 2c, 8 - all other details must be identical to "
    + "the original application")}

    ${ck(false, "Self Determined POC part A notice", "big-pick")}
    ${note("please complete sections 1, 2, 4, 7, 8")}

    <div class="two"><div>${ck(false, "Self Determined POC part B issue", "big-pick")}</div>
      <div class="row"><div style="padding-top:1mm;">ENQ</div><div class="col">${opt()}</div></div></div>
    ${note("please complete sections 1a, 8")}

    <div class="two"><div>${ck(false, "Self Determined POC part C acceptance", "big-pick")}</div>
      <div class="row"><div style="padding-top:1mm;">ENQ</div><div class="col">${opt()}</div></div></div>
    ${note("please complete sections 1a, 8 and include your design submission checklist")}

    ${ck(false, "Self service metered", "big-pick")}
    ${note("please complete sections 1, 2, 6, 7, 8 and quantity of connections below:")}
    <div class="row"><div style="padding-top:1mm;">New</div><div class="col">${opt()}</div>
      <div style="padding-top:1mm;">Disconnection</div><div class="col">${opt()}</div>
      <div class="col"></div></div>

    ${ck(false, "Self service unmetered", "big-pick")}
    ${note("please complete sections 1, 2, 7, 8 and quantity of connections below:")}
    <div class="row"><div style="padding-top:1mm;">New</div><div class="col">${opt()}</div>
      <div style="padding-top:1mm;">Transfer</div><div class="col">${opt()}</div>
      <div style="padding-top:1mm;">Disconnection</div><div class="col">${opt()}</div></div>

    <div class="two"><div>${ck(false, "Additional load", "big-pick")}</div>
      <div class="ask"><span class="t">Please provide previous ENQ</span></div></div>
    ${note("please complete sections 1, 2, 4, 8 - this must be received from the IDNO")}

    <p class="crim" style="margin-top:4mm;">Please tick the quotation type you would like</p>
    ${ck(false, "Budget estimate", "big-pick")}
    ${ck(true, "Formal quotation", "big-pick")}

    <div class="ask" style="margin-top:4mm;">
      <span class="t crim" style="margin:0;">Will you be appointing an IDNO?</span>
      ${ck(idno, "Yes")}${ck(!idno, "No")}
    </div>
    <p class="q">If yes, please provide the details of the IDNO</p>
    ${opt(d.idnoName)}

    <div class="ask" style="margin-top:4mm;">
      <span class="t">All connection offers will be issued by email, if you would like a
        copy by post, please tick here:</span>${ck(false, "")}
    </div>`);
}

/* ── Page 3: section 1, your details ────────────────────────────── */
function page3(d) {
  const nm = String(d.applicantName || "").trim().split(/\s+/);
  const first = nm.slice(0, -1).join(" ");
  const last = nm.length > 1 ? nm.at(-1) : "";
  const a = String(d.applicantAddress || "").split(",").map((s) => s.trim()).filter(Boolean);
  /* Their address block is three free lines, so the parts are spread
     across them rather than guessed into named fields. */
  const line = (n) => (n === 0 ? a.slice(0, 2).join(", ")
    : n === 1 ? (a[2] ?? "") : a.slice(3).join(", "));

  return page(`
    <div class="sec">Section 1 - Your Details (the applicant)</div>
    <p class="q">1a. Applicant details</p>
    <div class="two">
      <div>
        <div class="row">
          <div style="flex:0 0 32mm;"><p class="lb">Title</p>${req()}</div>
          ${labelled("First Name", req(first))}
        </div>
        <p class="lb">Last Name</p>${req(last)}
        <p class="lb" style="margin-top:2mm;">Email</p>${req(d.applicantEmail)}
        <p class="lb" style="margin-top:2mm;">Mobile</p>${req(d.applicantMobile)}
      </div>
      <div>
        <p class="lb">Address</p>${req(line(0))}
        <div style="margin-top:2mm;">${req(line(1))}</div>
        <div style="margin-top:2mm;">${req(line(2))}</div>
        <p class="lb" style="margin-top:2mm;">Postcode</p>
        <div style="width:45%;">${req(d.applicantPostcode)}</div>
      </div>
    </div>

    <hr class="rule">
    <p class="q">1b. Owner/Occupier details</p>
    ${yesNo("Are you applying as an agent on behalf of the owner/occupier of the premises?", true)}
    <p class="info">\u24D8 If you are acting as an agent applying on behalf of the
      owner/occupier (or future/owner/occupier) of the site address then you are required to
      provide a letter of authority (example can be found in the appendix section of this
      form)</p>
    <div class="two">
      <div>
        <div class="row">
          <div style="flex:0 0 32mm;"><p class="lb">Title</p>${opt()}</div>
          ${labelled("First Name", opt())}
        </div>
        <p class="lb">Last Name</p>${opt()}
        <p class="lb" style="margin-top:2mm;">Email</p>${opt()}
        <p class="lb" style="margin-top:2mm;">Mobile</p>${opt()}
      </div>
      <div>
        <p class="lb">Address</p>${opt()}
        <div style="margin-top:2mm;">${opt()}</div>
        <div style="margin-top:2mm;">${opt()}</div>
        <p class="lb" style="margin-top:2mm;">Postcode</p>
        <div style="width:45%;">${opt()}</div>
      </div>
    </div>
    ${yesNo("Is the owner/occupier a local authority?", false)}

    <p class="q" style="margin-top:3mm;">1c. How would you like us to refer to your
      project? e.g. <i>Project123</i></p>
    ${opt(d.siteName)}

    <p class="q" style="margin-top:3mm;">1d. Please provide the end users Meter Point
      Administration Number (MPAN)<br><i>This will start with 15 or 23</i></p>
    <div class="mpan">${Array.from({ length: 13 }, () => `<div class="mp">${opt()}</div>`).join("")}</div>`);
}

/* ── Page 4: section 2, your connection ─────────────────────────── */
function page4(d) {
  /* Their form asks for the month and year separately. */
  const dt = String(d.connectionDate || "");
  const m = dt.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  const month = m ? m[2] : "";
  const year = m ? m[3] : "";
  const site = String(d.siteAddress || "").split(",").map((s) => s.trim()).filter(Boolean);

  return page(`
    <div class="sec">Section 2 - Your Connection</div>
    <p class="q">2a. Site Address</p>
    <p class="lb">Property name/number</p>${req(d.siteName)}
    <p class="lb" style="margin-top:2mm;">Street</p>${req(site[0] ?? "")}
    <p class="lb" style="margin-top:2mm;">Town</p>${req(site.slice(1).join(", "))}
    <p class="lb" style="margin-top:2mm;">Postcode</p>${req(d.postcode)}

    <p class="q" style="margin-top:4mm;">2b. Who will be invoiced for the Connection Offer
      Expenses (COE)?</p>
    <p class="lb">Name</p>${opt()}
    <p class="lb" style="margin-top:2mm;">Company</p>${opt(d.applicantCompany)}
    <p class="lb" style="margin-top:2mm;">Address</p>${opt(d.applicantAddress)}
    <p class="lb" style="margin-top:2mm;">Postcode</p>${opt(d.applicantPostcode)}

    <p class="q" style="margin-top:4mm;">2c. Your connection details</p>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">When would you like your
        connection to be made?</div>
      <div style="padding-top:1.5mm;">Month</div>
      <div style="flex:0 0 28mm;">${req(month)}</div>
      <div style="padding-top:1.5mm;">Year</div>
      <div style="flex:0 0 28mm;">${req(year)}</div>
    </div>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">What is the total load
        required for your connection? kVA</div>
      <div style="flex:0 0 60mm;">${req(d.totalKva)}</div>
    </div>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">How many domestic
        connections will be required on your site?</div>
      <div style="flex:0 0 60mm;">${opt(d.domesticCount)}</div>
    </div>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">How many non-domestic
        connections will be required on your site?</div>
      <div style="flex:0 0 60mm;">${opt(d.commercialCount)}</div>
    </div>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">Do you have single or
        multiple entry/exit points?</div>
      <div style="flex:0 0 60mm;">${opt()}</div>
    </div>
    <p class="info">\u24D8 If multiple, a clear phasing plan must be provided for the
      complete development (example can be found in the appendix section of this form)</p>
    <div class="row">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">If applying for an
        additional load, what is your current load amount? kVA</div>
      <div style="flex:0 0 60mm;">${opt()}</div>
    </div>
    ${yesNo("Do you require Northern Powergrid to complete the final closing joints?", true)}`);
}

/* ── Page 5: section 3a–3c, electrical equipment ────────────────── */
function page5(d) {
  const gridRow = (label, qty) =>
    `<tr><td class="lbl">${esc(label)}</td><td>${opt(qty)}</td><td>${opt()}</td>`
    + `<td>${opt()}</td><td>${opt()}</td></tr>`;

  return page(`
    <div class="sec">Section 3 - Electrical Equipment</div>
    <p class="q">3a. Will you be installing any electric heating - including water heaters
      and electric heaters?</p>
    <div class="picks">${ck(true, "Yes")}${ck(false, "No go to section 3b")}</div>
    <table class="g">
      <thead><tr><th></th><th>QTY</th><th>Load (kW)</th><th>Make</th><th>Model</th></tr></thead>
      <tbody>
        ${gridRow("Water heaters", "")}
        ${gridRow("Storage heaters", "")}
        ${gridRow("Heat pump", d.heatPumpCount)}
      </tbody>
    </table>
    <p class="info">\u24D8 If you are installing more than one type of pump, please use the
      additional information space at the end of this sheet<br>
      If the equipment used does not comply with BS-EN 61000/3/2 and 61000/3/3 harmonics
      information will be required</p>

    <p class="q" style="margin-top:3mm;">3b. Will you be installing any motors - including
      those used for compressor driven air conditioners?</p>
    <div class="picks">${ck(false, "Yes")}${ck(true, "No go to section 3c")}</div>
    <div class="two">
      <div>
        <div class="row"><div style="flex:0 0 20mm;padding-top:1.5mm;">Type</div>
          <div class="col">${opt()}</div></div>
        <div class="row"><div style="flex:0 0 20mm;padding-top:1.5mm;">Phase</div>
          <div class="col">${ck(false, "Single")}${ck(false, "Three")}</div></div>
      </div>
      <div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Starting Current
          (amps)</div><div style="flex:0 0 50mm;">${opt()}</div></div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Rating (kW)</div>
          <div style="flex:0 0 50mm;">${opt()}</div></div>
      </div>
    </div>
    ${yesNo("Does the motor start more than once per hour?", false)}
    <div class="row"><div class="col"></div><div style="flex:0 0 40mm;">${opt()}</div>
      <div style="flex:0 0 60mm;padding-top:1.5mm;">If yes, how many times per hour?</div></div>
    <p class="info">\u24D8 If you are installing more than one type of motor, please use the
      additional information space at the end of this sheet</p>

    <p class="q" style="margin-top:3mm;">3c. Will you be installing any welders?</p>
    <div class="picks">${ck(false, "Yes")}${ck(true, "No go to section 3d")}</div>
    <div class="two">
      <div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Input voltage
          (volts)</div><div style="flex:0 0 45mm;">${opt()}</div></div>
        <div class="row"><div style="flex:0 0 20mm;padding-top:1.5mm;">Phase</div>
          <div class="col">${ck(false, "Single")}${ck(false, "Three")}</div></div>
      </div>
      <div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Welds per minute</div>
          <div style="flex:0 0 50mm;">${opt()}</div></div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Rating (kW)</div>
          <div style="flex:0 0 50mm;">${opt()}</div></div>
      </div>
    </div>
    <p class="info">\u24D8 If you are installing more than one type of welder, please use the
      additional information space at the end of this sheet</p>
    <p class="q">Please provide any additonal details</p>
    ${opt("", "tall")}`);
}

/* ── Page 6: section 3d–3f ──────────────────────────────────────── */
function page6() {
  return page(`
    <p class="q">3d. Will you be installing any electric vehicle chargers?</p>
    <div class="picks">${ck(false, "Yes")}${ck(true, "No - Go to section 3e")}</div>
    <div class="two">
      <div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Technology type</div>
          <div style="flex:0 0 45mm;">${opt()}</div></div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">EV charge point
          manufacturer</div><div style="flex:0 0 45mm;">${opt()}</div></div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">EV charge point
          model</div><div style="flex:0 0 45mm;">${opt()}</div></div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Model in ENA
          database</div><div style="flex:0 0 45mm;">${opt()}</div></div>
      </div>
      <div>
        <div class="row"><div class="col" style="padding-top:1.5mm;">Rating (amps)</div>
          <div style="flex:0 0 45mm;">${opt()}</div></div>
      </div>
    </div>
    <div class="row"><div style="flex:0 0 20mm;padding-top:1.5mm;">Phase</div>
      <div class="col">${ck(false, "Single")}${ck(false, "Three")}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;">Number being installed with
      the same specification</div><div style="flex:0 0 35mm;">${opt()}</div></div>
    <p class="info">\u24D8 If you are installing more than one type of EVCP, please use the
      additional information space at the end of this sheet</p>

    <p class="q" style="margin-top:3mm;">3e. Will you be installing any equipment causing
      harmonic distortion?</p>
    <div class="picks">${ck(false, "Yes")}${ck(true, "No go to section 3f")}</div>
    <p class="q">Please provide details of equipment that will affect the harmonics of your
      supply</p>
    ${opt("", "taller")}

    <p class="q" style="margin-top:4mm;">3f. Please provide any additional details</p>
    ${opt("", "taller")}`);
}

/* ── Page 7: sections 4, 5, 6 ───────────────────────────────────── */
function page7(d) {
  const idno = !!d.idnoName;
  return page(`
    <div class="sec">Section 4 - Generation</div>
    <p class="q">4a. Will you be installing any generation?</p>
    <div style="display:flex;flex-direction:column;gap:1mm;margin-bottom:2mm;">
      ${ck(false, "Yes (if over 1MW, please complete the ENA G99 application form)")}
      ${ck(true, "No - Go to section 5")}
    </div>
    <p class="q">4b. Please confirm that this will be for standby purposes only?</p>
    <div class="picks">${ck(false, "Yes")}${ck(false, "No - Go to section 5")}</div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">4c. What
      type of generation are you planning to install?</div>
      <div style="flex:0 0 70mm;">${opt()}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">4d. What
      will be the maximum power export? kVA</div>
      <div style="flex:0 0 70mm;">${req()}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">4e. What
      will be the maximum power import? kVA</div>
      <div style="flex:0 0 70mm;">${req(d.totalKva)}</div></div>

    <div class="sec" style="margin-top:5mm;">Section 5 - Temporary Connection</div>
    ${yesNo("Do you need a temporary connection?", false)}
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">5a. What is
      your temporary connection for?</div><div style="flex:0 0 70mm;">${opt()}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">5b. What is
      the total capacity for your temporary connection? kVA</div>
      <div style="flex:0 0 70mm;">${opt()}</div></div>
    <p class="info">\u24D8 A temporary connection associated with a point of connection will
      be included within one quotation unless you have requested otherwise.<br>
      An early build request will be processed separately to the main POC.</p>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">5c. Length
      of time the connection is required for:</div>
      <div style="flex:0 0 70mm;">${opt()}</div></div>

    <div class="sec" style="margin-top:5mm;">Section 6 - Linkbox</div>
    <p class="q">6a. Please select one of the following options:</p>
    <div style="display:flex;flex-direction:column;gap:1.5mm;">
      ${ck(idno, "IDNO/ICP requires a link box which will become the property of the IDNO")}
      ${ck(false, "IDNO/ICP does not require a link box, and it will become the property of "
    + "the DNO after installation")}
      ${ck(!idno, "Not applicable")}
    </div>`);
}

/* ── Page 8: section 7a–7f, land rights and planning ────────────── */
function page8() {
  const detail = (q) => `<p class="q">${q}</p>`
    + `<div class="picks">${ck(false, "Yes &ndash;<i>Provide details below</i>")}`
    + `${ck(false, "No")}</div>${opt("", "tall")}`;

  return page(`
    <div class="sec">Section 7 - Land rights &amp; planning</div>
    <p class="q">7a. Please provide details of your planning permission relating to your
      premises</p>
    <div style="margin-left:5mm;">
      ${yesNo("Planning application required", false)}
      ${yesNo("Full planning permission received", false)}
    </div>
    <div class="ask">
      <span class="t">7b. Are Wayleaves required?</span>
      ${ckAfter(false, "Yes")}${ckAfter(false, "No")}${ckAfter(true, "Don&rsquo;t know")}
    </div>

    <p class="q" style="margin-top:3mm;">7c. Please provide details of any affected
      landowners where applicable for our wayleave officer to obtain access rights for
      Northern Powergrid adopted assets</p>
    <p class="lb">Name</p>${opt()}
    <p class="lb" style="margin-top:2mm;">Email</p>${opt()}
    <p class="lb" style="margin-top:2mm;">Address</p>${opt()}
    <div class="row" style="margin-top:2mm;">
      ${labelled("Postcode", opt())}${labelled("Phone", opt())}
    </div>

    ${detail("7d. Is the site classed as a site of specific interest or listed under any "
    + "classification e.g. historical site, conservation area, listed building?")}
    ${detail("7e. Are there any trees or hedges on the site that are protected by "
    + "preservation orders?")}
    ${detail("7f. Are there any existing water courses, culverts or drainage ditches in or "
    + "adjacent to the site?")}`);
}

/* ── Page 9: section 7g–7i ──────────────────────────────────────── */
function page9(d) {
  return page(`
    <p class="q">7g. Does the site contain any substances hazardous to health or the
      environment e.g. asbestos, hydrocarbons?</p>
    <div class="picks">${ck(false, "Yes &ndash;<i>Provide details below</i>")}
      ${ck(false, "No")}</div>
    ${opt("", "tall")}

    <p class="q" style="margin-top:4mm;">7h. What is the likelihood of flooding from rivers
      and the sea in your development?</p>
    <div class="picks">${ck(false, "Low")}${ck(false, "Medium")}${ck(false, "High")}</div>

    <p class="q" style="margin-top:3mm;">7i. Please provide any other details you feel are
      relevant to your application</p>
    <div class="f opt" style="min-height:110mm;">${field(d.notes)}</div>`);
}

/* ── Page 10: section 8, declaration ────────────────────────────── */
function page10(d) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, "0");
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  return page(`
    <div class="sec">Section 8 - Check you have provided everything</div>
    <div style="display:flex;flex-direction:column;gap:2mm;margin-bottom:5mm;">
      ${ck(true, "Site plan at an appropriate scale that indicates the site boundary "
    + "(example can be found in the appendix to this form)")}
      ${ck(true, "Run sheet / whereabouts")}
      ${ck(true, "Letter of authority if required")}
    </div>

    <p class="q">The applicant must sign this section (the person named in section 1)</p>
    <div class="row" style="margin-top:4mm;">
      <div class="col" style="padding-top:1.5mm;font-size:9.5pt;">Signature of applicant</div>
      <div style="flex:0 0 110mm;">${opt("", "taller")}</div>
    </div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">Print
      name</div><div style="flex:0 0 110mm;">${opt(d.applicantName)}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">Position in
      company</div><div style="flex:0 0 110mm;">${opt()}</div></div>
    <div class="row"><div class="col" style="padding-top:1.5mm;font-size:9.5pt;">Date</div>
      <div style="flex:0 0 110mm;">${opt(`${dd}/${mm}/${today.getFullYear()}`)}</div></div>`);
}

export function buildNpgDocument(d) {
  const ref = [d.projectRef, d.siteName].filter(Boolean).join(" \u2014 ");
  return {
    html: wrapDocument({
      title: "Northern Powergrid application for a new or modified electricity connection"
        + (ref ? " \u2014 " + ref : ""),
      css: NPG_CSS,
      pages: page1() + page2(d) + page3(d) + page4(d) + page5(d) + page6()
        + page7(d) + page8() + page9(d) + page10(d),
    }),
    ref,
    provider: "NPg",
    providerTitle: "Northern Powergrid",
    submit: submitPayload(d, {
      to: NPG_SUBMIT_EMAIL,
      title: "Application for a new or modified electricity connection",
      form: "NPG",
    }),
  };
}
