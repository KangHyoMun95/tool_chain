"use client";

import type { LiveStatus } from "@/src/hooks/use-live-items";
import { usePrediction } from "@/src/hooks/use-prediction";
import { useI18n } from "@/src/i18n/provider";
import { cn } from "@/src/lib/cn";
import { HudCard } from "../ui/HudCard";
import { Radar } from "../ui/Radar";
import { DecorImage } from "./DecorImage";
import { ResultOverlay } from "./ResultOverlay";

type Props = {
  streamId: string;
  connection: LiveStatus;
  shoe: number | null;
  round: number | null;
  status: string | null;   // status thô của message mới nhất
  statusLabel: string;
  result: string | null;   // actual_result của ván hiện tại; null = chưa có
};

const TONE_CLASS = { loss: "hud-result-loss", draw: "hud-result-draw" } as const;

/** Thanh trạng thái ở đầu khung: ảnh predict_status.png, nhãn nằm giữa ảnh. */
function StatusBar({ label, dim = false, pulse = false }: { label: string; dim?: boolean; pulse?: boolean }) {
  return (
    <div className="relative z-10 w-full max-w-[380px]" style={{ containerType: "inline-size" }}>
      <DecorImage src="/images/predict_status.png" className={cn("block h-auto w-full select-none", dim && "opacity-60 grayscale")} />
      <span className="absolute inset-x-[17%] top-[16%] flex h-[66%] items-center justify-center gap-2 text-center font-display font-black uppercase tracking-wider text-white drop-shadow-[0_0_6px_#ff0038]" style={{ fontSize: "5cqw" }}>
        {pulse && <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-white shadow-[0_0_8px_#fff]" />}
        <span className="truncate">{label}</span>
      </span>
    </div>
  );
}

/**
 * Khung dự đoán: Offline → chờ IN_PROGRESS (radar) → đang lấy dự đoán (radar) → có dự đoán → có kết quả
 * (nền thua đỏ đậm / hòa xám).
 */
export function PredictionPanel({ streamId, connection, shoe, round, status, statusLabel, result }: Props) {
  const { t } = useI18n();
  const { phase, prediction } = usePrediction(streamId, shoe, round, status);
  const online = connection === "live";
  // pick = null (AI chưa đủ dữ liệu): không có đúng / sai, chỉ hiện hòa khi kết quả là T. Bị khóa (vào giữa ván): không tô màu.
  const tone = online && prediction && !prediction.locked && result !== null
    ? (result === "T" ? "draw" : prediction.pick === null ? null : prediction.pick === result ? "win" : "loss")
    : null;
  // Ảnh kết quả giữa màn hình: chỉ khi có pick để so (pick = null + kết quả T không tính là hòa của dự đoán).
  const overlayTone = tone && prediction?.pick ? tone : null;

  return (
    <>
    <ResultOverlay tone={overlayTone} roundKey={`${streamId}:${shoe}:${round}`} />
    <HudCard glow className={cn("relative flex h-[236px] flex-col items-center justify-start overflow-hidden p-3", tone && tone !== "win" && TONE_CLASS[tone])} aria-live="polite">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <DecorImage src="/images/pedestal-bg.png" className="h-full w-full object-cover opacity-70 mix-blend-screen" />
        <div className="absolute inset-0 bg-gradient-to-b from-red-600/10 via-transparent to-red-900/20" />
      </div>

      {!online ? (
        <>
          <StatusBar dim label={t(connection === "reconnecting" ? "status.reconnecting" : "status.offline")} />
          <p className="relative z-10 mt-3 font-mono text-xs uppercase tracking-widest text-gray-400">{t(`live.connection.${connection}`)}</p>
        </>
      ) : phase === "waiting" || phase === "analyzing" ? (
        <>
          <StatusBar pulse={phase === "analyzing"} label={phase === "analyzing" ? t("live.analyzing") : statusLabel} />
          <div className="relative z-10 my-2"><Radar size={105} /></div>
          <p className="relative z-10 flex items-center gap-2 font-mono text-xs font-black uppercase tracking-widest text-red-400 drop-shadow-[0_0_8px_#ff0038]">
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon" />
            <span className="animate-pulse">{t(phase === "analyzing" ? "live.scanning" : "live.loadingData")}</span>
            <span className="h-1.5 w-1.5 animate-ping rounded-full bg-neon" />
          </p>
        </>
      ) : phase === "ready" && prediction?.locked ? (
        <>
          <StatusBar label={statusLabel} />
          <div className="relative z-10 my-2 opacity-60"><Radar size={105} /></div>
          <p className="relative z-10 font-mono text-xs font-black uppercase tracking-widest text-gray-200">{t("live.nextRound")}</p>
        </>
      ) : phase === "missing" ? (
        <>
          <StatusBar dim label={statusLabel} />
          <p className="relative z-10 mt-3 font-mono text-xs uppercase tracking-widest text-gray-300">{t("live.noPrediction")}</p>
        </>
      ) : (
        prediction && (
          <>
            <StatusBar label={statusLabel} />

            {/* predict_and_rate.gif (sát đáy khung): ô tròn (giữa, phía trên) chứa dự đoán, ô dưới chứa phần trăm. Hiện từ trong ra ngoài khi có dự đoán. */}
            <div
              key={`${shoe}:${round}`}
              className="predict-reveal relative z-10 -mb-3 mt-auto aspect-[828/304] w-full max-w-[400px]"
              style={{ containerType: "inline-size" }}
            >
              <DecorImage src="/images/predict_and_rate.gif" className="absolute inset-0 h-full w-full select-none object-contain" />
              <div className="absolute left-[50.2%] top-[42.8%] flex -translate-x-1/2 -translate-y-1/2 items-center justify-center">
                <span className={cn("font-display font-black leading-none", "predict-pulse", prediction.pick === "P" ? "text-blue-400 drop-shadow-[0_0_14px_rgba(59,130,246,0.95)]" : prediction.pick === "B" ? "text-red-500 drop-shadow-[0_0_14px_rgba(255,30,66,0.95)]" : "text-gray-300")} style={{ fontSize: prediction.pick === null ? "9cqw" : "13cqw" }}>
                  {prediction.pick ?? "—"}
                </span>
              </div>
              <div className="absolute left-1/2 top-[82%] flex w-[52%] -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-1.5 whitespace-nowrap">
                {prediction.pick === null || prediction.confidence === null ? (
                  <span className="text-center font-mono font-black uppercase tracking-wider text-gray-200" style={{ fontSize: "3.4cqw" }}>{t("live.insufficientData")}</span>
                ) : (
                  <>
                    <span className="font-semibold text-gray-200" style={{ fontSize: "4.4cqw" }}>{t("live.confidence")}:</span>
                    <span className="font-mono font-black text-neon drop-shadow-[0_0_8px_#ff0038]" style={{ fontSize: "6cqw" }}>{prediction.confidence.toFixed(1)}%</span>
                  </>
                )}
              </div>
            </div>
          </>
        )
      )}
    </HudCard>
    </>
  );
}
