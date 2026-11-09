/** Chuỗi ✓ / ✕ của các dự đoán gần nhất. */
export function ResultBeads({ results }: { results: boolean[] }) {
  return (
    <div className="flex items-center justify-between gap-1 font-mono">
      {results.map((correct, i) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ${correct ? "bg-emerald-500" : "bg-red-600/90"}`}
        >
          {correct ? "✓" : "✕"}
        </span>
      ))}
    </div>
  );
}
