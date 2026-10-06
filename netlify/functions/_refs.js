/* ── Project reference allocation, in one place ──

   Pulled out of next-ref.js because the reference has to be allocated
   TWICE: once to show in the Add Project form, and again at insert time
   if the first one has been taken since. Two copies of this arithmetic
   would drift.

   ── Why the second allocation exists ──

   On 6 Oct a project created in the app at 06:32 landed on 2610.004,
   which an imported contract had held since 14:21 the day before. The
   form asks for a reference when it MOUNTS and writes it when the user
   saves, so the gap is however long somebody takes over the form - a
   tab left open overnight makes it hours. The function's own comment
   claimed "two estimators creating a project at the same moment must
   not be handed the same ref", which the implementation never
   delivered: the read and the write are separate HTTP requests with no
   lock, no sequence and no retry between them.

   A reference handed out early is a guess. The insert is the only
   moment that can be authoritative, so that is where the conflict is
   caught and a fresh number taken. */

/* The month a reference is filed under: YY + MM, zero padded. */
export function refPrefix(when = new Date()) {
  return String(when.getFullYear()).slice(2)
       + String(when.getMonth() + 1).padStart(2, "0");
}

/* The YYMM a reference already names, or null if it is not in that
   shape. Used so a reallocated reference stays in the month the project
   was raised in rather than jumping to today - which matters at the
   turn of a month, when a form opened on the 31st is saved on the 1st. */
export function monthOf(ref) {
  const m = /^(\d{4})\.\d+$/.exec(String(ref ?? ""));
  return m ? m[1] : null;
}

/* ── The next free number in a month ──

   The old version asked PostgREST for one row:

     .like("Project_Ref", `${prefix}.%`)
     .order("Project_Ref", { ascending: false }).limit(1)

   which is a TEXT ordering. With everything padded to three digits text
   order happens to match numeric order, so it looked right - but the
   reference field is free text that anybody can edit, and the legacy
   import carries whatever the old system had. One '2610.9' in the month
   sorts above '2610.012', the tail parses as 9, and the next reference
   comes out as 2610.010: a number already in use.

   Reading every reference in the month and taking the numeric maximum
   costs a few hundred rows - 233 in October - and cannot be fooled by
   the width somebody typed. A reference that is not YYMM.<digits> at
   all is skipped rather than guessed at. */
export async function allocateRef(db, prefix = refPrefix()) {
  const { data, error } = await db
    .from("Project")
    .select("Project_Ref")
    .like("Project_Ref", `${prefix}.%`);
  if (error) throw error;

  let max = 0;
  for (const row of data ?? []) {
    const m = /^\d{4}\.0*(\d+)$/.exec(String(row.Project_Ref ?? ""));
    if (!m) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}.${String(max + 1).padStart(3, "0")}`;
}

/* ── Is this error the reference colliding, and nothing else? ──

   Project has four unique constraints: the reference, Contract_Number,
   and the two legacy keys from 0247. Retrying with a new reference
   would be wrong for any of the other three - a duplicate contract
   number is the user's to resolve, and silently renumbering the project
   would hide it. So this matches the constraint by name, not just the
   SQLSTATE.

   Both the name and the column list are checked because PostgREST puts
   them in different fields and has moved them between versions: the
   constraint name lands in `message`, the key columns in `details`. */
const REF_CONSTRAINTS = [
  "Project_Ref_Revision_Option_UQ",                 // 0254 onwards
  "Project_Project_Ref_Revision_Option_Letter_key", // the 0001 inline one
];

export function isRefConflict(error) {
  if (!error || String(error.code) !== "23505") return false;
  const text = `${error.message ?? ""} ${error.details ?? ""}`;
  if (REF_CONSTRAINTS.some((c) => text.includes(c))) return true;

  /* ── Fallback, for a constraint renamed again later ──
     The key list names all three reference columns, and no other
     constraint on this table does.

     All three, not just "Project_Ref": a unique constraint added later
     over the reference AND something else - (Project_Ref, AP_Number),
     say - would mention it, and taking a new reference does nothing
     about a duplicate AP number. That insert would be retried six
     times and then fail anyway, with the user waiting through it.

     An earlier version of this comment justified the strictness by
     saying Display_Ref contains Project_Ref as a substring. It does
     not - the two names only share "_Ref" - so that reasoning was
     wrong even though the code it defended is right. */
  return text.includes('"Project_Ref"')
      && text.includes('"Revision"')
      && text.includes('"Option_Letter"');
}
