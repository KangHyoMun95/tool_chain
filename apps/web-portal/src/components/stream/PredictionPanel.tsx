"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

const TONE_CLASS = { loss: "hud-result-loss", draw: "hud-result-draw" } as const;

const WINNER_GIF_MS = 4400;   // winner.gif dài ~4.25s (lặp vô hạn): hiển thị hết một vòng rồi gỡ

/** winner.gif hiện giữa màn hình (portal ra body, không nằm trong khung dự đoán): đã hiện thì chạy hết một vòng, không phụ thuộc trạng thái khác (ván mới, đổi phase...). Tính giờ từ lúc ảnh tải xong. */
function WinnerOverlay({ onDone }: { onDone: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => { if (!timer.current) timer.current = setTimeout(onDone, WINNER_GIF_MS); };
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth > 0) start();   // ảnh đã có trong cache
    return () => { if (timer.current) clearTimeout(timer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center" aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={img} src="/images/winner.gif" alt="" onLoad={start} onError={onDone} className="max-h-[80vh] max-w-[90vw] select-none object-contain" />
    </div>,
    document.body,
  );
}

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
 * (nền thua đỏ đậm / hòa xám; thắng chỉ hiện winner.gif giữa màn hình).
 */
export function PredictionPanel({ streamId, connection, shoe, round, status, statusLabel, result }: Props) {
  const { t } = useI18n();
  const { phase, prediction } = usePrediction(streamId, shoe, round, status);
  const online = connection === "live";
  // pick = null (AI chưa đủ dữ liệu): không có đúng / sai, chỉ hiện hòa khi kết quả là T
  const tone = online && prediction && result !== null
    ? (result === "T" ? "draw" : prediction.pick === null ? null : prediction.pick === result ? "win" : "loss")
    : null;
  // Thắng: bật hiệu ứng đúng một lần cho mỗi ván; sau đó tự chạy hết, không phụ thuộc tone / phase hiện tại
  const winKey = tone === "win" ? `${shoe}:${round}` : null;
  const celebratedRef = useRef<string | null>(null);
  const [celebration, setCelebration] = useState<string | null>(null);
  useEffect(() => {
    if (winKey && celebratedRef.current !== winKey) { celebratedRef.current = winKey; setCelebration(winKey); }
  }, [winKey]);

  return (
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
                <span className={cn("predict-pulse font-display font-black leading-none", prediction.pick === "P" ? "text-blue-400 drop-shadow-[0_0_14px_rgba(59,130,246,0.95)]" : prediction.pick === "B" ? "text-red-500 drop-shadow-[0_0_14px_rgba(255,30,66,0.95)]" : "text-gray-300")} style={{ fontSize: prediction.pick === null ? "9cqw" : "13cqw" }}>
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
      {celebration && <WinnerOverlay key={celebration} onDone={() => setCelebration((c) => (c === celebration ? null : c))} />}
    </HudCard>
  );
}
