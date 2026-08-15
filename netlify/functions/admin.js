import { supabase, json, fail } from "./_supabase.js";

/* Generic reference-data CRUD, driven by an allow-list.

   The allow-list is the whole security model here: without it, a table
   name in the URL would let anyone read or write anything the service
   key can reach. */
const TABLES = {
  /* Dig and lay rates (0158). Everything that estimates a trench reads
     these, so they are edited here rather than in SQL — the reason they
     were put in the database at all was that a rate needing a deploy to
     correct would never get corrected, and a rate needing a DBA is not
     much better. */
  Dig_Rate:         { pk: "Dig_Rate_ID",         order: "Sort_Order" },
  Dig_Depth_Factor: { pk: "Dig_Depth_Factor_ID", order: "Depth_From_M" },
  Dig_Lay_Rate:     { pk: "Dig_Lay_Rate_ID",     order: "Utility_Key" },
  /* The six surfaces, and how much slower each is to dig than unmade
     ground. The factor lives here rather than beside the rates because
     the trench already records its surface — a second list keyed by the
     same six values is a second place to remember them. */
  GIS_Surface_Type: { pk: "Surface_Key",         order: "Sort_Order" },
  Property_Type:   { pk: "Property_Type_ID",   order: "Sort_Order" },
  Property_Config: { pk: "Property_Config_ID", order: "Bedrooms" },
  Quote_Type:      { pk: "Quote_Type_ID",      order: "Sort_Order" },
  Region:          { pk: "Region_ID",          order: "Sort_Order" },
  Sub_Region:      { pk: "Sub_Region_ID",      order: "Sort_Order" },
  Utility:         { pk: "Utility_ID",         order: "Sort_Order" },
  Role:            { pk: "Role_ID",            order: "Sort_Order" },
  Person:          { pk: "Person_ID",          order: "Person_Name" },
  Person_Role:     { pk: "Person_Role_ID",     order: "Person_Role_ID" },
  /* Which regions somebody covers, and when they are away. Ordered so
     the newest absence is not buried under three years of old ones. */
  Person_Region:   { pk: "Person_Region_ID",   order: "Person_Region_ID" },
  Person_Menu_Visible: { pk: "Person_Menu_Visible_ID", order: "Person_Menu_Visible_ID" },
  Person_Holiday:  { pk: "Person_Holiday_ID",  order: "Start_DateTime" },
  /* Teams: the gang, who is on it, and what it is qualified and
     permitted to do. */
  Craft:           { pk: "Craft_ID",           order: "Sort_Order" },
  Team:            { pk: "Team_ID",            order: "Team_Name" },
  Team_Member:     { pk: "Team_Member_ID",     order: "Team_Member_ID" },
  Team_Craft:      { pk: "Team_Craft_ID",      order: "Team_Craft_ID" },
  Team_Region:     { pk: "Team_Region_ID",     order: "Team_Region_ID" },
  /* The fleet, and the five histories that hang off a vehicle. Deleting
     a vehicle cascades to all five in the database (0137), so this list
     never has to delete them itself. */
  Vehicle:             { pk: "Vehicle_ID",             order: "Registration",
    conflict: "A vehicle with that registration already exists." },
  Vehicle_Insurance:   { pk: "Insurance_ID",           order: "Insurance_ID" },
  Vehicle_MOT:         { pk: "MOT_ID",                 order: "MOT_ID" },
  Vehicle_Service:     { pk: "Service_ID",             order: "Service_ID" },
  Vehicle_Maintenance: { pk: "Maintenance_ID",         order: "Maintenance_ID" },
  Vehicle_Mileage_Log: { pk: "Log_ID",                 order: "Log_ID" },
  /* Which project tabs each section of the app shows (0138). Only the
     exceptions are stored, so an absent row means the tab is shown. */
  Project_Tab_Visibility: { pk: "Project_Tab_Visibility_ID", order: "Area_Key" },
  /* And which stages (0140). A separate table because a stage is not a
     tab: one column holding either kind of key would mean every read
     has to remember which it is looking at. */
  Project_Stage_Visibility: { pk: "Project_Stage_Visibility_ID", order: "Area_Key" },
  /* ── Human Resources (0140–0142) ──────────────────────────────
     65 of the 71 HR tables. Six are deliberately absent and stay that
     way until HR has authentication:

       Bank_Details, DBS_Check, Disciplinary, Grievance, OH_Referral,
       PIP_Record

     This list is the entire security model — a table in it is served
     to any caller who names it — so those six are reachable only from
     SQL until there is something to check who is asking. Adding each
     back is one line. */
  Accreditation_Type:                { pk: "Accreditation_Type_ID", order: "Name" },
  Address:                           { pk: "Address_ID", order: "Created_At" },
  Applicant:                         { pk: "Applicant_ID", order: "Created_At" },
  Application:                       { pk: "Application_ID", order: "Created_At" },
  Audit_Log:                         { pk: "Audit_Log_ID", order: "Audit_Log_ID" },
  Benefit_Type:                      { pk: "Benefit_Type_ID", order: "Name" },
  Candidate_Attachment:              { pk: "Candidate_Attachment_ID", order: "Created_At" },
  Candidate:                         { pk: "Candidate_ID", order: "Created_At" },
  Certificate_Type:                  { pk: "Certificate_Type_ID", order: "Name" },
  Contingent_Worker:                 { pk: "Contingent_Worker_ID", order: "Created_At" },
  Department:                        { pk: "Department_ID", order: "Name" },
  Documents_Log:                     { pk: "Documents_Log_ID", order: "Created_At" },
  Driving_Licence_Check:             { pk: "Driving_Licence_Check_ID", order: "Created_At" },
  Employee_Accreditation:            { pk: "Employee_Accreditation_ID", order: "Created_At" },
  Employee_Benefit:                  { pk: "Employee_Benefit_ID", order: "Start_Date" },
  Employee_Certificate:              { pk: "Employee_Certificate_ID", order: "Created_At" },
  Employee_Onboarding_Content:       { pk: "Employee_Onboarding_Content_ID", order: "Created_At" },
  Employee_Onboarding_Task:          { pk: "Employee_Onboarding_Task_ID", order: "Created_At" },
  Employee_Pay:                      { pk: "Employee_Pay_ID", order: "Effective_Date" },
  Employee_Role:                     { pk: "Employee_Role_ID", order: "Start_Date" },
  Employee_Skill:                    { pk: "Employee_Skill_ID", order: "Created_At" },
  Employee_Training:                 { pk: "Employee_Training_ID", order: "Created_At" },
  Employment:                        { pk: "Employment_ID", order: "Start_Date" },
  Equipment_Assignment:              { pk: "Equipment_Assignment_ID", order: "Created_At" },
  Equipment_Type:                    { pk: "Equipment_Type_ID", order: "Name" },
  Headcount_Budget:                  { pk: "Headcount_Budget_ID", order: "Created_At" },
  Hierarchy:                         { pk: "Hierarchy_ID", order: "Created_At" },
  Interaction_Type:                  { pk: "Interaction_Type_ID", order: "Name" },
  Interaction:                       { pk: "Interaction_ID", order: "Created_At" },
  Interview_Format_Type:             { pk: "Interview_Format_Type_ID", order: "Name" },
  Interview_Stage:                   { pk: "Interview_Stage_ID", order: "Created_At" },
  Job_Advert:                        { pk: "Job_Advert_ID", order: "Title" },
  Job_Site:                          { pk: "Job_Site_ID", order: "Name" },
  Job_Title:                         { pk: "Job_Title_ID", order: "Title" },
  Leave_Entitlement:                 { pk: "Leave_Entitlement_ID", order: "Created_At" },
  Leave_Request:                     { pk: "Leave_Request_ID", order: "Start_Date" },
  Leave_Type:                        { pk: "Leave_Type_ID", order: "Name" },
  Leaver_Type:                       { pk: "Leaver_Type_ID", order: "Name" },
  Leaver:                            { pk: "Leaver_ID", order: "Created_At" },
  Mentoring_Relationship:            { pk: "Mentoring_Relationship_ID", order: "Start_Date" },
  Next_Of_Kin:                       { pk: "Next_Of_Kin_ID", order: "Name" },
  Objective:                         { pk: "Objective_ID", order: "Title" },
  Offer:                             { pk: "Offer_ID", order: "Start_Date" },
  Office_Location:                   { pk: "Office_Location_ID", order: "Name" },
  Onboarding_Content:                { pk: "Onboarding_Content_ID", order: "Title" },
  Onboarding_Content_Type:           { pk: "Onboarding_Content_Type_ID", order: "Name" },
  Onboarding_Task:                   { pk: "Onboarding_Task_ID", order: "Created_At" },
  Performance_Review:                { pk: "Performance_Review_ID", order: "Created_At" },
  Person_Document:                   { pk: "Person_Document_ID", order: "Created_At" },
  Recruitment_Agency:                { pk: "Recruitment_Agency_ID", order: "Name" },
  Referee:                           { pk: "Referee_ID", order: "Name" },
  Return_To_Work_Form:               { pk: "Return_To_Work_Form_ID", order: "Created_At" },
  Job_Role:                          { pk: "Job_Role_ID", order: "Created_At" },
  Salary_Band:                       { pk: "Salary_Band_ID", order: "Effective_Date" },
  Sector_Magazine:                   { pk: "Sector_Magazine_ID", order: "Name" },
  Sickness_Category:                 { pk: "Sickness_Category_ID", order: "Name" },
  Sickness_Record:                   { pk: "Sickness_Record_ID", order: "Created_At" },
  Skill_Category:                    { pk: "Skill_Category_ID", order: "Name" },
  Skill:                             { pk: "Skill_ID", order: "Name" },
  Succession_Plan:                   { pk: "Succession_Plan_ID", order: "Created_At" },
  Timesheet_Entry:                   { pk: "Timesheet_Entry_ID", order: "Created_At" },
  Timesheet:                         { pk: "Timesheet_ID", order: "Created_At" },
  Training_Course:                   { pk: "Training_Course_ID", order: "Name" },
  Vacancy:                           { pk: "Vacancy_ID", order: "Title" },
  Working_Pattern:                   { pk: "Working_Pattern_ID", order: "Created_At" },

  /* Non-compliance reports and what hangs off them (0139). Deleting a
     report cascades to its actions and comments in the database, so
     this list never has to delete them itself. */
  NCR:         { pk: "NCR_ID",         order: "Date_Received",
    conflict: "That NCR reference already exists." },
  NCR_Status:  { pk: "NCR_Status_ID",  order: "Sort_Order" },
  NCR_Action:  { pk: "NCR_Action_ID",  order: "Due_Date" },
  NCR_Comment: { pk: "NCR_Comment_ID", order: "Created_At" },
  /* Business_Unit is deliberately absent: the table arrives with the HR
     section, and the screens tolerate its absence until it does. */
  /* Phases, which work type involves which, and who is doing them. */
  Task_Type:           { pk: "Task_Type_ID",           order: "Display_Order" },
  Dependency_Type:     { pk: "Dependency_Type_ID",     order: "Sort_Order" },
  Task_Dependency:     { pk: "Task_Dependency_ID",     order: "Task_Dependency_ID",
    /* One relationship per pair of phases per work type, which is what
       the unique index enforces. Saying "that entry already exists" is
       true and useless: the row somebody is adding is not the row that
       exists — it is the same pair with a different relationship, and
       what they need to know is that the pair is spoken for and the
       answer is to edit it. */
    conflict: "Those two phases already have a relationship. "
      + "Edit the existing rule rather than adding a second one \u2014 "
      + "a pair with two relationships has no single answer to how long "
      + "the second waits." },
  Work_Type_Task_Type: { pk: "Work_Type_Task_Type_ID", order: "Display_Order" },
  Call_Off_Utility: { pk: "Call_Off_Utility_ID", order: "Call_Off_Utility_ID" },
  Call_Off_Assignment_Comment: {
    pk: "Assignment_Comment_ID", order: "Created_At",
  },
  Call_Off_Assignment_Utility: {
    pk: "Assignment_Utility_ID", order: "Assignment_Utility_ID",
  },
  Call_Off_Assignment: { pk: "Assignment_ID",          order: "Start_Date" },
  /* The days under an assignment. Missing from this list, every write
     to it returned 404 — and because saving an edit deletes the old days
     before writing the new ones, an edit lost its day breakdown and
     reopening showed what was still in the table. The assignment itself
     saved; the days did not. */
  Call_Off_Work_Day:   { pk: "Work_Day_ID",            order: "Work_Date" },
  /* The states a team's work can be in, and the colour each is drawn
     in. Ordered by Display_Order so the pill menu reads in workflow
     order rather than alphabetically, which would put Complete second. */
  Call_Off_Status:     { pk: "Call_Off_Status_ID",     order: "Display_Order" },
  /* Water pipe sizes against the plots they carry. */
  Water_Pipe_Size:     { pk: "Water_Pipe_Size_ID",     order: "Max_Meters" },
  /* Which operators a size rule applies to. No rows means all of
     them — see 0119. */
  Water_Pipe_Size_Operator: { pk: "Water_Pipe_Size_Operator_ID",
    order: "Water_Pipe_Size_ID" },
  /* Gas pipe sizes against the load they carry. Ordered by kW for the
     same reason water is ordered by meters: that is the order the
     sizing reads them in, and a list on screen that walks differently
     from the build is a list that will be argued with. */
  Gas_Pipe_Size:       { pk: "Gas_Pipe_Size_ID",       order: "Max_kW" },
  Gas_Pipe_Size_Operator: { pk: "Gas_Pipe_Size_Operator_ID",
    order: "Gas_Pipe_Size_ID" },
  /* Diversity factors against supply count. Empty until somebody
     configures it, and the gas build refuses to size a main rather than
     assuming a factor — see 0131. */
  Gas_Diversity:       { pk: "Gas_Diversity_ID",       order: "Max_Supplies" },
  Gas_Diversity_Operator: { pk: "Gas_Diversity_Operator_ID",
    order: "Gas_Diversity_ID" },
  /* Read-only here: a view, listed so the pipe size screen can offer
     the operators that actually work in water. Writes to it would fail
     at the database, which is the right answer — an operator's
     utilities are edited in Organisations. */
  Operator_Utility: { pk: "Organisation_ID",       order: "Name" },
  /* The shape of the admin menu itself — see 0127. */
  Admin_Menu:       { pk: "Admin_Menu_ID",         order: "Display_Order" },
  Customer:        { pk: "Customer_ID",        order: "Customer_Name" },
  Customer_Branch: { pk: "Branch_ID",          order: "Branch_Name" },
  IDNO_Source_Mapping: { pk: "IDNO_Source_Mapping_ID", order: "Mapping_Name" },
  Fire_Service:    { pk: "Fire_Service_ID",    order: "Fire_Service_Name" },
  IDNO:            { pk: "IDNO_ID",            order: "IDNO_Name" },
  Heat_Source:     { pk: "Heat_Source_ID",     order: "Heat_Source" },
  Heat_Pump_Model: { pk: "Heat_Pump_Model_ID", order: "Model" },
  Design_Status:   { pk: "Design_Status_ID",   order: "Sort_Order" },
  POC_Status:      { pk: "POC_Status_ID",      order: "Sort_Order" },
  POC_Type:        { pk: "POC_Type_ID",        order: "Sort_Order" },
  NRS_Sub_Type:    { pk: "NRS_Sub_Type_ID",    order: "Sort_Order" },
  Pack_Status:     { pk: "Pack_Status_ID",     order: "Sort_Order" },
  Visit_Outcome:   { pk: "Visit_Outcome_ID",   order: "Sort_Order" },
  Electric_Transformer_Size: { pk: "Transformer_Size_ID", order: "Sort_Order" },
  Electric_Cable_Type:       { pk: "Cable_Type_ID",       order: "Sort_Order" },
  Electric_Cable_Size:       { pk: "Cable_Size_ID",       order: "Sort_Order" },
  Electric_Impedance:        { pk: "Impedance_ID",        order: "Impedance_ID" },
  Electric_Joint:            { pk: "Joint_ID",            order: "Sort_Order" },
  House_Type_Consumption:    { pk: "Consumption_ID",      order: "Bedrooms" },
  Electric_VD_Setting:       { pk: "VD_Setting_ID",       order: "VD_Setting_ID" },
  Gas_Pressure_Setting: {
    pk: "Gas_Pressure_Setting_ID", order: "Gas_Pressure_Setting_ID",
  },
  Tender_Points_Band:        { pk: "Band_ID",             order: "Sort_Order" },
  Tender_Points_Rule:        { pk: "Rule_ID",             order: "Sort_Order" },
  Base_Points_Band:          { pk: "Band_ID",             order: "Sort_Order" },
  Quotation_Status:{ pk: "Quotation_Status_ID", order: "Sort_Order" },
  AV_Status:       { pk: "AV_Status_ID",       order: "Sort_Order" },
  Local_Authority: { pk: "Local_Authority_ID", order: "Authority_Name" },
  AV_Agreement_Type:{ pk: "AV_Agreement_Type_ID", order: "Sort_Order" },
  AV_Agreement:    { pk: "AV_Agreement_ID",    order: "AV_Agreement_ID" },
  Voltage_Rating:  { pk: "Voltage_Rating_ID",   order: "Sort_Order" },
  DNO:             { pk: "DNO_ID",             order: "DNO_Name" },
  Status_Transition:       { pk: "Transition_ID", order: "Transition_ID" },
  Status_Transition_Guard: { pk: "Guard_ID",      order: "Guard_ID" },
  Scope_Status:    { pk: "Scope_Status_ID",    order: "Sort_Order" },
  Project_Status:  { pk: "Project_Status_ID",  order: "Sort_Order" },
};

const nullEmpty = (o) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v === "" ? null : v]));

export default async function handler(req, context) {
  const table = context?.params?.table;
  const meta = TABLES[table];
  if (!meta) return json({ error: `Table "${table}" is not editable here.` }, 404);

  const db = supabase();
  const url = new URL(req.url);
  const id = url.searchParams.get("id");

  try {
    if (req.method === "GET") {
      const { data, error } = await db.from(table).select("*").order(meta.order);
      if (error) throw error;
      return json({ rows: data || [] });
    }

    /* The primary key is never written, on either verb.

       An edit in the generic table copies the whole row into the draft
       and sends it back, key included. That was harmless while every
       table used serial — a serial column is an ordinary column with a
       default, and setting it to the value it already holds does
       nothing. The tables added since are GENERATED ALWAYS AS IDENTITY,
       which Postgres refuses to write at all, even to the value already
       there:

         column "Water_Pipe_Size_ID" can only be updated to DEFAULT

       Stripped here rather than in the screen that sends it. A PATCH
       names its row in the URL, so the key in the body is redundant on
       every table and every caller — and any future table declared the
       modern way would have hit this in turn, each one looking like a
       fault in that table. */
    const withoutKey = (body) => {
      const out = { ...body };
      delete out[meta.pk];
      return out;
    };

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from(table)
        .insert(nullEmpty(withoutKey(body))).select().single();
      if (error && error.code === "23505") {
        return json({ error: meta.conflict || "That entry already exists." }, 409);
      }
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      /* Editing a row into a duplicate hits the same index as inserting
         one, and used to come back as a raw Postgres error — the same
         situation with a worse explanation, because only the insert
         path had been thought about. */
      const { data, error } = await db
        .from(table).update(nullEmpty(withoutKey(body))).eq(meta.pk, id).select().single();
      if (error && error.code === "23505") {
        return json({ error: meta.conflict || "That entry already exists." }, 409);
      }
      if (error) throw error;
      return json(data);
    }

    if (req.method === "DELETE") {
      if (!id) return json({ error: "id required" }, 400);
      const { error } = await db.from(table).delete().eq(meta.pk, id);
      // 23503 = foreign key violation: something still references this row
      if (error && error.code === "23503") {
        return json({ error: "Still in use elsewhere — deactivate it instead of deleting." }, 409);
      }
      if (error) throw error;
      return json({ deleted: true });
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (e) {
    return fail(e, 400);
  }
}

export const config = { path: "/api/admin/:table" };
