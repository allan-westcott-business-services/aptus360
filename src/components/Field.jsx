import { useId, cloneElement, isValidElement, Children } from "react";

/* A label is only associated with its control if they're linked by id.
   Rendering them as siblings looks right and reads as nothing to a
   screen reader, so the id is generated here and pushed onto the child
   rather than left to every caller to remember. */
export default function Field({ label, required, hint, span, children, htmlFor }) {
  const autoId = useId();
  const id = htmlFor || autoId;
  const hintId = hint ? `${id}-hint` : undefined;

  const child = Children.only(children);
  const control = isValidElement(child)
    ? cloneElement(child, {
        id: child.props.id || id,
        "aria-describedby": child.props["aria-describedby"] || hintId,
        "aria-required": required || undefined,
      })
    : child;

  return (
    <div className="fld" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req" aria-hidden="true"> *</span>}
      </label>
      {control}
      {hint && <p className="hint" id={hintId}>{hint}</p>}
    </div>
  );
}
