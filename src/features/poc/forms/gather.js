import { getProject } from "../../../api/projects.js";
import { listNrs } from "../../../api/nrs.js";
import { listPlots } from "../../../api/plots.js";
import { adminList } from "../../../api/admin.js";

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

  /* The load split.

     Domestic comes from the plot count and whatever is left over;
     commercial from the project's non-residential supplies. The total is
     the figure agreed on the application itself, so where it is set it
     wins \u2014 the parts are derived from it rather than the other way
     round, which is how the two come to disagree on a printed form. */
  const commercialCount = nrsRows.length;
  const commercialKva = nrsRows.reduce(
    (a, n) => a + (parseFloat(n.Load_kVA ?? n.Non_Residential_kVA) || 0), 0);
  const domesticCount = poc.Plot_Count ?? plotRows.length ?? "";
  const totalKva = poc.Requested_kVA ?? "";
  const domesticKva =
    totalKva !== "" && commercialKva
      ? Math.max(0, Number(totalKva) - commercialKva)
      : (totalKva !== "" && !commercialKva ? totalKva : "");

  return {
    pocId: poc.POC_Application_ID,
    poc,

    projectRef: project?.Project_Ref ?? "",
    siteName: project?.Site_Name ?? "",
    siteAddress: project?.Site_Address ?? "",
    postcode: project?.Post_Code ?? "",
    easting: project?.Easting ?? "",
    northing: project?.Northing ?? "",

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
    heatPumpCount: "",

    connectionType: poc.Connection_Type ?? "",
    applicationDate: poc.Application_Date ?? "",
    quoteReference: poc.Quote_Reference ?? "",
    notes: poc.Notes ?? "",
    nrs: nrsRows,
  };
}
