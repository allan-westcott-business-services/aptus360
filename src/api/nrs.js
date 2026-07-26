import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = [];
let nid = 700;

export async function listNrs(projectId) {
  if (USE_MOCKS) { await delay(160); return { rows: [...store] }; }
  return http.get(`/projects/${projectId}/nrs`);
}
export async function saveNrs(projectId, row, id) {
  if (USE_MOCKS) {
    await delay(250);
    if (id) { store = store.map((r) => (r.NRS_ID === id ? { ...r, ...row } : r)); return row; }
    const created = { ...row, NRS_ID: ++nid, Project_ID: projectId };
    store = [...store, created];
    return created;
  }
  return id
    ? http.patch(`/projects/${projectId}/nrs?id=${id}`, row)
    : http.post(`/projects/${projectId}/nrs`, row);
}
export async function deleteNrs(projectId, id) {
  if (USE_MOCKS) { await delay(180); store = store.filter((r) => r.NRS_ID !== id); return { deleted: true }; }
  return http.del(`/projects/${projectId}/nrs?id=${id}`);
}
