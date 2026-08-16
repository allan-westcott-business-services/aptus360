import { http } from "./client.js";

/* The signed-in leader's queue.

   No arguments. The endpoint takes the caller from the session and
   answers with their own team's work or refuses — a team id passed from
   here would be a team id anybody could change. */
export async function fieldQueue() {
  return http.get("/field/queue");
}

/* The reasons an operative may give. Office-only ones are filtered out
   by the endpoint, so this is the list as it should be shown. */
export async function abortReasons() {
  return http.get("/field/reasons");
}

/* Refuse the job that is open, and release the next.

   The assignment id is sent even though the endpoint could work it out,
   because the tablet may have been looking at a stale queue — better it
   names what it thinks it is refusing and is told no than aborts
   whatever happens to be open now. */
export async function abortJob({ assignmentId, reasonCode, note }) {
  return http.post("/field/abort", { assignmentId, reasonCode, note });
}
