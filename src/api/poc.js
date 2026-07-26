import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = [];
let nextId = 900;

export async function listPoc(projectId) {
  if (USE_MOCKS) { await delay(180); return { rows: [...store] }; }
  return http.get(`/projects/${projectId}/poc`);
}

export async function createPoc(projectId, payload) {
  if (USE_MOCKS) {
    await delay(400);
    const { idno_ids = [], ...common } = payload;
    const rows = (idno_ids.length ? idno_ids : [null]).map((id) => ({
      ...common, POC_Application_ID: ++nextId, IDNO_ID: id ? Number(id) : null,
    }));
    store = [...store, ...rows];
    return { rows };
  }
  return http.post(`/projects/${projectId}/poc`, payload);
}

export async function updatePoc(projectId, id, changes) {
  if (USE_MOCKS) {
    await delay(250);
    store = store.map((r) => (r.POC_Application_ID === id ? { ...r, ...changes } : r));
    return changes;
  }
  return http.patch(`/projects/${projectId}/poc?id=${id}`, changes);
}

export async function deletePoc(projectId, id) {
  if (USE_MOCKS) {
    await delay(200);
    store = store.filter((r) => r.POC_Application_ID !== id);
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}/poc?id=${id}`);
}
