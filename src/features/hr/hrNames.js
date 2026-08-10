/* Translating between the HR module's names and this database's.

   The HR portal was written against its own Supabase project, where
   tables were `people` and `employee_pay` and every key was `id`. Those
   tables now live here as `Person` and `Employee_Pay` with keys like
   `Person_ID`, and access goes through the application's own endpoint
   rather than PostgREST.

   Rather than edit 5,700 lines of module code, the four query wrappers
   translate: table and column names on the way out, and the rows that
   come back on the way in. Everything above those wrappers carries on
   speaking snake_case and never knows the difference.

   ── Why the mapping is derived, not listed ──

   The rule is mechanical — snake_case to Mixed_Case, `id` to
   `{Table}_ID` — so it is written once as a function. A hand-written
   list of 618 columns would be wrong within a month, and wrong in a way
   that reads as a field simply not saving. */

/* Words this database capitalises differently from a plain
   `capitalize()`. Everything else follows the rule. */
const ACRONYM = {
  id: "ID", dob: "DOB", ni: "NI", url: "URL", dbs: "DBS",
  oh: "OH", pip: "PIP", cv: "CV", hr: "HR", fte: "FTE",
  ir35: "IR35", cm: "CM", kg: "KG",
};

/* Tables whose singular form the rules would get wrong. */
const IRREGULAR = {
  people: "Person",
  addresses: "Address",
  hierarchy: "Hierarchy",
  next_of_kin: "Next_Of_Kin",
  audit_log: "Audit_Log",
  bank_details: "Bank_Details",
  headcount_budget: "Headcount_Budget",
  training_courses: "Training_Course",
  employment: "Employment",
  onboarding_content: "Onboarding_Content",
  employee_onboarding_content: "Employee_Onboarding_Content",
  employee_pay: "Employee_Pay",
  employee_training: "Employee_Training",
  documents_log: "Documents_Log",
  /* `roles` here is a headcount slot — job title, department, salary
     band, FTE. This database already has Role, which is a permissions
     role held by a Person. Same word, unrelated things. */
  roles: "Job_Role",
};

const word = (w) => ACRONYM[w] ?? (w.charAt(0).toUpperCase() + w.slice(1));

export function tableName(snake) {
  if (IRREGULAR[snake]) return IRREGULAR[snake];
  const parts = snake.split("_");
  const last = parts[parts.length - 1];
  if (last.endsWith("ies")) parts[parts.length - 1] = last.slice(0, -3) + "y";
  else if (last.endsWith("sses")) parts[parts.length - 1] = last.slice(0, -2);
  else if (last.endsWith("s") && !last.endsWith("ss")) {
    parts[parts.length - 1] = last.slice(0, -1);
  }
  return parts.map(word).join("_");
}

export function columnName(snake, table) {
  if (snake === "id") return `${tableName(table)}_ID`;
  const parts = snake.split("_").map(word);
  /* "_id" is folded to "ID" after capitalising, not before: capitalising
     first gives "Id", and Person_Id matches nothing written Person_ID. */
  if (parts[parts.length - 1] === "Id") parts[parts.length - 1] = "ID";
  return parts.join("_");
}

/* The reverse, for rows coming back. Built per table from the row's own
   keys rather than from a list, so a column added to the database
   arrives without anything here needing to change. */
export function toSnake(mixed) {
  return mixed
    .replace(/_ID$/, "_id")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

/* A row as the module expects it: snake_case keys, and the primary key
   presented as `id` whatever it is called here.

   ── Ids come back as strings, deliberately ──

   They used to be uuids, so every id in this module was a string, and
   the code compares them with === in something like fifty places —
   against `dataset` values, against keys of objects, against each
   other. Both of those sources are always strings.

   Bigint ids arrive as numbers, and `5 === "5"` is false. That turned
   every edit and delete button into a no-op: the click fired, the row
   lookup returned undefined, and nothing happened. Nothing threw, so
   there was nothing to see.

   Converting here rather than fixing fifty comparisons keeps the module
   working the way it was written, and means the fifty-first cannot be
   wrong either. Postgres accepts a numeric string for a bigint, so they
   go back out unchanged. */
const isId = (key) => key === "id" || key.endsWith("_ID");

export function rowIn(row, table) {
  if (!row) return row;
  const pk = `${tableName(table)}_ID`;
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    const key = k === pk ? "id" : toSnake(k);
    out[key] = isId(k) && v != null ? String(v) : v;
  }
  return out;
}

/* And a row on its way out. */
export function rowOut(row, table) {
  const out = {};
  for (const [k, v] of Object.entries(row ?? {})) {
    /* Empty string to null, as the portal's own wrappers did: a blank
       string in a NOT NULL column is not a missing value, it is a value
       that happens to be empty, and the two behave differently. */
    out[columnName(k, table)] = v === "" ? null : v;
  }
  return out;
}

/* PostgREST filters, as the module writes them: `person_id=eq.5`, and
   occasionally two joined by `&`. Parsed rather than passed on, because
   the rows are filtered here now.

   Only the operators the module actually uses are handled. Anything
   else throws rather than being ignored — a filter that silently does
   nothing returns every row in the table, which looks like data being
   wrong rather than a filter being unsupported. */
export function parseFilter(filter) {
  if (!filter) return [];
  return filter.split("&").filter(Boolean).map((part) => {
    const [lhs, rhs] = part.split("=");
    if (!rhs) throw new Error(`HR filter not understood: ${part}`);
    const dot = rhs.indexOf(".");
    const op = rhs.slice(0, dot);
    const value = decodeURIComponent(rhs.slice(dot + 1));
    if (!["eq", "neq", "is", "in", "gte", "lte"].includes(op)) {
      throw new Error(`HR filter operator not supported: ${op}`);
    }
    return { column: lhs, op, value };
  });
}

export function matchesFilters(row, filters) {
  return filters.every(({ column, op, value }) => {
    const v = row[column];
    switch (op) {
      case "eq": return String(v ?? "") === value;
      case "neq": return String(v ?? "") !== value;
      case "is": return value === "null" ? v == null : String(v) === value;
      case "in": return value.replace(/^\(|\)$/g, "").split(",")
        .map((x) => x.replace(/^"|"$/g, "")).includes(String(v));
      case "gte": return v != null && String(v) >= value;
      case "lte": return v != null && String(v) <= value;
      default: return true;
    }
  });
}
