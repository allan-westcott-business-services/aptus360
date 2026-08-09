import { supabase, json, fail } from "./_supabase.js";

/* Generic reference-data CRUD, driven by an allow-list.

   The allow-list is the whole security model here: without it, a table
   name in the URL would let anyone read or write anything the service
   key can reach. */
const TABLES = {
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
  /* Phases, which work type involves which, and who is doing them. */
  Task_Type:           { pk: "Task_Type_ID",           order: "Display_Order" },
  Dependency_Type:     { pk: "Dependency_Type_ID",     order: "Sort_Order" },
  Task_Dependency:     { pk: "Task_Dependency_ID",     order: "Task_Dependency_ID" },
  Work_Type_Task_Type: { pk: "Work_Type_Task_Type_ID", order: "Display_Order" },
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
  Utility:          { pk: "Utility_ID",            order: "Sort_Order" },
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
        return json({ error: "That entry already exists." }, 409);
      }
      if (error) throw error;
      return json(data, 201);
    }

    if (req.method === "PATCH") {
      if (!id) return json({ error: "id required" }, 400);
      const body = await req.json();
      const { data, error } = await db
        .from(table).update(nullEmpty(withoutKey(body))).eq(meta.pk, id).select().single();
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
