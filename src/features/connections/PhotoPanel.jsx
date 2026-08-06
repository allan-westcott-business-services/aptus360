import { useState, useEffect, useCallback } from "react";
import Banner from "../../components/Banner.jsx";
import { listPhotos, addPhoto, deletePhoto } from "../../api/connectionPhotos.js";
import { useAuth } from "../../lib/AuthContext.jsx";
import { useDragHandle } from "../../lib/useDragHandle.js";

/* Photographs against one connection.

   Evidence that the work was done, and what it looked like. Many per
   connection, so this is a list rather than a single slot — an engineer
   photographs the meter, the trench and the reinstatement, and any of
   the three might be the one that settles a query later. */
export default function PhotoPanel({ connection, onClose, onChanged }) {
  const { user } = useAuth() || {};
  const drag = useDragHandle();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const id = connection.Plot_Utility_ID;

  const load = useCallback(async () => {
    try { setRows((await listPhotos(id)).rows || []); setError(""); }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  async function upload(files) {
    if (!files?.length) return;
    setBusy(true);
    try {
      /* One at a time rather than in parallel: a phone photo is a few
         megabytes, and a browser firing eight uploads at once is how one
         of them fails silently. */
      for (const f of files) await addPhoto(id, f, { email: user?.email });
      await load();
      onChanged?.();
      setError("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function remove(p) {
    if (!window.confirm("Delete this photograph?")) return;
    try { await deletePhoto(p.Photo_ID); await load(); onChanged?.(); }
    catch (e) { setError(e.message); }
  }

  return (
    <div className="fe-backdrop" onClick={() => { if (!drag.justDragged()) onClose(); }}>
      <div className="php" onClick={(e) => e.stopPropagation()} style={drag.panelStyle}
        role="dialog" aria-label="Photographs">
        <style>{CSS}</style>

        <div className="php-head" {...drag.handleProps}>
          <div>
            <h3>Photographs</h3>
            <p className="php-sub">
              Plot {connection._plotNumber} &middot; {connection._projectRef}
            </p>
          </div>
          <button className="fe-x" onClick={onClose} aria-label="Close">&times;</button>
        </div>

        <div className="php-body">
          {error && <Banner kind="error">{error}</Banner>}

          <label className="php-drop">
            <input type="file" accept="image/*" multiple disabled={busy}
              onChange={(e) => { upload([...e.target.files]); e.target.value = ""; }} />
            {busy ? "Uploading\u2026" : "Choose photographs, or drag them here"}
          </label>

          {loading && <p className="php-empty">Loading&hellip;</p>}
          {!loading && !rows.length && (
            <p className="php-empty">Nothing attached to this connection yet.</p>
          )}

          <div className="php-grid">
            {rows.map((p) => (
              <figure className="php-item" key={p.Photo_ID}>
                <a href={p.url} target="_blank" rel="noreferrer">
                  <img src={p.url} alt={p.Caption || "Connection photograph"} loading="lazy" />
                </a>
                <figcaption>
                  <span>{p.Uploaded_By || "\u2014"}</span>
                  <button className="btn delete sm" onClick={() => remove(p)}>
                    Delete
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div className="fe-foot">
          <span className="fe-spacer" />
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

const CSS = `
.php { background: var(--white); border-radius: 12px; width: min(620px, 94vw); max-height: 88vh;
  display: flex; flex-direction: column; box-shadow: 0 24px 60px rgba(15,23,42,.28); }
.php-head { display: flex; align-items: flex-start; gap: 10px; padding: 15px 18px 12px;
  border-bottom: 1px solid var(--border); }
.php-head > div { flex: 1; }
.php-head h3 { margin: 0; font-size: 17px; font-weight: 700; }
.php-sub { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
.php-body { padding: 15px 18px; overflow-y: auto; flex: 1; }
.php-empty { color: var(--muted); font-size: 12.5px; text-align: center; padding: 24px; }
.php-drop { display: block; border: 1.5px dashed var(--border); border-radius: 8px;
  padding: 16px; text-align: center; font-size: 12.5px; color: var(--muted); cursor: pointer;
  font-weight: 500; text-transform: none; letter-spacing: 0; margin-bottom: 14px; }
.php-drop:hover { border-color: var(--accent); color: var(--accent); }
.php-drop input { display: none; }
.php-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; }
.php-item { margin: 0; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.php-item img { width: 100%; height: 110px; object-fit: cover; display: block; }
.php-item figcaption { display: flex; align-items: center; justify-content: space-between;
  padding: 4px 6px; font-size: 10.5px; color: var(--muted); }
`;
