import { supabase, json, fail } from "./_supabase.js";

/* One batched call for every lookup the UI needs.

   Status lists come from here too, deliberately. Hardcoding status IDs in
   the frontend means a reseeded or edited status table silently writes the
   wrong value — no error, just wrong data. The database owns the IDs. */
export default async function handler() {
  try {
    const db = supabase();

    const queries = {
      branches:       db.from("Customer_Branch").select("Branch_ID,Branch_Name,Customer_ID").eq("Is_Active", true).order("Branch_Name"),
      customers:      db.from("Customer").select("Customer_ID,Customer_Name").eq("Is_Active", true).order("Customer_Name"),
      regions:        db.from("Region").select("Region_ID,Region").eq("Is_Active", true).order("Sort_Order"),
      subRegions:     db.from("Sub_Region").select("Sub_Region_ID,Region_ID,Sub_Region").eq("Is_Active", true).order("Sort_Order"),
      quoteTypes:     db.from("Quote_Type").select("Quote_Type_ID,Quote_Type,Is_Budget").eq("Is_Active", true).order("Sort_Order"),
      people:         db.from("Person").select("Person_ID,Person_Name,Is_BDD_KAM,Is_Estimator,Is_Designer,Is_Project_Manager").eq("Is_Active", true).order("Person_Name"),
      utilities:      db.from("Utility").select("Utility_ID,Utility,Is_Lighting").order("Sort_Order"),
      fireServices:   db.from("Fire_Service").select("Fire_Service_ID,Fire_Service_Name").order("Fire_Service_Name"),
      idnos:          db.from("IDNO").select("IDNO_ID,IDNO_Name").order("IDNO_Name"),
      heatSources:    db.from("Heat_Source").select("Heat_Source_ID,Heat_Source").order("Heat_Source"),
      heatPumpModels: db.from("Heat_Pump_Model").select("Heat_Pump_Model_ID,Model").order("Model"),
      projectStatuses: db.from("Project_Status").select("Project_Status_ID,Stage,Status,Sort_Order,Is_Terminal").order("Sort_Order"),
      scopeStatuses:   db.from("Scope_Status").select("Scope_Status_ID,Status,Sort_Order,Is_Terminal").order("Sort_Order"),
      designStatuses:  db.from("Design_Status").select("Design_Status_ID,Status,Sort_Order,Is_Complete").order("Sort_Order"),
    };

    const keys = Object.keys(queries);
    const results = await Promise.all(Object.values(queries));

    const out = {};
    keys.forEach((k, i) => {
      // Fail loudly on a bad column rather than returning partial data —
      // the silent FULL/MIN fallback in the legacy app is what hid sixteen
      // phantom columns for months.
      if (results[i].error) throw new Error(`${k}: ${results[i].error.message}`);
      out[k] = results[i].data;
    });

    return json(out);
  } catch (e) {
    return fail(e);
  }
}

export const config = { path: "/api/lookups" };
