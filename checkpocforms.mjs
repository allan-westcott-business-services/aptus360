/* Operator application forms: which form a POC needs, and what comes out.

   The expensive failure here is a form that looks right and is wrong —
   printed, posted to a network operator, and queried weeks later. So
   these check the two things a reader cannot: that the right forms are
   offered for a given operator, and that the numbers on the page add up
   to what was applied for. */
import { FORMS, formsFor } from "./src/features/poc/forms/registry.js";
import { isEnw, isNged, isNpg, isMua, OPERATOR_IDS } from "./src/features/poc/forms/matching.js";
import { buildEnwDocument, ENW_SUBMIT_EMAIL } from "./src/features/poc/forms/enw.js";
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
  const idnoLine = html.slice(html.indexOf("IDNO Point of connection") - 120,
    html.indexOf("IDNO Point of connection"));
  if (!idnoLine.includes("bx on")) fail("an adopting IDNO did not tick the IDNO box");
  const dnoAt = html.indexOf("ICP Point of connection");
  if (html.slice(dnoAt - 120, dnoAt).includes("bx on"))
    fail("the DNO box is ticked as well as the IDNO one");

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

console.log(bad ? `\n${bad} problem(s)` : `Operator forms behave (${FORMS.length} registered, `
  + `${FORMS.filter((f) => f.ready).length} built).`);
process.exit(bad ? 1 : 0);
