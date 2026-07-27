export default function Select({ value, onChange, disabled, children, id, ...rest }) {
  return (
    <div className="sel">
      <select
        id={id}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      >
        {children}
      </select>
    </div>
  );
}
