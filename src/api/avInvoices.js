import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listInvoices(projectId) {
  if (USE_MOCKS) { await delay(180); return { rows: [] }; }
  const q = projectId ? `?project_id=${projectId}` : "";
  return http.get(`/av-invoices${q}`);
}
export async function checkInvoiced(projectId, utilityId) {
  if (USE_MOCKS) { await delay(150); return { invoiced: [] }; }
  return http.post("/av-invoices?op=check", { project_id: projectId, utility_id: utilityId });
}
export async function generateInvoices(payload) {
  if (USE_MOCKS) { await delay(700); return { created: [], failed: [] }; }
  return http.post("/av-invoices?op=generate", payload);
}
export async function updateInvoice(id, changes) {
  if (USE_MOCKS) { await delay(200); return changes; }
  return http.patch(`/av-invoices?id=${id}`, changes);
}
export async function deleteInvoice(id) {
  if (USE_MOCKS) { await delay(150); return { deleted: true }; }
  return http.del(`/av-invoices?id=${id}`);
}
