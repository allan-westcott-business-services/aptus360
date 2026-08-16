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

// 7. Every operator role can record which utilities it works in.
//
//    The admin screen asked that question only of an idno or a dno, so
//    Cadent's record had nowhere to say it works in gas — and a picker
//    that matches on utility could never offer it. The same two-role
//    list, in a second place.
{
  const admin = readFileSync("./src/features/admin/OrganisationsAdmin.jsx", "utf8");
  const list = admin.match(/const OPERATOR_ROLES = \[([^\]]*)\]/);
  if (!list) fail("the admin screen does not state which roles are operators");
  else {
    for (const role of ["dno", "idno", "gt", "igt", "wu", "iwu"]) {
      if (!list[1].includes(`"${role}"`)) {
        fail(`a ${role} cannot record which utilities it works in`);
      }
    }
  }
  /* And the test uses it rather than a list of its own. */
  if (!/OPERATOR_ROLES\.includes\(/.test(admin)) {
    fail("the operator test keeps its own list of roles");
  }
  if (/\["idno", "dno"\]\.includes/.test(admin)) {
    fail("the two-role list is still there");
  }

  /* The two halves agree. This screen decides whether the question is
     asked; the view decides whether the answer is used, and a role in
     one but not the other is a company that can be described and never
     offered, or offered and never described. */
  const sql = readFileSync("./supabase/migrations/0172_operator_roles.sql", "utf8");
  const view = sql.slice(sql.indexOf("CREATE OR REPLACE VIEW"));
  const inView = view.match(/t\."Type_Key" IN \(([^)]*)\)/);
  if (list && inView) {
    for (const role of [...list[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1])) {
      if (!inView[1].includes(`'${role}'`)) {
        fail(`${role} can record utilities but is not offered by any picker`);
      }
    }
    for (const role of [...inView[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])) {
      if (!list[1].includes(`"${role}"`)) {
        fail(`${role} is offered by pickers but cannot record its utilities`);
      }
    }
  }
}

// 8. Each utility's operator is called what it is called.
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

// 9. A picker offers the right sort of company, not just one working
//    in the utility.
//
//    The filter matched on utility alone, so an IDNO marked as covering
//    gas was offered as a gas transporter. The role is what makes
//    somebody a transporter; the utility only says where.
{
  /* Read from the page, not copied. A copy here passes while the page
     offers electricity companies as gas transporters — which is the
     whole fault this section exists to catch. */
  const tabSrc = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
  const mapSrc = tabSrc.match(/const OPERATOR_ROLES = \{([\s\S]*?)\};/);
  if (!mapSrc) fail("the page does not say which roles belong to which utility");
  const ROLES = {};
  for (const m of (mapSrc?.[1] ?? "").matchAll(/(\w+):\s*\[([^\]]*)\]/g)) {
    ROLES[m[1]] = [...m[2].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
  }
  /* And says something for each of the three. */
  for (const u of ["electric", "gas", "water"]) {
    if (!ROLES[u]?.length) fail(`${u} has no operator roles named`);
  }
  const ops = [
    { Name: "Cadent", role_keys: ["gt"], utility_ids: [2] },
    { Name: "ES Pipelines", role_keys: ["igt"], utility_ids: [2] },
    { Name: "GTC", role_keys: ["idno", "igt", "iwu"], utility_ids: [1, 2, 3] },
    { Name: "Leep Networks", role_keys: ["idno", "iwu"], utility_ids: [1, 2, 3] },
    { Name: "United Utilities", role_keys: ["wu"], utility_ids: [3] },
  ];
  const offered = (utility, id) => {
    const roles = ROLES[utility] ?? null;
    return ops.filter((o) =>
      (!roles || (o.role_keys || []).some((k) => roles.includes(k)))
      && (o.utility_ids || []).some((x) => Number(x) === Number(id)))
      .map((o) => o.Name);
  };

  const gas = offered("gas", 2);
  if (!gas.includes("Cadent")) fail("a gas transporter is not offered on gas");
  if (!gas.includes("GTC")) fail("a company holding igt is not offered on gas");
  /* Leep covers gas in this fixture and holds only idno and iwu — an
     electricity and water company, and not a transporter. */
  if (gas.includes("Leep Networks")) {
    fail("an IDNO covering gas is offered as a gas transporter");
  }

  const water = offered("water", 3);
  if (!water.includes("United Utilities")) fail("a water undertaker is not offered on water");
  if (water.includes("Cadent")) fail("a gas transporter is offered on water");

  /* And the screen does both halves rather than one. */
  const tab = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
  if (!/rightRole\(o\) && covers\(o\)/.test(tab)) {
    fail("the picker matches on utility without checking the role");
  }
  /* Whoever is already chosen stays in the list, or changing the rules
     would empty a field that has a good answer in it and show None over
     a saved value. */
  if (!/Number\(o\.Organisation_ID\) === Number\(sc\.DNO_Organisation_ID\)/.test(tab)) {
    fail("an existing selection drops out of its own picker");
  }
  /* A utility nobody has named roles for still offers everything, which
     is the old behaviour and the safe fallback. */
  if (!/!roles\s*\n?\s*\|\|/.test(tab)) {
    fail("a utility with no named roles offers nobody at all");
  }
}

// 10. The empty message says what is actually missing.
//
//    "No Gas Transporter is marked as working in this utility" said
//    nothing — a gas transporter works in gas by definition. Two things
//    can be wrong and they have different fixes.
{
  const tab = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
  if (!/anyWithRole/.test(tab)) {
    fail("the message cannot tell 'none set up' from 'none linked to this utility'");
  }
  if (!/has been set up yet/.test(tab)) {
    fail("there is no message for a role nobody holds");
  }
  if (!/Set which utilities each/.test(tab)) {
    fail("there is no message for a role held but not linked to the utility");
  }
  /* The old wording, which was the complaint. */
  if (/is marked as working in `\s*\+?\s*\n?\s*"?this utility/.test(tab)
    || /marked as working in this utility/.test(tab)) {
    fail("the message still restates the field back at the reader");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The organisation role filter behaves (DNO does not mean IDNO).");
process.exit(bad ? 1 : 0);
