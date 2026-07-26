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
  Customer:        { pk: "Customer_ID",        order: "Customer_Name" },
  Customer_Branch: { pk: "Branch_ID",          order: "Branch_Name" },
  Fire_Service:    { pk: "Fire_Service_ID",    order: "Fire_Service_Name" },
  IDNO:            { pk: "IDNO_ID",            order: "IDNO_Name" },
  Heat_Source:     { pk: "Heat_Source_ID",     order: "Heat_Source" },
  Heat_Pump_Model: { pk: "Heat_Pump_Model_ID", order: "Model" },
  Design_Status:   { pk: "Design_Status_ID",   order: "Sort_Order" },
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

    if (req.method === "POST") {
      const body = await req.json();
      const { data, error } = await db.from(table).insert(nullEmpty(body)).select().single();
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
        .from(table).update(nullEmpty(body)).eq(meta.pk, id).select().single();
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
