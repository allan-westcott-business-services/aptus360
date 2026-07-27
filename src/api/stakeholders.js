import { http, USE_MOCKS } from "./client.js";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = []; let nid = 4000;

export async function listContacts(projectId) {
  if (USE_MOCKS) { await delay(150); return { rows: [...store] }; }
  return http.get(`/projects/${projectId}/contacts`);
}
export async function saveContact(projectId, row, id) {
  if (USE_MOCKS) {
    await delay(220);
    if (id) { store = store.map((r) => (r.Project_Contact_ID === id ? { ...r, ...row } : r)); return row; }
    const c = { ...row, Project_Contact_ID: ++nid }; store = [...store, c]; return c;
  }
  return id
    ? http.patch(`/projects/${projectId}/contacts?id=${id}`, row)
    : http.post(`/projects/${projectId}/contacts`, row);
}
export async function deleteContact(projectId, id) {
  if (USE_MOCKS) { await delay(150); store = store.filter((r) => r.Project_Contact_ID !== id); return { deleted: true }; }
  return http.del(`/projects/${projectId}/contacts?id=${id}`);
}
