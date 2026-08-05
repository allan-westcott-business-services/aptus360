import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = [];
let nid = 900;

export async function listCallOffs(projectId) {
  if (USE_MOCKS) { await delay(160); return { rows: [...store] }; }
  return http.get(`/projects/${projectId}/calloffs`);
}

export async function createCallOff(projectId, body) {
  if (USE_MOCKS) {
    await delay(250);
    const created = { ...body, Submission_ID: ++nid, Status: "Pending Review" };
    store = [created, ...store];
    return created;
  }
  return http.post(`/projects/${projectId}/calloffs`, body);
}

export async function updateCallOff(projectId, id, body) {
  if (USE_MOCKS) {
    await delay(200);
    store = store.map((r) => (r.Submission_ID === id ? { ...r, ...body } : r));
    return body;
  }
  return http.patch(`/projects/${projectId}/calloffs?id=${id}`, body);
}

export async function deleteCallOff(projectId, id) {
  if (USE_MOCKS) {
    await delay(200);
    store = store.filter((r) => r.Submission_ID !== id);
    return { ok: true };
  }
  return http.del(`/projects/${projectId}/calloffs?id=${id}`);
}
