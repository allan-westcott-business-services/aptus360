/* Which teams may be offered a piece of work.

   Task_Type held one Craft_ID, so the model could say "Excavation & Lay
   is done by craft X" and no more. Ours is done by three — Multi
   Utility Mains, Multi Utility Service and Electric Only — and which
   applies depends on whether the call-off is mains or service and which
   utilities are on it. With nothing to match on, the craft was left
   unset and every team appeared in the dropdown.

   A craft now carries the phase, the scope and the utilities. */
import { craftsForWork, eligibleTeams } from "./src/features/calloffs/assignments.js";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const EXC = 1, JOINT = 3, REINST = 4;
const ELECTRIC = 1, GAS = 2, WATER = 3;

const crafts = [
  { Craft_ID: 1, Craft_Name: "Multi Utility Mains - Excavation & Lay", Task_Type_ID: EXC, Scope: "mains" },
  { Craft_ID: 2, Craft_Name: "Multi Utility Service - Excavation & Lay", Task_Type_ID: EXC, Scope: "service" },
  { Craft_ID: 3, Craft_Name: "Electric Only - Excavation & Lay", Task_Type_ID: EXC, Scope: null },
  { Craft_ID: 4, Craft_Name: "Electric Jointing", Task_Type_ID: JOINT, Scope: "service" },
  { Craft_ID: 5, Craft_Name: "Reinstatement", Task_Type_ID: REINST, Scope: null },
];
/* Only Electric Only is restricted. No rows means any utility. */
const craftUtilities = [{ Craft_ID: 3, Utility_ID: ELECTRIC }];

const names = (o) => craftsForWork({ crafts, craftUtilities, ...o })
  .map((c) => c.Craft_Name).sort();

// 1. A mains call-off with gas and water can only go to Multi Utility
//    Mains. That is the rule as stated.
{
  const got = names({ taskTypeId: EXC, scope: "mains", utilityIds: [ELECTRIC, GAS, WATER] });
  if (got.join() !== "Multi Utility Mains - Excavation & Lay") {
    fail(`mains with gas and water matched: ${got.join(", ") || "nothing"}`);
  }
}

// 2. The electric part of the same call-off can also go to Electric
//    Only — which is what splitting the phase by utility produces.
{
  const got = names({ taskTypeId: EXC, scope: "mains", utilityIds: [ELECTRIC] });
  if (!got.includes("Electric Only - Excavation & Lay")) {
    fail("an electric-only booking was refused the Electric Only craft");
  }
  if (!got.includes("Multi Utility Mains - Excavation & Lay")) {
    fail("a multi-utility gang was refused work it can plainly do");
  }
}

// 3. Covered, not merely overlapping. Gas and electric together is not
//    a match for a gang that only lays electric — half a job is not a
//    match, and this is the case that makes the rule worth having.
{
  const got = names({ taskTypeId: EXC, scope: "mains", utilityIds: [ELECTRIC, GAS] });
  if (got.includes("Electric Only - Excavation & Lay")) {
    fail("Electric Only was offered a booking that includes gas");
  }
}

// 4. Scope separates the two multi-utility crafts.
{
  const mains = names({ taskTypeId: EXC, scope: "mains", utilityIds: [GAS] });
  if (mains.includes("Multi Utility Service - Excavation & Lay")) {
    fail("a service craft was offered mains work");
  }
  const svc = names({ taskTypeId: EXC, scope: "service", utilityIds: [GAS] });
  if (svc.includes("Multi Utility Mains - Excavation & Lay")) {
    fail("a mains craft was offered service work");
  }
}

// 5. Scope null on a craft means either, not unknown.
{
  for (const scope of ["mains", "service"]) {
    if (!names({ taskTypeId: REINST, scope, utilityIds: [GAS] }).includes("Reinstatement")) {
      fail(`reinstatement was refused ${scope} work`);
    }
  }
}

// 6. The phase must match: a jointing gang is not offered a dig.
{
  if (names({ taskTypeId: EXC, scope: "service", utilityIds: [ELECTRIC] })
    .includes("Electric Jointing")) {
    fail("a jointing craft was offered excavation");
  }
}

// 7. A craft with no phase set matches nothing rather than everything.
//    Street Lighting, Water Chlorination and Gas Engineer are in this
//    state until somebody maps them, and matching everything would put
//    those gangs on every job on the board.
{
  const unmapped = [{ Craft_ID: 9, Craft_Name: "Gas Engineer", Task_Type_ID: null, Scope: null }];
  if (craftsForWork({ crafts: unmapped, craftUtilities: [], taskTypeId: EXC }).length) {
    fail("a craft with no phase matched work");
  }
}

// 8. And the dropdown, which is what somebody actually sees.
{
  const teams = [
    { Team_ID: 1, Team_Name: "MU Team 1", Active: true },
    { Team_ID: 2, Team_Name: "Electric Only NW", Active: true },
    { Team_ID: 3, Team_Name: "Jointing Team NW", Active: true },
    { Team_ID: 4, Team_Name: "Reinstatement NW", Active: true },
  ];
  const teamCrafts = [
    { Team_ID: 1, Craft_ID: 1 }, { Team_ID: 2, Craft_ID: 3 },
    { Team_ID: 3, Craft_ID: 4 }, { Team_ID: 4, Craft_ID: 5 },
  ];
  const offered = (o) => eligibleTeams(teams, {
    teamCrafts, teamRegions: [], crafts, craftUtilities, ...o,
  }).map((t) => t.Team_Name);

  const full = offered({ taskTypeId: EXC, scope: "mains", utilityIds: [ELECTRIC, GAS, WATER] });
  if (full.join() !== "MU Team 1") {
    fail(`a full mains call-off offered: ${full.join(", ") || "nobody"}`);
  }
  if (full.includes("Jointing Team NW") || full.includes("Reinstatement NW")) {
    fail("a gang without the craft was offered excavation");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "Craft matching behaves (phase, scope and utilities all count).");
process.exit(bad ? 1 : 0);
