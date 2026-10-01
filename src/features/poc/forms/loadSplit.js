/* How an operator's form divides the load: domestic, commercial, total.

   ── What was wrong ──

   "The load details of the ENW POC Application form is not pulling in
   the loads of the non residential supplies." The commercial line
   printed a count of 2 and no load at all, and the TOTAL was the
   domestic figure.

   ── Two faults, and the arithmetic one was hidden by the other ──

   The commercial load read `n.Load_kVA ?? n.Non_Residential_kVA` off a
   SUPPLY. A supply's load column is `Requested_kVA`;
   `Non_Residential_kVA` is a column on the APPLICATION; and `Load_kVA`
   is not a column anywhere. Both reads came back undefined, `|| 0` made
   the sum zero, and `|| ""` printed it as an empty cell.

   The total was wrong too. It read `poc.Requested_kVA` as the agreed
   TOTAL and derived domestic by subtracting commercial from it. It is
   not the total: the POC save writes `Requested_kVA` from the plots and
   `Non_Residential_kVA` beside it, and the screen says so in as many
   words — "132.1 requested + 24.0 non-residential". The two stored
   figures are the PARTS and the total is their sum. Subtracting one
   part from the other understated domestic by exactly the commercial
   load, and only looked right while commercial was stuck at zero. One
   fault concealing another is why the form looked merely incomplete
   rather than wrong.

   ── Which figure is authoritative ──

   `poc.Non_Residential_kVA` is what the POC screen computed — narrowed
   to the application's utility and to the supplies somebody ticked —
   and then saved. Summing the supply rows here would be a second
   opinion about the same number, free to drift from the screen the user
   is looking at. So the stored figure wins and the sum is a fallback,
   for an application saved before that column was recorded.

   ── Why it is in its own file ──

   `gather.js` imports the API layer, which reaches `api/client.js` and
   `import.meta.env` — so it cannot be imported outside Vite, and a
   check cannot reach anything defined in it. The rules live here, where
   they can be asked directly; `gather.js` calls this and does the
   fetching. */

import { nrsForUtility, parseIds } from "../interimPlots.js";

export function loadSplit({ poc = {}, nrsRows = [], plotRows = [] } = {}) {
  /* The same two rules the POC screen narrows by, imported rather than
     copied: which supplies take this utility, and which ids an interim
     application named. A form that counted them differently from the
     screen they were ticked on would be two answers about one
     application, printed and posted. */
  const chosen = parseIds(poc.Interim_NRS_IDs);
  const forUtility = nrsForUtility(nrsRows, poc.Utility_ID);
  /* `Interim_NRS_IDs` names a subset; empty means every supply on the
     utility, which is what the screen offers by default. */
  const onThisApplication = chosen.length
    ? forUtility.filter((n) => chosen.includes(Number(n.NRS_ID)))
    : forUtility;

  const summedKva = onThisApplication.reduce(
    (a, n) => a + (parseFloat(n.Requested_kVA) || 0), 0);
  const stored = parseFloat(poc.Non_Residential_kVA);
  const commercialKva = Number.isFinite(stored) ? stored : summedKva;

  const domesticKva = poc.Requested_kVA ?? "";

  return {
    commercialCount: onThisApplication.length,
    commercialKva,
    domesticCount: poc.Plot_Count ?? plotRows.length ?? "",
    domesticKva,
    /* The parts as they are stored, and the total as their sum. Blank
       only where there is nothing at all to report: a form printing
       "0" where a figure has not been worked out yet says something
       untrue about the job. */
    totalKva: domesticKva === "" && !commercialKva
      ? ""
      : (Number(domesticKva) || 0) + commercialKva,
  };
}
