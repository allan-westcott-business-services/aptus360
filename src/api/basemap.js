import { http, USE_MOCKS } from "./client.js";
import { getSupabase } from "../lib/supabaseClient.js";


const delay = (ms) => new Promise((r) => setTimeout(r, ms));
let mock = null;

export async function getBasemap(projectId) {
  if (USE_MOCKS) { await delay(120); return mock; }
  return http.get(`/projects/${projectId}/basemap`);
}

export async function saveBasemap(projectId, changes) {
  if (USE_MOCKS) { await delay(200); mock = { ...(mock || {}), ...changes }; return mock; }
  return http.put(`/projects/${projectId}/basemap`, changes);
}

export async function removeBasemap(projectId) {
  if (USE_MOCKS) { await delay(150); mock = null; return { deleted: true }; }
  return http.del(`/projects/${projectId}/basemap`);
}

/* Straight to Supabase Storage rather than through a function: a site
   plan is megabytes, and a Netlify function has a 10-second budget and a
   6MB body limit. The browser already holds a signed-in session. */
/* The PDF is stored as it arrived. Flattening it to an image at import
   throws away the resolution that makes a vector drawing useful — it's
   rendered instead at whatever zoom you're viewing. */
export async function uploadBasemap(projectId, file, onProgress) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);

  if (USE_MOCKS) {
    await delay(400);
    return { url: URL.createObjectURL(file), path: `mock/${file.name}`, isPdf };
  }
  if (!supabase) throw new Error("Sign in before uploading a plan.");

  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${projectId}/${Date.now()}.${ext}`;

  onProgress && onProgress(20);
  const supabase = await getSupabase();
  const { error } = await supabase.storage.from("basemaps")
    .upload(path, file, {
      cacheControl: "31536000",
      upsert: false,
      contentType: isPdf ? "application/pdf" : file.type,
    });
  if (error) throw new Error(error.message);

  const { data } = supabase.storage.from("basemaps").getPublicUrl(path);
  onProgress && onProgress(100);
  return { url: data.publicUrl, path, isPdf };
}

/* Read the pixel dimensions before saving — the canvas needs them to
   size the image, and reading them later means a second load. */
export function readImageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a readable image.")); };
    img.src = url;
  });
}
