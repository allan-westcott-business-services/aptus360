import { esc, field, wrapDocument, submitPayload } from "./shell.js";

/* Electricity North West — "Application for electricity connection
   (5 or more connections or single connection over 60kVA)".

   Rebuilt against the operator's own PDF rather than from a
   description, so this follows its three pages and its wording. The
   palette is sampled from the artwork: ENW green #7ac043, navy #00245d,
   and the pale green #e2efd5 the notes sit on.

   ── The shape of the thing ──

   Not a table of label/value rows. It is a run of green section bars
   with dotted rules under the entries, labels in navy at the left of a
   rule and the answer typed straight after them on the same line. Boxes
   are ticked, not filled. Getting that wrong is what made the first
   attempt unrecognisable.

   ── The ENW logo ──

   Not reproduced: it is their trade mark and no asset for it ships with
   this application. The navy header block it sits in is drawn, with
   their strapline set in text, so the page balances and prints without
   a hole in the corner. If somebody wants the exact mark, drop the
   artwork in and it can be embedded. */

export const ENW_SUBMIT_EMAIL = "connections@enwl.co.uk";

const TIMESCALES_URL =
  "http://www.enwl.co.uk/docs/default-source/connections/"
  + "guaranteed-standards-of-performance-for-connections-work.pdf?sfvrsn=8";
const HEATPUMP_URL = "www.energynetworks.org/electricity/futures/heat-pumps.html";
const GENERATION_URL =
  "www.enwl.co.uk/our-services/connection-services/distributed-generation";

export const ENW_CSS = `
body { margin: 0; background: #e5e7eb; color: #00245d;
  font-family: Arial, Helvetica, sans-serif; }
.pg { width: 210mm; min-height: 297mm; margin: 10px auto; background: #fff;
  padding: 12mm 10mm; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2); }

/* ── Header ── */
.hd { display: flex; justify-content: space-between; align-items: flex-start;
  margin-bottom: 7mm; }
.hd h1 { margin: 0; font-size: 25pt; font-weight: 400; line-height: 1.08;
  color: #00245d; letter-spacing: -.3pt; }
.hd .sub { margin: 2mm 0 0; font-size: 9pt; color: #00245d; }
.logo { width: 52mm; height: 26mm; background: #00245d; border-radius: 0 0 0 26mm;
  color: #fff; display: flex; flex-direction: column; align-items: center;
  justify-content: center; text-align: center; flex: none; }
.logo .nm { font-size: 12pt; font-weight: 700; line-height: 1.05; letter-spacing: -.2pt; }
.logo .tag { font-size: 6.5pt; margin-top: 1.5mm; opacity: .95; }

/* ── Bars ── */
.navy { background: #00245d; color: #fff; font-size: 9.5pt; padding: 1.4mm 3mm;
  display: flex; align-items: center; gap: 6mm; }
.navy .lbl { flex: 1; }
.grn { background: #7ac043; color: #fff; font-size: 10pt; padding: 1.3mm 3mm;
  margin-top: 2mm; display: flex; align-items: center; }
.grn .r { margin-left: auto; font-size: 9pt; }

/* ── Entries ── */
.ln { border-bottom: .6pt dotted #aeb4bf; padding: 1.1mm 3mm; font-size: 9.5pt;
  display: flex; align-items: baseline; gap: 2mm; min-height: 5mm; }
.ln .l { color: #00245d; white-space: nowrap; }
.ln .v { font-weight: 700; flex: 1; }
.ln.split { gap: 0; }
.ln.split > div { display: flex; align-items: baseline; gap: 2mm; }
.ln.split > div:first-child { flex: 1.15; }
.ln.split > div:last-child { flex: 1; }
.note { font-size: 7.5pt; font-weight: 700; padding: 1.5mm 3mm; line-height: 1.35; }
.note a { color: #00245d; }
.tint { background: #e2efd5; }
.bul { font-size: 7.5pt; padding: 1mm 3mm 1mm 7mm; line-height: 1.4; }
.bul li { margin-bottom: .8mm; }

/* ── Tick boxes ── */
/* Centred with flex rather than nudged with offsets: a tick that sits
   proud of its box is the first thing that looks wrong on a printed
   form, and hand-tuned offsets drift the moment the size changes. */
.bx { display: inline-flex; align-items: center; justify-content: center;
  width: 3mm; height: 3mm; border: .8pt solid #00245d; margin-right: 1.5mm;
  vertical-align: -.5mm; font-size: 7pt; font-weight: 700; line-height: 1;
  color: #00245d; }
.bx.on::after { content: "\\2713"; }
/* On the navy bar the boxes would otherwise be navy on navy. */
.navy .bx { border-color: #fff; color: #fff; }
.opt { display: flex; align-items: baseline; }
.opts { display: grid; grid-template-columns: 1fr 1fr; }
.opts > div { border-bottom: .6pt dotted #aeb4bf; padding: 1.1mm 3mm; font-size: 9.5pt; }

/* ── Tables ── */
table.ld { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 1mm; }
table.ld th, table.ld td { border-bottom: .6pt dotted #aeb4bf; padding: 1.3mm 3mm;
  text-align: left; vertical-align: bottom; }
table.ld th { font-weight: 400; color: #00245d; font-size: 8.5pt; }
table.ld td.v { font-weight: 700; }
table.ld tr.tot td { background: #e2efd5; font-weight: 700; }
table.gr { width: 100%; border-collapse: collapse; font-size: 8pt; margin-top: 1mm; }
table.gr th, table.gr td { border: .6pt solid #aeb4bf; padding: 1.2mm 2mm;
  text-align: left; }
table.gr th { background: #e2efd5; font-weight: 400; font-size: 7.5pt; line-height: 1.2; }
table.gr td { height: 6mm; font-weight: 700; }
`;

/* An entry: a label, then the answer on the same rule. */
const ln = (label, value, cls = "") =>
  `<div class="ln ${cls}"><span class="l">${esc(label)}</span>`
  + `<span class="v">${field(value)}</span></div>`;

/* Two entries sharing one rule, as the form does for
   landline/mobile and contact name/number. */
const split = (l1, v1, l2, v2) =>
  `<div class="ln split"><div><span class="l">${esc(l1)}</span>`
  + `<span class="v">${field(v1)}</span></div>`
  + `<div><span class="l">${esc(l2)}</span>`
  + `<span class="v">${field(v2)}</span></div></div>`;

const box = (on, label) =>
  `<span class="opt"><span class="bx${on ? " on" : ""}"></span>${label}</span>`;

/* ── Page 1 ─────────────────────────────────────────────────────── */
function page1(d) {
  const type = String(d.connectionType || "");
  const isNew = /new/i.test(type) || !type;
  /* An adopting IDNO on the application is what makes this an IDNO
     point of connection rather than a DNO-owned one. */
  const idno = !!d.idnoName;

  return `<div class="pg">
    <div class="hd">
      <div>
        <h1>Application for<br>electricity connection</h1>
        <p class="sub">(5 or more connections or single connection over 60kVA)</p>
      </div>
      <div class="logo">
        <span class="nm">electricity<br>north west</span>
        <span class="tag">Bringing energy to your door</span>
      </div>
    </div>

    <div class="navy">
      <span class="lbl">Preferred methods of communication:</span>
      ${box(false, "Phone")}${box(false, "SMS")}${box(true, "Email")}${box(false, "Post")}
    </div>

    <div class="grn">Applicant Details</div>
    ${ln("Company name / Contact name", d.applicantCompany)}
    ${ln("Address", d.applicantAddress)}
    ${ln("", "")}
    ${ln("Post Code", d.applicantPostcode)}
    ${split("Landline number", d.applicantPhone, "Mobile number", d.applicantMobile)}
    ${ln("Email address", d.applicantEmail)}
    <div class="note">If you are not the site manager/representative or will have a
      builder to manage your on-site activities, including the final connection please
      provide their details below:</div>
    ${split("Contact name", d.siteContactName, "Contact number", d.siteContactPhone)}
    ${split("Position / Role (i.e. Site Manager, Consultant, Project Manager)", "",
    "Email address", d.siteContactEmail)}

    <div class="grn">Site Details<span class="r">${box(false, "same as applicant")}</span></div>
    ${ln("Site Name / Address", d.siteName)}
    ${ln("", d.siteAddress)}
    ${split("Grid Reference or X (Eastings) & Y (Northings)",
    [d.easting, d.northing].filter(Boolean).join(", "), "Post Code", d.postcode)}
    <div class="note">You can convert a post code to a grid reference and / or put a pin
      on a map indicating your supply position and realise your X &amp; Y coordinates
      using websites such as http://www.gridreferencefinder.com or
      http://www.streetmap.co.uk</div>

    <div class="grn">Type of supply (please indicate the type of supply required)</div>
    <div class="opts">
      <div>${box(isNew, "New connection(s)")}</div>
      <div>${box(/additional/i.test(type), "Additional load to existing supply")}</div>
      <div>${box(/alteration|relocat/i.test(type),
    "Service alteration - relocation of an existing meter")}</div>
      <div>${box(/temporary/i.test(type), "Temporary supply")}</div>
      <div>${box(/re-?energise/i.test(type), "Re-energise existing supply")}</div>
      <div>${box(/diversion/i.test(type), "Diversion of an existing asset")}</div>
      <div>${box(!idno, "ICP Point of connection - new asset to be owned by DNO")}</div>
      <div>${box(idno, "IDNO Point of connection - new asset to be owned by IDNO")}</div>
    </div>
    ${ln("What date do you require the connection(s) to be made?", d.connectionDate)}

    <div class="grn">Quotation required (see guidance note for description)</div>
    <div class="opts" style="grid-template-columns:1fr 1fr 1fr;">
      <div>${box(true, "Firm")}</div>
      <div>${box(false, "Budget")}</div>
      <div>${box(false, "Feasibility")}</div>
    </div>
    <ul class="bul">
      <li>A full quote is where we carry out a full network study and provide you with a
        firm quote that you can accept. Connection Offer Expenses now apply to all 33kV
        and 132kV applications.</li>
      <li>A budget quote is where we provide you with a quick indicative price. With the
        option you will get a faster response compared to a firm quote, however we do not
        carry out a full and detailed network study and our budget quotes cannot be
        accepted as they are not firm offers.</li>
      <li>A feasibility study is a bespoke study tailored to your specific needs. We will
        work with you to provide you with the information you need, however this is not a
        firm quotation. There will be a upfront charge for this option. The costs will be
        advised upon your application.</li>
      <li>Details of our charges associated with the provision of quotations and estimates
        can be found in our Statement of Methodology and Charges for Connection to
        Electricity North West Limited&rsquo;s Electricity Distribution System</li>
    </ul>
    <div class="note">All of our timescales can be found on the link below, however we
      always work to exceed these timescales.<br>${esc(TIMESCALES_URL)}</div>

    <div class="grn">Load Details (please state maximum power required in kVA)</div>
    <table class="ld">
      <thead><tr><th style="width:26%"></th><th style="width:20%">Number of<br>Connections</th>
        <th style="width:20%">Load (kVA)</th><th>Comments</th></tr></thead>
      <tbody>
        <tr><td>Commercial</td><td class="v">${field(d.commercialCount)}</td>
          <td class="v">${field(d.commercialKva)}</td><td>${field("")}</td></tr>
        <tr><td>Domestic</td><td class="v">${field(d.domesticCount)}</td>
          <td class="v">${field(d.domesticKva)}</td><td>${field("")}</td></tr>
        <tr class="tot"><td>TOTAL</td><td class="v">${field(d.totalConnections)}</td>
          <td class="v">${field(d.totalKva)}</td><td></td></tr>
      </tbody>
    </table>

    <div class="note tint" style="margin-top:2mm;">Please note all of the information on
      this page is key to enable us to get your job raised. If you are struggling with any
      of the above please contact a member of our team who will be happy to help you with
      this to ensure there are no delays.</div>
  </div>`;
}

/* ── Page 2: heating, motors, vehicle chargers ──────────────────── */
function page2(d) {
  const blank = (n) => Array.from({ length: n }, () => `<td>${field("")}</td>`).join("");
  return `<div class="pg">
    <div class="grn">Heating type</div>
    <div class="ln"><span class="l">How will your property/ies be heated?</span>
      <span class="v">${box(false, "Electric")}&nbsp;&nbsp;${box(false, "Gas")}
      &nbsp;&nbsp;${box(false, "Other")}</span></div>
    <div class="note" style="font-weight:400;">(i.e. oil, off peak we storage,
      instantaneous wet central heating, etc)</div>

    <table class="gr">
      <thead><tr><th style="width:30%"></th><th>Number<br>per property</th>
        <th>kW per<br>Heater</th><th>kW Water<br>Heating</th>
        <th>Total kW rating<br>per property</th></tr></thead>
      <tbody>
        <tr><td>Electric Panel Heaters</td>${blank(4)}</tr>
        <tr><td>Off Peak Storage Heaters</td>${blank(4)}</tr>
      </tbody>
    </table>

    <table class="gr">
      <thead><tr><th style="width:30%"></th><th>Number<br>of Pumps</th>
        <th>kW per<br>Pump</th><th>Frequency of<br>starting per hour</th>
        <th>Starting<br>Current</th></tr></thead>
      <tbody>
        <tr><td>Air/Ground Source Heat Pump</td>
          <td>${field(d.heatPumpCount)}</td>${blank(3)}</tr>
      </tbody>
    </table>
    <div class="note">If you are installing Heat Pumps you will need to complete the
      relevant forms that can be found on ENA&rsquo;s website where you will need to
      complete one of the forms A, B or C, depending on the equipment you are installing
      ${esc(HEATPUMP_URL)}</div>
    <div class="note" style="font-weight:400;">If you don&rsquo;t know the full details,
      tell us what you know in the comments section and an engineer can discuss this with
      you when they are doing the network study.</div>

    <div class="grn">Motors</div>
    <table class="gr">
      <thead><tr><th>Single /<br>three phase</th><th>Number of<br>Motors</th>
        <th>kW rating of<br>largest Motor</th><th>Frequency of<br>starting per hour</th>
        <th>Starting Current<br>(Amps)</th></tr></thead>
      <tbody><tr>${blank(5)}</tr></tbody>
    </table>
    <div class="note" style="font-weight:400;">Normal domestic appliances and small motors
      (with an electrical input of less than 1.7 kVA) can be connected without the need for
      the details to be included as part of your application. Details of all other motors
      will be required. Please use an additional page if required, to give a full
      breakdown.</div>
    <div class="note" style="font-weight:400;">The information required for these motors
      will be: the electrical input power; the type of motor starting (e.g. star/delta;
      direct on line; soft start; etc); frequency of starting (how many times per hour will
      the motor be started).</div>
    <div class="note" style="font-weight:400;">If you don&rsquo;t know the full details, or
      have multiple different motors, provide what details you have in the comments section
      and an engineer can discuss this with you when they are doing the network study.</div>

    <div class="grn">Electric Vehicle Chargers</div>
    <table class="gr">
      <thead><tr><th>Number of chargers<br>per property</th><th>Single /<br>three phase</th>
        <th>Input<br>current</th><th>kW<br>rating</th>
        <th>Output AC<br>or DC</th></tr></thead>
      <tbody><tr>${blank(5)}</tr></tbody>
    </table>
    <div class="note">*Please include the make, model and specification of all of the
      chargers with this application</div>
  </div>`;
}

/* ── Page 3: generation ─────────────────────────────────────────── */
function page3() {
  return `<div class="pg">
    <div class="grn">Generation</div>
    <div class="ln"><span class="l">Will generation equipment be installed?</span>
      <span class="v">${box(false, "Yes")}&nbsp;&nbsp;${box(false, "No")}</span></div>
    <div class="note">If you ticked YES please fill in generation form (which can be found
      on our web page)</div>
    <div class="ln"><span class="l">If you ticked YES we have assumed you will be
      generating electricity back in to the network, if not please tick this box</span>
      <span class="v">${box(false, "")}</span></div>
    <div class="note">If you are installing Generation, please visit our website
      ${esc(GENERATION_URL)} for further guidance.</div>
  </div>`;
}

export function buildEnwDocument(d) {
  const ref = [d.projectRef, d.siteName].filter(Boolean).join(" \u2014 ");
  return {
    html: wrapDocument({
      title: "ENW Application for electricity connection" + (ref ? " \u2014 " + ref : ""),
      css: ENW_CSS,
      pages: page1(d) + page2(d) + page3(),
    }),
    ref,
    provider: "ENW",
    providerTitle: "Electricity North West",
    submit: submitPayload(d, {
      to: ENW_SUBMIT_EMAIL,
      title: "Application for electricity connection",
      form: "ENW",
    }),
  };
}
