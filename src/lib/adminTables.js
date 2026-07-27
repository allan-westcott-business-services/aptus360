/* Admin registry, copied from ADMIN_TABLES in the original app.

   Simple lookups are described by their fields and handled by one generic
   editor. Anything with real structure gets `special` and its own screen —
   the same escape hatch the original used. */
export const ADMIN_TABLES = [
  { separator: true, label: "Properties & Plots" },
  { key: "Property_Config", label: "House Types", special: "housetypes" },
  { key: "Property_Type", label: "Property Type", pk: "Property_Type_ID", fields: [
      { col: "Property_Type", label: "Type Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Heat_Source", label: "Heat Source", pk: "Heat_Source_ID", fields: [
      { col: "Heat_Source", label: "Heat Source", type: "text", required: true },
    ] },
  { key: "Heat_Pump_Model", label: "Heat Pump Model", pk: "Heat_Pump_Model_ID", fields: [
      { col: "Model", label: "Model", type: "text", required: true },
    ] },

  { separator: true, label: "Projects & Design" },
  { key: "Quote_Type", label: "Quote Type", pk: "Quote_Type_ID", fields: [
      { col: "Quote_Type", label: "Quote Type", type: "text", required: true },
      { col: "Is_Budget", label: "Budget (no designs)", type: "checkbox" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Project_Status", label: "Project Status", pk: "Project_Status_ID", fields: [
      { col: "Stage", label: "Stage", type: "select", options: ["Tender", "Contract"], required: true },
      { col: "Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Terminal", label: "Terminal", type: "checkbox" },
    ] },
  { key: "Scope_Status", label: "Scope Status", pk: "Scope_Status_ID", fields: [
      { col: "Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Terminal", label: "Terminal", type: "checkbox" },
    ] },
  { key: "Design_Status", label: "Design Status", pk: "Design_Status_ID", fields: [
      { col: "Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Complete", label: "Counts as complete", type: "checkbox" },
    ] },
  { key: "Status_Transition", label: "Status Workflow", special: "workflow" },
  { key: "Visit_Outcome", label: "Visit Outcome", pk: "Visit_Outcome_ID", fields: [
      { col: "Visit_Outcome", label: "Outcome", type: "text", required: true },
      { col: "Is_Aborted", label: "Counts as aborted", type: "checkbox" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Pack_Status", label: "Service Card Pack Status", pk: "Pack_Status_ID", fields: [
      { col: "Pack_Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "NRS_Sub_Type", label: "Non-Res Supply Type", pk: "NRS_Sub_Type_ID", fields: [
      { col: "Label", label: "Type Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "POC_Type", label: "POC Type", pk: "POC_Type_ID", fields: [
      { col: "POC_Type", label: "Type Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "AV_Status", label: "Asset Value Status", pk: "AV_Status_ID", fields: [
      { col: "AV_Status", label: "Status Name", type: "text", required: true },
      { col: "Row_Colour", label: "Colour", type: "text" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Quotation_Status", label: "Quotation Status", pk: "Quotation_Status_ID", fields: [
      { col: "Quotation_Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Voltage_Rating", label: "Voltage Rating", pk: "Voltage_Rating_ID", fields: [
      { col: "Voltage_Rating", label: "Rating", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "POC_Status", label: "POC Status", pk: "POC_Status_ID", fields: [
      { col: "POC_Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Utility", label: "Utility", pk: "Utility_ID", fields: [
      { col: "Utility", label: "Utility Name", type: "text", required: true },
      { col: "Is_Lighting", label: "Street lighting", type: "checkbox" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },

  { separator: true, label: "Organisations & People" },
  { key: "Customer", label: "Customers", pk: "Customer_ID", fields: [
      { col: "Customer_Name", label: "Customer Name", type: "text", required: true },
      { col: "Audacia_Customer_Name", label: "Audacia Name", type: "text" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Person", label: "People & Roles", special: "people" },
  { key: "Role", label: "Role", pk: "Role_ID", fields: [
      { col: "Role", label: "Role Name", type: "text", required: true },
      { col: "Role_Code", label: "Code", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Region", label: "Region", pk: "Region_ID", fields: [
      { col: "Region", label: "Region", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Sub_Region", label: "Sub Region", special: "subregions" },

  { separator: true, label: "Utilities & Connections" },
  { key: "IDNO", label: "IDNO / IGT / NAV", pk: "IDNO_ID", fields: [
      { col: "IDNO_Name", label: "Operator Name", type: "text", required: true },
    ] },
  { key: "DNO", label: "DNO", pk: "DNO_ID", fields: [
      { col: "DNO_Name", label: "DNO Name", type: "text", required: true },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Local_Authority", label: "Local Authority", pk: "Local_Authority_ID", fields: [
      { col: "Authority_Name", label: "Authority Name", type: "text", required: true },
      { col: "Authority_Type", label: "Type", type: "select", options: ["Town","County","Unitary"], required: true },
      { col: "Contact_Name", label: "Contact", type: "text" },
      { col: "Telephone", label: "Telephone", type: "text" },
      { col: "Email", label: "Email", type: "text" },
    ] },
  { key: "AV_Agreement_Type", label: "AV Agreement Type", pk: "AV_Agreement_Type_ID", fields: [
      { col: "AV_Agreement_Type", label: "Type Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Fire_Service", label: "Fire Authority", pk: "Fire_Service_ID", fields: [
      { col: "Fire_Service_Name", label: "Authority Name", type: "text", required: true },
    ] },
];

export const findAdminTable = (key) => ADMIN_TABLES.find((t) => !t.separator && t.key === key);
