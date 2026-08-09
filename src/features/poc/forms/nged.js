import { esc, field, wrapDocument, submitPayload } from "./shell.js";

/* National Grid Electricity Distribution — "Application for a
   competitive network connection".

   Built against the operator's own PDF: six pages, sections A to L,
   their wording and their palette (navy #28338c on the #e9e9e9 panel,
   entry boxes outlined #a8adc6).

   ── The shape ──

   Unlike the ENW form, this one is boxes rather than rules: a label
   above a white entry box, laid out in rows of two or three. Section
   headers are full-width navy bars, and each section ends with a
   right-aligned "Proceed to section X".

   ── Three regional offices ──

   Where a completed form goes depends on the region, and the form
   prints all three. The office picker in the preview chooses which one
   the covering email is addressed to; Midlands is first because it is
   first on their form, not because it is a default anybody chose. */

export const NGED_OFFICES = {
  "Midlands": {
    email: "nged.newsuppliesmids@nationalgrid.co.uk",
    post: ["National Grid Electricity Distribution", "Records Team", "3rd Floor",
      "Toll End Road", "Tipton", "DY4 0HH"],
    tel: "0121 623 9007",
  },
  "South Wales": {
    email: "nged.newsupplieswales@nationalgrid.co.uk",
    post: ["National Grid Electricity Distribution", "Records Team", "Phoenix Way",
      "Llansamlet", "Swansea", "SA7 9HW"],
    tel: "0179 278 4509",
  },
  "South West": {
    email: "nged.newsupplies@nationalgrid.co.uk",
    post: ["National Grid Electricity Distribution", "Records Team",
      "Lostwithiel Road", "Bodmin", "PL31 1DE"],
    tel: "0120 889 2288",
  },
};

export const NGED_CSS = `
body { margin: 0; background: #d5d5d5; color: #28338c;
  font-family: Arial, Helvetica, sans-serif; }
.pg { width: 210mm; min-height: 297mm; margin: 10px auto; background: #fff;
  padding: 10mm 12mm; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,.2); }

h1 { margin: 4mm 0 5mm; font-size: 22pt; font-weight: 700; line-height: 1.12; }
.run { display: flex; justify-content: space-between; align-items: baseline;
  font-size: 10pt; font-weight: 700; margin-bottom: 3mm; }
.intro { display: flex; gap: 6mm; align-items: flex-start; margin-bottom: 4mm; }
.intro .l { flex: 1; font-size: 8.5pt; line-height: 1.5; }
.intro .l b { display: block; margin-bottom: 1mm; }
.intro .l p { margin: 0 0 2.5mm; }
.aside { width: 58mm; flex: none; background: #e9e9e9; padding: 3mm;
  font-size: 8pt; line-height: 1.45; }

/* Section bars and the grey panel each section sits on. */
.sec { background: #28338c; color: #fff; font-size: 10.5pt; font-weight: 700;
  padding: 2mm 4mm; }
.panel { background: #e9e9e9; padding: 4mm; margin-bottom: 5mm; }
.sub { font-size: 10pt; font-weight: 700; margin: 0 0 1.5mm; }
.sub:not(:first-child) { margin-top: 4mm; }
.hint { font-size: 8.5pt; margin: 0 0 2mm; line-height: 1.45; }
.small { font-size: 7.5pt; line-height: 1.4; margin: 1mm 0 0; }
.next { text-align: right; font-size: 9pt; font-weight: 700; margin: 3mm 0 0; }
.rule { border: 0; border-top: .8pt solid #a8adc6; margin: 4mm 0 3mm; }

/* Entry boxes: a label above a white box. */
.row { display: flex; gap: 3mm; margin-bottom: 2.5mm; }
.fl { flex: 1; min-width: 0; }
.fl > label { display: block; font-size: 8.5pt; margin-bottom: 1mm; }
.bxin { background: #fff; border: .8pt solid #a8adc6; min-height: 7mm;
  padding: 1.4mm 2mm; font-size: 9.5pt; font-weight: 700; }
.tall { min-height: 14mm; }

/* Tick boxes: real inputs, so they can be corrected before printing. */
.ck { appearance: none; -webkit-appearance: none; margin: 0 1.8mm 0 0;
  display: inline-flex; align-items: center; justify-content: center;
  width: 3.6mm; height: 3.6mm; border: .8pt solid #28338c; background: #fff;
  vertical-align: -.7mm; font: 700 8pt/1 Arial, Helvetica, sans-serif;
  color: #28338c; cursor: pointer; flex: none; }
.ck:checked::after { content: "\\2713"; }
.ck:focus-visible { outline: 1.5pt solid #28338c; outline-offset: .5pt; }
.opt { display: inline-flex; align-items: flex-start; cursor: pointer;
  font-size: 9pt; margin-right: 6mm; }
.opt span { max-width: 62mm; }
.opts { display: flex; flex-wrap: wrap; gap: 1mm 0; margin: 1mm 0 2mm; }
.two { display: flex; gap: 6mm; }
.two > div { flex: 1; min-width: 0; }
.choice { font-size: 9pt; line-height: 1.45; }
.choice b { font-weight: 700; }

table.pr { width: 100%; border-collapse: collapse; font-size: 9pt; }
table.pr th, table.pr td { border: .8pt solid #a8adc6; padding: 1.6mm 2mm;
  text-align: left; background: #fff; }
table.pr th { background: #e9e9e9; font-weight: 400; font-size: 8.5pt; }
table.pr td { height: 7mm; font-weight: 700; }

.offices { display: flex; gap: 4mm; font-size: 8pt; line-height: 1.5; }
.offices > div { flex: 1; }
.offices b { display: block; font-size: 9pt; margin-bottom: 1mm; }

@media print {
  body { background: #fff; }
  .pg { box-shadow: none; margin: 0; }
  .ck { -webkit-print-color-adjust: exact; print-color-adjust: exact;
    border-color: #28338c !important; }
  .ck:focus-visible { outline: 0; }
}
`;

/* A labelled entry box. */
const fl = (label, value = "", cls = "") =>
  `<div class="fl"><label>${esc(label)}</label>`
  + `<div class="bxin ${cls}">${field(value)}</div></div>`;

const ck = (on, label) =>
  `<label class="opt"><input type="checkbox" class="ck"${on ? " checked" : ""}>`
  + `<span>${label}</span></label>`;

const next = (s) => `<p class="next">Proceed to section ${s}</p>`;
const runner = () =>
  `<div class="run"><span>Application for a competitive network connection</span>`
  + `<span>See guidance booklet</span></div>`;

/* NGED asks for an address in parts and this database keeps one string,
   so the last two comma-separated pieces are offered as town and city
   and the rest as the building. It is a guess, it is right for most
   addresses written the usual way, and every box is editable — which is
   the only reason a guess is acceptable here at all. */
function splitAddress(address) {
  const parts = String(address || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return { building: parts.join(", "), town: "", city: "" };
  return {
    building: parts.slice(0, -2).join(", "),
    town: parts.at(-2),
    city: parts.at(-1),
  };
}

/* An address block, used for both the customer and the representative. */
function addressBlock(d, name = { first: "", last: "" }) {
  const a = splitAddress(d.applicantAddress);
  return `
    <div class="row">
      ${fl("Title:")}${fl("First name:", name.first)}${fl("Last name:", name.last)}
    </div>
    <div class="row">
      ${fl("Company (if applicable):", d.applicantCompany)}
      ${fl("Company registered number (if applicable):")}
    </div>
    <div class="row">
      ${fl("House/flat number:")}${fl("Building name:", a.building)}${fl("Street:")}
    </div>
    <div class="row">
      ${fl("Town:", a.town)}${fl("City:", a.city)}${fl("Postcode:", d.applicantPostcode)}
    </div>
    <div class="row">
      ${fl("Daytime telephone:", d.applicantPhone)}${fl("Mobile:", d.applicantMobile)}
      ${fl("Email:", d.applicantEmail)}
    </div>`;
}

/* ── Page 1: section A ──────────────────────────────────────────── */
function page1(d) {
  const nm = String(d.applicantName || "").trim().split(/\s+/);
  const rep = { first: nm.slice(0, -1).join(" "), last: nm.length > 1 ? nm.at(-1) : "" };

  return `<div class="pg">
    <h1>Application for a competitive<br>network connection</h1>
    <div class="intro">
      <div class="l">
        <b>Suitable for;</b>
        <p>Request for connection installation by an ICP for adoption by NGED.
          Request to connect an embedded network.</p>
        <p>On receipt of your application and all relevant information, we will provide
          you with a quotation for the works which will include costs for the
          non-contestable works and any agreed contestable works.</p>
      </div>
      <div class="aside">If you have any queries about your application or require a copy
        of this form in large print, braille, on audiotape, in Welsh, in another language,
        or in any other format, please contact us.</div>
    </div>

    <div class="sec">Section A &ndash; your details</div>
    <div class="panel">
      <p class="sub">1. Customer address details</p>
      <p class="hint">Please provide details of the customer who will be responsible for
        accepting and paying for any connection offer issued.</p>
      ${addressBlock(d)}

      <p class="sub">2. Site address details</p>
      <p class="hint">The location of the new connection(s)</p>
      <div class="row">${fl("Site name/plot numbers:", d.siteName)}</div>
      <div class="row">
        ${fl("House/flat number:")}${fl("Building name:")}${fl("Street:", d.siteAddress)}
      </div>
      <div class="row">
        ${fl("Town:")}${fl("City:")}${fl("Postcode:", d.postcode)}
      </div>
      <div class="row">${fl("To help us locate your site please include the address of "
    + "any adjacent properties:")}</div>

      <p class="sub">3. Representative details</p>
      <p class="hint">With your consent we can liaise with a contractor, supplier or agent
        acting on your behalf.<br>If you want to nominate a representative please complete
        the details below</p>
      ${addressBlock(d, rep)}
      ${next("B")}
    </div>
  </div>`;
}

/* ── Page 2: sections B, C, D ───────────────────────────────────── */
function page2(d) {
  /* An adopting IDNO makes this an embedded network rather than a
     connection NGED will adopt. Same fact that drives the ENW form's
     point-of-connection boxes. */
  const idno = !!d.idnoName;

  return `<div class="pg">
    ${runner()}
    <div class="sec">Section B &ndash; type of connection offer required</div>
    <div class="panel">
      <p class="sub">Do you require an indicative Budget Estimate or a firm connection offer?</p>
      <div class="two">
        <div class="choice">${ck(true, "<b>Connection Offer:</b> A connection offer is a "
    + "quotation which will set out detailed terms and conditions and once accepted will "
    + "be binding on both parties.")}</div>
        <div class="choice">${ck(false, "<b>Budget Estimate:</b> A Budget Estimate is "
    + "non-binding for indicative purposes only. This is useful at the early stages of a "
    + "project, if you have not got final plans in place or a firm date in mind for the "
    + "works.")}</div>
      </div>
      <div class="two" style="margin-top:3mm;">
        <div class="choice">${ck(false, "<b>Draw Down Connection Offer:</b> A Connection "
    + "Offer which seeks to draw down from capacity which has previously been reserved for "
    + "the Development Area. If you are not the Capacity Customer, please provide a Letter "
    + "of Authority giving their consent for this application to utilise the reserved "
    + "capacity.")}</div>
        <div>${fl("Please provide the NGED reference for the Reservation of Capacity "
    + "Agreement:")}</div>
      </div>
      <div class="two" style="margin-top:3mm;">
        <div>
          <p class="sub">When would you like us to provide the connection(s)?</p>
          <p class="hint">Once you accept the Connection Offer we will contact you to agree
            dates which take account of team availability and Local Authority streetworks
            requirements:</p>
        </div>
        <div>${fl("DD/MM/YY", d.connectionDate)}</div>
      </div>
      ${next("C")}
    </div>

    <div class="sec">Section C &ndash; responsibilities for inclusion in the connection offer</div>
    <div class="panel">
      <p class="hint">To ensure we provide you with the most accurate quotation, it is
        important that we understand the extent to which you require services to be
        provided by NGED. Please indicate who will be undertaking each of the following
        activities:</p>
      <div class="two">
        <div>
          <p class="sub">Design and self-approval of the POC to NGED&rsquo;s existing network</p>
          <div class="opts">${ck(false, "NGED")}${ck(true, "ICP")}</div>
          <p class="small">You must be signed up to NGED&rsquo;s Framework and POC Extension
            of Contestability Agreement and hold the relevant network design authorisations</p>
        </div>
        <div>
          <p class="sub">Design approval of downstream assets to be adopted by NGED</p>
          <div class="opts">${ck(false, "NGED")}${ck(true, "ICP")}</div>
          <p class="small">You must have achieved design self-approval</p>
        </div>
      </div>
      <div class="two" style="margin-top:3mm;">
        <div>
          <p class="sub">Obtaining legals permissions and consents:</p>
          <div class="opts">${ck(false, "NGED")}${ck(true, "ICP")}</div>
        </div>
        <div>
          <p class="sub">Completion of energising connection to NGED&rsquo;s network:</p>
          <div class="opts">${ck(true, "NGED")}${ck(false, "ICP")}</div>
        </div>
      </div>
      <div class="two" style="margin-top:3mm;">
        <div>
          <p class="sub">Ownership of the constructed network:</p>
          <div class="opts">${ck(false, "NGED")}${ck(true, "ICP")}</div>
        </div>
        <div>${fl("Please enter the IDNO name (if known)", d.idnoName)}</div>
      </div>
      ${next("D")}
    </div>

    <div class="sec">Section D &ndash; type of connections required</div>
    <div class="panel">
      <div class="two">
        <div>
          <p class="sub">New connections</p>
          <p class="hint">Confirm the type of property requiring a new connection:</p>
          <div style="display:flex;flex-direction:column;gap:1mm;">
            ${ck(!idno, "Installation of connections for adoption by NGED")}
            ${ck(idno, "Connection of an embedded (IDNO) network")}
          </div>
          <p class="small">Please enter the connections to be installed, including those to
            be adopted by an IDNO, in sections E and F below.</p>
        </div>
        <div>
          <p class="sub">Total site capacity</p>
          <p class="hint">Please enter the total import and export capacity required</p>
          <div class="row">${fl("Import kVA", d.totalKva)}${fl("Export kVA")}</div>
        </div>
      </div>
      <hr class="rule">
      <div class="two">
        <div>
          <p class="sub">Temporary supply</p>
          <p class="hint">Will a temporary supply be required?</p>
          <div class="opts">${ck(false, "Yes")}${ck(true, "No")}</div>
          <p class="hint">Please enter your maximum power requirement of the temporary supply</p>
          ${fl("Power requirement kVA")}
        </div>
        <div>
          <p class="hint" style="margin-top:6mm;">Type of temporary supply</p>
          <div class="opts">${ck(false, "Single phase")}${ck(false, "Three phase")}</div>
        </div>
      </div>
      ${next("E")}
    </div>
  </div>`;
}

/* ── Page 3: sections E and F ───────────────────────────────────── */
function page3(d) {
  /* Per-property load, which the form asks for and this database keeps
     only in total. Two decimal places because that is what their own
     completed forms carry, and a rounded figure invites a query. */
  const perPlot = (Number(d.domesticKva) && Number(d.domesticCount))
    ? (Number(d.domesticKva) / Number(d.domesticCount)).toFixed(2) : "";

  return `<div class="pg">
    ${runner()}
    <div class="sec">Section E &ndash; domestic connections</div>
    <div class="panel">
      <div class="two">
        <div>
          <p class="hint">How many connections are required?</p>
          ${fl("", d.domesticCount)}
        </div>
        <div>
          <p class="hint">Power requirement:<br>The normal maximum capacity for individual
            domestic properties is 18.4kVA. If you require a different maximum power for
            each property please enter the kVA value here.</p>
          ${fl("kVA", perPlot)}
        </div>
      </div>
      <p class="sub">Landlord supplies:</p>
      <p class="hint">Will any landlord&rsquo;s supplies be required?</p>
      <div class="opts">${ck(false, "Yes")}${ck(false, "No")}</div>
      <div class="row">
        ${fl("Number of landlord supplies")}
        ${fl("Please enter your maximum power requirement for each landlords supply in kVA")}
      </div>
      <p class="hint">Do you require your connection to accommodate motors, welders,
        electric vehicles or other disturbing equipment?</p>
      <div class="opts">${ck(false, "Yes (Proceed to section G)")}
        ${ck(true, "No (Proceed to section H)")}</div>
      ${next("F")}
    </div>

    <div class="sec">Section F &ndash; business premises</div>
    <div class="panel">
      <div class="two">
        <div>
          <p class="hint">How many connections are required?</p>
          ${fl("", d.commercialCount)}
        </div>
        <div>
          ${fl("Maximum power requirement for each connection kVA", d.commercialKva)}
        </div>
      </div>
      <div class="two">
        <div>${fl("Please enter your maximum business premises power requirement, after "
    + "diversity is applied (kVA)", d.commercialKva)}</div>
        <div>${fl("If your enquiry is for an increase in power, please state the existing "
    + "load (kVA)")}</div>
      </div>
      <p class="small">If power requirements differ significantly between supplies please
        provide more details in section L &ndash; additional information</p>
      <p class="small"><b>Power guidelines:</b> An 80 amp single phase supply can provide up
        to 18kVA. A 100 amp three phase supply can provide up to 69kVA.</p>
      <hr class="rule">
      <p class="sub">Earthing</p>
      <p class="hint">Earthing for connections to be adopted by NGED. However, some methods
        of building do not allow this means of earthing, in particular multi-occupancy steel
        framed buildings. In such cases alternative earthing solutions can be provided by
        your electrical contractor.</p>
      <p class="hint">Is your building steel framed and subdivided into units?</p>
      <div class="opts">${ck(false, "Yes")}${ck(false, "No")}</div>
      <p class="hint">Do you require your connection to accommodate motors, welders,
        electric vehicles or other disturbing equipment?</p>
      <div class="opts">${ck(false, "Yes (Proceed to section G)")}
        ${ck(true, "No (Proceed to section H)")}</div>
      ${next("G")}
    </div>
  </div>`;
}

/* ── Page 4: sections G and H ───────────────────────────────────── */
function page4() {
  return `<div class="pg">
    ${runner()}
    <div class="sec">Section G &ndash; disturbing loads</div>
    <div class="panel">
      <p class="hint">If you are connecting any electrical equipment which may cause a
        disturbance on the electricity system (e.g. motors, welders), please provide us with
        details. Note: upon assessment we may need more detailed information. If required,
        we will send you the appropriate data collection form for completion.</p>
      <p class="sub">Motors</p>
      <div class="opts">${ck(false, "Single phase")}${ck(false, "Three phase")}
        ${ck(false, "Direct online")}${ck(false, "Star delta")}</div>
      <div class="row">${fl("Starting current (Amps)")}${fl("Number of starts per hour")}</div>
      <p class="sub">Welders</p>
      <div class="opts">${ck(false, "Single phase")}${ck(false, "Three phase")}</div>
      <div class="row">${fl("Input voltage")}${fl("Rating")}
        ${fl("Number of welds per minute")}</div>
      <p class="hint" style="margin-top:3mm;">Do you require electric vehicle charging or
        heat pump installation?</p>
      <div class="two">
        <div class="opts">${ck(true, "No")}${ck(false, "Yes")}</div>
        <div class="small">Please enclose with this application a completed ENA Application
          for the Installation of Low Carbon Technologies, available to download at
          nationalgrid.co.uk/evhp</div>
      </div>
      ${fl("Other potentially disturbing equipment (please provide details)", "", "tall")}
      ${next("H")}
    </div>

    <div class="sec">Section H &ndash; details of electrical load</div>
    <div class="panel">
      <p class="sub">Space heating:</p>
      <p class="hint">To help plan for your connection, please indicate below the fuel type
        to be used:</p>
      <div class="opts">${ck(false, "Gas")}${ck(false, "Electric (storage &amp; direct)")}
        ${ck(false, "Electric boiler")}${ck(false, "Ground/air source heat pump")}
        ${ck(false, "Other (please specify)")}</div>
      <p class="small">For electric boilers and heat pumps, please include the
        manufacturer&rsquo;s specification sheet.</p>
      <p class="small">*Off-peak means the heating that can only operate during a
        pre-arranged time (usually 7 hours) in the range of hours 23:00&ndash;07:00 and is
        usually controlled by a time-switch.</p>
      <div class="row">
        ${fl("For electric storage heating, total off-peak* load is (kW)")}
        ${fl("For electric direct heating, total load is (kW)")}
      </div>
      <p class="sub">Water Heating:</p>
      <p class="hint">To help plan for your connection, please indicate below the fuel type
        to be used:</p>
      <div class="opts">${ck(false, "Gas")}${ck(false, "Electric (storage &amp; direct)")}
        ${ck(false, "Electric boiler")}${ck(false, "Ground/air source heat pump")}
        ${ck(false, "Other (please specify)")}</div>
      <div class="row">
        ${fl("Electric showers: Number of instantaneous showers")}
        ${fl("Shower size (kW each)")}
      </div>
      ${next("I")}
    </div>
  </div>`;
}

/* ── Page 5: sections I and J ───────────────────────────────────── */
function page5() {
  const yearRow = (y) =>
    `<tr><th style="width:16%">${y}</th><td>${field("")}</td><td>${field("")}</td>`
    + `<td>${field("")}</td></tr>`;

  return `<div class="pg">
    ${runner()}
    <div class="sec">Section I &ndash; generation</div>
    <div class="panel">
      <p class="hint">Will there be any on site electricity generation?<br>
        For ER G99 compliant installations, please enclose the relevant G99 application form
        with this application</p>
      <div class="opts">${ck(false, "Yes (please provide details below)")}
        ${ck(true, "No (proceed to Section J)")}</div>
      <p class="hint">Please indicate the type of generation you are installing</p>
      <div class="opts">${ck(false, "Solar panels")}${ck(false, "Wind")}
        ${ck(false, "Battery storage")}</div>
      <div class="row">${fl("Other (please specify)")}
        ${fl("Please provide the proposed generation capacity (kW)")}</div>
      <p class="hint">Will the generators be capable of operating in parallel with National
        Grid Electricity Distribution&rsquo;s system?</p>
      <div class="opts">${ck(false, "Yes")}${ck(false, "No")}</div>
      <p class="small">Please visit our website for more information on connecting
        electricity generation nationalgrid.co.uk/connections/generation</p>
      ${next("J")}
    </div>

    <div class="sec">Section J &ndash; build out programme</div>
    <div class="panel">
      <p class="hint">To assist with the planning of the connection works, it would be
        useful to understand how the site will be built out. Please provide your indicative
        build programme, where available.</p>
      <p class="small">Note: if your development is proposed to take longer than 5 years to
        construct, please provide details in Section L: additional information.</p>
      <table class="pr">
        <thead><tr><th></th><th>Number of domestic premises</th>
          <th>Number of business premises</th>
          <th>Annual capacity requirement (kVA)</th></tr></thead>
        <tbody>${["Year 1", "Year 2", "Year 3", "Year 4", "Year 5"]
    .map(yearRow).join("")}</tbody>
      </table>
      <p class="hint" style="margin-top:3mm;">Should you wish to provide any further
        information regarding your build out programme, please enter below.</p>
      ${fl("", "", "tall")}
      ${next("K")}
    </div>
  </div>`;
}

/* ── Page 6: sections K and L, and where to send it ─────────────── */
function page6(d) {
  const office = ([name, o]) =>
    `<div><b>${esc(name)}</b>${o.post.map(esc).join("<br>")}<br><br>`
    + `T: ${esc(o.tel)}<br>(Lines are open Mon to Fri, 8:30&ndash;5pm)<br>`
    + `${esc(o.email)}</div>`;

  return `<div class="pg">
    ${runner()}
    <div class="sec">Section K &ndash; site plans</div>
    <div class="panel">
      <p class="hint">In order to provide a connection offer, we require one copy of the
        location plan and one copy of the site layout plan, together with your application
        form.</p>
      <div class="two">
        <div>
          <p class="sub">Location plan</p>
          <p class="small">The Location Plan shows where to find the proposed site for the
            new connection.</p>
          <p class="small">All applications should have one location plan enclosed. Please
            highlight the site location on the plan.</p>
          <p class="small">Location plans can be obtained by using A-Z street maps or via
            the internet, which is now available in most public libraries.</p>
        </div>
        <div>
          <p class="sub">Site layout plan</p>
          <p class="small">1. In the absence of an architect&rsquo;s drawing, please draw on
            a separate sheet a layout showing all the proposed buildings and accesses onto
            the site.</p>
          <p class="small">2. The proposed meter position(s) should be marked onto the plan
            with an X.</p>
          <p class="small">*For embedded networks, the plan should include the proposed
            Point(s) of Supply locations</p>
        </div>
      </div>
    </div>

    <div class="sec">Section L &ndash; additional information</div>
    <div class="panel">
      <p class="hint">Please provide any additional information you feel may be relevant to
        your connection application:</p>
      ${fl("", d.notes, "tall")}
    </div>

    <p class="sub">Please send your completed application form with supporting
      documentation to your regional office:</p>
    <div class="offices">
      ${Object.entries(NGED_OFFICES).map(office).join("")}
    </div>
  </div>`;
}

export function buildNgedDocument(d) {
  const ref = [d.projectRef, d.siteName].filter(Boolean).join(" \u2014 ");
  return {
    html: wrapDocument({
      title: "NGED Application for a competitive network connection"
        + (ref ? " \u2014 " + ref : ""),
      css: NGED_CSS,
      pages: page1(d) + page2(d) + page3(d) + page4() + page5() + page6(d),
    }),
    ref,
    provider: "NGED",
    providerTitle: "National Grid Electricity Distribution",
    submit: submitPayload(d, {
      to: NGED_OFFICES.Midlands.email,
      title: "Application for a competitive network connection",
      form: "NGED",
    }),
  };
}
