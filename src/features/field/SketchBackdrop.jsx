import { useEffect, useRef, useState } from "react";

/* The sketch backdrop, drawn rather than photographed.

   ── Why this is not an <img> ──

   It was. The as-laid drawing was rendered to a 1400×900 PNG when the
   call-off was raised, and the tablet scaled it up. A gang zooming in
   to mark where a joint actually sits got a staircase for a cable and a
   smear for the site plan — which is a vector line drawing in the
   original PDF, so the pixelation was pure loss.

   Two layers now, and neither is a picture:

   The design is an SVG path per run. Coordinates in metres, mapped
   through the same view the plan uses, so it is crisp at any zoom and
   arrives in a few hundred bytes rather than two hundred kilobytes.

   The plan is the source PDF, rendered by pdf.js at the zoom being
   shown and re-rendered when that changes. Exactly what the GIS canvas
   does on screen — the page is vector, so asking for it at 4× gives
   four times the detail rather than four times the pixel.

   ── The fallback ──

   Where a call-off has no vector payload — every one raised before this
   existed — the PNG is used as before. It pixelates, and that is
   better than a blank rectangle. */

/* Metres to the drawing box, for a given view. */
const project = (bounds, size) => {
  const w = bounds.maxX - bounds.minX;
  const h = bounds.maxY - bounds.minY;
  const scale = Math.min(size / w, size / h);
  return {
    scale,
    x: (size - w * scale) / 2 - bounds.minX * scale,
    /* Y is flipped: the drawing counts north-up, the screen counts
       down. Getting this wrong mirrors the site and nobody notices
       until a gang digs the wrong end of a road. */
    y: (size + h * scale) / 2 + bounds.minY * scale,
    at: (p) => [p[0] * scale + (size - w * scale) / 2 - bounds.minX * scale,
      (size + h * scale) / 2 + bounds.minY * scale - p[1] * scale],
  };
};

/* The site plan, rendered from the PDF at the zoom being shown.

   Re-rendered when the zoom changes, debounced — pdf.js renders one
   page at a time and a pinch fires a hundred zoom events, so asking for
   every one queues a hundred renders and the tablet stops responding. */
function PlanLayer({ plan, bounds, size, zoom }) {
  const ref = useRef(null);
  const [err, setErr] = useState("");
  const docRef = useRef(null);
  const busy = useRef(false);
  const want = useRef(null);

  useEffect(() => {
    let live = true;
    if (!plan?.url) return undefined;

    (async () => {
      try {
        if (plan.kind !== "pdf") return;
        const pdfjs = await import("pdfjs-dist");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        const doc = await pdfjs.getDocument({ url: plan.url }).promise;
        if (!live) return;
        docRef.current = doc;
        draw();
      } catch (e) {
        if (live) setErr(e.message || "The site plan could not be opened.");
      }
    })();

    return () => { live = false; docRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.url]);

  /* One render, at the zoom asked for. */
  async function draw() {
    const doc = docRef.current;
    const cv = ref.current;
    if (!doc || !cv || !bounds) return;
    if (busy.current) { want.current = zoom; return; }
    busy.current = true;

    try {
      const page = await doc.getPage(plan.page || 1);
      const view = project(bounds, size);

      /* The page is measured in its own units and the drawing in
         metres; Metres_Per_Pixel is the ratio and Origin_X/Y says where
         the page corner sits. The scale asked for is the view's, times
         the zoom — which is the whole point: at 4× the page is
         re-rendered at 4× rather than stretched. */
      const s = Math.min(8, (view.scale * plan.mpp) * zoom);
      const vp = page.getViewport({
        scale: s,
        offsetX: -((bounds.minX - plan.originX) / plan.mpp) * s,
        offsetY: -((bounds.minY - plan.originY) / plan.mpp) * s,
      });

      const px = Math.max(1, Math.round(size * zoom));
      cv.width = px;
      cv.height = px;
      const ctx = cv.getContext("2d", { alpha: false });
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, px, px);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
    } catch (e) {
      setErr(e.message || "The site plan could not be drawn.");
    } finally {
      busy.current = false;
      const q = want.current;
      want.current = null;
      if (q != null && q !== zoom) draw();
    }
  }

  useEffect(() => {
    const t = setTimeout(draw, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, size, bounds]);

  if (!plan?.url) return null;
  if (plan.kind !== "pdf") {
    /* A raster plan is a raster plan. Shown, and honestly no crisper
       than it ever was — the pixels are all there are. */
    return <img className="jf-planlayer" src={plan.url} alt="Site plan"
      style={{ opacity: plan.opacity ?? 0.6 }} draggable={false} />;
  }
  return (
    <>
      <canvas ref={ref} className="jf-planlayer"
        style={{ opacity: plan.opacity ?? 0.6 }} />
      {err && <p className="jf-planerr">{err}</p>}
    </>
  );
}

/* The design, as paths. */
function DesignLayer({ vector, size }) {
  if (!vector?.bounds || !vector.items?.length) return null;
  const view = project(vector.bounds, size);
  const at = view.at;

  return (
    <svg className="jf-designlayer" viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="none">
      {vector.items.map((it, i) => {
        if (it.kind === "cable") {
          const d = it.pts.map((p, n) => `${n ? "L" : "M"}${at(p).join(" ")}`).join(" ");
          return <path key={i} d={d} fill="none"
            stroke={it.colour || "#f5b301"}
            /* Services thinner than mains, as the canvas draws them. A
               backdrop that drew them alike would lose which is which
               at the one moment a gang is deciding what they are
               jointing into. */
            strokeWidth={it.service ? 2 : 4}
            strokeLinecap="round" strokeLinejoin="round" />;
        }
        if (it.kind === "plot") {
          const [x, y] = at(it.pts[0]);
          return (
            <g key={i}>
              <rect x={x - 4} y={y - 4} width={8} height={8} rx={1.5}
                fill="#fde68a" stroke="#1d2733" strokeWidth={0.8} />
              {it.label && (
                <text x={x} y={y - 7} fontSize={8} textAnchor="middle"
                  fill="#1d4ed8" fontWeight="600">{it.label}</text>
              )}
            </g>
          );
        }
        if (it.kind === "joint") {
          const [x, y] = at(it.pts[0]);
          return <circle key={i} cx={x} cy={y} r={3}
            fill="#c0392b" stroke="#fff" strokeWidth={1} />;
        }
        return null;
      })}
    </svg>
  );
}

export default function SketchBackdrop({ vector, plan, fallback, size = 1000, zoom = 1 }) {
  /* No vector payload: every call-off raised before this existed. The
     PNG pixelates, which is why this work happened — but a pixelated
     drawing beats no drawing, and re-taking is a choice somebody makes
     rather than something that happens to their booked work. */
  if (!vector) {
    if (!fallback) return null;
    return <img className="jf-planlayer" src={fallback}
      alt="As-laid electric drawing" draggable={false} />;
  }

  return (
    <>
      <PlanLayer plan={plan} bounds={vector.bounds} size={size} zoom={zoom} />
      <DesignLayer vector={vector} size={size} />
    </>
  );
}
