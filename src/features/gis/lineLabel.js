/* What a line says about itself on the drawing.

   A main or a service carries a tag — the way and circuit on electric,
   the size and length on water and gas — and until now only the screen
   wrote it. The print labelled points and nothing else, so a sheet went
   out with every pipe and cable anonymous: the one drawing somebody
   digs from, and the reader had to count runs back to the POC to know
   which main they were looking at.

   Pure, and here rather than in the canvas, so the two renderers
   compose one string instead of two. What the canvas adds on top of
   this — the catalogue's spelling of a cable, the gas flow, the white
   plate behind the text — is live state and presentation; what a run IS
   called is a fact about the feature, and that is what this returns. */

import { isTrenchType } from "./snapping.js";
import { drawnLength, runLength, hasMeasured } from "./lengths.js";

/* The measured length where somebody entered one, marked so the
   drawing admits the number is not the geometry under it, and the
   drawn length otherwise. Same rule the canvas has always used. */
export const lengthLabel = (f) => (hasMeasured(f)
  ? `${runLength(f).toFixed(1)} m entered`
  : `${drawnLength(f).toFixed(1)} m`);

/* The short tag: "2B" for way 2 circuit B, "2a" for a feeder hop.

   A trench never carries one. It has a Circuit_Letter on it in older
   drawings, and labelling a dig with a circuit says the dig belongs to
   that circuit — which is how a shared trench gets read as one
   circuit's and priced to it. */
export function lineTag(f, lineTypes = []) {
  const a = f?.Attributes || {};
  const circuit = isTrenchType(a.Line_Type, lineTypes) ? null : a.Circuit_Letter;
  if (circuit) return `${a.Way ?? ""}${circuit}`;
  return a.Way ? `${a.Way}${a.Hop_Letter ?? ""}` : "";
}

/* The label a line carries on a sheet.

   The tag, and beneath it what the run is made of where the feature
   says so: water and gas carry a size, and every run carries a length
   measured off its own geometry. Returned as lines, because size and
   length are two quantities and running them together means telling
   them apart by their units.

   `Size` is read off the feature rather than out of a catalogue: it is
   written beside Water_Pipe_Size_ID whenever a size is set, by the
   build and by the editor alike, so the sheet can say what is in the
   ground without the catalogues the screen holds in memory. Where a
   run has been upsized by hand this is that size, which is the figure
   somebody orders from.

   What is deliberately NOT here: the catalogue's spelling of a cable
   and the gas flow. Both are derived from lookups the canvas loads and
   the print does not, and inventing a second source for them is how
   the two drawings come apart. A sheet that needs them is a sheet that
   should pass them in. */
export function lineLabelText(f, { lineTypes = [] } = {}) {
  if (!f || (f.Geometry || []).length < 2) return "";
  const a = f.Attributes || {};
  const tag = lineTag(f, lineTypes);

  /* A trench says nothing but its own label: what it holds is drawn
     inside it, and a dig labelled with a size reads as a pipe. */
  if (isTrenchType(a.Line_Type, lineTypes)) return f.Label ? String(f.Label) : "";

  const sized = (f.Layer_Key === "water" || f.Layer_Key === "gas") && a.Size
    ? [String(a.Size), lengthLabel(f)]
    : null;

  if (sized) return [tag || null, ...sized].filter(Boolean).join("\n");
  if (tag) return tag;
  /* Nothing configured to say: fall back to whatever the run is
     called, which is what the build wrote on it (W1, G3). */
  return f.Label ? String(f.Label) : "";
}
