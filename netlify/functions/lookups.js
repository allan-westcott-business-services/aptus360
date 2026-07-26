import { supabase, json, fail } from "./_supabase.js";

/* One batched call for every lookup the UI needs.

   Lookups change rarely, so this is cached for a few minutes at the edge.
   Batching also avoids paying serverless cold-start latency a dozen times
   over when a screen first loads. */
export default async function handler() {
  try {
    const db = supabase();

    const [branches, regions, subRegions, quoteTypes, people, fireServices, idnos, heatPumpModels, heatSources] =
      await Promise.all([
        db.from("Customer_Branch").select("Branch_ID,Branch_Name,Customer_ID").order("Branch_Name"),
        db.from("Region").select("Region_ID,Region").order("Region"),
        db.from("Sub_Region").select("Sub_Region_ID,Region_ID,Sub_Region").order("Sub_Region"),
        db.from("Quote_Type").select("Quote_Type_ID,Quote_Type").order("Quote_Type"),
        db.from("Person").select("Person_ID,Person_Name").order("Person_Name"),
        db.from("Fire_Service").select("Fire_Service_ID,Fire_Service_Name").order("Fire_Service_Name"),
        db.from("IDNO").select("IDNO_ID,IDNO_Name").order("IDNO_Name"),
        db.from("Heat_Pump_Model").select("Heat_Pump_Model_ID,Model").order("Model"),
        db.from("Heat_Source").select("Heat_Source_ID,Heat_Source").order("Heat_Source"),
      ]);

    const results = { branches, regions, subRegions, quoteTypes, people, fireServices, idnos, heatPumpModels, heatSources };

    // Fail loudly on a bad column rather than silently returning partial data,
    // which is what the FULL/MIN fallback in the legacy app did.
    for (const [name, res] of Object.entries(results)) {
      if (res.error) throw new Error(`${name}: ${res.error.message}`);
    }

    return json(
      Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.data])),
      200
    );
  } catch (e) {
    return fail(e);
  }
}

export const config = { path: "/api/lookups" };
