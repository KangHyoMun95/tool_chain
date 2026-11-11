import type { RecentResultDto } from "@/src/lib/api/predictions";

/** Các dự đoán đã chấm gần nhất: chữ pick (B đỏ / P xanh dương), viền xanh lá = đúng, viền đỏ + mờ = sai. */
export function ResultBeads({ results }: { results: RecentResultDto[] }) {
  return (
    <div className="flex flex-wrap items-center justify-start gap-1 font-mono">
      {results.map((r, i) => (
        <span
          key={i}
          title={`${r.pick} → ${r.result}`}
          className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black text-white shadow ring-2 ${r.pick === "B" ? "bg-red-600" : "bg-blue-600"} ${r.win ? "ring-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.7)]" : "opacity-60 ring-red-900"}`}
        >
          {r.pick}
        </span>
      ))}
    </div>
  );
}
