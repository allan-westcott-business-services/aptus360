import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = []; let nid = 9000;

export async function listDevelopers(projectId) {
  if (USE_MOCKS) { await delay(160); return { rows: [...store], counts: {}, unassigned: 0 }; }
  return http.get(`/projects/${projectId}/developers`);
}
export async function saveDeveloper(projectId, row, id) {
  if (USE_MOCKS) {
    await delay(220);
    if (id) {
      if (row.Is_Main) store = store.map((d) => ({ ...d, Is_Main: false }));
      store = store.map((d) => (d.Project_Developer_ID === id ? { ...d, ...row } : d));
      return row;
    }
    const d = { ...row, Project_Developer_ID: ++nid, Project_ID: projectId };
    store = [...store, d];
    return d;
  }
  return id
    ? http.patch(`/projects/${projectId}/developers?id=${id}`, row)
    : http.post(`/projects/${projectId}/developers`, row);
}
export async function deleteDeveloper(projectId, id) {
  if (USE_MOCKS) { await delay(160); store = store.filter((d) => d.Project_Developer_ID !== id); return { deleted: true }; }
  return http.del(`/projects/${projectId}/developers?id=${id}`);
}
export async function assignPlots(projectId, plotIds, developerId) {
  if (USE_MOCKS) { await delay(300); return { updated: plotIds.length }; }
  return http.put(`/projects/${projectId}/developers`, { plot_ids: plotIds, developer_id: developerId });
}
