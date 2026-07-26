import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function updateScope(scopeId, changes) {
  if (USE_MOCKS) {
    await delay(300);
    return { Project_Scope_ID: scopeId, ...changes };
  }
  return http.patch(`/scopes/${scopeId}`, changes);
}

export async function createScope(projectId, utilityId) {
  if (USE_MOCKS) {
    await delay(300);
    return { Project_Scope_ID: Math.floor(Math.random() * 9000) + 1000, Utility_ID: utilityId };
  }
  return http.post(`/projects/${projectId}/scopes`, { Utility_ID: utilityId });
}

export async function deleteScope(scopeId) {
  if (USE_MOCKS) {
    await delay(200);
    return { deleted: true };
  }
  return http.del(`/scopes/${scopeId}`);
}
