import { useRef, useState, useCallback } from "react";

/* Moving a floating form out of the way.

   A dialog that covers the thing you are being asked about is a common
   and avoidable annoyance — a feature editor sitting on top of the
   feature, an invoice form over the plot list it is asking you to check.

   Pointer events with capture, so the drag keeps tracking when the
   cursor leaves the header, or even the window. Mouse events would drop
   it the moment you moved faster than React re-rendered.

   The panel is moved with a transform rather than by switching to
   absolute positioning: the layout that centred it still applies, so
   letting go leaves it where you put it, and closing and reopening puts
   it back in the middle. */
export function useDragHandle() {
  const [pos, setPos] = useState(null);
  const drag = useRef(null);
  const moved = useRef(false);

  const onPointerDown = useCallback((e) => {
    /* A control in the header is a control, not a grab point. Without
       this the close button becomes hard to hit, because the first pixel
       of movement starts a drag instead. */
    if (e.target.closest("button, input, select, textarea, a, [role=button]")) return;
    if (e.button !== 0) return;
    drag.current = {
      sx: e.clientX, sy: e.clientY,
      ox: pos?.x ?? 0, oy: pos?.y ?? 0,
    };
    moved.current = false;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
    setPos({ x: d.ox + dx, y: d.oy + dy });
  }, []);

  const onPointerUp = useCallback((e) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
  }, []);

  /* Letting go over the backdrop must not count as a click on it, or a
     drag that ends outside the panel closes the form you were moving. */
  const justDragged = useCallback(() => moved.current, []);

  return {
    handleProps: {
      onPointerDown, onPointerMove, onPointerUp,
      onDoubleClick: () => setPos(null),      // back to the middle
      style: { cursor: pos ? "grabbing" : "grab", touchAction: "none" },
      title: "Drag to move \u2014 double-click to re-centre",
    },
    panelStyle: pos ? { transform: `translate(${pos.x}px, ${pos.y}px)` } : undefined,
    justDragged,
    moved: !!pos,
    reset: () => setPos(null),
  };
}
