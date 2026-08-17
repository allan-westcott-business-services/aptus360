/* The councils a project can name.

   382 of them, loaded into the organisation register alongside the
   customers, the DNOs and the fire authorities — because a council is
   an organisation the business deals with, and a second register for
   one kind of organisation is a second place to look.

   One role, eleven kinds. Local Authority already existed as a type, so
   the kinds are subtypes underneath it, the way Subcontractor holds
   trades. Eleven separate types would have made "show me the local
   authorities" impossible to ask, and that is the question people
   actually ask. */
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };

const sql = readFileSync("./supabase/migrations/0177_uk_councils.sql", "utf8");
const tab = readFileSync("./src/features/stakeholders/StakeholderTab.jsx", "utf8");
const api = readFileSync("./netlify/functions/lookups.js", "utf8");

/* The tiers, read from the screen rather than copied: a copy here would
   pass while the dropdowns offered the wrong thing. */
const tierOf = (name) => {
  const m = tab.match(new RegExp(`const ${name} = \\[([^\\]]*)\\]`));
  return m ? [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]) : [];
};
const COUNTY = tierOf("COUNTY_TIER");
const TOWN = tierOf("TOWN_TIER");
const SINGLE = tierOf("SINGLE_TIER");

/* What the source file holds, by kind. */
const COUNTS = {
  county_council: 21, district_council: 78, borough_council: 72,
  city_council: 14, unitary: 62, met_borough: 36, london_borough: 32,
  council_area: 32, principal_council: 22, ni_district: 11, sui_generis: 2,
};

// 1. Every kind lands somewhere.
//
//    A kind in no tier is a council loaded into the register and
//    offered by nothing — invisible, and only discovered by somebody
//    failing to find their own council.
{
  const placed = [...COUNTY, ...TOWN, ...SINGLE];
  for (const kind of Object.keys(COUNTS)) {
    if (!placed.includes(kind)) fail(`${kind} is in the register and no dropdown`);
  }
  /* And nothing is placed twice within a list. */
  for (const list of [COUNTY, TOWN, SINGLE]) {
    if (new Set(list).size !== list.length) fail("a kind is listed twice in one tier");
  }
  /* County and town tiers are exclusive: a district is not a county. */
  for (const k of COUNTY) {
    if (TOWN.includes(k)) fail(`${k} is both a county and a town`);
  }
}

// 2. Single-tier councils appear in both lists.
//
//    A unitary has nothing above it and does both jobs. Scotland, Wales
//    and Northern Ireland have no county tier at all, so forcing their
//    councils into one box would leave the other empty for those
//    projects.
{
  const sum = (ks) => ks.reduce((t, k) => t + (COUNTS[k] || 0), 0);
  const counties = sum(COUNTY) + sum(SINGLE);
  const towns = sum(TOWN) + sum(SINGLE);

  if (counties !== 218) fail(`the county list holds ${counties}, wanted 218`);
  if (towns !== 361) fail(`the town list holds ${towns}, wanted 361`);

  for (const nationKind of ["council_area", "principal_council", "ni_district"]) {
    if (!SINGLE.includes(nationKind)) {
      fail(`${nationKind} has no county above it and is not single-tier`);
    }
  }
  /* Both lists are built from the tiers, not from one another. */
  if (!/inTier\(TOWN_TIER\), \.\.\.inTier\(SINGLE_TIER\)/.test(tab)) {
    fail("the town list does not include the single-tier councils");
  }
  if (!/inTier\(COUNTY_TIER\), \.\.\.inTier\(SINGLE_TIER\)/.test(tab)) {
    fail("the county list does not include the single-tier councils");
  }
}

// 3. Told apart by subtype, not by name.
//
//    "Durham County Council" and "County Durham" are the same body
//    spelled two ways, and a rule reading the name would get one of
//    them wrong.
{
  if (/Name.*includes\("County"\)|\/county\/i\.test\(.*Name/.test(tab)) {
    fail("councils are sorted into tiers by reading their names");
  }
  if (!/c\.Subtype_Key/.test(tab)) fail("the tiers are not matched on the subtype");
}

// 4. A council that no longer exists is not offered.
//
//    England is mid-reorganisation: 12 councils go in April 2027 and
//    172 in April 2028. A dropdown offering a body that has ceased to
//    exist is how a project comes to name one.
{
  if (!/Abolition_Date/.test(sql)) fail("the abolition dates are not loaded");
  if (!/!c\.Abolition_Date \|\| c\.Abolition_Date > today/.test(tab)) {
    fail("a council past its abolition date is still offered");
  }
  /* Filtered on the way out, not deleted: a project that already names
     one keeps it. */
  if (/DELETE FROM "Organisation"/.test(sql)) {
    fail("councils are removed rather than stopped being offered");
  }
  /* And it is said at the moment of choosing, rather than found out
     later. */
  if (!/Ceases /.test(tab)) fail("nothing says when a chosen council ceases");
}

// 5. One role, eleven kinds — not eleven roles.
{
  if (!/"Has_Subtypes" = true/.test(sql)) {
    fail("Local Authority does not gain subtypes");
  }
  if (!/Type_Key" = 'local_authority'/.test(sql)) {
    fail("the councils are not given the local authority role");
  }
  /* Eleven new types would have made "show me the local authorities"
     impossible to ask. */
  if (/INSERT INTO "Organisation_Type"/.test(sql)) {
    fail("the kinds were added as types rather than subtypes");
  }
  const subs = sql.match(/CROSS JOIN \(VALUES([\s\S]*?)\) AS v\(k, l, o\)/);
  const keys = subs ? [...subs[1].matchAll(/\('([a-z_]+)'/g)].map((m) => m[1]) : [];
  for (const kind of Object.keys(COUNTS)) {
    if (!keys.includes(kind)) fail(`${kind} is not seeded as a subtype`);
  }
}

// 6. Loaded once, however often it runs.
//
//    Keyed on the GSS code rather than the name: names change, and
//    Colchester Borough became Colchester City in 2022.
{
  /* The organisation insert, not the role insert below it — both
     mention the GSS code, so a search of the whole file passed while
     the insert had lost its guard and every rerun duplicated 382
     councils. */
  const orgIns = sql.slice(sql.indexOf('INSERT INTO "Organisation" ("Name"'));
  const orgBody = orgIns.slice(0, orgIns.indexOf(";"));
  if (!/NOT EXISTS/.test(orgBody)) {
    fail("running it twice loads every council a second time");
  }
  if (!/o\."GSS_Code" = c\.gss/.test(orgBody)) {
    fail("councils are matched on something other than their GSS code");
  }
  if (!/organisation_gss/.test(sql)) fail("nothing stops two rows sharing a GSS code");
  /* The role too, or running it twice gives a council two. */
  const roleIns = sql.slice(sql.indexOf('INSERT INTO "Organisation_Role"'));
  if (!/NOT EXISTS/.test(roleIns.slice(0, 900))) {
    fail("running it twice gives every council a second role");
  }
}

// 7. Read through the view that already does this join.
{
  /* The councils query specifically. Organisation_By_Role is used by
     the operator lists too, so a search of the whole file passed while
     this one joined by hand. */
  const at = api.indexOf("councils: db.from(");
  const query = at < 0 ? "" : api.slice(at, api.indexOf(",\n", api.indexOf(".order", at)));
  if (!query) fail("there is no council list");
  else if (!/from\("Organisation_By_Role"\)/.test(query)) {
    fail("the councils are read with a hand-rolled join");
  }
  if (!/eq\("Type_Key", "local_authority"\)/.test(api)) {
    fail("the council list is not filtered to local authorities");
  }
  /* The view gains the new columns rather than the reader joining
     again — and appended, never reordered, because a view that moves a
     column breaks every SELECT * against it. */
  const view = sql.slice(sql.indexOf('CREATE OR REPLACE VIEW "Organisation_By_Role"'));
  if (!/o\."GSS_Code", o\."Nation", o\."Abolition_Date"/.test(view)) {
    fail("the view does not carry what a council dropdown needs");
  }
  if (!/o\."VAT_Registered", o\."VAT_Rate",\s*\n\s*o\."GSS_Code"/.test(view)) {
    fail("the new columns were not appended to the end of the view");
  }
}

// 8. One place to maintain a body, not two.
//
//    Local Authority and Fire Authority each had their own table and
//    their own admin page, while the same organisations already existed
//    in the register. Two places holding one thing is two lists that
//    disagree the first time somebody adds one.
{
  const tables = readFileSync("./src/lib/adminTables.js", "utf8");

  /* The screens are gone. Checked on the entry rather than the name —
     both are explained in comments where they stood, and searching the
     file for the name found the explanation. */
  if (/\{ key: "Local_Authority"/.test(tables)) {
    fail("the Local Authority screen is still on the admin menu");
  }
  if (/\{ key: "Fire_Service"/.test(tables)) {
    fail("the Fire Authority screen is still on the admin menu");
  }

  /* And nothing reads the old lists, or removing the screens would have
     left a dropdown nobody can add to. */
  /* Read, not merely mentioned — the tab explains where the old list
     went, and matching that explanation failed on correct code. */
  const tabCode = tab.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/localAuthorities/.test(tabCode)) {
    fail("the stakeholders tab still reads the old council list");
  }
  const apiCode = api.replace(/\/\*[\s\S]*?\*\//g, "");
  if (/from\("Local_Authority"\)/.test(apiCode)) {
    fail("the lookups endpoint still fetches the old council table");
  }
  if (/from\("Fire_Service"\)/.test(apiCode)) {
    fail("the fire authorities still come from their own table");
  }

  /* The fire authorities come from the register, the same way the
     councils and the operators do. */
  if (!/eq\("Type_Key", "fire_authority"\)/.test(api)) {
    fail("the fire authorities are not read from the organisation register");
  }
  if (!/x\.Organisation_ID/.test(tab)) {
    fail("the fire dropdown still names organisations by the old id");
  }
}

console.log(bad ? `\n${bad} problem(s)`
  : "The council lists behave (382 loaded, both tiers, none past its date).");
process.exit(bad ? 1 : 0);
