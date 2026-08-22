import { http, USE_MOCKS } from "./client.js";

/* Options are parallel versions of one enquiry — 2607.004(A) and (B) —
   not the variants a DNO offers inside a quotation. */
export async function listOptions(projectId) {
  if (USE_MOCKS) return { rows: [] };
  return http.get(`/project-options?project=${projectId}`);
}

/* `copyGis` duplicates the drawing onto the new option (0188). Off by
   default: an option raised for a commercial variation does not want
   several thousand features copied, and it is the heaviest part of the
   operation. */
export async function addOptions(projectId, count = 1, copyGis = false) {
  if (USE_MOCKS) return { created: [] };
  return http.post(`/project-options?project=${projectId}`, { count, copy_gis: copyGis });
}

export async function removeOption(projectId, optionId) {
  if (USE_MOCKS) return { deleted: true };
  return http.del(`/project-options?project=${projectId}&option=${optionId}`);
}
