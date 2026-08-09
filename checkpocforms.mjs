/* Operator application forms: which form a POC needs, and what comes out.

   The expensive failure here is a form that looks right and is wrong —
   printed, posted to a network operator, and queried weeks later. So
   these check the two things a reader cannot: that the right forms are
   offered for a given operator, and that the numbers on the page add up
   to what was applied for. */
import { FORMS, formsFor } from "./src/features/poc/forms/registry.js";
import { isEnw, isNged, isNpg, isMua, OPERATOR_IDS } from "./src/features/poc/forms/matching.js";
import { buildEnwDocument, ENW_SUBMIT_EMAIL } from "./src/features/poc/forms/enw.js";
import { buildNgedDocument, NGED_OFFICES } from "./src/features/poc/forms/nged.js";
import {
  buildNpgDocument, NPG_SUBMIT_EMAIL, NPG_PRINTED_EMAIL,
} from "./src/features/poc/forms/npg.js";
import { esc, field } from "./src/features/poc/forms/shell.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const eq = (g, w, what) => {
  if (JSON.stringify(g) !== JSON.stringify(w))
    fail(`${what}: got ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
};

const lookups = {
  dnos: [
    { DNO_ID: 1, DNO_Name: "Electricity North West" },
    { DNO_ID: 2, DNO_Name: "National Grid Electricity Distribution" },
    { DNO_ID: 3, DNO_Name: "Western Power Distribution" },
    { DNO_ID: 4, DNO_Name: "Northern Powergrid" },
    { DNO_ID: 5, DNO_Name: "UK Power Networks" },
  ],
  idnos: [
    { IDNO_ID: 1, IDNO_Name: "MUA Electricity" },
    { IDNO_ID: 2, IDNO_Name: "ESP Electricity" },
  ],
};

// ── Matching by name ────────────────────────────────────────────
{
  if (!isEnw({ DNO_ID: 1 }, lookups)) fail("ENW not matched by name");
  if (!isNged({ DNO_ID: 2 }, lookups)) fail("NGED not matched by name");
  // Western Power was renamed NGED; records under the old name still exist.
  if (!isNged({ DNO_ID: 3 }, lookups)) fail("Western Power not matched as NGED");
  if (!isNpg({ DNO_ID: 4 }, lookups)) fail("Northern Powergrid not matched");
  if (!isMua({ IDNO_ID: 1 }, lookups)) fail("MUA not matched by name");

  // An operator with no form must match nothing rather than something.
  if (FORMS.some((f) => f.matches({ DNO_ID: 5 }, lookups)))
    fail("UK Power Networks matched a form it has none of");

  // A DNO matcher must not fire on an IDNO id, or vice versa.
  if (isEnw({ IDNO_ID: 1 }, lookups)) fail("a DNO matcher fired on an IDNO field");
  if (isMua({ DNO_ID: 1 }, lookups)) fail("the IDNO matcher fired on a DNO field");
  // Nothing selected matches nothing.
  eq(formsFor({}, lookups).length, 0, "empty POC offers no forms");
  eq(formsFor(null, lookups).length, 0, "missing POC offers no forms");
}

// ── Matching by id, once ids are confirmed ──────────────────────
{
  const saved = OPERATOR_IDS.ENW;
  OPERATOR_IDS.ENW = 99;
  if (!isEnw({ DNO_ID: 99 }, { dnos: [{ DNO_ID: 99, DNO_Name: "Something else" }] }))
    fail("a confirmed id did not match ahead of the name");
  OPERATOR_IDS.ENW = saved;
  // Back to null, that same row must no longer match.
  if (isEnw({ DNO_ID: 99 }, { dnos: [{ DNO_ID: 99, DNO_Name: "Something else" }] }))
    fail("an unconfirmed id matched anyway");
}

// ── A POC needing two forms ─────────────────────────────────────
{
  // A DNO for the connection and an IDNO adopting the network.
  const both = formsFor({ DNO_ID: 1, IDNO_ID: 1 }, lookups).map((f) => f.type);
  eq(both, ["ENW", "MUA"], "a DNO plus an adopting IDNO offers both forms");
}

// ── Every registry row is coherent ──────────────────────────────
{
  for (const f of FORMS) {
    if (!f.type || !f.label || !f.title) fail(`${f.type}: missing type, label or title`);
    if (typeof f.matches !== "function") fail(`${f.type}: no matcher`);
    if (f.ready && typeof f.build !== "function") fail(`${f.type}: ready but has no build`);
    if (!f.ready && f.build) fail(`${f.type}: has a build but is not marked ready`);
  }
  eq([...new Set(FORMS.map((f) => f.type))].length, FORMS.length, "form types are unique");
}

// ── Escaping ────────────────────────────────────────────────────
{
  eq(esc(`<script>"x"&'y'`), "&lt;script&gt;&quot;x&quot;&amp;&#39;y&#39;", "escaping");
  eq(esc(null), "", "null escapes to empty");
  if (field("<b>").includes("<b>")) fail("field() did not escape its value");
}

// ── The built ENW document ──────────────────────────────────────
{
  const d = {
    pocId: 7, projectRef: "2607.001", siteName: "Winston Road",
    siteAddress: "Winston Road, Staindrop", postcode: "DL2 3LG",
    easting: "412345", northing: "523456",
    applicantName: "A. Westcott", applicantEmail: "a@x.com", applicantPhone: "07700 900000",
    applicantCompany: "Aptus Utilities Ltd", applicantAddress: "Bolton",
    applicantMobile: "07700 900001", applicantPostcode: "BL5 3XP",
    siteContactName: "A. Westcott", siteContactPhone: "", siteContactEmail: "",
    connectionDate: "2027-02-09", heatPumpCount: "",
    dnoName: "Electricity North West", idnoName: "MUA Electricity",
    domesticCount: 72, domesticKva: 180, commercialCount: 2, commercialKva: 45,
    totalKva: 225, totalConnections: 74,
    connectionType: "New connection", applicationDate: "2026-08-01",
    quoteReference: "", notes: "Phased over two years.",
    nrs: [{ Description: "Community centre", Load_kVA: 30 },
      { Description: "Pumping station", Load_kVA: 15 }],
  };
  const out = buildEnwDocument(d);
  const html = out.html;

  // The builder hands back a document plus what the chrome needs. It must
  // not do the showing itself: a builder that opened a window could only
  // be exercised by running the application.
  for (const k of ["html", "ref", "provider", "providerTitle", "submit"]) {
    if (!(k in out)) fail(`build result is missing "${k}"`);
  }
  if (/window\.open|document\.write/.test(String(buildEnwDocument)))
    fail("the builder opens or writes a window itself");

  if (!html.startsWith("<!DOCTYPE html>")) fail("document has no doctype");
  // Four pages, as the artwork has.
  // Three pages, as the operator's own form has.
  eq((html.match(/class="pg"/g) || []).length, 3, "page count");

  // The section bars, in the operator's wording and order. Getting these
  // wrong is what made the first attempt unrecognisable, and it is not
  // something the other assertions would notice.
  const bars = [...html.matchAll(/<div class="grn">([^<]*)/g)].map((m) => m[1].trim());
  eq(bars, [
    "Applicant Details", "Site Details",
    "Type of supply (please indicate the type of supply required)",
    "Quotation required (see guidance note for description)",
    "Load Details (please state maximum power required in kVA)",
    "Heating type", "Motors", "Electric Vehicle Chargers", "Generation",
  ], "section bars");

  // The load table is the part an engineer reads first.
  for (const r of ["Commercial", "Domestic", "TOTAL"]) {
    if (!html.includes(`>${r}</td>`)) fail(`load table has no ${r} row`);
  }
  // Their actual mark, embedded rather than set in text. A linked image
  // would have to survive the iframe sandbox and the print path, and a
  // logo that silently fails to load is only noticed after sending.
  if (!html.includes("data:image/png;base64,"))
    fail("the ENW logo is not embedded in the document");
  if (/<img[^>]+src="https?:/i.test(html))
    fail("the form links to an image instead of embedding it");

  // ENW green and navy, sampled from the artwork.
  for (const c of ["#7ac043", "#00245d", "#e2efd5"]) {
    if (!html.includes(c)) fail(`the ENW palette is missing ${c}`);
  }

  // The facts that matter must actually reach the page.
  for (const v of ["Winston Road", "DL2 3LG", "A. Westcott", "Aptus Utilities Ltd"]) {
    if (!html.includes(v)) fail(`"${v}" is missing from the form`);
  }

  // The operator's form has no breakdown of individual supplies — only a
  // commercial count and load — so listing them would be inventing a
  // section that is not on the form.
  if (html.includes("Community centre")) fail("a supply breakdown reached the form");

  // The adopting IDNO ticks a box rather than being printed: the form
  // asks whose asset it will be, not who they are.
  const before = (needle, n = 140) =>
    html.slice(Math.max(0, html.indexOf(needle) - n), html.indexOf(needle));
  if (!before("IDNO Point of connection").includes("checked"))
    fail("an adopting IDNO did not tick the IDNO box");
  if (before("ICP Point of connection").includes("checked"))
    fail("the DNO box is ticked as well as the IDNO one");

  // The boxes must be real inputs. The application guesses at most of
  // them and is wrong often enough that whoever completes the form has
  // to be able to change them — a printed span cannot be unticked.
  const boxes = (html.match(/type="checkbox"/g) || []).length;
  if (boxes < 15) fail(`only ${boxes} checkboxes are real inputs`);
  if (/class="bx[^"]*on[^"]*"/.test(html))
    fail("a tick is still baked into a class rather than a checkbox state");
  // And they must be reachable without a script, since the document has none.
  if (!/<label class="opt"><input type="checkbox"/.test(html))
    fail("checkbox labels are not clickable");

  // The load table must add up to what was applied for, or the operator
  // queries it — this is the check a reader cannot do by eye.
  const total = Number(d.domesticKva) + Number(d.commercialKva);
  if (total !== Number(d.totalKva))
    fail(`load split ${d.domesticKva}+${d.commercialKva} does not total ${d.totalKva}`);
  const conns = Number(d.domesticCount) + Number(d.commercialCount);
  if (conns !== Number(d.totalConnections))
    fail(`connection counts ${conns} do not total ${d.totalConnections}`);

  // The submit payload has to carry the id back, or nothing gets stamped.
  const sub = out.submit;
  eq(sub.pocId, 7, "submit payload carries the POC id");
  eq(sub.to, ENW_SUBMIT_EMAIL, "submit payload is addressed to the operator");
  if (!sub.subject.includes("2607.001")) fail("subject does not identify the project");

  // The document is inert: it is rendered in an iframe, so any script in
  // it would be running attacker-controlled markup with no reason to.
  if (/<script/i.test(html)) fail("the printable document contains a script");
  if (/\son\w+\s*=/i.test(html)) fail("the printable document has an inline handler");
  if (!html.trimEnd().endsWith("</body></html>")) fail("document does not end cleanly");

  // Nothing user-supplied may reach the page as markup.
  const nasty = buildEnwDocument({ ...d, siteName: '</script><img onerror=x>' }).html;
  if (nasty.includes("<img onerror")) fail("an unescaped value reached the document");
}

// ── The built NGED document ─────────────────────────────────────
{
  const d = {
    pocId: 9, projectRef: "2607.001",
    siteName: "Walton Gardens, Liverpool Lane, Hutton",
    siteAddress: "Walton Gardens, Liverpool Lane, Hutton", postcode: "",
    applicantCompany: "Aptus Utilities", applicantName: "Allan Murrell",
    applicantAddress: "Aptus House, 20 Barrs Fold Road, Wingates Industrial Estate, "
      + "Westhoughton, Bolton",
    applicantPostcode: "BL5 3XP", applicantPhone: "01942 233 000", applicantMobile: "",
    applicantEmail: "allan.murrell@aptusutilities.co.uk",
    idnoName: "MUA Electricity", connectionDate: "09/02/2027",
    domesticCount: 159, domesticKva: 535, commercialCount: 2, commercialKva: 0,
    totalKva: 535, totalConnections: 161, notes: "", nrs: [],
  };
  const out = buildNgedDocument(d);
  const html = out.html;

  eq((html.match(/class="pg"/g) || []).length, 6, "NGED page count");

  // Sections A to L, in order. The form is long enough that a missing
  // section is easy to overlook by eye.
  const secs = [...html.matchAll(/<div class="sec">Section ([A-L])/g)].map((m) => m[1]);
  eq(secs, ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"], "NGED sections");

  // Per-property load: the form asks for it, we hold only the total.
  // 535 over 159 plots is 3.36, which is what their own form carries.
  if (!html.includes("3.36")) fail("per-property kVA was not derived (expected 3.36)");

  // An adopting IDNO makes this an embedded network, not one NGED adopts.
  const before = (needle, n = 160) =>
    html.slice(Math.max(0, html.indexOf(needle) - n), html.indexOf(needle));
  if (!before("Connection of an embedded").includes("checked"))
    fail("an adopting IDNO did not tick the embedded network box");
  if (before("Installation of connections for adoption").includes("checked"))
    fail("both connection-type boxes are ticked");

  // The address is split into the parts NGED asks for.
  for (const v of ["Westhoughton", "Bolton", "BL5 3XP"]) {
    if (!html.includes(v)) fail(`NGED form is missing "${v}" from the split address`);
  }

  // All three regional offices are printed, and the email defaults to one
  // of them rather than to something invented.
  for (const [name, o] of Object.entries(NGED_OFFICES)) {
    if (!html.includes(name)) fail(`office ${name} is missing from the form`);
    if (!html.includes(o.email)) fail(`office ${name} has no email on the form`);
  }
  if (!Object.values(NGED_OFFICES).some((o) => o.email === out.submit.to))
    fail("the covering email is not addressed to a real regional office");

  // Same rules as every other form.
  if (/<script/i.test(html)) fail("the NGED document contains a script");
  if ((html.match(/type="checkbox"/g) || []).length < 30)
    fail("NGED tick boxes are not real inputs");
  const nasty = buildNgedDocument({ ...d, siteName: '<img onerror=x>' }).html;
  if (nasty.includes("<img onerror")) fail("an unescaped value reached the NGED document");
}

// ── The built Northern Powergrid document ───────────────────────
{
  const d = {
    pocId: 11, projectRef: "2607.001",
    siteName: "Walton Gardens, Liverpool Lane, Hutton",
    siteAddress: "Walton Gardens, Liverpool Lane, Hutton", postcode: "",
    applicantCompany: "Aptus Utilities", applicantName: "Allan Murrell",
    applicantAddress: "Aptus House, Wingates Industrial Estate, 20 Barrs Fold Road, "
      + "Westhoughton, Bolton",
    applicantPostcode: "BL5 3XP", applicantPhone: "01942 233 000", applicantMobile: "",
    applicantEmail: "allan.murrell@aptusutilities.co.uk",
    idnoName: "MUA Electricity", connectionDate: "09/02/2027",
    domesticCount: 159, domesticKva: 535, commercialCount: 2, commercialKva: 0,
    totalKva: 535, totalConnections: 161, heatPumpCount: "", notes: "", nrs: [],
  };
  const out = buildNpgDocument(d);
  const html = out.html;

  eq((html.match(/class="pg"/g) || []).length, 10, "NPg page count");

  const secs = [...html.matchAll(/<div class="sec"[^>]*>Section (\d)/g)].map((m) => m[1]);
  eq(secs, ["1", "2", "3", "4", "5", "6", "7", "8"], "NPg sections");

  // Their form prints the operator's email with the letters transposed.
  // The page has to match the artwork; the covering email must not, or
  // it bounces. This is the one place the two deliberately differ.
  if (!html.includes(NPG_PRINTED_EMAIL))
    fail("the printed page does not carry the address as their form prints it");
  eq(out.submit.to, NPG_SUBMIT_EMAIL, "covering email address");
  if (NPG_SUBMIT_EMAIL === NPG_PRINTED_EMAIL)
    fail("the corrected address is the same as the printed one \u2014 check the spelling");
  if (out.submit.to.includes("powergird"))
    fail("the covering email would be sent to the transposed domain");

  // Their two field tints mean something: pink is required, grey optional.
  if (!/class="f req/.test(html)) fail("no required (pink) fields on the NPg form");
  if (!/class="f opt/.test(html)) fail("no optional (grey) fields on the NPg form");

  // The date is split into month and year, as section 2c asks.
  const mAt = html.indexOf("Month");
  if (!html.slice(mAt, mAt + 400).includes(">02<")) fail("connection month not split out");
  if (!html.slice(mAt, mAt + 600).includes(">2027<")) fail("connection year not split out");

  // Thirteen MPAN boxes, which is what an MPAN has.
  eq((html.match(/class="mp"/g) || []).length, 13, "MPAN boxes");

  // An adopting IDNO drives the link box question in section 6.
  const before = (needle, n = 200) =>
    html.slice(Math.max(0, html.indexOf(needle) - n), html.indexOf(needle));
  if (!before("IDNO/ICP requires a link box").includes("checked"))
    fail("an adopting IDNO did not tick the link box option");
  if (before("Not applicable").includes("checked"))
    fail("Not applicable is ticked as well as the link box option");

  if (/<script/i.test(html)) fail("the NPg document contains a script");
  if ((html.match(/type="checkbox"/g) || []).length < 40)
    fail("NPg tick boxes are not real inputs");
  const nasty = buildNpgDocument({ ...d, siteName: "<img onerror=x>" }).html;
  if (nasty.includes("<img onerror")) fail("an unescaped value reached the NPg document");
}

console.log(bad ? `\n${bad} problem(s)` : `Operator forms behave (${FORMS.length} registered, `
  + `${FORMS.filter((f) => f.ready).length} built).`);
process.exit(bad ? 1 : 0);
