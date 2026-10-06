import { supabase, json, fail, withAuth } from "./_supabase.js";
import { allocateRef } from "./_refs.js";

/* ── What this is now, and what it is not ──

   This hands the Add Project form a reference to SHOW. It is the next
   free number at the moment it is asked, and nothing more: the form
   asks on mount and saves minutes or hours later, so by the time the
   project is inserted the number may well be taken.

   The old comment here said "two estimators creating a project at the
   same moment must not be handed the same ref", which this endpoint
   cannot deliver on its own - the read and the write are separate
   requests, with no lock between them. Moving the allocation to the
   server narrowed the window; it never closed it, and on 6 Oct a form
   left open across the contract import produced exactly the collision
   the comment said was impossible.

   The authoritative allocation is at insert time, in projects.js, which
   retries on the unique violation. The arithmetic itself lives in
   _refs.js so both callers use the same rules - including the numeric
   maximum this used to get wrong by ordering references as text. */
export default withAuth(async function handler() {
  try {
    return json({ ref: await allocateRef(supabase()) });
  } catch (e) {
    return fail(e);
  }
});

export const config = { path: "/api/next-project-ref" };
