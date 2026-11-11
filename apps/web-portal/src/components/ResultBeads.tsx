import type { RecentResultDto } from "@/src/lib/api/predictions";

/** Chuỗi ✓ / ✕ của các dự đoán gần nhất (đúng / sai theo `win` do API tính). */
export function ResultBeads({ results }: { results: RecentResultDto[] }) {
  return (
    <div className="flex items-center justify-start gap-1 font-mono">
      {results.map((r, i) => (
        <span
          key={i}
          title={`${r.pick} → ${r.result}`}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white shadow ${r.win ? "bg-emerald-500" : "bg-red-600/90"}`}
        >
          {r.win ? "✓" : "✕"}
        </span>
      ))}
    </div>
  );
}
