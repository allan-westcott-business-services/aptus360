import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let opts = [];
let quots = [];
let nid = 500;

export async function listOptions(appId) {
  if (USE_MOCKS) {
    await delay(150);
    const o = opts.filter((x) => x.POC_Application_ID === appId);
    return { options: o, quotations: quots.filter((q) => o.some((x) => x.Option_ID === q.Option_ID)) };
  }
  return http.get(`/poc/${appId}/options`);
}

export async function saveOption(appId, row, id) {
  if (USE_MOCKS) {
    await delay(220);
    if (id) { opts = opts.map((o) => (o.Option_ID === id ? { ...o, ...row } : o)); return row; }
    const created = { ...row, Option_ID: ++nid, POC_Application_ID: appId };
    opts = [...opts, created];
    return created;
  }
  return id
    ? http.patch(`/poc/${appId}/options?kind=option&id=${id}`, row)
    : http.post(`/poc/${appId}/options?kind=option`, row);
}

export async function saveQuotation(appId, row, id) {
  if (USE_MOCKS) {
    await delay(220);
    if (id) { quots = quots.map((q) => (q.Quotation_ID === id ? { ...q, ...row } : q)); return row; }
    const created = { ...row, Quotation_ID: ++nid };
    quots = [...quots, created];
    return created;
  }
  return id
    ? http.patch(`/poc/${appId}/options?kind=quotation&id=${id}`, row)
    : http.post(`/poc/${appId}/options?kind=quotation`, row);
}

export async function removeOption(appId, id) {
  if (USE_MOCKS) { await delay(150); opts = opts.filter((o) => o.Option_ID !== id); return { deleted: true }; }
  return http.del(`/poc/${appId}/options?kind=option&id=${id}`);
}

export async function removeQuotation(appId, id) {
  if (USE_MOCKS) { await delay(150); quots = quots.filter((q) => q.Quotation_ID !== id); return { deleted: true }; }
  return http.del(`/poc/${appId}/options?kind=quotation&id=${id}`);
}
