import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = [];
let nid = 20000;

const MOCK_LAYERS = [
  { Layer_Key: "boundary", Label: "Site boundary", Colour: "#0f172a", Sort_Order: 10 },
  { Layer_Key: "plot", Label: "Plots", Colour: "#2563eb", Sort_Order: 20 },
  { Layer_Key: "electric", Label: "Electric", Colour: "#f59e0b", Sort_Order: 30 },
  { Layer_Key: "gas", Label: "Gas", Colour: "#10b981", Sort_Order: 40 },
  { Layer_Key: "water", Label: "Water", Colour: "#3b82f6", Sort_Order: 50 },
  { Layer_Key: "trench", Label: "Trenches", Colour: "#a855f7", Sort_Order: 60 },
  { Layer_Key: "note", Label: "Notes", Colour: "#64748b", Sort_Order: 70 },
];

export async function listGis(projectId) {
  if (USE_MOCKS) { await delay(180); return { features: [...store], layers: MOCK_LAYERS }; }
  return http.get(`/projects/${projectId}/gis`);
}
export async function seedPlots(projectId, spacing = 12) {
  if (USE_MOCKS) { await delay(400); return { created: 0 }; }
  return http.post(`/projects/${projectId}/gis?action=seed&spacing=${spacing}`, {});
}
export async function createFeature(projectId, feature) {
  if (USE_MOCKS) {
    await delay(160);
    const f = { ...feature, Feature_ID: ++nid, Project_ID: projectId };
    store = [...store, f];
    return f;
  }
  return http.post(`/projects/${projectId}/gis`, feature);
}
export async function moveFeatures(projectId, updates) {
  if (USE_MOCKS) {
    await delay(200);
    store = store.map((f) => {
      const u = updates.find((x) => x.Feature_ID === f.Feature_ID);
      return u ? { ...f, Geometry: u.Geometry } : f;
    });
    return { updated: updates.length };
  }
  return http.patch(`/projects/${projectId}/gis`, { updates });
}
export async function updateFeature(projectId, id, changes) {
  if (USE_MOCKS) {
    await delay(160);
    store = store.map((f) => (f.Feature_ID === id ? { ...f, ...changes } : f));
    return changes;
  }
  return http.patch(`/projects/${projectId}/gis?id=${id}`, changes);
}
export async function deleteFeatures(projectId, ids) {
  if (USE_MOCKS) {
    await delay(160);
    store = store.filter((f) => !ids.includes(f.Feature_ID));
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}/gis?ids=${ids.join(",")}`);
}
