"use client";

import { useI18n } from "@/src/i18n/provider";
import type { HistoryRow } from "@/src/hooks/use-stream-history";
import type { Totals } from "@/src/hooks/use-stream-session";

const COLS = 12;
const ROWS = 6;
const SIZE = COLS * ROWS;

type Props = { country: string | null; totals: Totals | null; rows: HistoryRow[] };   // rows: round giảm dần

// Chia ngang 1/3 – 2/3; phần 2/3 chia dọc 2/3 (lưới kết quả) – 1/3 (số liệu).
export function LiveBoard({ country, totals, rows }: Props) {
  const { t } = useI18n();
  // Cũ → mới, lấy SIZE ván mới nhất; lưới điền theo cột (trên xuống dưới, rồi sang cột kế).
  const cells = rows.filter((r) => r.result !== null).slice(0, SIZE).reverse();
  const num = (v: number | undefined) => (v === undefined ? "—" : v);

  return (
    <div className="card card-glass board">
      <div className="board-left">
        <p className="micro-label micro-label-light">{t("live.country")}</p>
        <p className="metric metric-purple">{country || "—"}</p>
      </div>
      <div className="board-right">
        <div className="board-grid" aria-label={t("live.boardTitle")}>
          {Array.from({ length: SIZE }, (_, i) => {
            const r = cells[i]?.result;
            const tone = r === "B" || r === "P" || r === "T" ? r : null;
            return (
              <span key={i} className={`board-cell${tone ? ` cell-${tone}` : r ? " cell-other" : ""}`}>
                {tone ?? (r ? "?" : "")}
              </span>
            );
          })}
        </div>
        <div className="board-totals">
          <span className="total-B">B: <strong>{num(totals?.B)}</strong></span>
          <span className="total-P">P: <strong>{num(totals?.P)}</strong></span>
          <span className="total-T">T: <strong>{num(totals?.T)}</strong></span>
        </div>
      </div>
    </div>
  );
}
