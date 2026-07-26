export default function Section({ title, right, intro, children }) {
  return (
    <section className="sec">
      <div className="sec-head">
        <p className="sec-label">{title}</p>
        {right}
      </div>
      {intro && <p className="sec-intro">{intro}</p>}
      {children}
    </section>
  );
}
