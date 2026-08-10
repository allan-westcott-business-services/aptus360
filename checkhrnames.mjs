/* The translation between the HR module's names and this database's.

   The module asks for `people` and `person_id`; the tables are `Person`
   and `Person_ID`. Every read and write passes through here, and a
   wrong name does not throw — it returns an empty list or drops a
   field on save, which reads as the data being wrong. */
import {
  tableName, columnName, rowIn, rowOut, parseFilter, matchesFilters,
} from "./src/features/hr/hrNames.js";
import { readFileSync } from "node:fs";

let bad = 0;
const fail = (m) => { console.log("  FAIL " + m); bad++; };
const eq = (g, w, what) => {
  if (JSON.stringify(g) !== JSON.stringify(w))
    fail(`${what}: got ${JSON.stringify(g)}, wanted ${JSON.stringify(w)}`);
};

// 1. Every table the module asks for must exist in the migration. This is
//    the check that matters: a name this gets wrong is a screen that
//    silently shows nothing.
/* Read from the repo, not from wherever the file was generated: a test
   that reaches outside the checkout passes here and fails on a build
   machine, which is the least useful place to find out. */
const sql = readFileSync("supabase/migrations/0142_hr_schema.sql", "utf8");
const ASKED = `accreditation_types applicants applications benefit_types
candidate_attachments certificate_types contingent_workers departments
employee_benefits employee_certificates employee_pay employee_roles
employee_skills employee_training equipment_types hierarchy interaction_types
interactions interview_format_types interview_stages job_adverts job_sites
job_titles leave_requests leave_types leaver_types leavers office_locations
onboarding_content onboarding_tasks people performance_reviews person_documents
recruitment_agencies roles salary_bands sector_magazines sickness_categories
sickness_records skills timesheets timesheet_entries training_courses
vacancies skill_categories`.split(/\s+/).filter(Boolean);

const created = new Set([...sql.matchAll(/CREATE TABLE IF NOT EXISTS "([^"]+)"/g)]
  .map((m) => m[1]));
created.add("Person");   // 0140 alters the existing table rather than creating it

for (const t of ASKED) {
  const mapped = tableName(t);
  if (created.size && !created.has(mapped)) {
    fail(`the module asks for "${t}" -> "${mapped}", which no migration creates`);
  }
}

// 2. The names that would be wrong under a plain rule.
eq(tableName("people"), "Person", "people");
eq(tableName("roles"), "Job_Role", "roles (not the permissions Role)");
eq(tableName("training_courses"), "Training_Course", "training_courses");
eq(tableName("addresses"), "Address", "addresses");
eq(tableName("employee_pay"), "Employee_Pay", "employee_pay (already singular)");
eq(tableName("bank_details"), "Bank_Details", "bank_details (stays plural)");
eq(tableName("next_of_kin"), "Next_Of_Kin", "next_of_kin");

// 3. Columns, including the trailing-id case that reads fine and matches
//    nothing.
eq(columnName("id", "people"), "Person_ID", "id on people");
eq(columnName("person_id", "employee_pay"), "Person_ID", "person_id");
eq(columnName("first_name", "people"), "First_Name", "first_name");
eq(columnName("dob", "people"), "DOB", "dob");
eq(columnName("ni_number", "people"), "NI_Number", "ni_number");
eq(columnName("salary_band_id", "employee_pay"), "Salary_Band_ID", "salary_band_id");
if (columnName("person_id", "x").includes("_Id"))
  fail("a trailing id was capitalised as Id, which matches nothing");

// 4. Rows round-trip, and the primary key is presented as `id` whatever
//    it is called in the database.
const row = rowIn({ Person_ID: 7, First_Name: "Ada", NI_Number: "AB12", DOB: "1990-01-01" },
  "people");
eq(row, { id: 7, first_name: "Ada", ni_number: "AB12", dob: "1990-01-01" }, "row in");

const out = rowOut({ first_name: "Ada", ni_number: "", person_id: 7 }, "employee_pay");
eq(out, { First_Name: "Ada", NI_Number: null, Person_ID: 7 }, "row out");
// Empty string becomes null: a blank in a NOT NULL column is not a
// missing value, and the two behave differently.
if (out.NI_Number !== null) fail("an empty string was not turned into null");

// 5. Filters. An unsupported one must throw rather than be ignored — a
//    filter that quietly does nothing returns the whole table.
eq(parseFilter("person_id=eq.5"), [{ column: "person_id", op: "eq", value: "5" }],
  "simple filter");
eq(parseFilter("").length, 0, "no filter");
eq(parseFilter("a=eq.1&b=is.null").length, 2, "two filters");
try {
  parseFilter("person_id=like.*x*");
  fail("an unsupported filter operator was accepted");
} catch { /* expected */ }

const rows = [{ person_id: 5, status: "Active" }, { person_id: 6, status: null }];
eq(rows.filter((r) => matchesFilters(r, parseFilter("person_id=eq.5"))).length, 1, "eq");
eq(rows.filter((r) => matchesFilters(r, parseFilter("status=is.null"))).length, 1, "is null");
eq(rows.filter((r) => matchesFilters(r, parseFilter("person_id=in.(5,6)"))).length, 2, "in");

console.log(bad ? `\n${bad} problem(s)`
  : `HR name translation behaves (${ASKED.length} tables the module asks for).`);
process.exit(bad ? 1 : 0);
