export function RecentResultDots({ results }: { results: boolean[] }) {
  return (
    <div className="result-dots">
      {results.map((correct, i) => (
        <span key={i} className={`result-dot ${correct ? "is-win" : "is-loss"}`}>
          {correct ? "✓" : "✕"}
        </span>
      ))}
    </div>
  );
}
