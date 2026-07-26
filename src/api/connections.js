import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = [];
let nid = 3000;

export async function listAllConnections() {
  if (USE_MOCKS) { await delay(220); return { plots: [], connections: [...store] }; }
  return http.get("/connections");
}

export async function listConnections(projectId) {
  if (USE_MOCKS) { await delay(200); return { plots: [], connections: [...store] }; }
  return http.get(`/projects/${projectId}/connections`);
}
export async function generateConnections(projectId, plotIds, utilityIds) {
  if (USE_MOCKS) {
    await delay(400);
    const rows = [];
    plotIds.forEach((p) => utilityIds.forEach((u) => {
      if (!store.some((r) => r.Plot_ID === p && r.Utility_ID === u)) {
        rows.push({ Plot_Utility_ID: ++nid, Plot_ID: p, Utility_ID: u });
      }
    }));
    store = [...store, ...rows];
    return { rows, created: rows.length };
  }
  return http.post(`/projects/${projectId}/connections`, { plot_ids: plotIds, utility_ids: utilityIds });
}
export async function updateConnection(projectId, id, changes) {
  if (USE_MOCKS) {
    await delay(200);
    store = store.map((r) => (r.Plot_Utility_ID === id ? { ...r, ...changes } : r));
    return changes;
  }
  return http.patch(`/projects/${projectId}/connections?id=${id}`, changes);
}
export async function bulkUpdateConnections(projectId, ids, changes) {
  if (USE_MOCKS) {
    await delay(350);
    store = store.map((r) => (ids.includes(r.Plot_Utility_ID) ? { ...r, ...changes } : r));
    return { updated: ids.length };
  }
  return http.patch(`/projects/${projectId}/connections`, { ids, changes });
}
