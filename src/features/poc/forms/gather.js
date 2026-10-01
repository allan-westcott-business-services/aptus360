import { getProject } from "../../../api/projects.js";
import { listNrs } from "../../../api/nrs.js";
import { listPlots } from "../../../api/plots.js";
import { adminList } from "../../../api/admin.js";
import { loadSplit } from "./loadSplit.js";
import { heatingSummary } from "./heating.js";

/* Everything the operator forms need, gathered once.

   All four forms want broadly the same facts — who is applying, where
   the site is, how much load, split between houses and everything else
   — so this runs once and each form picks what it uses. Four separate
   gatherers would drift, and a field that appears on three forms and is
   wrong on the fourth is the kind of thing nobody notices until an
   operator queries it.

   ── Missing data is left blank, not fatal ──

   Every lookup beyond the POC row itself is allowed to fail. The forms
   are editable, so a blank field costs somebody ten seconds of typing;
   a failed fetch that stops the form opening costs them the job. The
   original took the same line and it is the right one \u2014 these are
   printed and posted, not validated by a machine. */

const soft = (p) => p.then((r) => r).catch(() => null);

export async function gatherFormData({ poc, projectId, lookups }) {
  const [project, nrs, plots, people] = await Promise.all([
    soft(getProject(projectId)),
    soft(listNrs(projectId)),
    soft(listPlots(projectId)),
    soft(adminList("Person")),
  ]);

  const nrsRows = nrs?.rows ?? nrs ?? [];
  const plotRows = plots?.rows ?? plots ?? [];
  const personRows = people?.rows ?? [];

  const applicant = personRows.find(
    (p) => Number(p.Person_ID) === Number(poc.Applicant_Person_ID)) ?? {};

  const nameOf = (list, idKey, nameKey, id) =>
    (list || []).find((x) => Number(x[idKey]) === Number(id))?.[nameKey] ?? "";

  /* The load split: which supplies belong on this application, what
     they come to, and how that adds up with the domestic figure. The
     rules are in loadSplit.js, where a check can reach them — this file
     imports the API layer and cannot be loaded outside Vite. */
  const {
    commercialCount, commercialKva, commercialNote, domesticCount, domesticKva, totalKva,
  } =
    loadSplit({ poc, nrsRows, plotRows, nrsSubTypes: lookups?.nrsSubTypes || [] });

  /* The heating boxes and the heat pump row. Classified by the heat
     source's NAME, the way 0097 and `takesHeatPump` both do it, because
     the ids are whatever the lookup was seeded with and somebody can
     rename one in Admin. */
  const heating = heatingSummary({ plots: plotRows, heatSources: lookups?.heatSources || [] });

  return {
    pocId: poc.POC_Application_ID,
    poc,

    projectRef: project?.Project_Ref ?? "",
    siteName: project?.Site_Name ?? "",
    siteAddress: project?.Site_Address ?? "",
    /* ── The column names, as the Project table spells them ──

       Reported: an ENW application asks for the eastings, northings and
       post code, and the printed form came out blank in all three.

       These read `Post_Code`, `Easting` and `Northing`. The table has
       `Postcode`, `Eastings` and `Northings` — 0001 — and the endpoint
       has been selecting those three correctly all along. So the data
       arrived and three property reads missed it, every one of them by
       a letter: an underscore that is not there and two plurals that
       are.

       Nothing failed. `project?.Easting` on a row without that key is
       `undefined`, `?? ""` turns it into a blank, and a blank is
       exactly what an unfilled form field looks like — so the form
       printed, looked finished, and went to the operator with the site
       location missing. */
    postcode: project?.Postcode ?? "",
    easting: project?.Eastings ?? "",
    northing: project?.Northings ?? "",

    applicantName: applicant.Person_Name ?? "",
    applicantEmail: applicant.Email ?? "",
    /* The form asks for landline and mobile separately, so they are kept
       apart rather than collapsed into one "phone". */
    applicantPhone: applicant.Phone ?? applicant.Landline ?? "",
    applicantMobile: applicant.Mobile ?? "",
    applicantPostcode: "",
    applicantCompany: poc.Applicant_Company ?? "Aptus Utilities Ltd",
    applicantAddress: poc.Applicant_Company_Address ?? poc.Business_Address ?? "",

    dnoName: nameOf(lookups?.dnos, "DNO_ID", "DNO_Name", poc.DNO_ID),
    idnoName: nameOf(lookups?.idnos, "IDNO_ID", "IDNO_Name", poc.IDNO_ID),

    domesticCount,
    domesticKva,
    commercialCount: commercialCount || "",
    /* "1 x Fibre cabinet, 1 x Temporary building supply" — what the
       supplies on this application are, for the form's Comments
       column. */
    commercialNote,
    commercialKva: commercialKva || "",
    totalKva,
    totalConnections:
      (Number(domesticCount) || 0) + (Number(commercialCount) || 0) || "",

    /* Fields the form wants and this database has nowhere to keep. Left
       blank deliberately: the form is editable, and a blank line somebody
       fills in is better than a plausible guess nobody checks.

       The exception is the contact name, which is seeded with the
       applicant. That block is for the builder or site manager, and this
       application does not record one \u2014 but a completed ENW form with
       nobody named on it comes straight back, and the applicant is who
       they would ring. */
    siteContactName: applicant.Person_Name ?? "",
    siteContactPhone: "",
    siteContactEmail: "",
    connectionDate: "",

    /* How the properties are heated, rolled up from the plots. This was
       `heatPumpCount: ""` and sat in the block above for fields "this
       database has nowhere to keep" — it has somewhere: every plot
       carries a heat source, and the ones on a pump carry a model. */
    heatElectric: heating.electric,
    heatGas: heating.gas,
    heatOther: heating.other,
    heatPumpCount: heating.heatPumpCount,
    heatPumpKva: heating.heatPumpKva,
    heatingNote: heating.note,

    connectionType: poc.Connection_Type ?? "",
    applicationDate: poc.Application_Date ?? "",
    quoteReference: poc.Quote_Reference ?? "",
    notes: poc.Notes ?? "",
    nrs: nrsRows,
  };
}
