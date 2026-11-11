// apps/web-portal/src/hooks/use-live-items.ts
"use client";
import { useEffect, useRef, useState } from "react";
import {
  advanceShoe, comparePosition, payloadPosition,
  type Position, type RealtimeInsufficientBalance, type RealtimePrediction, type RealtimeRoundResult, type RealtimeTick, type ShoeContext,
} from "@toolhackchain/shared";
import { useAuth } from "@/src/components/auth/AuthProvider";
import { ApiError, isInsufficientBalance } from "@/src/lib/api/client";
import { requestSseTicket } from "@/src/lib/api/realtime";
import { apiUrl } from "@/src/lib/auth";
import { streamDebug } from "@/src/lib/stream-debug";

// Trang demo /live nhận tick kiểu bất kỳ (BTC/ETH...); trang stream dùng CrawlPayload (mặc định của RealtimeTick).
type LiveTick<D> = Omit<RealtimeTick<D>, "stream_id" | "type"> & { type?: "tick"; stream_id?: string | null };
/** insufficient: hết điểm (402 khi xin ticket hoặc event insufficient_balance) — dừng hẳn, không tự kết nối lại. */
export type LiveStatus = "connecting" | "live" | "reconnecting" | "revoked" | "insufficient";

/** Vị trí đang hiển thị của một item: phiên và kết quả CHỈ ĐI TỚI (comparePosition, dùng chung với hub). */
type Tracker = { ctx: ShoeContext; session: Position | null; result: Position | null };

const RETRY_BASE_MS = 1_000;
const RETRY_MAX_MS = 15_000;

type Options<D> = {
  /** Chỉ nhận tick có stream_id khớp HOẶC null (đã lọc theo key_id lúc subscribe; null = chưa có trong cache id của API). */
  streamId?: string;
  /** Trang chi tiết: kết nối tham gia stream này (bị trừ tiền cho mỗi dự đoán có pick, nhận pick riêng). */
  participate?: boolean;
  /** Gọi cho mọi tick hợp lệ mới hơn tick đã có (kể cả khi nội dung không đổi). Dùng bản mới nhất của hàm, không cần useCallback. */
  onTick?: (t: LiveTick<D>) => void;
  /** Event `round_result` của đúng stream, mới hơn kết quả đã nhận (nguồn DUY NHẤT của kết quả / lịch sử / đúng-sai). */
  onRoundResult?: (r: RealtimeRoundResult) => void;
  /** Event `prediction` của đúng stream (chỉ tới trên kết nối tham gia, khi đã bị trừ tiền hoặc pick = null). */
  onPrediction?: (p: RealtimePrediction) => void;
};

/**
 * Phiên và kết quả CHỈ ĐI TỚI (hub đã lọc; client chặn thêm bằng comparePosition): tick cũ hơn phiên đang hiển thị và
 * round_result không mới hơn kết quả đã nhận đều bị bỏ.
 * SSE theo ticket một lần: xin ticket (POST /realtime/ticket) → EventSource /stream?ticket=. Ticket chỉ dùng được một lần nên
 * không để EventSource tự kết nối lại: lỗi / server đóng ⇒ đóng hẳn rồi xin ticket mới với backoff (1s, 2s, 4s... tối đa 15s).
 * 401 không làm mới được token ⇒ chưa đăng nhập; 403 / 404 ⇒ revoked; 402 / insufficient_balance ⇒ insufficient (dừng).
 */
export function useLiveItems<D = Record<string, unknown>>(items: string[], { streamId, participate = false, onTick, onRoundResult, onPrediction }: Options<D> = {}) {
  const { status: authStatus, markUnauthenticated } = useAuth();
  const [ticks, setTicks] = useState<Record<string, LiveTick<D>>>({});
  const [status, setStatus] = useState<LiveStatus>("connecting");
  const [reconnectCount, setReconnectCount] = useState(0);   // tăng mỗi lần kết nối lại thành công sau khi mất kết nối
  const key = items.join(",");
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;
  const onRoundResultRef = useRef(onRoundResult);
  onRoundResultRef.current = onRoundResult;
  const onPredictionRef = useRef(onPrediction);
  onPredictionRef.current = onPrediction;

  useEffect(() => {
    if ((!key && !participate) || authStatus !== "authenticated") return;
    if (participate && !streamId) return;
    let stopped = false;
    let dropped = false;
    let attempt = 0;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const latestTs = new Map<string, number>();
    // Sống qua các lần kết nối lại (snapshot sau reconnect / API restart có thể là ván cũ hơn ván đang hiển thị).
    const trackers = new Map<string, Tracker>();
    const tracker = (itemId: string): Tracker => {
      let t = trackers.get(itemId);
      if (!t) trackers.set(itemId, (t = { ctx: { current: null, previous: null }, session: null, result: null }));
      return t;
    };

    const stop = (next: LiveStatus) => {
      stopped = true;
      es?.close();
      clearTimeout(timer);
      setStatus(next);
    };

    const retry = () => {
      if (stopped) return;
      es?.close();
      es = null;
      dropped = true;
      setStatus("reconnecting");
      const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** attempt);
      attempt++;
      clearTimeout(timer);
      timer = setTimeout(() => void connect(), delay);
    };

    const onMessage = (e: MessageEvent<string>) => {
      let msg: LiveTick<D> | RealtimePrediction | RealtimeInsufficientBalance | RealtimeRoundResult;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg.type === "insufficient_balance") { stop("insufficient"); return; }
      // Event thiếu `type` coi là tick. Prediction không đi qua logic chống tick cũ / state của tick.
      if (msg.type === "prediction") {
        if (streamId && msg.stream_id !== streamId) return;
        streamDebug(`prediction shoe ${msg.data.shoe} round ${msg.data.round}: ${msg.data.pick ?? "null"} (${msg.data.reason})`);
        onPredictionRef.current?.(msg);
        return;
      }
      if (msg.type === "round_result") {
        if (streamId && msg.stream_id != null && msg.stream_id !== streamId) return;
        const trk = tracker(msg.item_id);
        const pos = { shoe: msg.shoe, round: msg.round };
        if (trk.result && comparePosition(pos, trk.result, trk.ctx) <= 0) {
          streamDebug(`bỏ round_result shoe ${pos.shoe} round ${pos.round}: không mới hơn kết quả shoe ${trk.result.shoe} round ${trk.result.round}`);
          return;
        }
        trk.result = pos;
        streamDebug(`round_result shoe ${pos.shoe} round ${pos.round}: ${msg.result}`);
        onRoundResultRef.current?.(msg);
        return;
      }
      const t = msg;
      if (streamId && t.stream_id != null && t.stream_id !== streamId) return;
      // Trạng thái trực tiếp chỉ đi tới: tick cũ hơn phiên đang hiển thị bị bỏ (tick không có shoe/round, vd trang demo, không lọc).
      const pos = payloadPosition(t.data);
      if (pos) {
        const trk = tracker(t.item_id);
        if (trk.session && comparePosition(pos, trk.session, trk.ctx) < 0) {
          streamDebug(`bỏ tick shoe ${pos.shoe} round ${pos.round}: cũ hơn phiên đang hiển thị shoe ${trk.session.shoe} round ${trk.session.round}`);
          return;
        }
        if (!trk.session || trk.session.shoe !== pos.shoe || trk.session.round !== pos.round) {
          streamDebug(`đổi phiên → shoe ${pos.shoe} round ${pos.round}`, { from: trk.session });
        }
        trk.ctx = advanceShoe(trk.ctx, pos.shoe);
        trk.session = pos;
      }
      if ((latestTs.get(t.item_id) ?? -Infinity) >= t.ts) return;
      latestTs.set(t.item_id, t.ts);
      onTickRef.current?.(t);
      // Chỉ cập nhật state khi dữ liệu thực sự đổi (tick dày, nhiều tick giống nhau).
      setTicks((p) => {
        const old = p[t.item_id];
        return old && JSON.stringify(old.data) === JSON.stringify(t.data) ? p : { ...p, [t.item_id]: t };
      });
    };

    async function connect() {
      let ticket: string;
      try {
        ticket = await requestSseTicket({
          items: key ? key.split(",") : [],
          participateStreamId: participate ? streamId : undefined,
        });
      } catch (err) {
        if (stopped) return;
        if (isInsufficientBalance(err)) return stop("insufficient");
        if (err instanceof ApiError && err.status === 401) { stop("revoked"); markUnauthenticated(); return; }
        if (err instanceof ApiError && (err.status === 403 || err.status === 404 || err.status === 400)) return stop("revoked");
        return retry();   // mạng / 5xx / 429
      }
      if (stopped) return;
      const source = new EventSource(apiUrl(`/stream?ticket=${encodeURIComponent(ticket)}`));
      es = source;
      source.onopen = () => {
        attempt = 0;
        setStatus("live");
        if (dropped) { dropped = false; setReconnectCount((n) => n + 1); }
      };
      source.onmessage = onMessage;
      source.onerror = () => { if (es === source) retry(); };   // không để EventSource tự mở lại với ticket đã dùng
    }

    setStatus("connecting");
    void connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, [key, streamId, participate, authStatus, markUnauthenticated]);

  return { ticks, status, reconnectCount };
}
