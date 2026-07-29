import { http, USE_MOCKS } from "./client.js";
import { clearLookupCache } from "./lookups.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

export async function listOrganisations() {
  if (USE_MOCKS) { await delay(180); return { rows: [] }; }
  return http.get("/organisations");
}
export async function getOrgTypes() {
  if (USE_MOCKS) { await delay(120); return { types: [], subtypes: [] }; }
  return http.get("/organisations?what=types");
}
export async function getOrganisation(id) {
  if (USE_MOCKS) { await delay(160); return { organisation: null, roles: [], branches: [], contacts: [] }; }
  return http.get(`/organisations?what=detail&id=${id}`);
}
export async function saveOrganisation(body, id) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(200); return body; }
  return id ? http.patch(`/organisations?id=${id}`, body) : http.post("/organisations", body);
}
export async function saveBranch(body, id) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(200); return body; }
  return id
    ? http.patch(`/organisations?what=branch&id=${id}`, body)
    : http.post("/organisations?what=branch", body);
}
export async function saveContact(body, id) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(200); return body; }
  return id
    ? http.patch(`/organisations?what=contact&id=${id}`, body)
    : http.post("/organisations?what=contact", body);
}
export async function addRole(body) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(150); return { added: true }; }
  return http.post("/organisations?what=role", body);
}
/* Only the reference and the active flag. Changing which role it is
   means removing it and adding the other one — the unique constraint is
   on organisation + type + subtype. */
export async function saveRole(id, body) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(150); return body; }
  return http.patch(`/organisations?what=role&id=${id}`, body);
}
export async function removeRecord(what, id) {
  clearLookupCache();
  if (USE_MOCKS) { await delay(150); return { deleted: true }; }
  return http.del(`/organisations?what=${what}&id=${id}`);
}
