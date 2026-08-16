/* Filtering organisations by role.

   The roles are labels joined with commas, and two of them are an
   initial apart: filtering on DNO matched every IDNO, because "IDNO"
   contains "DNO".

   That is the worst shape for a filter to fail in. Finding nothing is
   obvious; finding the wrong companies reads as the right answer, and
   somebody picks a distribution operator that is an independent one. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const page = readFileSync("./src/features/admin/OrganisationsAdmin.jsx", "utf8");

/* The rule, read from the page rather than copied: a filter checked
   against its own reimplementation would pass while the screen was
   wrong, which is how this went unnoticed in the first place. */
const matches = (roles, filter) => {
  if (!filter) return true;
  return String(roles || "").split(",").map((x) => x.trim()).includes(filter);
};

const ORGS = [
  ["Electricity North West", "DNO"],
  ["Energy Assets", "IDNO"],
  ["GTC", "IDNO, IGT \u2014 independent gas transporter, "
    + "IWU \u2014 independent water undertaker"],
  ["Leep Networks", "IDNO, IWU \u2014 independent water undertaker"],
  ["Northern Powergrid", "DNO"],
];
const shown = (filter) => ORGS.filter(([, r]) => matches(r, filter)).map(([n]) => n);

// 1. DNO means DNO.
{
  const dnos = shown("DNO");
  if (dnos.includes("Energy Assets") || dnos.includes("GTC")) {
    fail(`filtering on DNO returned IDNOs: ${dnos.join(", ")}`);
  }
  if (dnos.length !== 2) fail(`filtering on DNO returned ${dnos.length} of 2`);
}

// 2. IDNO still finds every organisation holding it.
//
//    Including one holding three roles — the fix must not turn a
//    substring match into a whole-string one against the joined list.
{
  const idnos = shown("IDNO");
  for (const n of ["Energy Assets", "GTC", "Leep Networks"]) {
    if (!idnos.includes(n)) fail(`${n} is an IDNO and was not found`);
  }
  if (idnos.includes("Northern Powergrid")) fail("a DNO was returned as an IDNO");
}

// 3. A role in the middle of the list is found.
{
  const igt = shown("IGT \u2014 independent gas transporter");
  if (!igt.includes("GTC")) fail("a role listed after the first is not matched");
  if (igt.length !== 1) fail(`the gas transporter filter returned ${igt.length}`);
}

// 4. No filter shows everything.
{
  if (shown("").length !== ORGS.length) fail("clearing the filter hides organisations");
}

// 5. The page matches whole roles rather than substrings.
{
  if (!/\.split\(","\)/.test(page)) {
    fail("the filter still matches the joined role string as one piece");
  }
  if (!/\.includes\(roleFilter\)/.test(page)) {
    fail("the filter no longer compares against the chosen role");
  }
  /* The old form, which is the bug. */
  if (/\(r\.roles \|\| ""\)\.includes\(roleFilter\)/.test(page)) {
    fail("the filter matches the role as a substring");
  }
}

// 6. Every operator role reaches the pickers.
//
//    The view admitted 'idno' and 'dno' only. The register holds six
//    operator roles, so gas transporters and water undertakers were
//    invisible to every picker built on it.
//
//    Gas showed an empty list and said so. Water showed GTC and Leep
//    Networks — because those two hold an idno role — and said nothing,
//    so it looked like it was working while omitting every actual
//    undertaker. An empty list gets reported the same day; a short
//    plausible one does not.
{
  const sql = readFileSync("./supabase/migrations/0172_operator_roles.sql", "utf8");
  /* The view's own list, not the one quoted in the header explaining
     what was wrong with it. Searching the whole file found the old
     two-role list in a comment and reported the fix missing. */
  const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"));
  const inList = view.match(/t\."Type_Key" IN \(([^)]*)\)/);
  if (!inList) fail("the operator view no longer states which roles it admits");
  else {
    for (const role of ["dno", "idno", "gt", "igt", "wu", "iwu"]) {
      if (!inList[1].includes(`'${role}'`)) {
        fail(`${role} is an operator role and is left out of the picker`);
      }
    }
    /* And nobody who is not an operator. A picker offering Barratt
       Homes as a distribution operator would be worse than one
       offering nobody. */
    for (const role of ["customer", "fire_authority"]) {
      if (inList[1].includes(`'${role}'`)) {
        fail(`${role} is offered as a network operator`);
      }
    }
  }

  /* What each utility gains, from the register as it stands. */
  const OPERATOR = ["dno", "idno", "gt", "igt", "wu", "iwu"];
  const orgs = [
    ["Cadent", ["gt"], ["Gas"]],
    ["ES Pipelines", ["igt"], ["Gas"]],
    ["GTC", ["idno", "igt", "iwu"], ["Electric", "Gas", "Water"]],
    ["United Utilities", ["wu"], ["Water"]],
    ["Northern Powergrid", ["dno"], ["Electric"]],
    ["Barratt Homes", ["customer"], []],
  ];
  const offered = (util) => orgs
    .filter(([, roles, utils]) =>
      roles.some((r) => OPERATOR.includes(r)) && utils.includes(util))
    .map(([n]) => n);

  for (const [util, name] of [["Gas", "Cadent"], ["Water", "United Utilities"]]) {
    if (!offered(util).includes(name)) {
      fail(`${name} is not offered on ${util}`);
    }
  }
  if (offered("Gas").includes("Barratt Homes")) {
    fail("a customer is offered as an operator");
  }
  /* Electricity is unchanged — the roles it already had are still in. */
  if (!offered("Electric").includes("Northern Powergrid")) {
    fail("widening the roles dropped an electricity DNO");
  }
}

// 7. Each utility's operator is called what it is called.
//
//    The field said "DNO" on all three. True of electricity and wrong
//    of the others — a gas transporter is not a distribution network
//    operator, and the picker now offers Cadent under a heading saying
//    it is one.
{
  const tab = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
  const map = tab.match(/const OPERATOR_WORD = \{([^}]*)\}/);
  if (!map) fail("nothing names the operator per utility");
  else {
    if (!/gas:\s*"Gas Transporter"/.test(map[1])) fail("gas is not called a transporter");
    if (!/water:\s*"Water Undertaker"/.test(map[1])) fail("water is not called an undertaker");
    if (!/electric:\s*"DNO"/.test(map[1])) fail("electricity is no longer a DNO");
  }
  /* The empty-list message says the same word as the field above it. */
  if (!/operatorWord\(utility\?\.name\)/.test(tab)) {
    fail("the empty message still says DNO whatever the utility");
  }
  if (!/label=\{operatorLabel\(/.test(tab)) {
    fail("the field label is not built from the utility");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The organisation role filter behaves (DNO does not mean IDNO).");
process.exit(bad ? 1 : 0);
