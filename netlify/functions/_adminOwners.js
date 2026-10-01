/* Which Admin tab owns each reference table.

   ── Why the server needs this ──

   Admin is granted a tab at a time now (src/lib/adminTabs.js), and the
   Admin page shows only the tabs somebody holds. That is markup. Every
   one of these tables is edited through ONE endpoint, /api/admin/:table,
   which until now asked only for a valid session — so anybody signed in
   could write VAT rates, dig rates or the status workflow with a single
   request, whatever their menu showed.

   ── Only the tables an Admin tab writes ──

   That endpoint whitelists 158 tables, and most of them are not Admin's
   at all: HR, vehicles, NCRs and call-offs all use it for their own
   working data. Gating those behind an Admin grant would refuse an HR
   manager booking leave. So this map covers only the tables an Admin
   TAB writes — fifty-six of them — and every other table keeps the
   behaviour it has today, which is the wider hole in the handover.

   ── Each one has a single owner ──

   Checked rather than assumed: no table in this map is written from two
   different tabs, and none is written from outside the Admin screens.
   checkadminaccess.mjs derives this map again from the screens
   themselves and fails on any difference, because a wrong owner here
   refuses somebody who has been granted the right tab — a 403 on a
   screen they are looking at, which is the one failure that would read
   as the feature being broken.

   A table NOT in this map is not refused. Several screens write through
   a variable table name — Electric Specs, Points Configuration, Dig
   Rates and Teams all do — and those tables stay as they were rather
   than being guessed at. */

export const ADMIN_TABLE_OWNER = {
  AV_Agreement_Type: "AV_Agreement_Type",
  AV_Status: "AV_Status",
  CAD_Layer: "CAD_Layer",
  Call_Off_Status: "Call_Off_Status",
  Craft: "Craft",
  Customer: "Customer",
  Customer_Branch: "Customer",
  DNO: "DNO",
  DXF_Layer_Map: "DXF_Layer_Map",
  Dependency_Type: "Dependency_Type",
  Design_Status: "Design_Status",
  Dig_Rate: "Dig_Rate",
  Enquiry_Form: "Enquiry_Form",
  Enquiry_Option: "Enquiry_Form",
  Enquiry_Question: "Enquiry_Form",
  GIS_Surface_Type: "GIS_Surface_Type",
  Gas_Diversity: "Gas_Diversity",
  Gas_Diversity_Operator: "Gas_Diversity",
  Gas_Pipe_Size: "Gas_Pipe_Size",
  Gas_Pipe_Size_Operator: "Gas_Pipe_Size",
  Gas_Pressure_Setting: "Gas_Pipe_Size",
  Heat_Source: "Heat_Source",
  IDNO: "IDNO",
  IDNO_Source_Mapping: "IDNO_Source_Mapping",
  NRS_Sub_Type: "NRS_Sub_Type",
  POC_Status: "POC_Status",
  POC_Type: "POC_Type",
  Pack_Status: "Pack_Status",
  Person: "Person",
  Person_Holiday: "Person",
  Person_Menu_Visible: "Person",
  Person_Region: "Person",
  Person_Role: "Person",
  Portal_Access: "Portal_Access",
  Project_Stage_Visibility: "Project_Tab_Visibility",
  Project_Status: "Project_Status",
  Project_Tab_Visibility: "Project_Tab_Visibility",
  Property_Config: "Property_Config",
  Property_Type: "Property_Type",
  Quotation_Status: "Quotation_Status",
  Quote_Type: "Quote_Type",
  Region: "Region",
  Role: "Role",
  Scope_Status: "Scope_Status",
  Status_Transition: "Status_Transition",
  Status_Transition_Guard: "Status_Transition",
  Sub_Region: "Sub_Region",
  Task_Dependency: "Task_Dependency",
  Task_Type: "Task_Type",
  Team: "Team",
  Team_Member: "Team",
  Utility: "Utility",
  VAT_Rate: "VAT_Rate",
  Visit_Outcome: "Visit_Outcome",
  Water_Pipe_Size: "Water_Pipe_Size",
  Water_Pipe_Size_Operator: "Water_Pipe_Size",
};

/* The Admin tab that owns this table, or null where none does. */
export const ownerOfTable = (table) =>
  Object.hasOwn(ADMIN_TABLE_OWNER, table) ? ADMIN_TABLE_OWNER[table] : null;

/* The menu key that owner is granted as. Kept in step with
   src/lib/adminTabs.js by checkadminaccess.mjs — the two cannot be one
   file, because a Netlify function and the browser bundle do not share
   a module tree. */
export const adminKeyFor = (tabKey) => `admin:${tabKey}`;
