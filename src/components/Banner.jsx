export default function Banner({ kind = "muted", children }) {
  return <div className={`banner ${kind}`}>{children}</div>;
}
