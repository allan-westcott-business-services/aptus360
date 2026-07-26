import { http, USE_MOCKS } from "./client.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let store = {};

export async function getQuotationPlots(quotationId) {
  if (USE_MOCKS) {
    await delay(120);
    return { rows: (store[quotationId] || []).map((Plot_ID) => ({ Plot_ID })) };
  }
  return http.get(`/quotations/${quotationId}/plots`);
}

export async function setQuotationPlots(quotationId, plotIds, optionId) {
  if (USE_MOCKS) {
    await delay(280);
    store[quotationId] = [...plotIds];
    return { count: plotIds.length };
  }
  return http.put
    ? http.put(`/quotations/${quotationId}/plots`, { plot_ids: plotIds, option_id: optionId })
    : http.post(`/quotations/${quotationId}/plots`, { plot_ids: plotIds, option_id: optionId });
}
