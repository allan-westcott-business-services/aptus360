export default function StagePill({ stage }) {
  const cls = stage === "Contract" ? "stage-pill contract" : "stage-pill tender";
  return <span className={cls}>{stage} stage</span>;
}
