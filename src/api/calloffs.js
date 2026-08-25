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

/* The picture of one span, stored against it.

   Sent to a function rather than uploaded from here: the browser's key
   has no policies and can write nothing, so storage goes the same way
   everything else does. */
export async function saveSpanImage({ spanId, dataUrl }) {
  return http.post("/call-off-span-image", { spanId, dataUrl });
}

/* The as-laid drawing of an Electric Service call-off.

   Sent to a function rather than uploaded from here, for the same
   reason the span pictures are: the browser's key has no policies and
   can write nothing, so storage goes the way everything else does.

   Which is also the answer to the credentials question the old
   standalone work instruction raised — it carried an insert-only
   Supabase token compiled into the page. Nothing here needs one. */
export async function saveAsLaidImage({ submissionId, dataUrl }) {
  return http.post("/call-off-as-laid", { submissionId, dataUrl });
}

/* The design drawing the office attaches to a call-off.

   Sent as a data URL through a function, for the same reason the
   as-laid picture is: the browser's key can write nothing, so storage
   goes the way everything else does. */
export async function saveCallOffDrawing({ submissionId, dataUrl, name }) {
  return http.post("/call-off-drawing", { submissionId, dataUrl, name });
}

/* What is attached, asked of the endpoint that owns the columns.

   Not read off the call-off row: calloffs.js keeps an explicit column
   list and leaves these out on purpose, because naming a column the
   running database might not have broke the raise path once already. */
export async function getCallOffDrawing({ submissionId }) {
  return http.get(`/call-off-drawing?submissionId=${submissionId}`);
}

export async function removeCallOffDrawing({ submissionId }) {
  return http.del("/call-off-drawing", { submissionId });
}
