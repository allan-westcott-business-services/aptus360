import { http, USE_MOCKS } from "./client.js";
import { planningMock } from "../lib/mockData.js";
import { adminDelete } from "./admin.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

/* The whole board in one call — see netlify/functions/planning.js for
   why it is one and not eight. */
export async function getPlanning() {
  if (USE_MOCKS) { await delay(220); return planningMock(); }
  return http.get("/planning");
}

/* Dragging a booking along the schedule.

   Measured in half-days, because that is the smallest thing the
   schedule records — a booking can start after lunch. Signed: negative
   is earlier. The assignment's work days are re-laid to match, over
   whatever weekend halves it works. */
export async function moveAssignment(assignmentId, op = {}) {
  const { startShift = 0, endShift = 0, weekend, teamId, also } = op;
  if (USE_MOCKS) {
    await delay(180);
    return { Assignment_ID: assignmentId, startShift, endShift };
  }
  /* A shift for each end, because moving and stretching are the same
     operation: equal shifts slide the booking, different ones change
     its length.

     `weekend` only where it ran into one and somebody answered for it;
     `teamId` only where it was dropped on another gang's lane. Both go
     with the move rather than being saved separately, so a booking
     cannot end up claiming to work Saturdays with its days still on
     weekdays, or belonging to a gang on days it never moved to. */
  return http.patch(`/planning/assignments/${assignmentId}/move`, {
    startShift,
    endShift,
    ...(weekend ? { weekend } : {}),
    ...(teamId ? { teamId } : {}),
    /* The bookings that follow this one, moving with it. Sent as part
       of the same request rather than as one request each: they are one
       decision, and half a cascade written is a schedule that no longer
       says what anybody agreed. */
    ...(also?.length ? { also } : {}),
  });
}

/* Giving an unassigned phase to a gang.

   A booking of one day at the day it was dropped on. The endpoint
   checks the gang may take it before creating anything — the board asks
   the same question first, but a rule the browser enforces is not a
   rule. */
export async function assignPhase(op = {}) {
  const { submissionId, taskTypeId, teamId, date, weekend } = op;
  if (USE_MOCKS) {
    await delay(200);
    return { Assignment_ID: Math.floor(Math.random() * 1e6), Start_Date: date };
  }
  return http.post("/planning/assignments", {
    submissionId, taskTypeId, teamId, date,
    ...(weekend ? { weekend } : {}),
  });
}

/* Removing a booking, and the days under it.

   Through adminDelete rather than a raw request or an endpoint of its
   own: it is a delete of one row and its children, which is what the
   admin endpoint is for, and the call-offs page already removes an
   assignment exactly this way — the two should not diverge over which
   rows get cleaned up.

   adminDelete also clears the lookup cache, which a hand-rolled DELETE
   would not, and the symptom of forgetting that is a value you have
   just deleted still appearing for the rest of the session.

   The days go first. The cascade should take them, but it is added
   guardedly in the migration and may not be there, so deleting them
   explicitly means no orphans either way. Failures there are swallowed
   for the same reason the call-offs page swallows them: a day that has
   already gone is not a reason to leave the assignment behind. */
export async function deleteAssignment(assignmentId, workDayIds = []) {
  for (const id of workDayIds) {
    await adminDelete("Call_Off_Work_Day", id, "Work_Day_ID").catch(() => {});
  }
  return adminDelete("Call_Off_Assignment", assignmentId, "Assignment_ID");
}

/* A person's colour on the board. The generic admin endpoint would do
   this, but going through it from here would mean the board knowing the
   name of a table it otherwise never touches. */
export async function setPlannerColour(personId, colour) {
  if (USE_MOCKS) { await delay(120); return { Person_ID: personId, Planner_Colour: colour }; }
  return http.patch(`/admin/Person?id=${personId}`, { Planner_Colour: colour });
}
