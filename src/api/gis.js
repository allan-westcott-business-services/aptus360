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

const MOCK_LINE_TYPES = [
  { Type_Key: "elec_main", Label: "Electric main", Layer_Key: "electric", Colour: "#f59e0b", Width_px: 3.5, Dashed: false },
  { Type_Key: "elec_service", Label: "Electric service", Layer_Key: "electric", Colour: "#f59e0b", Width_px: 1.8, Dashed: false },
  { Type_Key: "gas_main", Label: "Gas main", Layer_Key: "gas", Colour: "#10b981", Width_px: 3.5, Dashed: false },
  { Type_Key: "gas_service", Label: "Gas service", Layer_Key: "gas", Colour: "#10b981", Width_px: 1.8, Dashed: false },
  { Type_Key: "water_main", Label: "Water main", Layer_Key: "water", Colour: "#3b82f6", Width_px: 3.5, Dashed: false },
  { Type_Key: "water_service", Label: "Water service", Layer_Key: "water", Colour: "#3b82f6", Width_px: 1.8, Dashed: false },
  { Type_Key: "trench_joint", Label: "Joint trench", Layer_Key: "trench", Colour: "#a855f7", Width_px: 6, Dashed: false },
  { Type_Key: "trench_sep", Label: "Separate trench", Layer_Key: "trench", Colour: "#a855f7", Width_px: 6, Dashed: true },
];

export async function listGis(projectId) {
  if (USE_MOCKS) { await delay(180); return { features: [...store], layers: MOCK_LAYERS, lineTypes: MOCK_LINE_TYPES }; }
  return http.get(`/projects/${projectId}/gis`);
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

/* Network operations. Each returns a count so the screen can say what
   happened rather than just "done". */
export async function placeJoints(projectId) {
  if (USE_MOCKS) { await delay(400); return { placed: 0 }; }
  return http.post(`/projects/${projectId}/gis-network?op=joints`, {});
}
export async function traceNetwork(projectId, sourceFeatureId) {
  if (USE_MOCKS) { await delay(500); return { traced: 0 }; }
  return http.post(`/projects/${projectId}/gis-network?op=trace`,
    { source_feature_id: sourceFeatureId });
}
export async function assignMeters(projectId, maxM = 30) {
  if (USE_MOCKS) { await delay(450); return { assigned: 0 }; }
  return http.post(`/projects/${projectId}/gis-network?op=meters`, { max_m: maxM });
}

/* The plots still to be placed, with the bedroom count so seeds can be
   coloured, and the utilities this project needs meters for. */
export async function listPlacementPlots(projectId) {
  if (USE_MOCKS) { await delay(180); return { plots: [], utilities: [] }; }
  return http.get(`/projects/${projectId}/gis-plots`);
}

/* Create any plots in the range that don't exist, then return the whole
   range ready to place. */
export async function ensurePlots(projectId, payload) {
  if (USE_MOCKS) { await delay(400); return { created: 0, plots: [] }; }
  return http.post(`/projects/${projectId}/gis-ensure-plots`, payload);
}
