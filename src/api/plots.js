import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let mockStore = [];
let mockId = 1000;

export async function listPlots(projectId) {
  if (USE_MOCKS) {
    await delay(180);
    return { rows: mockStore.filter((p) => p.Project_ID === Number(projectId)) };
  }
  return http.get(`/projects/${projectId}/plots`);
}

export async function createPlots(projectId, plots, projectRef = "") {
  if (USE_MOCKS) {
    await delay(500);
    const rows = plots.map((p) => ({
      ...p,
      Plot_ID: ++mockId,
      Project_ID: Number(projectId),
      Plot_Ref: projectRef ? `${projectRef}-${p.Plot_Number}` : p.Plot_Number,
    }));
    mockStore.push(...rows);
    return { rows };
  }
  return http.post(`/projects/${projectId}/plots`, { plots });
}

export async function deletePlot(projectId, plotId) {
  if (USE_MOCKS) {
    await delay(150);
    mockStore = mockStore.filter((p) => p.Plot_ID !== plotId);
    return { deleted: true };
  }
  return http.del(`/projects/${projectId}/plots?plot_id=${plotId}`);
}

export async function bulkUpdatePlots(projectId, plotIds, changes) {
  if (USE_MOCKS) {
    await delay(400);
    mockStore = mockStore.map((p) => (plotIds.includes(p.Plot_ID) ? { ...p, ...changes } : p));
    return { updated: plotIds.length };
  }
  return http.patch(`/projects/${projectId}/plots`, { plot_ids: plotIds, changes });
}

export async function bulkDeletePlots(projectId, plotIds) {
  if (USE_MOCKS) {
    await delay(300);
    mockStore = mockStore.filter((p) => !plotIds.includes(p.Plot_ID));
    return { deleted: plotIds.length };
  }
  return http.del(`/projects/${projectId}/plots?plot_ids=${plotIds.join(",")}`);
}
