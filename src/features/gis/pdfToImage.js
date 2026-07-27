import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

/* Reading a PDF's page count and size before upload. The rendering
   itself happens in usePdfPage, at the zoom being viewed — flattening
   the page here would throw away the resolution worth keeping. */

export async function pdfPageCount(file) {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const n = doc.numPages;
  await doc.destroy();
  return n;
}

export async function pdfPageSize(file, pageNumber = 1) {
  const doc = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  if (pageNumber < 1 || pageNumber > doc.numPages) {
    const n = doc.numPages;
    await doc.destroy();
    throw new Error(`That PDF has ${n} page${n === 1 ? "" : "s"}.`);
  }
  const page = await doc.getPage(pageNumber);
  const vp = page.getViewport({ scale: 1 });
  const size = { width: vp.width, height: vp.height, pageCount: doc.numPages };
  await doc.destroy();
  return size;
}
