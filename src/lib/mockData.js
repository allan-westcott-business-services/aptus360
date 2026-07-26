/* Sample data so the UI runs before the Project tables exist.
   Delete this file once VITE_USE_MOCKS is switched off for good. */

export const lookups = {
  branches: [
    { Branch_ID: 1, Branch_Name: "Barratt \u2014 Yorkshire East", Customer_ID: 10 },
    { Branch_ID: 2, Branch_Name: "Persimmon \u2014 West Midlands", Customer_ID: 11 },
    { Branch_ID: 3, Branch_Name: "Taylor Wimpey \u2014 North West", Customer_ID: 12 },
    { Branch_ID: 4, Branch_Name: "Vistry \u2014 South West", Customer_ID: 13 },
  ],
  regions: [
    { Region_ID: 1, Region: "North" },
    { Region_ID: 2, Region: "Midlands" },
    { Region_ID: 3, Region: "South" },
  ],
  subRegions: [
    { Sub_Region_ID: 1, Region_ID: 1, Sub_Region: "Yorkshire" },
    { Sub_Region_ID: 2, Region_ID: 1, Sub_Region: "North West" },
    { Sub_Region_ID: 3, Region_ID: 2, Sub_Region: "West Midlands" },
    { Sub_Region_ID: 4, Region_ID: 3, Sub_Region: "Wessex" },
  ],
  quoteTypes: [
    { Quote_Type_ID: 1, Quote_Type: "Full" },
    { Quote_Type_ID: 2, Quote_Type: "Budget" },
    { Quote_Type_ID: 3, Quote_Type: "Street Lighting" },
  ],
  people: [
    { Person_ID: 1, Person_Name: "A. Whitcombe", Role_IDs: [1], Role_Codes: ["BDD_KAM"] },
    { Person_ID: 2, Person_Name: "R. Nkemelu", Role_IDs: [2, 3], Role_Codes: ["ESTIMATOR", "DESIGNER"] },
    { Person_ID: 3, Person_Name: "J. Farrell", Role_IDs: [1, 2, 5], Role_Codes: ["BDD_KAM", "ESTIMATOR", "PROJECT_MANAGER"] },
    { Person_ID: 4, Person_Name: "S. Dhillon", Role_IDs: [2, 3, 5], Role_Codes: ["ESTIMATOR", "DESIGNER", "PROJECT_MANAGER"] },
  ],
  roles: [
    { Role_ID: 1, Role: "BDD / KAM", Role_Code: "BDD_KAM", Sort_Order: 10 },
    { Role_ID: 2, Role: "Estimator", Role_Code: "ESTIMATOR", Sort_Order: 20 },
    { Role_ID: 3, Role: "Designer", Role_Code: "DESIGNER", Sort_Order: 30 },
    { Role_ID: 4, Role: "Design Checker", Role_Code: "DESIGN_CHECKER", Sort_Order: 40 },
    { Role_ID: 5, Role: "Project Manager", Role_Code: "PROJECT_MANAGER", Sort_Order: 50 },
    { Role_ID: 6, Role: "Quantity Surveyor", Role_Code: "QS", Sort_Order: 60 },
  ],
  fireServices: [
    { Fire_Service_ID: 1, Fire_Service_Name: "West Yorkshire FRS" },
    { Fire_Service_ID: 2, Fire_Service_Name: "Avon Fire & Rescue" },
  ],
  idnos: [
    { IDNO_ID: 1, IDNO_Name: "GTC" },
    { IDNO_ID: 2, IDNO_Name: "ESP Electricity" },
    { IDNO_ID: 3, IDNO_Name: "Leep Networks" },
    { IDNO_ID: 4, IDNO_Name: "Icosa Water" },
  ],
  heatPumpModels: [
    { Heat_Pump_Model_ID: 1, Model: "Vaillant aroTHERM 5kW" },
    { Heat_Pump_Model_ID: 2, Model: "Daikin Altherma 6kW" },
  ],
  projectStatuses: [
    { Project_Status_ID: 1, Stage: "Tender", Status: "New", Sort_Order: 10, Is_Terminal: false },
    { Project_Status_ID: 2, Stage: "Tender", Status: "Tendering", Sort_Order: 20, Is_Terminal: false },
    { Project_Status_ID: 3, Stage: "Tender", Status: "Peer Check", Sort_Order: 30, Is_Terminal: false },
    { Project_Status_ID: 4, Stage: "Tender", Status: "Awaiting Approval", Sort_Order: 40, Is_Terminal: false },
    { Project_Status_ID: 5, Stage: "Tender", Status: "Pending", Sort_Order: 50, Is_Terminal: false },
    { Project_Status_ID: 6, Stage: "Tender", Status: "On Hold", Sort_Order: 60, Is_Terminal: false },
    { Project_Status_ID: 7, Stage: "Tender", Status: "Complete", Sort_Order: 70, Is_Terminal: false },
    { Project_Status_ID: 8, Stage: "Tender", Status: "Secured", Sort_Order: 80, Is_Terminal: false },
    { Project_Status_ID: 9, Stage: "Tender", Status: "Lost", Sort_Order: 90, Is_Terminal: true },
    { Project_Status_ID: 10, Stage: "Tender", Status: "Withdrawn", Sort_Order: 100, Is_Terminal: true },
    { Project_Status_ID: 11, Stage: "Contract", Status: "Mobilising", Sort_Order: 10, Is_Terminal: false },
    { Project_Status_ID: 12, Stage: "Contract", Status: "On Site", Sort_Order: 20, Is_Terminal: false },
    { Project_Status_ID: 13, Stage: "Contract", Status: "Commercially Complete", Sort_Order: 30, Is_Terminal: true },
  ],
  scopeStatuses: [
    { Scope_Status_ID: 1, Status: "Quoting", Sort_Order: 10, Is_Terminal: false },
    { Scope_Status_ID: 2, Status: "Quoted", Sort_Order: 20, Is_Terminal: false },
    { Scope_Status_ID: 3, Status: "Secured", Sort_Order: 30, Is_Terminal: false },
    { Scope_Status_ID: 4, Status: "Lost", Sort_Order: 40, Is_Terminal: true },
    { Scope_Status_ID: 5, Status: "Withdrawn", Sort_Order: 50, Is_Terminal: true },
  ],
  designStatuses: [
    { Design_Status_ID: 1, Status: "Not started", Sort_Order: 10, Is_Complete: false },
    { Design_Status_ID: 2, Status: "In progress", Sort_Order: 20, Is_Complete: false },
    { Design_Status_ID: 3, Status: "Peer check", Sort_Order: 30, Is_Complete: false },
    { Design_Status_ID: 4, Status: "Completed", Sort_Order: 40, Is_Complete: true },
  ],
  heatSources: [
    { Heat_Source_ID: 1, Heat_Source: "ASHP" },
    { Heat_Source_ID: 2, Heat_Source: "Gas boiler" },
  ],
};

export const demoProject = {
  Project_ID: 4711,
  Project_Ref: "2607.014",
  Revision: 0,
  Contract_Number: "AP2607.014",
  Project_Status_ID: 11,
  Date_Signed: "2026-05-18",
  Secured_Date: "2026-04-30",
  Branch_ID: 1,
  Region_ID: 1,
  Fire_Service_ID: 1,
  Site_Name: "Kirkstall Meadows",
  Site_Address: "Kirkstall Road, Leeds",
  Postcode: "LS5 3BF",
  Eastings: 426300,
  Northings: 435120,
  Site_Contact: "M. Okafor \u2014 07700 900412",
  Audacia_Customer_Name: "BARRATT HOMES (YORKS E)",
  Audacia_Plot_Count: 148,
  Auto_Plot_Count: 146,
  Minimum_Service_Call_Off: 12,
  Lay_Only_MU: false,
  Heat_Pump_Model_ID: 1,
  Default_Plot_Heat_Source_ID: 1,
};

export const demoScopes = [
  { Project_Scope_ID: 1, Utility_ID: 1, Scope_Status_ID: 3, Secured_Date: "2026-04-30", Design_Status_ID: 4, IDNO_ID: 2, Reference: "ESPE012189", External_Design: false },
  { Project_Scope_ID: 2, Utility_ID: 2, Scope_Status_ID: 3, Secured_Date: "2026-04-30", Design_Status_ID: 4, IDNO_ID: 1, Reference: "ESN012189", External_Design: false },
  { Project_Scope_ID: 3, Utility_ID: 3, Scope_Status_ID: 3, Secured_Date: "2026-05-06", Design_Status_ID: 3, IDNO_ID: 4, Reference: "4100063004", External_Design: false },
  { Project_Scope_ID: 4, Utility_ID: 5, Scope_Status_ID: 4, Secured_Date: "", Design_Status_ID: 1, IDNO_ID: null, Reference: "", External_Design: true },
];
