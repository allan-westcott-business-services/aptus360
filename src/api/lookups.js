import { http, USE_MOCKS } from "./client.js";
import { lookups as mockLookups } from "../lib/mockData.js";

/* Lookups are small, change rarely, and are needed by nearly every screen.
   One batched call, cached for the session — this is why GET /api/lookups
   exists rather than a dozen separate endpoints. */
let cache = null;

export async function getLookups() {
  if (cache) return cache;
  cache = USE_MOCKS ? mockLookups : await http.get("/lookups");
  return cache;
}

export function clearLookupCache() {
  cache = null;
}
