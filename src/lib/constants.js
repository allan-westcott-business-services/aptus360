/* Stage-scoped statuses. Replaces the separate Tender_Status and
   Contract_Status tables — one list, filtered by stage. */
export const STAGES = { TENDER: "Tender", CONTRACT: "Contract" };

export const STATUSES = [
  { id: 1, stage: "Tender", label: "New" },
  { id: 2, stage: "Tender", label: "Tendering" },
  { id: 3, stage: "Tender", label: "Peer Check" },
  { id: 4, stage: "Tender", label: "Awaiting Approval" },
  { id: 5, stage: "Tender", label: "Pending" },
  { id: 6, stage: "Tender", label: "On Hold" },
  { id: 7, stage: "Tender", label: "Secured" },
  { id: 8, stage: "Tender", label: "Lost" },
  { id: 9, stage: "Tender", label: "Withdrawn" },
  { id: 20, stage: "Contract", label: "Mobilising" },
  { id: 21, stage: "Contract", label: "On Site" },
  { id: 22, stage: "Contract", label: "Commercially Complete" },
];

export const statusesForStage = (stage) => STATUSES.filter((s) => s.stage === stage);
export const statusById = (id) => STATUSES.find((s) => s.id === +id);

export const SCOPE_STATUSES = [
  { id: 1, label: "Quoting" },
  { id: 2, label: "Quoted" },
  { id: 3, label: "Secured" },
  { id: 4, label: "Lost" },
  { id: 5, label: "Withdrawn" },
];

export const DESIGN_STATUSES = [
  { id: 1, label: "Not started" },
  { id: 2, label: "In progress" },
  { id: 3, label: "Peer check" },
  { id: 4, label: "Completed" },
];

export const SCOPE_STATUS_SECURED = 3;
export const SCOPE_STATUS_LOST = 4;
export const DESIGN_STATUS_COMPLETE = 4;
