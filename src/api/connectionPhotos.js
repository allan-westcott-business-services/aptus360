import { http, USE_MOCKS } from "./client.js";
import { supabase } from "../lib/supabaseClient.js";

const BUCKET = "connection-photos";

export async function listPhotos(connectionId) {
  if (USE_MOCKS) return { rows: [] };
  return http.get(`/connection-photos?connection=${connectionId}`);
}

/* Upload then record, in that order. A row written before the file
   exists is a broken image the moment anyone looks; a file with no row
   is invisible and harmless. */
export async function addPhoto(connectionId, file, { caption, email } = {}) {
  if (USE_MOCKS) return { Photo_ID: 1, url: URL.createObjectURL(file) };
  if (!supabase) throw new Error("Sign in before attaching a photo.");

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${connectionId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET)
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) {
    /* The bucket is not created by a migration — storage isn't schema —
       so this is the first thing to check when it fails. */
    throw new Error(error.message.includes("Bucket not found")
      ? `Storage bucket "${BUCKET}" doesn't exist yet. Create it in Supabase › Storage.`
      : error.message);
  }
  return http.post("/connection-photos", {
    Plot_Utility_ID: connectionId, Storage_Path: path,
    Caption: caption || null, Uploaded_By_Email: email || null,
  });
}

export async function deletePhoto(photoId) {
  if (USE_MOCKS) return { deleted: true };
  return http.del(`/connection-photos?id=${photoId}`);
}
