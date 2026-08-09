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
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },

  { separator: true, label: "Projects & Design" },
  { key: "Quote_Type", label: "Quote Type", pk: "Quote_Type_ID", fields: [
      { col: "Quote_Type", label: "Quote Type", type: "text", required: true },
      { col: "Is_Budget", label: "Budget (no designs)", type: "checkbox" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Points_Config", label: "Points Configuration", special: "points" },
  { key: "Project_Status", label: "Project Status", pk: "Project_Status_ID", fields: [
      { col: "Stage", label: "Stage", type: "select", options: ["Tender", "Contract"], required: true },
      { col: "Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      /* Tints the row on the Projects list. The column has been on
         Project_Status since 0001, carried over from the original's
         Tender_Status, but nothing has ever set it. */
      { col: "Row_Colour", label: "Row Colour", type: "colour" },
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
  { key: "Electric_Specs", label: "Electric Specs", special: "electric" },
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
  { key: "POC_Status", label: "POC Status", pk: "POC_Status_ID", fields: [
      { col: "POC_Status", label: "Status Name", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },
  { key: "Utility", label: "Utility", pk: "Utility_ID", fields: [
      { col: "Utility", label: "Utility Name", type: "text", required: true },
      /* The default colour for everything on this utility — mains,
         services, meters, joints. A line type or a style row may still
         override it, and one that does is a deliberate departure rather
         than a copy of this. */
      { col: "Colour", label: "Default Colour", type: "colour" },
      { col: "Is_Lighting", label: "Street lighting", type: "checkbox" },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
    ] },

  { separator: true, label: "Organisations & People" },
  { group: true, label: "Organisations" },
  { key: "Organisation", label: "Organisations", special: "organisations" },
  { key: "Customer", label: "Customers & Branches", special: "customers" },
  { key: "IDNO_Source_Mapping", label: "IDNO Source Mapping", pk: "IDNO_Source_Mapping_ID", fields: [
      { col: "Mapping_Name", label: "Mapping Name", type: "text", required: true },
      { col: "IDNO_ID", label: "IDNO ID", type: "number" },
      { col: "AV_Agreement_Type_ID", label: "Agreement Type ID", type: "number" },
      { col: "Config", label: "Config (JSON)", type: "json" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Person", label: "People & Roles", special: "people" },
  /* Teams sit with people: a team is who turns up, and the two are
     maintained together — somebody joining the company is added here
     next. */
  { key: "Team", label: "Teams", special: "teams" },
  /* What a team is qualified to do, and what a work phase requires.

     Next to Teams, because the two are only ever maintained together —
     a craft with no team holding it means a phase nothing can be
     assigned to, and that is easier to notice with the lists adjacent. */
  /* The phases a job is done in. Craft_ID says which teams may work
     each — a phase with none is open to anybody, which is what an
     unconfigured phase looks like. */
  { key: "Dependency_Type", label: "Dependency Types", pk: "Dependency_Type_ID", fields: [
      { col: "Dependency_Type", label: "Name", type: "text", required: true },
      /* The value code behind the name. Editable because a scheme may
         need a kind nobody has thought of, but it is checked by the
         database against the two it knows — anything else is refused
         rather than silently ignored by the code that reads it. */
      { col: "Kind", label: "Kind", type: "text", required: true },
      /* The default for rules that do not set their own. Kept on the
         kind so an existing "after a delay" type still means something
         on its own; the number that matters is the one on each rule. */
      { col: "Lag_Halves", label: "Default delay (half-days)", type: "number" },
      { col: "Sort_Order", label: "Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Task_Dependency", label: "Phase Dependencies", pk: "Task_Dependency_ID", fields: [
      { col: "Predecessor_Task_Type_ID", label: "Must happen first", type: "lookup",
        table: "Task_Type", value: "Task_Type_ID", text: "Task_Type_Name" },
      { col: "Successor_Task_Type_ID", label: "Then this may start", type: "lookup",
        table: "Task_Type", value: "Task_Type_ID", text: "Task_Type_Name" },
      { col: "Dependency_Type_ID", label: "Relationship", type: "lookup",
        table: "Dependency_Type", value: "Dependency_Type_ID", text: "Dependency_Type" },
      /* How long the second waits, on this rule rather than on the kind
         — jointing half a day after the dig starts and reinstatement
         three days after it are the same relationship with different
         numbers. Left empty it falls back to the relationship's own,
         which is what everything made before 0135 does.

         Half-days, because that is what the schedule is counted in: 1
         is half a day, 2 is a day, 4 is two days. Only does anything on
         a start-to-start; a finish-to-start already waits for the
         finish. */
      { col: "Lag_Halves", label: "Delay (half-days)", type: "number" },
      /* Left empty, it applies to every work type — which is what
         "jointing follows the dig" means. */
      { col: "Work_Type_ID", label: "Only for work type", type: "lookup",
        table: "Work_Type", value: "Work_Type_ID", text: "Work_Type_Name" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  { key: "Task_Type", label: "Work Phases", pk: "Task_Type_ID", fields: [
      { col: "Task_Type_Name", label: "Phase", type: "text", required: true },
      /* type "lookup" with table/value/text, which is the shape the
         generic editor reads. Written as a "select" with a "source"
         first, which parses fine and renders an empty dropdown — the
         editor simply never looks at those keys. */
      { col: "Craft_ID", label: "Requires Craft", type: "lookup",
        table: "Craft", value: "Craft_ID", text: "Craft_Name" },
      { col: "Display_Order", label: "Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  /* Where a team's work has got to, and what colour to draw it.

     Next to the phases, because the two describe the same rows from
     different angles: a phase is what the work is, a status is how far
     along it is. */
  { key: "Call_Off_Status", label: "Call-Off Statuses", pk: "Call_Off_Status_ID", fields: [
      { col: "Status_Name", label: "Status", type: "text", required: true },
      { col: "Colour", label: "Pill Colour", type: "colour" },
      /* Blank means the app picks black or white from the background's
         brightness. Set it only where that answer is legible but
         unattractive. */
      { col: "Text_Colour", label: "Text Colour (optional)", type: "colour" },
      { col: "Display_Order", label: "Order", type: "number" },
      /* Work that is done with. The call-offs list opens on work still
         to do and reads this to decide what that means. */
      { col: "Is_Closed", label: "Closed", type: "checkbox" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
  /* What size of water pipe feeds how many plots, and whose rule each
     one is.

     Its own screen rather than the generic editor: a rule may name any
     number of operators, and a many-to-many is a row of checkboxes here
     as it is for teams and their crafts. The generic editor can show a
     column that points at one thing; it has no way to show a column
     that points at several. */
  { key: "Water_Pipe_Size", label: "Water Pipe Sizes", special: "waterpipes" },
  /* The gas pair, kept beside water because they answer the same
     question and somebody configuring one usually configures both.

     Two screens rather than one with tabs: a pipe rule and a diversity
     rule are not two views of a thing, they are two inputs to one
     calculation, and the diversity table is the one that stops a build
     when it is empty. Burying that behind a tab would hide the only
     screen in Admin whose emptiness has a consequence elsewhere. */
  { key: "Gas_Pipe_Size", label: "Gas Pipe Sizes", special: "gaspipes" },
  { key: "Gas_Diversity", label: "Gas Diversity", special: "gasdiversity" },
  { key: "Craft", label: "Crafts", pk: "Craft_ID", fields: [
      { col: "Craft_Name", label: "Craft", type: "text", required: true },
      { col: "Sort_Order", label: "Sort Order", type: "number" },
      { col: "Is_Active", label: "Active", type: "checkbox" },
    ] },
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
  { group: true, label: "Utilities" },
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

  /* A second Teams entry stood here — the plain table editor over
     Team, alongside the bespoke screen up in Organisations & People.

     It never opened: both carried key "Team", the menu resolves a key
     with find(), and the first one won. So this row rendered the
     bespoke screen while claiming to be its own thing, and only showed
     up when the menu became data and the unique index on Screen_Key
     refused the pair. */

  { key: "VAT_Rate", label: "VAT Rates", pk: "VAT_Rate_ID", fields: [
      { col: "Label", label: "Rate name", type: "text", required: true },
      { col: "Rate", label: "Rate (%)", type: "number", required: true },
      /* The day it took effect. A rate runs until the next one starts,
         so there is no end date to keep in step. */
      { col: "Effective_From", label: "Effective From", type: "date", required: true },
      { col: "Notes", label: "Notes", type: "text" },
    ] },

  { separator: true, label: "Drawings" },
  { group: true, label: "Styles" },
  { key: "GIS_Style", label: "GIS Styles", special: "gisstyles" },
];

export const findAdminTable = (key) => ADMIN_TABLES.find((t) => !t.separator && t.key === key);
