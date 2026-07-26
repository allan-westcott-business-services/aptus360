export default function Field({ label, required, hint, span, children }) {
  return (
    <div className="fld" style={span ? { gridColumn: `span ${span}` } : undefined}>
      <label>
        {label}
        {required && <span className="req"> *</span>}
      </label>
      {children}
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
