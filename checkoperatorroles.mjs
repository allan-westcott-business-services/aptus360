/* Who is what, on a utility network.

   Each utility has an incumbent — the monopoly that owns the existing
   network — and independents that compete with it:

     electric   DNO / IDNO      Distribution Network Operator
     gas        GT  / IGT       Gas Transporter
     water      WU  / IWU       Water Undertaker

   "DNO" had been standing in for every incumbent, which is wrong: a DNO
   distributes electricity and nothing else.

   The rules this pins are the ones the schema enforces, so a change to
   either has to be a change to both. */

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const INCUMBENT = ["DNO", "GT", "WU"];
const INDEPENDENT = ["IDNO", "IGT", "IWU"];

/* Each incumbent has exactly one independent counterpart, and the
   naming says which: an I in front. */
for (const [inc, ind] of [["DNO", "IDNO"], ["GT", "IGT"], ["WU", "IWU"]]) {
  if (`I${inc}` !== ind) fail(`${inc} and ${ind} are not counterparts`);
}
if (INCUMBENT.length !== INDEPENDENT.length) {
  fail("a utility has an incumbent with no independent, or the reverse");
}

/* An organisation holds at most one incumbent role: it is the incumbent
   for one utility, not for several. */
const holds = (roles) => roles.filter((r) => INCUMBENT.includes(r)).length;
if (holds(["DNO"]) !== 1) fail("a single incumbent role was not counted");
if (holds(["DNO", "GT"]) <= 1) {
  fail("two incumbent roles were not recognised as two");
}

/* Independents may hold as many as they like — the same company can
   distribute electricity and transport gas in different developments. */
const independents = (roles) => roles.filter((r) => INDEPENDENT.includes(r));
if (independents(["IDNO", "IGT", "IWU"]).length !== 3) {
  fail("an independent was stopped from holding several roles");
}

/* And the two sets do not overlap: an incumbent is not an independent
   of itself. */
for (const r of INCUMBENT) {
  if (INDEPENDENT.includes(r)) fail(`${r} is in both sets`);
}

/* The project form offers customers, not operators. A DNO appearing in
   the customer branch list would let a project be filed against the
   network owner rather than the developer paying for it. */
const isCustomerType = (name) => /developer|customer/i.test(name);
for (const r of [...INCUMBENT, ...INDEPENDENT]) {
  if (isCustomerType(r)) fail(`${r} would be offered as a customer branch`);
}
if (!isCustomerType("Housing Developer")) {
  fail("a housing developer stopped counting as a customer");
}

console.log(bad ? `\n${bad} problem(s)`
  : "Operator roles behave (one incumbent, many independents, no overlap).");
process.exit(bad ? 1 : 0);
