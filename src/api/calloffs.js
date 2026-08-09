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

/* Every call-off, across every project — the operations list. */
export async function listAllCallOffs({ status } = {}) {
  if (USE_MOCKS) { await delay(160); return { rows: [...store] }; }
  const q = status && status !== "all" ? `?status=${encodeURIComponent(status)}` : "";
  return http.get(`/calloffs${q}`);
}

export async function getCallOff(id) {
  if (USE_MOCKS) {
    await delay(120);
    return { rows: store.filter((r) => Number(r.Submission_ID) === Number(id)) };
  }
  return http.get(`/calloffs?id=${id}`);
}

/* Status is moved from the operations page rather than the project tab:
   it is an operational decision, not a detail of the request. */
export async function setCallOffStatus(id, Status) {
  if (USE_MOCKS) {
    await delay(180);
    store = store.map((r) => (Number(r.Submission_ID) === Number(id) ? { ...r, Status } : r));
    return { Status };
  }
  return http.patch(`/calloffs/${id}/status`, { Status });
}

/* When each utility on a plot is wanted live.

   The whole set for one plot at a time — see
   netlify/functions/calloff-energisation.js for why it is not a call
   per cell. A utility left blank is dropped rather than stored empty. */
export async function setPlotEnergisation(servicePlotId, utilities) {
  if (USE_MOCKS) {
    await delay(150);
    return { Service_Plot_ID: servicePlotId, Utilities: utilities };
  }
  return http.put(`/calloffs/plots/${servicePlotId}/energisation`, { utilities });
}
