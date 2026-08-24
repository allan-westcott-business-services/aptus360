/* The background plan, ready to be drawn into a span picture.

   ── Why this is not in spanImage.js ──

   That module knows where the picture is looking. This one knows what a
   basemap is: that a raster one is an image placed by metres-per-pixel
   from an origin and possibly rotated, and a PDF one is a region of a
   page that has to be asked for and rendered before it can be drawn.

   Keeping them apart means the picture can be checked without a PDF
   library, and a third kind of plan later is a third function here
   rather than a third branch inside the drawing.

   ── Why it is asynchronous ──

   Only for PDFs, and only because pdf.js renders one page at a time. A
   raster plan is already in memory and comes back immediately. A caller
   with six spans awaits six PDF renders, which is a second or two once,
   when a call-off is raised. */

import { drawTile } from "./usePdfPage.js";

/* Metres to page units, and back.

   A PDF page is measured in points and the drawing in metres; the
   basemap's Metres_Per_Pixel is the ratio between them, and Origin_X/Y
   says where the page's corner sits in the drawing. */
const toPage = (basemap, x, y) => {
  const mpp = Number(basemap.Metres_Per_Pixel) || 1;
  const ox = Number(basemap.Origin_X) || 0;
  const oy = Number(basemap.Origin_Y) || 0;
  return [(x - ox) / mpp, (y - oy) / mpp];
};

/* The plan layer for one span's extent, or null where there is none.

     basemap     the row: Metres_Per_Pixel, Origin_X/Y, Rotation_Deg, Opacity
     bounds      the span's extent in metres, already padded
     image       the raster plan, where it is one
     renderRegion  usePdfPage's, where it is a PDF

   Returns { opacity, draw } for spanImage, or null. */
/* ── Why there is no plan ──

   planLayer returns null in six different circumstances and says which
   in none of them, and every caller wraps it in `.catch(() => null)`.
   So a drawing captured without its site plan looked exactly like a
   drawing captured with one, and the only way to tell was to open the
   picture and notice the map was missing.

   This answers the same question out loud. It is deliberately a
   separate function taking the same arguments rather than a second
   return value: nothing calling planLayer has to change, and a caller
   that wants to tell somebody what went wrong can ask.

   Returns null where a plan IS expected — that is, where the answer is
   "nothing is wrong". */
export function planReason({
  basemap, bounds, image = null, renderRegion = null, isPdf = false,
} = {}) {
  if (!basemap) return "no background plan is set up on this project";
  if (!basemap.Metres_Per_Pixel) {
    return "the background plan has no scale — run Calibrate scale on it";
  }
  if (!bounds) return "the design has no extent to cover";
  if (isPdf && !renderRegion) {
    return "the PDF plan was not ready to render — open the drawing and try again";
  }
  if (!isPdf && !image) return "the plan image has not finished loading";
  return null;
}

export async function planLayer({
  basemap, bounds, image = null, renderRegion = null, isPdf = false, scale = 1,
} = {}) {
  if (!basemap?.Metres_Per_Pixel || !bounds) return null;

  const mpp = Number(basemap.Metres_Per_Pixel);
  const ox = Number(basemap.Origin_X) || 0;
  const oy = Number(basemap.Origin_Y) || 0;
  const rot = (Number(basemap.Rotation_Deg) || 0) * Math.PI / 180;
  const opacity = Number(basemap.Opacity ?? 0.6);

  /* ── A PDF ── */
  if (isPdf && renderRegion) {
    /* The page rectangle covering this span. Both corners converted,
       then ordered — a rotated or mirrored calibration can put the
       "min" corner on the right. */
    const a = toPage(basemap, bounds.minX, bounds.minY);
    const b = toPage(basemap, bounds.maxX, bounds.maxY);
    const rect = {
      x: Math.min(a[0], b[0]),
      y: Math.min(a[1], b[1]),
      w: Math.abs(b[0] - a[0]),
      h: Math.abs(b[1] - a[1]),
    };
    if (!(rect.w > 0) || !(rect.h > 0)) return null;

    /* Rendered at the picture's own resolution rather than the
       screen's, so a span captured while zoomed out is not a blurred
       one. */
    const region = await renderRegion(rect, Math.max(0.2, mpp * scale));
    if (!region) return null;

    return {
      opacity,
      draw: (ctx, at, viewScale) => {
        if (rot) {
          const o = at([ox, oy]);
          ctx.translate(o.x, o.y);
          ctx.rotate(rot);
          ctx.translate(-o.x, -o.y);
        }
        /* drawTile takes page units and a metres-per-page-unit scale,
           the same way the canvas calls it. */
        drawTile(ctx, region,
          (px, py) => {
            const p = at([ox + px * mpp, oy + py * mpp]);
            return [p.x, p.y];
          },
          mpp * viewScale);
      },
    };
  }

  /* ── A raster ── */
  if (image) {
    return {
      opacity,
      draw: (ctx, at, viewScale) => {
        const o = at([ox, oy]);
        if (rot) {
          ctx.translate(o.x, o.y);
          ctx.rotate(rot);
          ctx.translate(-o.x, -o.y);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(image, o.x, o.y,
          image.naturalWidth * mpp * viewScale,
          image.naturalHeight * mpp * viewScale);
      },
    };
  }

  return null;
}
