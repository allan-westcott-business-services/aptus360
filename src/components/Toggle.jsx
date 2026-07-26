export default function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={checked ? "tog on" : "tog"}
      onClick={() => onChange(!checked)}
    >
      <span className="tog-track">
        <span className="tog-thumb" />
      </span>
      <span className="tog-label">{label}</span>
    </button>
  );
}
