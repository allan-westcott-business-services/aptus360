import { http, USE_MOCKS } from "./client.js";

/* Options are parallel versions of one enquiry — 2607.004(A) and (B) —
   not the variants a DNO offers inside a quotation. */
export async function listOptions(projectId) {
  if (USE_MOCKS) return { rows: [] };
  return http.get(`/project-options?project=${projectId}`);
}

export async function addOptions(projectId, count = 1) {
  if (USE_MOCKS) return { created: [] };
  return http.post(`/project-options?project=${projectId}`, { count });
}

export async function removeOption(projectId, optionId) {
  if (USE_MOCKS) return { deleted: true };
  return http.del(`/project-options?project=${projectId}&option=${optionId}`);
}
