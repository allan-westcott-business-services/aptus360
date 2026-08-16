import { http } from "./client.js";

/* The signed-in leader's queue.

   No arguments. The endpoint takes the caller from the session and
   answers with their own team's work or refuses — a team id passed from
   here would be a team id anybody could change. */
export async function fieldQueue() {
  return http.get("/field/queue");
}
