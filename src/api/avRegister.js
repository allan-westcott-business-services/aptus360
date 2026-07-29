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

/* The project view: invoices with the plot lines they are made of. */
export async function getProjectInvoices(projectId) {
  if (USE_MOCKS) return { invoices: [], lines: [] };
  return http.get(`/av-register?view=invoices&project=${projectId}`);
}

export async function saveAvInvoice(body) {
  if (USE_MOCKS) return body;
  return http.post("/av-register?op=invoice", body);
}

export async function saveAvInvoiceLine(body) {
  if (USE_MOCKS) return body;
  return http.post("/av-register?op=line", body);
}

export async function deleteAvInvoice(id) {
  if (USE_MOCKS) return { deleted: true };
  return http.del(`/av-register?invoice=${id}`);
}

export async function deleteAvInvoiceLine(id) {
  if (USE_MOCKS) return { deleted: true };
  return http.del(`/av-register?line=${id}`);
}

/* Raise an invoice against a set of plots. Header and lines go together
   — an invoice with no lines is wrong, not half-finished. */
export async function raiseAvInvoice(body) {
  if (USE_MOCKS) return { AV_Invoice_ID: 1, ...body };
  return http.post("/av-register?op=raise", body);
}
