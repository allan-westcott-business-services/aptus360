import { useState, useEffect, useRef, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* Renders a PDF page — but only the part you're looking at.

   Rendering the whole page at high zoom is impossible: an A0 drawing at
   1000% would be billions of pixels, so it gets capped and you end up
   staring at an enlarged low-resolution render. Rendering just the
   visible rectangle at full resolution costs the same regardless of
   zoom, and stays sharp all the way in.

   The rendered tile is deliberately larger than the viewport so small
   pans don't trigger a re-render. */

const MAX_PIXELS = 24e6;
const MARGIN = 0.35;        // extra tile beyond the viewport, as a fraction
const SCALE_BAND = 1.6;     // re-render once zoom moves beyond this ratio

export function usePdfPage(url, pageNumber = 1) {
  const [size, setSize] = useState(null);     // page size in PDF points
  const [tile, setTile] = useState(null);     // { canvas, x, y, w, h, scale }
  const [error, setError] = useState("");
  const docRef = useRef(null);
  const busy = useRef(false);
  const queued = useRef(null);

  useEffect(() => {
    if (!url) { setTile(null); setSize(null); return; }
    let dead = false;
    setTile(null);
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (dead) { doc.destroy(); return; }
        docRef.current = doc;
        const page = await doc.getPage(pageNumber);
        const vp = page.getViewport({ scale: 1 });
        setSize({ width: vp.width, height: vp.height });
        setError("");
      } catch (e) {
        if (!dead) setError(e.message || "The plan couldn't be opened.");
      }
    })();
    return () => { dead = true; docRef.current?.destroy(); docRef.current = null; };
  }, [url, pageNumber]);

  /* Ask for a region in page coordinates at a given screen scale. Called
     on pan and zoom; ignores requests the current tile already covers. */
  const request = useCallback(async (rect, scale) => {
    if (!docRef.current || !size || !rect || !scale) return;

    const covered = tile
      && rect.x >= tile.x && rect.y >= tile.y
      && rect.x + rect.w <= tile.x + tile.w
      && rect.y + rect.h <= tile.y + tile.h
      && scale <= tile.scale * SCALE_BAND
      && scale >= tile.scale / SCALE_BAND;
    if (covered) return;

    if (busy.current) { queued.current = { rect, scale }; return; }
    busy.current = true;

    try {
      // Grow the region so small pans stay within it
      const mx = rect.w * MARGIN, my = rect.h * MARGIN;
      let x = Math.max(0, rect.x - mx);
      let y = Math.max(0, rect.y - my);
      let w = Math.min(size.width - x, rect.w + mx * 2);
      let h = Math.min(size.height - y, rect.h + my * 2);

      let s = scale;
      if (w * s * h * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));

      const page = await docRef.current.getPage(pageNumber);
      const vp = page.getViewport({ scale: s, offsetX: -x * s, offsetY: -y * s });

      const cv = document.createElement("canvas");
      cv.width = Math.max(1, Math.round(w * s));
      cv.height = Math.max(1, Math.round(h * s));
      const ctx = cv.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;

      setTile({ canvas: cv, x, y, w, h, scale: s });
    } catch (e) {
      setError(e.message || "That page couldn't be drawn.");
    } finally {
      busy.current = false;
      const q = queued.current;
      queued.current = null;
      if (q) request(q.rect, q.scale);
    }
  }, [size, pageNumber, tile]);

  /* One region, rendered and handed back.

     `request` exists for the screen: it keeps one tile, grows it so
     small pans stay inside, and skips work the current tile already
     covers. All of that is wrong for taking a picture of a span — the
     answer has to be this extent, now, and several in a row without
     each replacing the last.

     So this renders and returns rather than setting state. Same
     document, same page, no tile touched: capturing a call-off leaves
     the drawing on screen exactly as it was.

     Sequential by necessity — pdf.js renders one page at a time — so a
     caller with six spans awaits six of these. That is a second or two
     once, when a call-off is raised. */
  const renderRegion = useCallback(async (rect, scale) => {
    if (!docRef.current || !size || !rect || !scale) return null;

    const x = Math.max(0, rect.x);
    const y = Math.max(0, rect.y);
    const w = Math.min(size.width - x, rect.w);
    const h = Math.min(size.height - y, rect.h);
    if (!(w > 0) || !(h > 0)) return null;

    /* The same ceiling the tile uses. A span at a high zoom would
       otherwise ask for a canvas the browser refuses to make, and the
       failure is a blank picture rather than an error. */
    let s = scale;
    if (w * s * h * s > MAX_PIXELS) s = Math.sqrt(MAX_PIXELS / (w * h));

    const page = await docRef.current.getPage(pageNumber);
    const vp = page.getViewport({ scale: s, offsetX: -x * s, offsetY: -y * s });

    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w * s));
    cv.height = Math.max(1, Math.round(h * s));
    const ctx = cv.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cv.width, cv.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    return { canvas: cv, x, y, w, h, scale: s };
  }, [size, pageNumber]);

  return { tile, size, error, request, renderRegion };
}

/* Draw a rendered tile onto a canvas, given the page→screen transform. */
export function drawTile(ctx, tile, toScreen, viewScale) {
  if (!tile) return;
  const [sx, sy] = toScreen(tile.x, tile.y);
  ctx.imageSmoothingEnabled = viewScale < tile.scale;
  ctx.drawImage(tile.canvas, sx, sy, tile.w * viewScale, tile.h * viewScale);
}
