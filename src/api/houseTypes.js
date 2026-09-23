/* A development's plot breakdown: named house types and floor plans. */
import { http } from "./client.js";

export const listHouseTypes = (projectId) => http.get(`/house-types?project=${projectId}`);

export const addHouseType = (projectId, row) =>
  http.post("/house-types", { ...row, Project_ID: projectId });

export const updateHouseType = (id, patch) => http.patch(`/house-types?id=${id}`, patch);

export const retireHouseType = (id) => http.del(`/house-types?id=${id}`);

/* Straight to storage on a slot the server mints, then recorded.
   Upload first, record second: a file with no row is invisible and
   harmless, a row with no file is a broken link. */
export async function attachFloorPlan(id, file) {
  const slot = await http.post(`/house-types?what=upload&id=${id}`, { fileName: file.name });
  if (!slot?.url) throw new Error("Could not start the upload.");
  const put = await fetch(slot.url, {
    method: "PUT", body: file,
    headers: { "content-type": file.type || "application/octet-stream" },
  });
  if (!put.ok) throw new Error(`The upload failed (${put.status}).`);
  return http.patch(`/house-types?what=attach&id=${id}`, {
    Storage_Path: slot.path, File_Name: file.name,
  });
}

export const floorPlanLink = (id) => http.get(`/house-types?what=file&id=${id}`);

/* Removes the plan, not the house type. */
export const removeFloorPlan = (id) => http.patch(`/house-types?what=detach&id=${id}`, {});
