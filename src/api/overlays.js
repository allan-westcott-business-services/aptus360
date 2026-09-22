/* OS tiles over a drawing, and the drawing's link to the National Grid.

   The DXF is read here in the browser before anything is sent: only
   the linework in grid metres travels, not the file. */
import { http } from "./client.js";

export const getOverlays = (projectId) =>
  http.get(`/projects/${projectId}/overlays`);

/* `tile` is what readOsTile returned. */
export const addOverlay = (projectId, tile, fileName) =>
  http.post(`/projects/${projectId}/overlays`, {
    Kind: "os_tile",
    File_Name: fileName,
    Linework: { polylines: tile.polylines, texts: tile.texts },
    Min_E: tile.extent?.minE, Min_N: tile.extent?.minN,
    Max_E: tile.extent?.maxE, Max_N: tile.extent?.maxN,
    Hidden_Layers: tile.hidden || [],
  });

export const updateOverlay = (projectId, id, patch) =>
  http.patch(`/projects/${projectId}/overlays?id=${id}`, patch);

export const removeOverlay = (projectId, id) =>
  http.del(`/projects/${projectId}/overlays?id=${id}`);

/* `fit` is what solveLink returned; `points` the pairs it came from. */
export const saveGridLink = (projectId, fit, points) =>
  http.put(`/projects/${projectId}/overlays?what=link`, {
    A: fit.a, B: fit.b, TX: fit.tx, TY: fit.ty,
    Scale: fit.scale, Rotation_Deg: fit.rotationDeg, RMS_M: fit.rms,
    Points: points,
  });

export const removeGridLink = (projectId) =>
  http.del(`/projects/${projectId}/overlays?what=link`);

/* The stored row back into the shape gridLink.js works with. */
export const linkFromRow = (row) => (row
  ? { a: Number(row.A), b: Number(row.B), tx: Number(row.TX), ty: Number(row.TY),
    scale: Number(row.Scale), rotationDeg: Number(row.Rotation_Deg),
    rms: row.RMS_M == null ? null : Number(row.RMS_M), points: row.Points || [] }
  : null);
