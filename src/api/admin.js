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

export async function adminCreate(table, row, pk) {
  /* Admin edits the tables the lookups are built from, so a write has to
     drop the cache or the rest of the session carries on reading what
     was true when the page loaded. Done here rather than in each screen:
     a screen that forgot would fail quietly, and the symptom — a value
     you just saved not appearing — looks like the save failing. */
  clearLookupCache();
  if (USE_MOCKS) {
    await delay(250);
    /* `pk` for the tables whose key is not `<table>_ID`, the same
       argument adminDelete already takes and for the same reason.
       Vehicle_Mileage_Log's key is Log_ID, so the guess produced a row
       carrying Vehicle_Mileage_Log_ID and no key the screen could use —
       it rendered without one and could not then be edited or deleted.
       Only mock mode was ever affected: the real endpoint returns the
       row Postgres wrote, key included. */
    const created = { ...row, [pk || `${table}_ID`]: ++nextId };
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
