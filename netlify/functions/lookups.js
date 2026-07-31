import { supabase, json, fail } from "./_supabase.js";

/* One batched call for every lookup the UI needs.

   Status lists come from here too, deliberately. Hardcoding status IDs in
   the frontend means a reseeded or edited status table silently writes the
   wrong value — no error, just wrong data. The database owns the IDs. */
export default async function handler() {
  try {
    const db = supabase();

    const queries = {
      branches:       db.from("Customer_Branch").select("Branch_ID,Branch_Name,Branch_Dropdown,Customer_ID").eq("Is_Active", true).order("Branch_Dropdown"),
      customers:      db.from("Customer").select("Customer_ID,Customer_Name").eq("Is_Active", true).order("Customer_Name"),
      regions:        db.from("Region").select("Region_ID,Region").eq("Is_Active", true).order("Sort_Order"),
      subRegions:     db.from("Sub_Region").select("Sub_Region_ID,Region_ID,Sub_Region").eq("Is_Active", true).order("Sort_Order"),
      quoteTypes:     db.from("Quote_Type").select("Quote_Type_ID,Quote_Type,Is_Budget").eq("Is_Active", true).order("Sort_Order"),
      /* Email is here so the signed-in session can be resolved to a
         person — it is the only thing the two have in common, and
         Person.Email is unique. */
      people:         db.from("Person").select("Person_ID,Person_Name,Email,Person_Role(Role_ID)").eq("Is_Active", true).order("Person_Name"),
      roles:          db.from("Role").select("Role_ID,Role,Role_Code,Sort_Order").eq("Is_Active", true).order("Sort_Order"),
      utilities:      db.from("Utility").select("Utility_ID,Utility,Is_Lighting").order("Sort_Order"),
      fireServices:   db.from("Fire_Service").select("Fire_Service_ID,Fire_Service_Name").order("Fire_Service_Name"),
      /* Through the view so the picker knows which utilities each one
         covers. An empty utility_ids means unassigned, which the picker
         treats as unrestricted rather than as matching nothing. */
      idnos:          db.from("IDNO_With_Utilities").select("IDNO_ID,IDNO_Name,Organisation_ID,utility_ids").order("IDNO_Name"),
      propertyTypes:   db.from("Property_Type").select("Property_Type_ID,Property_Type").eq("Is_Active", true).order("Sort_Order"),
      propertyConfigs: db.from("Property_Config").select("Property_Config_ID,Bedrooms,Property_Type_ID,Code").eq("Is_Active", true).order("Bedrooms"),
      heatSources:    db.from("Heat_Source").select("Heat_Source_ID,Heat_Source").order("Heat_Source"),
      /* Ordered newest first so resolving a rate for a date is a find(),
         not a sort. */
      /* Column names are 0027's — Cable_Size_ID, not
         Electric_Cable_Size_ID. The table names carry the prefix; the
         keys inside them do not. */
      cableSizes: db.from("Electric_Cable_Size")
        .select("Cable_Size_ID,Cable_Type_ID,Size_Label,Loop_Impedance_Ohm,Volt_Drop_Base,CSA_mm2,Rating_Amps,Material,Preferred_Fuse_A")
        .eq("Is_Active", true).order("Sort_Order"),
      cableTypes: db.from("Electric_Cable_Type")
        .select("Cable_Type_ID,Cable_Type,Cable_Code,Usage_Type,Voltage_Rating_ID").eq("Is_Active", true).order("Sort_Order"),
      transformerSizes: db.from("Electric_Transformer_Size")
        .select("Transformer_Size_ID,Label,Rating_kVA,Loop_Impedance_Ohm")
        .eq("Is_Active", true).order("Sort_Order"),
      vdSettings: db.from("Electric_VD_Setting").select("*").limit(1),
      vatRates:       db.from("VAT_Rate").select("VAT_Rate_ID,Rate,Effective_From,Label").order("Effective_From", { ascending: false }),
      /* Make and reference travel with the model because the model name
         alone is ambiguous — the register lists the same name under
         several entries with different loads. */
      heatPumpModels: db.from("Heat_Pump_Model")
        .select("Heat_Pump_Model_ID,Register_Number,Make,Model,Model_Reference,Rated_Power_kVA")
        .eq("Is_Active", true).order("Make").order("Model"),
      projectStatuses: db.from("Project_Status").select("Project_Status_ID,Stage,Status,Sort_Order,Row_Colour,Is_Terminal").order("Sort_Order"),
      scopeStatuses:   db.from("Scope_Status").select("Scope_Status_ID,Status,Sort_Order,Is_Terminal").order("Sort_Order"),
      localAuthorities: db.from("Local_Authority").select("Local_Authority_ID,Authority_Name,Authority_Type,Contact_Name,Telephone,Email").eq("Is_Active", true).order("Authority_Name"),
      avAgreementTypes: db.from("AV_Agreement_Type").select("AV_Agreement_Type_ID,AV_Agreement_Type,Utility_ID").eq("Is_Active", true).order("Sort_Order"),
      avStatuses:      db.from("AV_Status").select("AV_Status_ID,AV_Status,Row_Colour").eq("Is_Active", true).order("Sort_Order"),
      quotationStatuses: db.from("Quotation_Status").select("Quotation_Status_ID,Quotation_Status").eq("Is_Active", true).order("Sort_Order"),
      voltageRatings:    db.from("Voltage_Rating").select("Voltage_Rating_ID,Voltage_Rating").order("Sort_Order"),
      teams:           db.from("Team").select("Team_ID,Team_Name,Sort_Order").eq("Is_Active", true).order("Sort_Order").order("Team_Name"),
      visitOutcomes:   db.from("Visit_Outcome").select("Visit_Outcome_ID,Visit_Outcome,Is_Aborted").eq("Is_Active", true).order("Sort_Order"),
      packStatuses:    db.from("Pack_Status").select("Pack_Status_ID,Pack_Status").eq("Is_Active", true).order("Sort_Order"),
      nrsSubTypes:     db.from("NRS_Sub_Type").select("NRS_Sub_Type_ID,Label").eq("Is_Active", true).order("Sort_Order"),
      pocTypes:        db.from("POC_Type").select("POC_Type_ID,POC_Type").eq("Is_Active", true).order("Sort_Order"),
      dnos:            db.from("DNO").select("DNO_ID,DNO_Name").eq("Is_Active", true).order("DNO_Name"),
      pocStatuses:     db.from("POC_Status").select("POC_Status_ID,POC_Status").eq("Is_Active", true).order("Sort_Order"),
      transitions:     db.from("Status_Transition").select("From_Status_ID,To_Status_ID,Quote_Type_ID").eq("Is_Active", true),
      guards:          db.from("Status_Transition_Guard").select("Guard_ID,Target_Status_ID,Guard_Type,Condition_Status_IDs,Description").eq("Is_Active", true),
      designStatuses:  db.from("Design_Status").select("Design_Status_ID,Status,Sort_Order,Is_Complete").order("Sort_Order"),
      /* Operators as organisations, for anything that needs to know
         whose standard or scheme applies. Reads the 0048 view, so it
         already excludes inactive organisations and inactive roles. An
         organisation holding both roles comes back twice — once per
         role — which is correct for a role-scoped list. */
      orgOperators:    db.from("Organisation_By_Role").select("Organisation_ID,Name,Code,Type_Key,role_label,Reference,VAT_Registered,VAT_Rate").in("Type_Key", ["dno", "idno"]).order("Name"),
      operatorUtilities: db.from("Operator_Utility").select("Organisation_ID,Name,Code,utility_ids,role_keys").order("Name"),
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

    /* Flatten the embedded Person_Role rows into a plain Role_ID list, so
       the frontend never has to know the join table exists. */
    const roleById = new Map((out.roles || []).map((r) => [r.Role_ID, r.Role_Code]));
    out.people = (out.people || []).map((p) => {
      const ids = (p.Person_Role || []).map((x) => x.Role_ID);
      return {
        Person_ID: p.Person_ID,
        Person_Name: p.Person_Name,
        Role_IDs: ids,
        Role_Codes: ids.map((id) => roleById.get(id)).filter(Boolean),
      };
    });

    return json(out);
  } catch (e) {
    return fail(e);
  }
}

export const config = { path: "/api/lookups" };
