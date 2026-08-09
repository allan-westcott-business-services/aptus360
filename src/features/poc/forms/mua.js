import { esc, field, wrapDocument, submitPayload } from "./shell.js";

/* MUA (Murphy Utility Assets) — "Electricity Connection Application
   Form".

   Built against their own PDF: three pages, green #538136 table
   headings on black-ruled tables. Much plainer than the DNO forms —
   there are no tick boxes at all, only tables and free text.

   ── Keyed on the adopting IDNO ──

   This is the only form of the four that belongs to an IDNO rather than
   a distributor, so it is offered when MUA are adopting the network,
   not when they are distributing it. A POC naming a DNO for the
   connection and MUA for adoption legitimately needs this form and the
   DNO's, which is why the registry returns a list.

   ── The mua mark ──

   Not reproduced: no asset for it ships with this application. The
   version line and title are set as printed, and the top right is left
   for the mark. Send the artwork and it can be embedded the way the ENW
   one is. */

export const MUA_SUBMIT_EMAIL = "newconnection@muagroup.co.uk";
export const MUA_ADDRESS = "mua, Hiview House, Highgate Road, London NW5 1TN";
export const MUA_CONTACT =
  "T +44 (0)20 7267 4366 F +44 (0)20 7482 3107 E mail@muagroup.co.uk";
export const MUA_COMPANY = "Company No. 10588751 VAT No. 326953676";

export const MUA_CSS = `
body { margin: 0; background: #d5d5d5; color: #000;
  font-family: Arial, Helvetica, sans-serif; }
.pg { width: 210mm; min-height: 297mm; margin: 10px auto; background: #fff;
  padding: 12mm 14mm; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2);
  display: flex; flex-direction: column; }
.body { flex: 1; }

.ver { font-size: 9.5pt; }
.mark { text-align: right; font-size: 17pt; font-weight: 700; color: #538136;
  letter-spacing: -.5pt; line-height: 1; }
.mark small { display: block; font-size: 5.5pt; font-weight: 400; color: #7f7f7f;
  letter-spacing: 0; margin-top: .5mm; }
.top { display: flex; align-items: flex-start; justify-content: space-between; }
h1 { text-align: center; font-size: 15pt; font-weight: 700; margin: 3mm 0 5mm; }

/* Every block on this form is a table: a green heading row across the
   full width, then black-ruled rows beneath it. */
table.t { width: 100%; border-collapse: collapse; margin-bottom: 4mm;
  font-size: 10.5pt; }
table.t th.hd { background: #538136; color: #fff; font-weight: 700; text-align: center;
  padding: 1.6mm 2mm; border: .8pt solid #538136; }
table.t th, table.t td { border: .8pt solid #000; padding: 1.5mm 2.5mm;
  text-align: left; vertical-align: middle; }
table.t th.col { font-weight: 400; text-align: center; font-size: 10pt; }
table.t td.v { font-weight: 700; }
table.t td { height: 6.5mm; }

.bullets { font-size: 10.5pt; line-height: 1.5; margin: 0 0 3mm; padding-left: 7mm; }
.line { font-size: 10.5pt; margin: 0 0 3mm; }
.box { border: .8pt solid #000; padding: 2mm 2.5mm; font-size: 10.5pt;
  margin-bottom: 4mm; }
.box .q { margin: 0 0 1.5mm; }
.box .a { font-weight: 400; min-height: 12mm; }

.foot { text-align: center; font-size: 9.5pt; line-height: 1.5; margin-top: auto;
  padding-top: 6mm; }
.foot .pn { margin-top: 3mm; }

@media print {
  body { background: #fff; }
  .pg { box-shadow: none; margin: 0; }
  table.t th.hd { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const top = () =>
  `<div class="top"><span class="ver">Electricity connection Application Form V1.0</span>`
  + `<span class="mark">mua<small>Murphy Utility Assets</small></span></div>`
  + `<h1>Electricity Connection Application Form</h1>`;

const foot = (n) =>
  `<div class="foot">${esc(MUA_ADDRESS)}<br>${esc(MUA_CONTACT)}<br>${esc(MUA_COMPANY)}`
  + `<div class="pn">Page ${n} of 3</div></div>`;

const page = (body, n) => `<div class="pg"><div class="body">${top()}${body}</div>`
  + `${foot(n)}</div>`;

/* A label cell and a value cell, the pattern most of this form is made
   of. `span` is how many columns the value should cover. */
const kv = (label, value, span = 1) =>
  `<td>${esc(label)}</td><td class="v" colspan="${span}">${field(value)}</td>`;

/* ── Page 1: applicant, company, site, domestic connections ─────── */
function page1(d) {
  const a = String(d.applicantAddress || "").split(",").map((s) => s.trim()).filter(Boolean);
  const site = String(d.siteAddress || "").split(",").map((s) => s.trim()).filter(Boolean);

  /* One row per house type is what they send, and this database holds
     only a plot count and a total load. So the first row carries what
     is known — the count, the per-plot load, electric heating — and the
     rest are left ruled and empty for the mix to be typed in. Seven
     rows because that is what their form provides. */
  const perPlot = (Number(d.domesticKva) && Number(d.domesticCount))
    ? (Number(d.domesticKva) / Number(d.domesticCount)).toFixed(1) : "";
  const domesticRow = (first) =>
    `<tr><td class="v">${field(first ? d.domesticCount : "")}</td>`
    + `<td class="v">${field("")}</td><td class="v">${field("")}</td>`
    + `<td class="v">${field(first ? perPlot : "")}</td>`
    + `<td class="v">${field(first ? "Elec" : "")}</td></tr>`;

  return page(`
    <table class="t">
      <tr><th class="hd" colspan="4">Applicants Details:</th></tr>
      <tr>${kv("Your Reference No", d.siteName)}${kv("Our Ref", "")}</tr>
      <tr>${kv("Name:", d.applicantName, 3)}</tr>
      <tr>${kv("Tel:", d.applicantPhone)}${kv("Mobile:", d.applicantMobile)}</tr>
      <tr>${kv("Email:", d.applicantEmail, 3)}</tr>
    </table>

    <table class="t">
      <tr><th class="hd" colspan="4">Company Details</th></tr>
      <tr>${kv("Name", d.applicantCompany, 3)}</tr>
      <tr>${kv("Address", a[0] ?? "", 3)}</tr>
      <tr>${kv("Street:", a[1] ?? "", 3)}</tr>
      <tr>${kv("Town/City:", a.at(-1) ?? "", 3)}</tr>
      <tr>${kv("County:", "")}${kv("Post Code:", d.applicantPostcode)}</tr>
    </table>

    <table class="t">
      <tr><th class="hd" colspan="4">Site Address:</th></tr>
      <tr>${kv("Site Name:", d.siteName, 3)}</tr>
      <tr>${kv("Street name:", site[0] ?? "", 3)}</tr>
      <tr>${kv("Town/City:", site.slice(1).join(", "))}${kv("Post Code:", d.postcode)}</tr>
      <tr>${kv("Grid Reference (X; Y)",
    [d.easting, d.northing].filter(Boolean).join("; "), 3)}</tr>
    </table>

    <table class="t">
      <tr><th class="hd" colspan="5">Number and Type of Domestic Electricity
        Connections</th></tr>
      <tr>
        <th class="col" style="width:13%">No of Plots</th>
        <th class="col" style="width:26%">Property Type (Det/Semi/Ter/Flat etc)</th>
        <th class="col" style="width:15%">No of Bedrooms</th>
        <th class="col" style="width:16%">Load (kVA)</th>
        <th class="col">Heating Type (Gas/Elec/Other)</th>
      </tr>
      ${[true, false, false, false, false, false, false].map(domesticRow).join("")}
    </table>

    <table class="t">
      <tr><td style="width:38%">Do you require a Temp Supply?</td>
        <td class="v">${field("No")}</td></tr>
    </table>

    <div class="box">
      <p class="q">Please also provide details of any other loads such as: (Ground/Air
        Source Heat Pumps, Micro Generation, Car Chargers)</p>
      <div class="a">${field(d.idnoName
    ? `IDNO point of connection \u2014 asset to be adopted by: ${d.idnoName}`
    : "")}</div>
    </div>`, 1);
}

/* ── Page 2: commercial, EV, motors, declaration ────────────────── */
function page2(d) {
  /* Their commercial table takes one row per supply, so the project's
     non-residential supplies go in directly rather than being summed
     into a single line the way the DNO forms want them. */
  const supplies = (d.nrs || []).slice(0, 4);
  const commercialRow = (n, i) =>
    `<tr><td class="v">${field(n?.Description ?? n?.Supply_Name
      ?? (n ? `Commercial ${i + 1}` : ""))}</td>`
    + `<td class="v">${field("")}</td>`
    + `<td class="v">${field(n?.Load_kVA ?? "")}</td>`
    + `<td class="v">${field(n ? d.connectionDate : "")}</td></tr>`;
  const rows = [0, 1, 2, 3].map((i) => commercialRow(supplies[i], i)).join("");

  const blankRow = (cols) =>
    `<tr>${Array.from({ length: cols }, () => `<td class="v">${field("")}</td>`)
      .join("")}</tr>`;

  const today = new Date();
  const dmy = `${String(today.getDate()).padStart(2, "0")}/`
    + `${String(today.getMonth() + 1).padStart(2, "0")}/${today.getFullYear()}`;

  return page(`
    <table class="t">
      <tr><th class="hd" colspan="4">Number and Type of Commercial Electricity Connections
        including Landlord Supply</th></tr>
      <tr>
        <th class="col" style="width:30%">Plot Number/Name</th>
        <th class="col" style="width:22%">Single Phase or 3 Phase</th>
        <th class="col" style="width:20%">Load (kVA)</th>
        <th class="col">Date Connection Required</th>
      </tr>
      ${rows}
    </table>

    <table class="t">
      <tr><th class="hd" colspan="4">Number and Type of Electric Vehicle Chargers</th></tr>
      <tr>
        <th class="col">No of Chargers</th><th class="col">1Ph or 3Ph</th>
        <th class="col">Load (kVA)</th><th class="col">Date of Connection</th>
      </tr>
      ${blankRow(4)}${blankRow(4)}${blankRow(4)}
    </table>

    <table class="t">
      <tr><th class="hd" colspan="6">Motors or other Disturbing Loads</th></tr>
      <tr>
        <th class="col" style="width:24%">Use/Application</th>
        <th class="col">Rating (kW)</th><th class="col">Frequency of Start</th>
        <th class="col">1Ph or 3Ph</th><th class="col">Starting Method</th>
        <th class="col">Starting Current (Amps)</th>
      </tr>
      ${blankRow(6)}${blankRow(6)}${blankRow(6)}
    </table>

    <p class="line">Please provide:</p>
    <ul class="bullets">
      <li>A site plan showing the boundary of proposed development, with at least two street
        names, property schedule and correct number of connections.</li>
      <li>Latest location plans showing the correct site location.</li>
      <li>Preferred Point of Connection marked on site or location plan</li>
    </ul>
    <p class="line">Please send completed forms to ${esc(MUA_SUBMIT_EMAIL)}</p>

    <table class="t">
      <tr>${kv("Signature:", "")}${kv("Print Name:", d.applicantName)}</tr>
      <tr>${kv("Position:", "")}${kv("Date:", dmy)}</tr>
    </table>`, 2);
}

/* ── Page 3 ─────────────────────────────────────────────────────
   Their form runs to three pages and the last carries nothing but the
   letterhead. Reproduced so the page numbering on the printed pack
   matches theirs \u2014 a form that says "Page 2 of 3" and then stops
   looks like something failed to print. */
function page3() {
  return page("", 3);
}

export function buildMuaDocument(d) {
  const ref = [d.projectRef, d.siteName].filter(Boolean).join(" \u2014 ");
  return {
    html: wrapDocument({
      title: "MUA Electricity Connection Application Form" + (ref ? " \u2014 " + ref : ""),
      css: MUA_CSS,
      pages: page1(d) + page2(d) + page3(),
    }),
    ref,
    provider: "MUA",
    providerTitle: "MUA Group",
    submit: submitPayload(d, {
      to: MUA_SUBMIT_EMAIL,
      title: "Electricity Connection Application Form",
      form: "MUA",
    }),
  };
}
