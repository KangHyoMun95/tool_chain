"use client";

import type { CrawlPayload } from "@toolhackchain/shared";
import { useI18n } from "@/src/i18n/provider";

const FIELDS = ["deliver_time", "timestamp", "stamp_time", "round_start_time", "repaint_time"] as const;

// Chỉ quy đổi khi chắc chắn: epoch giây/mili-giây hoặc ISO có "T". Chuỗi không múi giờ (vd "2025-01-01 10:00:00") giữ nguyên.
function toVietnamTime(raw: string): string | null {
  let ms: number;
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    ms = n < 1e11 ? n * 1000 : n;
  } else if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    ms = Date.parse(raw);
  } else return null;
  if (!Number.isFinite(ms)) return null;
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour12: false });
}

export const SHOW_STREAM_DEBUG = process.env.NEXT_PUBLIC_SHOW_STREAM_DEBUG === "true";

/** Khung debug 5 trường time của message mới nhất; chỉ hiện khi NEXT_PUBLIC_SHOW_STREAM_DEBUG=true. */
export function StreamDebugPanel({ data }: { data: CrawlPayload | undefined }) {
  const { t } = useI18n();
  if (!SHOW_STREAM_DEBUG) return null;
  return (
    <details className="hud-card p-3.5 text-sm">
      <summary className="cursor-pointer font-display font-bold tracking-wide text-white">{t("live.debugTitle")}</summary>
      <table className="mt-2 w-full font-mono text-xs">
        <tbody>
          {FIELDS.map((f) => {
            const v = data?.[f];
            const raw = v == null ? null : String(v);
            const converted = raw === null ? null : toVietnamTime(raw);
            return (
              <tr key={f} className="border-t border-white/10">
                <td className="py-1 pr-3 text-slate-hud">{f}</td>
                <td className="py-1 pr-3 text-white">{raw ?? "—"}</td>
                <td className="py-1 text-slate-hud">{converted ? `${t("live.debugConverted")}: ${converted}` : ""}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </details>
  );
}
