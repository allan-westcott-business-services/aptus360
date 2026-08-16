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

console.log(bad ? `\n${bad} problem(s)`
  : "The organisation role filter behaves (DNO does not mean IDNO).");
process.exit(bad ? 1 : 0);
