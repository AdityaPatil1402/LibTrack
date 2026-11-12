export default function ComingSoonPage({ title, phase, description }) {
  return (
    <div className="stack-lg">
      <div className="page-head">
        <h1>{title}</h1>
      </div>
      <section className="empty-state">
        <h2>Coming in {phase}</h2>
        <p className="muted">{description}</p>
      </section>
    </div>
  );
}
