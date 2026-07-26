/* Status IDs are NOT defined here.

   They live in the database (Project_Status, Scope_Status, Design_Status)
   and arrive via GET /api/lookups. Hardcoding them meant a reseeded status
   table would silently write wrong values — no error, just bad data.

   What lives here instead: stage names, and helpers that answer questions
   about a status by looking it up in the fetched list. */

export const STAGES = { TENDER: "Tender", CONTRACT: "Contract" };

/* ── Project status ─────────────────────────────────────────────── */
export const statusesForStage = (projectStatuses = [], stage) =>
  projectStatuses.filter((s) => s.Stage === stage);

export const firstStatusForStage = (projectStatuses = [], stage) => {
  const list = statusesForStage(projectStatuses, stage);
  return list.length ? list[0].Project_Status_ID : "";
};

/* ── Scope status ───────────────────────────────────────────────── */
const scopeStatusName = (scopeStatuses = [], id) =>
  scopeStatuses.find((s) => s.Scope_Status_ID === Number(id))?.Status ?? "";

export const isScopeSecured = (scopeStatuses, id) =>
  scopeStatusName(scopeStatuses, id) === "Secured";

export const isScopeLost = (scopeStatuses, id) => {
  const name = scopeStatusName(scopeStatuses, id);
  return name === "Lost" || name === "Withdrawn";
};

/* ── Design status ──────────────────────────────────────────────── */
/* Uses the Is_Complete flag rather than matching on a name, so renaming
   "Completed" in the lookup table doesn't break Good To Go. */
export const isDesignComplete = (designStatuses = [], id) =>
  designStatuses.find((d) => d.Design_Status_ID === Number(id))?.Is_Complete === true;

/* ── People ─────────────────────────────────────────────────────── */
/* Filters on Role_Code, not display name, so renaming "BDD / KAM" in the
   Role table doesn't silently empty a dropdown. */
export const ROLE = {
  BDD_KAM: "BDD_KAM",
  ESTIMATOR: "ESTIMATOR",
  DESIGNER: "DESIGNER",
  DESIGN_CHECKER: "DESIGN_CHECKER",
  PROJECT_MANAGER: "PROJECT_MANAGER",
  QS: "QS",
};

export const peopleWithRole = (people = [], code) =>
  people.filter((p) => (p.Role_Codes || []).includes(code));

export const rolesForPerson = (person, roles = []) =>
  roles.filter((r) => (person?.Role_IDs || []).includes(r.Role_ID));
