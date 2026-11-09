"use client";

import { usePrediction } from "@/src/hooks/use-prediction";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { HudCard } from "../ui/HudCard";
import { Radar } from "../ui/Radar";
import { DecorImage } from "./DecorImage";

type Props = {
  streamId: string;
  connection: "connecting" | "live" | "reconnecting" | "revoked";
  shoe: number | null;
  round: number | null;
  status: string | null;   // status thô của message mới nhất
  statusLabel: string;
  result: string | null;   // actual_result của ván hiện tại; null = chưa có
};

const BADGE = "relative z-10 flex items-center gap-2 rounded-full border border-red-400 bg-gradient-to-r from-red-600 via-red-500 to-red-600 px-5 py-1 text-xs font-black uppercase tracking-wider text-white shadow-[0_0_12px_#ff0038]";
const TONE_CLASS = { win: "hud-result-win", loss: "hud-result-loss", draw: "hud-result-draw" } as const;

/**
 * Khung dự đoán: Offline → chờ IN_PROGRESS (radar) → đang lấy dự đoán (radar) → có dự đoán → có kết quả
 * (nền thắng xanh / thua đỏ đậm / hòa xám + nhãn THẮNG / THUA / HÒA).
 */
export function PredictionPanel({ streamId, connection, shoe, round, status, statusLabel, result }: Props) {
  const { t } = useI18n();
  const { phase, prediction } = usePrediction(streamId, shoe, round, status);
  const online = connection === "live";
  // pick = null (AI chưa đủ dữ liệu): không có đúng / sai, chỉ hiện hòa khi kết quả là T
  const tone = online && prediction && result !== null
    ? (result === "T" ? "draw" : prediction.pick === null ? null : prediction.pick === result ? "win" : "loss")
    : null;
  const verdict = tone === "win" ? t("live.win") : tone === "loss" ? t("live.lose") : t("live.tie");

  return (
    <HudCard glow className={cn("relative flex min-h-[300px] flex-col items-center justify-center overflow-hidden p-4", tone && TONE_CLASS[tone])} aria-live="polite">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <DecorImage src="/images/pedestal-bg.png" className="h-full w-full object-cover opacity-70 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-red-600/10 via-transparent to-red-900/20" />
      </div>

      {!online ? (
        <>
          <span className={cn(BADGE, "border-gray-500 from-gray-700 via-gray-600 to-gray-700 shadow-none")}>
            {t(connection === "reconnecting" ? "status.reconnecting" : "status.offline")}
          </span>
          <p className="relative z-10 mt-3 font-mono text-xs uppercase tracking-widest text-gray-400">{t(`live.connection.${connection}`)}</p>
        </>
      ) : phase === "waiting" || phase === "analyzing" ? (
        <>
          <span className={BADGE}>
            {phase === "analyzing" && <span className="h-2 w-2 animate-pulse rounded-full bg-white shadow-[0_0_8px_#fff]" />}
            {phase === "analyzing" ? t("live.analyzing") : statusLabel}
          </span>
          <div className="relative z-10 my-2"><Radar /></div>
          <p className="relative z-10 flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-red-400 drop-shadow-[0_0_8px_#ff0038]">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon" />
            <span className="animate-pulse">{t(phase === "analyzing" ? "live.scanning" : "live.loadingData")}</span>
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon" />
          </p>
        </>
      ) : phase === "missing" ? (
        <>
          <span className={cn(BADGE, "border-gray-500 from-gray-700 via-gray-600 to-gray-700 shadow-none")}>{statusLabel}</span>
          <p className="relative z-10 mt-3 font-mono text-xs uppercase tracking-widest text-gray-300">{t("live.noPrediction")}</p>
        </>
      ) : (
        prediction && (
          <>
            <span className={BADGE}>{statusLabel}</span>
            <span className="relative z-10 mt-1 font-display text-xs font-extrabold uppercase tracking-widest text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] md:text-sm">{t("live.prediction")}</span>

            <div className="relative mb-1 mt-2 flex h-[145px] w-full max-w-[360px] flex-col items-center justify-center">
              <DecorImage src="/images/rice-left.png" className="absolute -left-2 bottom-[18px] z-10 h-[120px] w-auto object-contain drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] sm:-left-3" />
              <DecorImage src="/images/rice-right.png" className="absolute -right-2 bottom-[18px] z-10 h-[120px] w-auto object-contain drop-shadow-[0_0_8px_rgba(245,158,11,0.6)] sm:-right-3" />
              {/* Bệ: ảnh nếu có, luôn có quầng vàng dự phòng bằng CSS */}
              <div className="absolute bottom-0 z-0 h-8 w-[300px] max-w-full rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(255,180,0,0.4)_0%,rgba(200,30,20,0.25)_50%,transparent_75%)]" />
              <DecorImage src="/images/pedestal-base.png" className="absolute -bottom-1 z-0 h-auto w-[330px] max-w-full object-contain drop-shadow-[0_0_12px_rgba(245,158,11,0.5)] sm:w-[360px]" />
              {prediction.pick === null || prediction.confidence === null ? (
                <span className="relative z-10 px-6 text-center font-mono text-xs font-black uppercase tracking-widest text-gray-200">{t("live.insufficientData")}</span>
              ) : (
                <>
                  <span className="relative z-10 pt-1 font-display text-6xl font-black leading-none text-white drop-shadow-[0_0_16px_rgba(255,255,255,0.9)] md:text-7xl">{prediction.pick}</span>
                  <span className="relative z-10 mb-2 flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-200">{t("live.confidence")}:</span>
                    <span className="font-mono text-base font-black text-neon drop-shadow-[0_0_8px_#ff0038]">{prediction.confidence.toFixed(1)}%</span>
                  </span>
                </>
              )}
            </div>

            {result !== null && tone && (
              <div className="relative z-10 mt-1 flex items-center gap-3">
                <span className="font-display text-4xl font-black text-white">{result}</span>
                <span className="rounded-full border border-white/40 bg-black/50 px-4 py-1 font-display text-sm font-extrabold tracking-wider text-white">{verdict}</span>
              </div>
            )}
          </>
        )
      )}
    </HudCard>
  );
}
