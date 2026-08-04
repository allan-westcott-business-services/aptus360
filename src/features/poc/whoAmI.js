/* Matching the signed-in user to a Person record.

   Authentication and the Person table are separate things: Supabase
   knows an email address, and the application knows people with names,
   roles and a place in the org chart. The only reliable link between
   them is the email.

   Kept apart from the form because the matching has edges — a user with
   no Person row, two Person rows sharing an address, a case or spacing
   difference — and each has a right answer that is easier to state here
   than to read out of a component.

   Nothing here fails loudly. Not being able to name the representative
   is an inconvenience, not an error: the picker is still there and the
   application still saves. */

const norm = (v) => String(v ?? "").trim().toLowerCase();

/* The Person whose email matches the signed-in user.

   Case and surrounding space are ignored, because an address typed into
   a staff record and one used to sign in are typed by different people
   on different days.

   Where two records share an address the first is taken and it is a
   deliberate choice rather than an accident of ordering: the list comes
   back sorted by name, so the answer is at least the same every time. */
export function personFor(user, people = []) {
  const email = norm(user?.email);
  if (!email) return null;
  return people.find((p) => norm(p.Email) === email) ?? null;
}

/* Their name, for showing where no record matched.

   Supabase carries a display name in user metadata when one has been
   set, and the local part of the address is a poor but honest fallback —
   "j.smith" tells somebody who it is where a blank tells them nothing. */
export function displayName(user) {
  const meta = user?.user_metadata || {};
  const named = meta.full_name || meta.name;
  if (named) return String(named);
  const email = String(user?.email ?? "");
  return email ? email.split("@")[0] : "";
}
