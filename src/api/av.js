import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let apps = [];
let quots = [];
let nid = 800;

export async function listAv(projectId) {
  if (USE_MOCKS) { await delay(180); return { applications: [...apps], quotations: [...quots] }; }
  return http.get(`/projects/${projectId}/av`);
}
export async function createAvApplication(projectId, payload) {
  if (USE_MOCKS) {
    await delay(400);
    const { idno_ids = [], ...body } = payload;
    const app = { ...body, AV_Application_ID: ++nid, Project_ID: projectId };
    apps = [...apps, app];
    quots = [...quots, ...idno_ids.map((i) => ({
      AV_Quotation_ID: ++nid, AV_Application_ID: app.AV_Application_ID,
      IDNO_ID: Number(i), Accepted: false,
    }))];
    return app;
  }
  return http.post(`/projects/${projectId}/av?kind=application`, payload);
}
export async function updateAv(projectId, kind, id, changes) {
  if (USE_MOCKS) {
    await delay(220);
    if (kind === "quotation") {
      quots = quots.map((q) => (q.AV_Quotation_ID === id
        ? { ...q, ...changes }
        : changes.Accepted ? { ...q, Accepted: q.AV_Application_ID === quots.find(x => x.AV_Quotation_ID === id)?.AV_Application_ID ? false : q.Accepted } : q));
    } else {
      apps = apps.map((a) => (a.AV_Application_ID === id ? { ...a, ...changes } : a));
    }
    return changes;
  }
  return http.patch(`/projects/${projectId}/av?kind=${kind}&id=${id}`, changes);
}
export async function addAvSlot(projectId, body) {
  if (USE_MOCKS) {
    await delay(200);
    const slot = { ...body, AV_Quotation_ID: ++nid, Accepted: false };
    quots = [...quots, slot];
    return slot;
  }
  return http.post(`/projects/${projectId}/av?kind=slot`, body);
}
export async function deleteAv(projectId, kind, id) {
  if (USE_MOCKS) {
    await delay(180);
    if (kind === "quotation") quots = quots.filter((q) => q.AV_Quotation_ID !== id);
    else { apps = apps.filter((a) => a.AV_Application_ID !== id); quots = quots.filter((q) => q.AV_Application_ID !== id); }
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}/av?kind=${kind}&id=${id}`);
}

/* Agreements are the agreed outcome — what was actually signed — as
   distinct from the applications and quotations, which are the
   competition that produced it. */
let agreements = [];
let aid = 6000;

export async function listAgreements(projectId) {
  if (USE_MOCKS) { await delay(150); return { rows: [...agreements] }; }
  return http.get(`/projects/${projectId}/av-agreements`);
}
export async function saveAgreement(projectId, row, id) {
  if (USE_MOCKS) {
    await delay(230);
    if (id) { agreements = agreements.map((a) => (a.AV_Agreement_ID === id ? { ...a, ...row } : a)); return row; }
    const a = { ...row, AV_Agreement_ID: ++aid }; agreements = [...agreements, a]; return a;
  }
  return id
    ? http.patch(`/projects/${projectId}/av-agreements?id=${id}`, row)
    : http.post(`/projects/${projectId}/av-agreements`, row);
}
export async function deleteAgreement(projectId, id) {
  if (USE_MOCKS) { await delay(150); agreements = agreements.filter((a) => a.AV_Agreement_ID !== id); return { deleted: true }; }
  return http.del(`/projects/${projectId}/av-agreements?id=${id}`);
}
