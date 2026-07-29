import { http, USE_MOCKS } from "./client.js";
import { clearLookupCache } from "./lookups.js";
import { adminMock } from "../lib/mockData.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 5000;

export async function adminList(table) {
  if (USE_MOCKS) {
    await delay(150);
    return { rows: adminMock[table] ? [...adminMock[table]] : [] };
  }
  return http.get(`/admin/${table}`);
}

export async function adminCreate(table, row) {
  /* Admin edits the tables the lookups are built from, so a write has to
     drop the cache or the rest of the session carries on reading what
     was true when the page loaded. Done here rather than in each screen:
     a screen that forgot would fail quietly, and the symptom — a value
     you just saved not appearing — looks like the save failing. */
  clearLookupCache();
  if (USE_MOCKS) {
    await delay(250);
    const created = { ...row, [`${table}_ID`]: ++nextId };
    adminMock[table] = [...(adminMock[table] || []), created];
    return created;
  }
  return http.post(`/admin/${table}`, row);
}

export async function adminUpdate(table, id, row) {
  /* Admin edits the tables the lookups are built from, so a write has to
     drop the cache or the rest of the session carries on reading what
     was true when the page loaded. Done here rather than in each screen:
     a screen that forgot would fail quietly, and the symptom — a value
     you just saved not appearing — looks like the save failing. */
  clearLookupCache();
  if (USE_MOCKS) {
    await delay(250);
    return { ...row };
  }
  return http.patch(`/admin/${table}?id=${id}`, row);
}

export async function adminDelete(table, id, pk) {
  /* Admin edits the tables the lookups are built from, so a write has to
     drop the cache or the rest of the session carries on reading what
     was true when the page loaded. Done here rather than in each screen:
     a screen that forgot would fail quietly, and the symptom — a value
     you just saved not appearing — looks like the save failing. */
  clearLookupCache();
  if (USE_MOCKS) {
    await delay(200);
    adminMock[table] = (adminMock[table] || []).filter((r) => r[pk] !== id);
    return { deleted: true };
  }
  return http.del(`/admin/${table}?id=${id}`);
}
