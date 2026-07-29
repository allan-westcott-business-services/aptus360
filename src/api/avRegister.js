import { http, USE_MOCKS } from "./client.js";

/* Asset value reconciliation. One row per plot per utility: what has
   been earned, and what has been claimed against it. */
export async function getAvRegister(projectId) {
  if (USE_MOCKS) return { rows: [] };
  return http.get(`/av-register${projectId ? `?project=${projectId}` : ""}`);
}

export async function setAvInvoiceStatus(invoiceIds, Status) {
  if (USE_MOCKS) return { updated: invoiceIds.length };
  return http.patch("/av-register", { invoice_ids: invoiceIds, Status });
}
