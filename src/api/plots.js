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

/* Self-lay for one utility across a selection of plots.

   Its own call rather than a field on bulkUpdatePlots, because it
   writes Plot_Utility and that one writes Plot. Sharing an entry point
   would mean one function that sometimes updates a different table
   depending on which key it was handed, and the count it returned would
   mean two things. */
export async function setPlotSelfLay(projectId, plotIds, utilityId, value) {
  if (USE_MOCKS) {
    await delay(300);
    mockStore = mockStore.map((p) => {
      if (!plotIds.includes(p.Plot_ID)) return p;
      const on = new Set(p.SLP_Utility_IDs || []);
      if (value) on.add(Number(utilityId)); else on.delete(Number(utilityId));
      return { ...p, SLP_Utility_IDs: [...on].sort((a, b) => a - b) };
    });
    return { updated: plotIds.length, missing: [] };
  }
  return http.patch(`/projects/${projectId}/plots?self_lay`,
    { plot_ids: plotIds, utility_id: Number(utilityId), value: !!value });
}

export async function bulkDeletePlots(projectId, plotIds) {
  if (USE_MOCKS) {
    await delay(300);
    mockStore = mockStore.filter((p) => !plotIds.includes(p.Plot_ID));
    return { deleted: plotIds.length };
  }
  return http.del(`/projects/${projectId}/plots?plot_ids=${plotIds.join(",")}`);
}
