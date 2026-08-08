import { http, USE_MOCKS } from "./client.js";
import { planningMock } from "../lib/mockData.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* The whole board in one call — see netlify/functions/planning.js for
   why it is one and not eight. */
export async function getPlanning() {
  if (USE_MOCKS) { await delay(220); return planningMock(); }
  return http.get("/planning");
}

/* Dragging a booking along the schedule.

   Whole days, and the assignment's work days move with it. Signed:
   negative is earlier. */
export async function moveAssignment(assignmentId, days) {
  if (USE_MOCKS) { await delay(180); return { Assignment_ID: assignmentId, days }; }
  return http.patch(`/planning/assignments/${assignmentId}/move`, { days });
}

/* A person's colour on the board. The generic admin endpoint would do
   this, but going through it from here would mean the board knowing the
   name of a table it otherwise never touches. */
export async function setPlannerColour(personId, colour) {
  if (USE_MOCKS) { await delay(120); return { Person_ID: personId, Planner_Colour: colour }; }
  return http.patch(`/admin/Person?id=${personId}`, { Planner_Colour: colour });
}
