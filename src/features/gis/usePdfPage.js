import { useState, useEffect, useRef } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* Renders a PDF page at whatever zoom you're actually viewing.

   Re-rendering on every wheel tick would be wasteful, so it works in
   bands: render at twice the required resolution, and only render again
   once the view has moved outside what that covers. In practice a few
   renders cover the whole zoom range and each one is sharp.

   Capped at 32MP — beyond that the browser starts refusing canvases, and
   a plan that large is unreadable on screen anyway. */

const MAX_PIXELS = 32e6;
const OVERSAMPLE = 2;
const REDRAW_BAND = 1.9;   // re-render once needed scale exceeds this ratio

export function usePdfPage(url, pageNumber = 1, requiredScale = 1) {
  const [canvas, setCanvas] = useState(null);
  const [size, setSize] = useState(null);      // page size in PDF points
  const [error, setError] = useState("");
  const docRef = useRef(null);
  const renderedAt = useRef(0);
  const busy = useRef(false);
  const pending = useRef(null);

  // load once
  useEffect(() => {
    if (!url) { setCanvas(null); return; }
    let dead = false;
    (async () => {
      try {
        const doc = await pdfjsLib.getDocument({ url, withCredentials: false }).promise;
        if (dead) { doc.destroy(); return; }
        docRef.current = doc;
        const page = await doc.getPage(pageNumber);
        const vp = page.getViewport({ scale: 1 });
        setSize({ width: vp.width, height: vp.height });
        renderedAt.current = 0;
      } catch (e) {
        if (!dead) setError(e.message || "The plan couldn't be opened.");
      }
    })();
    return () => {
      dead = true;
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, [url, pageNumber]);

  // render when the zoom moves outside the band the last render covers
  useEffect(() => {
    if (!docRef.current || !size || !requiredScale) return;

    const need = requiredScale;
    const covered = renderedAt.current;
    if (covered && need <= covered && need > covered / REDRAW_BAND / OVERSAMPLE) return;

    if (busy.current) { pending.current = need; return; }

    let dead = false;
    (async () => {
      busy.current = true;
      try {
        let target = need * OVERSAMPLE;
        if (size.width * target * size.height * target > MAX_PIXELS) {
          target = Math.sqrt(MAX_PIXELS / (size.width * size.height));
        }

        const page = await docRef.current.getPage(pageNumber);
        const vp = page.getViewport({ scale: target });
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(vp.width));
        cv.height = Math.max(1, Math.round(vp.height));
        const ctx = cv.getContext("2d", { alpha: false });
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: ctx, viewport: vp }).promise;

        if (!dead) {
          renderedAt.current = target;
          setCanvas(cv);
        }
      } catch (e) {
        if (!dead) setError(e.message || "That page couldn't be drawn.");
      } finally {
        busy.current = false;
        if (pending.current != null) {
          const p = pending.current;
          pending.current = null;
          // nudge the effect by pretending the scale changed
          if (!dead && p !== need) renderedAt.current = 0;
        }
      }
    })();
    return () => { dead = true; };
  }, [size, requiredScale, pageNumber]);

  return { canvas, size, error, renderedScale: renderedAt.current };
}
