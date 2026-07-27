import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const store = {};
let nid = 7000;
const key = (t, i) => `${t}:${i}`;

export async function getEntityNotes(type, id) {
  if (USE_MOCKS) {
    await delay(150);
    const s = store[key(type, id)] || { comments: [], attachments: [] };
    return { comments: [...s.comments], attachments: [...s.attachments], history: [] };
  }
  return http.get(`/entity/${type}/${id}`);
}

export async function addEntityRow(type, id, kind, row) {
  if (USE_MOCKS) {
    await delay(200);
    const k = key(type, id);
    store[k] = store[k] || { comments: [], attachments: [] };
    const created = kind === "attachment"
      ? { ...row, Attachment_ID: ++nid, Uploaded_At: new Date().toISOString() }
      : { ...row, Comment_ID: ++nid, Created_At: new Date().toISOString() };
    store[k][kind === "attachment" ? "attachments" : "comments"].unshift(created);
    return created;
  }
  return http.post(`/entity/${type}/${id}?kind=${kind}`, row);
}

export async function deleteEntityRow(type, id, kind, rowId) {
  if (USE_MOCKS) {
    await delay(150);
    const k = key(type, id);
    if (store[k]) {
      const f = kind === "attachment" ? "attachments" : "comments";
      const pk = kind === "attachment" ? "Attachment_ID" : "Comment_ID";
      store[k][f] = store[k][f].filter((r) => r[pk] !== rowId);
    }
    return { deleted: true };
  }
  return http.del(`/entity/${type}/${id}?kind=${kind}&row_id=${rowId}`);
}
