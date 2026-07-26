export default function Select({ value, onChange, disabled, children }) {
  return (
    <div className="sel">
      <select
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {children}
      </select>
    </div>
  );
}
