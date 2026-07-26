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
