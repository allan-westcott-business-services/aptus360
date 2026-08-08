/* Sample data so the UI runs before the Project tables exist.
   Delete this file once VITE_USE_MOCKS is switched off for good. */

export const lookups = {
  branches: [
    { Branch_ID: 1, Branch_Name: "Yorkshire East", Branch_Dropdown: "Barratt Homes (Yorkshire East)", Customer_ID: 10 },
    { Branch_ID: 2, Branch_Name: "West Midlands", Branch_Dropdown: "Persimmon Homes (West Midlands)", Customer_ID: 11 },
    { Branch_ID: 3, Branch_Name: "North West", Branch_Dropdown: "Taylor Wimpey Homes (North West)", Customer_ID: 12 },
    { Branch_ID: 4, Branch_Name: "South West", Branch_Dropdown: "Vistry Homes (South West)", Customer_ID: 13 },
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
  pocStatuses: [
    { POC_Status_ID: 1, POC_Status: "Not Required" },
    { POC_Status_ID: 2, POC_Status: "To Apply" },
    { POC_Status_ID: 3, POC_Status: "Applied" },
    { POC_Status_ID: 4, POC_Status: "Received" },
    { POC_Status_ID: 5, POC_Status: "Accepted" },
  ],
  designStatuses: [
    { Design_Status_ID: 1, Status: "Not started", Sort_Order: 10, Is_Complete: false },
    { Design_Status_ID: 2, Status: "In progress", Sort_Order: 20, Is_Complete: false },
    { Design_Status_ID: 3, Status: "Peer check", Sort_Order: 30, Is_Complete: false },
    { Design_Status_ID: 4, Status: "Completed", Sort_Order: 40, Is_Complete: true },
  ],
  propertyTypes: [
    { Property_Type_ID: 1, Property_Type: "Detached" },
    { Property_Type_ID: 2, Property_Type: "Semi-Detached" },
    { Property_Type_ID: 3, Property_Type: "Terraced" },
    { Property_Type_ID: 4, Property_Type: "Flat" },
    { Property_Type_ID: 5, Property_Type: "Bungalow" },
  ],
  propertyConfigs: [
    { Property_Config_ID: 1, Bedrooms: 2, Property_Type_ID: 3, Code: "2BT" },
    { Property_Config_ID: 2, Bedrooms: 2, Property_Type_ID: 4, Code: "2BF" },
    { Property_Config_ID: 3, Bedrooms: 3, Property_Type_ID: 2, Code: "3BS" },
    { Property_Config_ID: 4, Bedrooms: 3, Property_Type_ID: 1, Code: "3BD" },
    { Property_Config_ID: 5, Bedrooms: 4, Property_Type_ID: 1, Code: "4BD" },
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
  Auto_Plot_Count: 146,
  Minimum_Service_Call_Off: 12,
  Lay_Only_MU: false,
  Heat_Pump_Model_ID: 1,
  Default_Heat_Source_ID: 1,
};

export const demoScopes = [
  { Project_Scope_ID: 1, Utility_ID: 1, Scope_Status_ID: 3, Secured_Date: "2026-04-30", Design_Status_ID: 4, IDNO_ID: 2, Reference: "ESPE012189", External_Design: false },
  { Project_Scope_ID: 2, Utility_ID: 2, Scope_Status_ID: 3, Secured_Date: "2026-04-30", Design_Status_ID: 4, IDNO_ID: 1, Reference: "ESN012189", External_Design: false },
  { Project_Scope_ID: 3, Utility_ID: 3, Scope_Status_ID: 3, Secured_Date: "2026-05-06", Design_Status_ID: 3, IDNO_ID: 4, Reference: "4100063004", External_Design: false },
  { Project_Scope_ID: 4, Utility_ID: 5, Scope_Status_ID: 4, Secured_Date: "", Design_Status_ID: 1, IDNO_ID: null, Reference: "", External_Design: true },
];

/* A few rows so the Projects table is worth looking at offline. */
export const mockList = [
  { ...demoProject, Plot_Count: 146, scopes: demoScopes, Is_Priority: false,
    Date_Received: "2026-02-11", KPI_Date: "2026-02-25", Estimator_ID: 2, BDD_KAM_ID: 1,
    Quote_Type_ID: 1, I_and_C: false, Good_To_Go: "" },
  { Project_ID: 4712, Project_Ref: "2607.015", Revision: 0, Project_Status_ID: 2,
    Customer_ID: 11, Branch_ID: 2, Region_ID: 2, Site_Name: "Hollybank Rise",
    Site_Address: "Wolverhampton", Postcode: "WV6 8QT", Date_Received: "2026-06-03",
    KPI_Date: "2026-06-17", BDD_KAM_ID: 3, Estimator_ID: 4, Quote_Type_ID: 1,
    I_and_C: true, Is_Priority: true, Plot_Count: 62,
    scopes: [{ Utility_ID: 1 }, { Utility_ID: 2 }, { Utility_ID: 3 }, { Utility_ID: 4 }] },
  { Project_ID: 4713, Project_Ref: "2607.016", Revision: 1, Project_Status_ID: 5,
    Customer_ID: 12, Branch_ID: 3, Region_ID: 1, Site_Name: "Carrfield Gardens",
    Site_Address: "Preston", Postcode: "PR2 9LT", Date_Received: "2026-07-01",
    KPI_Date: "2026-07-15", BDD_KAM_ID: 1, Estimator_ID: 2, Quote_Type_ID: 3,
    I_and_C: false, Is_Priority: false, Plot_Count: 0,
    scopes: [{ Utility_ID: 5 }, { Utility_ID: 6 }] },
  { Project_ID: 4714, Project_Ref: "2607.017", Revision: 0, Project_Status_ID: 8,
    Customer_ID: 13, Branch_ID: 4, Region_ID: 3, Site_Name: "Wessex Fields",
    Site_Address: "Taunton", Postcode: "TA1 4LP", Date_Received: "2026-05-19",
    KPI_Date: "2026-06-02", Secured_Date: "2026-06-20", Good_To_Go: "2026-07-04",
    BDD_KAM_ID: 3, Estimator_ID: 4, Quote_Type_ID: 2,
    I_and_C: false, Is_Priority: false, Plot_Count: 210,
    scopes: [{ Utility_ID: 1 }, { Utility_ID: 3 }] },
];

/* Mutable store backing the admin screens when running on sample data. */
export const adminMock = {
  Property_Type: [
    { Property_Type_ID: 1, Property_Type: "Detached", Sort_Order: 10, Is_Active: true },
    { Property_Type_ID: 2, Property_Type: "Semi-Detached", Sort_Order: 20, Is_Active: true },
    { Property_Type_ID: 3, Property_Type: "Terraced", Sort_Order: 30, Is_Active: true },
    { Property_Type_ID: 4, Property_Type: "Flat", Sort_Order: 40, Is_Active: true },
    { Property_Type_ID: 5, Property_Type: "Bungalow", Sort_Order: 50, Is_Active: true },
  ],
  Property_Config: [
    { Property_Config_ID: 1, Bedrooms: 2, Property_Type_ID: 3, Code: "2BT" },
    { Property_Config_ID: 2, Bedrooms: 2, Property_Type_ID: 4, Code: "2BF" },
    { Property_Config_ID: 3, Bedrooms: 3, Property_Type_ID: 2, Code: "3BS" },
    { Property_Config_ID: 4, Bedrooms: 3, Property_Type_ID: 1, Code: "3BD" },
    { Property_Config_ID: 5, Bedrooms: 4, Property_Type_ID: 1, Code: "4BD" },
  ],
  Quote_Type: lookups.quoteTypes,
  Region: lookups.regions,
  Role: lookups.roles,
  IDNO: lookups.idnos,
  Fire_Service: lookups.fireServices,
  Heat_Source: lookups.heatSources,
  Heat_Pump_Model: lookups.heatPumpModels,
  Utility: [],
  Design_Status: lookups.designStatuses,
  Scope_Status: lookups.scopeStatuses,
  Project_Status: lookups.projectStatuses,
  Customer: [],
  Person: [
    { Person_ID: 1, Person_Name: "A. Whitcombe", Email: "aw@example.com", Is_Active: true },
    { Person_ID: 2, Person_Name: "R. Nkemelu", Email: "rn@example.com", Is_Active: true },
    { Person_ID: 3, Person_Name: "J. Farrell", Email: "jf@example.com", Is_Active: true },
    { Person_ID: 4, Person_Name: "S. Dhillon", Email: "sd@example.com", Is_Active: true },
  ],
  Person_Role: [
    { Person_Role_ID: 1, Person_ID: 1, Role_ID: 1 },
    { Person_Role_ID: 2, Person_ID: 2, Role_ID: 2 },
    { Person_Role_ID: 3, Person_ID: 2, Role_ID: 3 },
    { Person_Role_ID: 4, Person_ID: 3, Role_ID: 1 },
    { Person_Role_ID: 5, Person_ID: 3, Role_ID: 2 },
    { Person_Role_ID: 6, Person_ID: 3, Role_ID: 5 },
    { Person_Role_ID: 7, Person_ID: 4, Role_ID: 2 },
  ],
  Sub_Region: [
    { Sub_Region_ID: 1, Region_ID: 1, Sub_Region: "Yorkshire", Sort_Order: 10 },
    { Sub_Region_ID: 2, Region_ID: 1, Sub_Region: "North West", Sort_Order: 20 },
    { Sub_Region_ID: 3, Region_ID: 2, Sub_Region: "West Midlands", Sort_Order: 10 },
    { Sub_Region_ID: 4, Region_ID: 3, Sub_Region: "Wessex", Sort_Order: 10 },
  ],
};

/* ── Sample schedule for the Planning board ──

   Built relative to today rather than at fixed dates, so the sample
   always lands in the window the board opens on. A fixture dated 2026
   is a fixture that looks like an empty schedule the following spring,
   and "no data" is exactly the thing somebody would be trying to rule
   out when they turn the mocks on.

   Deliberately awkward in three places: two bookings that overlap on
   one team so the lane packing shows, a booking that starts before the
   default window so clipping shows, and a call-off with nothing
   assigned so the unassigned row has something in it. */
export function planningMock() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (n) => {
    const x = new Date(d.getTime() + n * 86400000);
    const p = (v) => String(v).padStart(2, "0");
    return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  };

  const assignments = [
    /* Works the whole weekend, because its days run across one — a
       fixture whose day rows contradict its own weekend rule would
       re-lay itself the first time anybody dragged it, and looking
       like a bug is the last thing sample data should do. */
    { Assignment_ID: 1, Submission_ID: 501, Task_Type_ID: 1, Team_ID: 1, Start_Date: day(-2), End_Date: day(1), Plot_Range: "1-8", Status: "In Progress", Sat_AM: true, Sat_PM: true, Sun_AM: true, Sun_PM: true },
    { Assignment_ID: 2, Submission_ID: 501, Task_Type_ID: 3, Team_ID: 2, Start_Date: day(2), End_Date: day(3), Plot_Range: "1-8", Status: "Scheduled" },
    { Assignment_ID: 3, Submission_ID: 502, Task_Type_ID: 1, Team_ID: 1, Start_Date: day(1), End_Date: day(4), Plot_Range: "12-20", Status: "Scheduled", Sat_AM: true, Sat_PM: true },
    { Assignment_ID: 4, Submission_ID: 503, Task_Type_ID: 4, Team_ID: 3, Start_Date: day(5), End_Date: day(6), Plot_Range: null, Status: "Scheduled" },
  ];

  return {
    submissions: [
      { Submission_ID: 501, Status: "Scheduled", Project_ID: 1, AP_Number: "AP-2607.001", Site_Name: "Willow Grange", Customer_Name: "Anwyl Homes", Work_Type_ID: 1, Preferred_Date: day(-2) },
      { Submission_ID: 502, Status: "Scheduled", Project_ID: 2, AP_Number: "AP-2607.014", Site_Name: "Kestrel Rise", Customer_Name: "Redrow", Work_Type_ID: 1, Preferred_Date: day(1) },
      { Submission_ID: 503, Status: "Reviewed", Project_ID: 1, AP_Number: "AP-2607.001", Site_Name: "Willow Grange", Customer_Name: "Anwyl Homes", Work_Type_ID: 2, Preferred_Date: day(5) },
      { Submission_ID: 504, Status: "Pending Review", Project_ID: 3, AP_Number: "AP-2608.002", Site_Name: "Marsh Fields", Customer_Name: "Bellway", Work_Type_ID: 1, Preferred_Date: day(3) },
    ],
    assignments,
    workDays: [
      { Work_Day_ID: 1, Assignment_ID: 1, Work_Date: day(-2), Part: "Full", Off_Site: true },
      { Work_Day_ID: 2, Assignment_ID: 1, Work_Date: day(-1), Part: "Full", Off_Site: false },
      { Work_Day_ID: 3, Assignment_ID: 1, Work_Date: day(0), Part: "Full", Off_Site: false },
      { Work_Day_ID: 4, Assignment_ID: 1, Work_Date: day(1), Part: "AM", Off_Site: false },
      { Work_Day_ID: 5, Assignment_ID: 2, Work_Date: day(2), Part: "PM", Off_Site: false },
      { Work_Day_ID: 6, Assignment_ID: 2, Work_Date: day(3), Part: "Full", Off_Site: false },
      { Work_Day_ID: 7, Assignment_ID: 3, Work_Date: day(1), Part: "Full", Off_Site: false },
      { Work_Day_ID: 8, Assignment_ID: 3, Work_Date: day(4), Part: "Full", Off_Site: false },
    ],
    workTypes: [
      { Work_Type_ID: 1, Work_Type_Name: "Mains Call Off", Display_Order: 10 },
      { Work_Type_ID: 2, Work_Type_Name: "Service Call Off", Display_Order: 20 },
    ],
    taskTypes: [
      { Task_Type_ID: 1, Task_Type_Name: "Excavation", Display_Order: 10 },
      { Task_Type_ID: 2, Task_Type_Name: "Laying", Display_Order: 20 },
      { Task_Type_ID: 3, Task_Type_Name: "Jointing", Display_Order: 30 },
      { Task_Type_ID: 4, Task_Type_Name: "Reinstatement", Display_Order: 40 },
    ],
    workTypeTasks: [
      { Work_Type_ID: 1, Task_Type_ID: 1, Display_Order: 10 },
      { Work_Type_ID: 1, Task_Type_ID: 2, Display_Order: 20 },
      { Work_Type_ID: 1, Task_Type_ID: 3, Display_Order: 30 },
      { Work_Type_ID: 1, Task_Type_ID: 4, Display_Order: 40 },
      { Work_Type_ID: 2, Task_Type_ID: 1, Display_Order: 10 },
      { Work_Type_ID: 2, Task_Type_ID: 4, Display_Order: 20 },
    ],
    teams: [
      { Team_ID: 1, Team_Name: "MU Gang 1", Active: true },
      { Team_ID: 2, Team_Name: "Jointing North", Active: true },
      { Team_ID: 3, Team_Name: "Reinstatement A", Active: true },
      { Team_ID: 4, Team_Name: "MU Gang 2", Active: true },
      { Team_ID: 5, Team_Name: "Old Gang", Active: false },
    ],
    regions: [
      { Region_ID: 1, Region: "North" },
      { Region_ID: 2, Region: "Midlands" },
      { Region_ID: 3, Region: "South" },
    ],
    projects: [
      { Project_ID: 1, Display_Ref: "2607.001", Site_Name: "Willow Grange", Region_ID: 1, Project_Manager_ID: 2 },
      { Project_ID: 2, Display_Ref: "2607.014", Site_Name: "Kestrel Rise", Region_ID: 2, Project_Manager_ID: 3 },
      { Project_ID: 3, Display_Ref: "2608.002", Site_Name: "Marsh Fields", Region_ID: 1, Project_Manager_ID: null },
    ],
    people: [
      { Person_ID: 2, Person_Name: "R. Nkemelu", Planner_Colour: "#0891b2" },
      { Person_ID: 3, Person_Name: "J. Farrell", Planner_Colour: null },
    ],
    peopleHaveColours: true,
    statuses: [
      { Call_Off_Status_ID: 1, Status: "Scheduled", Colour: "#3b82f6", Display_Order: 10, Is_Active: true },
      { Call_Off_Status_ID: 2, Status: "In Progress", Colour: "#f59e0b", Display_Order: 20, Is_Active: true },
      { Call_Off_Status_ID: 3, Status: "Complete", Colour: "#16a34a", Display_Order: 30, Is_Active: true },
    ],
    agreements: [
      { Project_ID: 1, Utility_ID: 1 },
      { Project_ID: 1, Utility_ID: 2 },
      { Project_ID: 2, Utility_ID: 1 },
      { Project_ID: 2, Utility_ID: 3 },
    ],
    utilities: [
      { Utility_ID: 1, Utility: "Electric", Colour: "#ffbb00", Sort_Order: 10 },
      { Utility_ID: 2, Utility: "Gas", Colour: "#ff0000", Sort_Order: 20 },
      { Utility_ID: 3, Utility: "Water", Colour: "#2ccc00", Sort_Order: 30 },
    ],
  };
}
