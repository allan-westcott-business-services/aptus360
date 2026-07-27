import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* Site plans arrive as PDFs, so the canvas has to take them directly.

   The page is rasterised at a resolution chosen from its own size rather
   than a fixed scale: an A0 drawing and an A4 one need very different
   multipliers to end up equally legible. Detail lost here can't be
   recovered by zooming, so it's worth erring large — but not so large
   that the browser runs out of memory decoding it later. */

const TARGET_LONG_EDGE = 4500;   // px
const MAX_PIXELS = 40e6;         // ~40MP, comfortable for canvas decode

export async function pdfPageCount(file) {
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

export async function renderPdfPage(file, pageNumber = 1, onProgress) {
  onProgress && onProgress(5);
  const buf = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buf }).promise;

  if (pageNumber < 1 || pageNumber > doc.numPages) {
    await doc.destroy();
    throw new Error(`That PDF has ${doc.numPages} page${doc.numPages === 1 ? "" : "s"}.`);
  }

  const page = await doc.getPage(pageNumber);
  onProgress && onProgress(20);

  const base = page.getViewport({ scale: 1 });
  let scale = TARGET_LONG_EDGE / Math.max(base.width, base.height);

  // Don't exceed what a canvas will comfortably hold
  if (base.width * scale * base.height * scale > MAX_PIXELS) {
    scale = Math.sqrt(MAX_PIXELS / (base.width * base.height));
  }
  scale = Math.max(1, scale);

  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(viewport.width);
  canvas.height = Math.round(viewport.height);
  const ctx = canvas.getContext("2d", { alpha: false });

  // White behind, or transparent areas come out black in a JPEG
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  onProgress && onProgress(35);
  await page.render({ canvasContext: ctx, viewport }).promise;
  onProgress && onProgress(70);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("The page couldn't be rasterised."))),
      "image/jpeg",
      0.92
    );
  });

  await doc.destroy();
  canvas.width = canvas.height = 0;   // release the backing store
  onProgress && onProgress(80);

  return {
    blob,
    width: canvas.width || Math.round(viewport.width),
    height: Math.round(viewport.height),
    renderedWidth: Math.round(viewport.width),
    renderedHeight: Math.round(viewport.height),
    pageCount: doc.numPages,
  };
}
