import { useId, cloneElement, isValidElement, Children } from "react";

/* A label is only associated with its control if an id links them.
   Rendering them as siblings looks right and reads as nothing to a
   screen reader, so the id is generated here and pushed onto the child.

   Fields often hold more than one child — a control plus a note — so
   only the first element gets the id and the rest pass through. Using
   Children.only here threw and blanked the page. */
export default function Field({ label, required, hint, span, children, htmlFor }) {
  const autoId = useId();
  const id = htmlFor || autoId;
  const hintId = hint ? `${id}-hint` : undefined;

  let tagged = false;
  const content = Children.toArray(children).map((child) => {
    if (tagged || !isValidElement(child)) return child;
    tagged = true;
    return cloneElement(child, {
      id: child.props.id || id,
      "aria-describedby": child.props["aria-describedby"] || hintId,
      "aria-required": required || undefined,
    });
  });

  return (
    <div className="fld" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {content}
      {hint && <p className="hint" id={hintId}>{hint}</p>}
    </div>
  );
}
