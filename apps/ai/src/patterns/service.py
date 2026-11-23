# src/patterns/service.py
# Hai consumer chạy song song trong một process:
#   ai:results       -> cập nhật bảng đếm pattern của stream
#   predict:requests -> tính dự đoán pattern-v1 -> predict:results
# AI KHÔNG ghi bảng nghiệp vụ nào trong DB: chỉ đọc DB (dựng lại bảng đếm) và ghi Redis của riêng nó + predict:results.
import asyncio
import contextlib
import json
import logging
import os
import signal
import socket
import time
from datetime import datetime, timezone

import redis
import redis.asyncio as aioredis

from sqlalchemy import Engine, text

from .category_config import CategoryConfig, CategoryRegistry, load_registry
from .config import (
    CONFIG_REFRESH_SECONDS, DEFAULT_HALF_LIFE_MINUTES, DEFAULT_SHOE_WEIGHT, HISTORY_DB_WINDOW_HOURS, MAX_CONCURRENT_PREDICTIONS,
    MAX_WEIGHT_EXPONENT, MISSING_PREVIOUS_DELAY_S, MISSING_PREVIOUS_RETRIES, REBUILD_SETTLE_SECONDS,
)
from .contract import (
    AI_COUNTER_GROUP, AI_REBUILD_CHANNEL, AI_PREDICTOR_GROUP, AI_RESULT_STREAM, MODEL_VERSION, PREDICT_REQUEST_STREAM,
    PREDICT_RESULT_STREAM, STREAM_MAXLEN, AiResult, PredictRequest, PredictResult, prediction_id,
    recent_key, round_status_key,
)
from .counts import RedisCounts, rebuild
from .db import engine
from .job_config import AiTuning, TuningReader
from .pattern import choose_pick, combine_weighted, format_detail, history_before, suffix_patterns, weight_scale
from .redis_io import consume, ensure_group

log = logging.getLogger("pattern")
LATE_STATUSES = {"DONE", "GET_RESULT", "SUMMARY_RESULT"}   # quá hạn dự đoán
NO_CONFIG_LOG_INTERVAL_S = 60

# Bù history khi HASH recent thiếu round (Redis restart / mất key): chỉ ĐỌC, đúng (stream_id, road_shoe), round < round hiện tại.
_HISTORY_QUERY = text("""
    SELECT road_count, result FROM game_sessions
    WHERE stream_id = CAST(:stream_id AS uuid) AND road_shoe = :shoe AND road_count < :round
      AND result IS NOT NULL AND created_at > now() - make_interval(hours => :hours)
""")


class AiService:
    def __init__(self, r: aioredis.Redis, db: Engine, registry: CategoryRegistry, tuning: AiTuning, redis_url: str = ""):
        self.r = r
        self.db = db
        self.registry = registry
        self.redis_url = redis_url
        self.tuning = tuning         # cấu hình đang áp dụng (job_configs). half_life_minutes chỉ đổi SAU khi rebuild thành công; shoe_weight đổi ngay
        self._last_error: dict[str, float] = {}
        self.counts = RedisCounts(r)
        self.delay_s = int(os.environ.get("AI_ARTIFICIAL_DELAY_MS", "0")) / 1000   # giả lập AI chậm để thử hạn chót
        # Cổng CHỈ cho phần ĐẾM kết quả mới (ai:results): đóng trong lúc dựng lại ⇒ message nằm lại trong stream. Dự đoán KHÔNG bị chặn: nó đọc bảng cũ
        # cùng (t0, half-life) của chúng trong một transaction Redis (RedisCounts.snapshot) cho tới khi rebuild đổi bảng.
        self._count_open = asyncio.Event()
        self._count_open.set()
        self._count_inflight = 0
        self._rebuild_lock = asyncio.Lock()
        self._rebuild_pending = False
        self._need_rebuild = False   # lần dựng lại trước thất bại ⇒ thử lại ở lần đọc cấu hình kế tiếp
        self._tasks: set[asyncio.Task] = set()

    @contextlib.asynccontextmanager
    async def _counting(self):
        await self._count_open.wait()
        self._count_inflight += 1    # không có await giữa wait() và dòng này nên cổng không thể đóng chen vào
        try:
            yield
        finally:
            self._count_inflight -= 1

    async def rebuild_now(self, reason: str, tuning: AiTuning) -> bool:
        """Dựng lại bảng đếm giữa chừng (không restart) với cấu hình `tuning`; nguyên tử (counts.rebuild). True nếu thành công.

        Chỉ tạm dừng ĐẾM kết quả mới: đóng cổng, chờ handler đếm đang chạy dở, chờ REBUILD_SETTLE_SECONDS cho ingestion ghi nốt batch cuối
        rồi mới đọc DB (ván đã đếm live nhưng chưa vào DB sẽ mất khi đổi bảng, như khi restart). Dự đoán vẫn chạy bằng bảng cũ.
        Thất bại ⇒ log ERROR, bảng và t0 cũ giữ nguyên (counts.rebuild đã xóa key tạm), thử lại ở lần đọc cấu hình sau.
        """
        async with self._rebuild_lock:
            self._rebuild_pending = False
            self._count_open.clear()
            try:
                while self._count_inflight:
                    await asyncio.sleep(0.05)
                await asyncio.sleep(REBUILD_SETTLE_SECONDS)
                log.info("Dựng lại bảng đếm giữa chừng (%s): half_life=%s phút", reason, tuning.half_life_minutes)
                sync_r = redis.from_url(self.redis_url, decode_responses=True)
                try:
                    await asyncio.to_thread(rebuild, sync_r, self.db, self.registry, tuning.half_life_minutes)
                finally:
                    sync_r.close()
                self.tuning, self._need_rebuild = tuning, False
                return True
            except Exception:
                log.exception("Dựng lại bảng đếm giữa chừng THẤT BẠI (%s): giữ nguyên bảng và t0 cũ, thử lại sau %ds", reason, CONFIG_REFRESH_SECONDS)
                self._need_rebuild = True
                return False
            finally:
                self._count_open.set()

    async def refresh_loop(self, reader: TuningReader, stop: asyncio.Event) -> None:
        """Mỗi CONFIG_REFRESH_SECONDS đọc job_configs: AI_HALF_LIFE đổi ⇒ dựng lại; AI_SHOE_WEIGHT đổi ⇒ áp dụng ngay (không dựng lại)."""
        while not stop.is_set():
            with contextlib.suppress(asyncio.TimeoutError):
                await asyncio.wait_for(stop.wait(), CONFIG_REFRESH_SECONDS)
            if stop.is_set():
                return
            try:
                new = await asyncio.to_thread(reader.read)
            except Exception as e:
                log.warning("Không đọc được job_configs (giữ cấu hình hiện tại): %s", e)
                continue
            if new.half_life_minutes != self.tuning.half_life_minutes or self._need_rebuild:
                log.info("AI_HALF_LIFE đổi %s -> %s phút (shoe_weight %s -> %s)", self.tuning.half_life_minutes, new.half_life_minutes,
                         self.tuning.shoe_weight, new.shoe_weight)
                await self.rebuild_now("AI_HALF_LIFE đổi", new)
            elif new.shoe_weight != self.tuning.shoe_weight:
                log.info("AI_SHOE_WEIGHT đổi %s -> %s (áp dụng ngay)", self.tuning.shoe_weight, new.shoe_weight)
                self.tuning = new

    async def _recent(self, stream_id: str, shoe: int) -> dict[int, str]:
        raw = await self.r.hgetall(recent_key(stream_id, shoe))
        return {int(k): v for k, v in raw.items() if k.isdigit()}

    def _db_history(self, stream_id: str, shoe: int, round_: int) -> dict[int, str]:
        with self.db.connect() as c:
            rows = c.execute(_HISTORY_QUERY, {"stream_id": stream_id, "shoe": shoe, "round": round_, "hours": HISTORY_DB_WINDOW_HOURS})
            return {int(r.road_count): str(r.result) for r in rows}

    @staticmethod
    def _ts(received_at: str) -> float:
        """Thời điểm kết quả được ghi nhận (`received_at`, cùng nghĩa với ended_at khi dựng lại: lúc kết quả được ghi nhận)."""
        try:
            return datetime.fromisoformat(received_at.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return time.time()

    def request_rebuild(self, reason: str) -> bool:
        """Yêu cầu dựng lại bảng đếm (cấu hình hiện tại) ở nền; bỏ qua nếu đang dựng / đã có yêu cầu chờ. True nếu đã nhận yêu cầu."""
        if self._rebuild_lock.locked() or self._rebuild_pending:
            return False
        self._rebuild_pending = True
        task = asyncio.create_task(self.rebuild_now(reason, self.tuning))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)
        return True

    def _maybe_rebuild_for_overflow(self, exponent: float) -> None:
        """Số mũ trọng số vượt MAX_WEIGHT_EXPONENT ⇒ tự dựng lại (đặt lại t0)."""
        if exponent > MAX_WEIGHT_EXPONENT:
            self.request_rebuild("số mũ trọng số vượt ngưỡng")

    def _config(self, key_id: str, what: str) -> CategoryConfig | None:
        """Cấu hình category của stream; không có ⇒ log ERROR (tối đa 1 dòng / phút / category) và trả None (không dự đoán, không đếm)."""
        cfg = self.registry.by_key_id(key_id)
        if cfg is None:
            parts = key_id.split("|")
            k = "|".join(parts[:2])
            now = time.monotonic()
            if now - self._last_error.get(k, -1e9) >= NO_CONFIG_LOG_INTERVAL_S:
                self._last_error[k] = now
                log.error("Category %r không có file định nghĩa trong config/categories: bỏ qua %s (key_id %s)", k, what, key_id)
        return cfg

    async def _history(self, msg: PredictRequest, cfg: CategoryConfig) -> tuple[str, bool, str]:
        """(history, missing_previous, nguồn). Giữ vòng chờ round - 1; HASH vẫn thiếu round nào trong 1..round-1 ⇒ bù từ DB."""
        recent: dict[int, str] = {}
        for attempt in range(MISSING_PREVIOUS_RETRIES + 1):
            recent = await self._recent(msg.stream_id, msg.shoe)
            _, missing = history_before(recent, msg.round, cfg.ignore_in_pattern)
            if not missing or attempt == MISSING_PREVIOUS_RETRIES:
                break
            await asyncio.sleep(MISSING_PREVIOUS_DELAY_S)

        source = "redis"
        if any(r not in recent for r in range(1, msg.round)):
            try:
                rows = await asyncio.to_thread(self._db_history, msg.stream_id, msg.shoe, msg.round)
                added = sum(1 for r in rows if r not in recent)
                recent = {**rows, **recent}   # HASH ưu tiên; không ghi ngược vào HASH
                source = f"redis+db (+{added} round)"
            except Exception as e:   # DB lỗi: vẫn dự đoán bằng phần có trong Redis
                log.warning("Không đọc được history từ DB cho %s shoe %d round %d: %s", msg.key_id, msg.shoe, msg.round, e)
                source = "redis (db lỗi)"
        history, missing = history_before(recent, msg.round, cfg.ignore_in_pattern)
        return history, missing, source

    async def on_ai_result(self, msg: AiResult) -> None:
        async with self._counting():
            await self._count_result(msg)

    async def _count_result(self, msg: AiResult) -> None:
        cfg = self._config(msg.key_id, "đếm kết quả")
        if cfg is None:
            return
        if msg.result not in cfg.results:
            log.error("ai:results: result %r không thuộc results của %s (key_id %s), bỏ qua", msg.result, cfg.key, msg.key_id)
            return
        before, missing = history_before(await self._recent(msg.stream_id, msg.shoe), msg.round, cfg.ignore_in_pattern)
        if missing:
            log.warning("ai:results thiếu round %d của stream %s shoe %d khi đếm round %d (bản dựng lại lúc khởi động sẽ sửa)",
                        msg.round - 1, msg.stream_id, msg.shoe, msg.round)
        counted, exponent = await self.counts.add_result(msg.stream_id, msg.shoe, msg.game_session_id, before, msg.result, cfg.predictable,
                                                         self._ts(msg.received_at))
        self._maybe_rebuild_for_overflow(exponent)
        log.debug("đếm %s shoe %d round %d result=%s: %s", msg.stream_id, msg.shoe, msg.round, msg.result, "mới" if counted else "đã đếm / không predictable")

    async def on_request(self, msg: PredictRequest) -> None:
        await self._predict(msg)

    async def _predict(self, msg: PredictRequest) -> None:
        cfg = self._config(msg.key_id, "dự đoán")
        if cfg is None:
            return
        status = await self.r.get(round_status_key(msg.game_session_id))
        if status in LATE_STATUSES:
            log.info("Bỏ qua yêu cầu %s shoe %d round %d: ván đã %s", msg.key_id, msg.shoe, msg.round, status)
            return

        history, missing, source = await self._history(msg, cfg)
        patterns = suffix_patterns(history)
        snap = await self.counts.snapshot(msg.stream_id, msg.shoe, patterns, cfg.predictable)   # một transaction: bảng + (t0, half-life) khớp nhau
        table = snap.raw                                                                        # số lần THẬT (điều kiện >= 3)
        half_life, shoe_weight = snap.half_life_minutes, self.tuning.shoe_weight
        wlookup = None
        if half_life and snap.t0 is not None:
            combined = combine_weighted(snap.table_w, snap.shoe_w, shoe_weight, weight_scale(time.time(), snap.t0, half_life), patterns, cfg.predictable)
            wlookup = lambda _patterns: combined
        else:
            half_life = None
        pick = choose_pick(history, lambda _patterns: table, cfg.predictable, wlookup=wlookup)
        log.info("Dự đoán %s shoe %d round %d history=%s%s\n%s", msg.key_id, msg.shoe, msg.round, source,
                 " (THIẾU round trước)" if missing else "", format_detail(pick))

        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        result = PredictResult(
            schema_version=1, prediction_id=prediction_id(msg.game_session_id),
            game_session_id=msg.game_session_id, stream_id=msg.stream_id, key_id=msg.key_id,
            shoe=msg.shoe, round=msg.round, missing_previous=missing, model_version=MODEL_VERSION,
            half_life_minutes=half_life, shoe_weight=shoe_weight if half_life else None,
            created_at=datetime.now(timezone.utc).isoformat(), **pick,
        )
        await self.r.xadd(PREDICT_RESULT_STREAM, {"payload": result.model_dump_json()}, maxlen=STREAM_MAXLEN, approximate=True)


async def listen_rebuild(url: str, svc: AiService, stop: asyncio.Event) -> None:
    """Nghe ai:rebuild (Redis Pub/Sub; API publish sau CLEAR_HISTORY) ⇒ AiService.request_rebuild (nguyên tử, không chặn dự đoán). Đang dựng lại mà có tín hiệu thêm thì bỏ qua. Mất kết nối thì tự nghe lại."""
    while not stop.is_set():
        conn = aioredis.from_url(url, decode_responses=True)
        try:
            pubsub = conn.pubsub()
            await pubsub.subscribe(AI_REBUILD_CHANNEL)
            log.info("Đang nghe tín hiệu %s", AI_REBUILD_CHANNEL)
            while not stop.is_set():
                msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if msg is None:
                    continue
                try:
                    reason = str(json.loads(msg["data"]).get("reason", "?"))
                except (ValueError, AttributeError):
                    reason = "?"
                if not svc.request_rebuild(f"tín hiệu {AI_REBUILD_CHANNEL}: {reason}"):
                    log.info("Bỏ qua tín hiệu %s (%s): đang dựng lại", AI_REBUILD_CHANNEL, reason)
        except Exception:
            log.exception("Nghe %s lỗi, thử lại sau 3s", AI_REBUILD_CHANNEL)
            await asyncio.sleep(3)
        finally:
            await conn.aclose()


async def run(registry: CategoryRegistry | None = None) -> None:
    registry = registry or load_registry()
    url = os.environ["REDIS_URL"]
    consumer = os.environ.get("AI_CONSUMER_NAME") or socket.gethostname()   # cố định qua các lần restart
    r = aioredis.from_url(url, decode_responses=True)
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)

    # Tạo group TRƯỚC khi dựng lại: tin đến trong lúc dựng nằm sẵn trong group, ván đã đếm bị loại bởi ai:counted.
    await ensure_group(r, AI_RESULT_STREAM, AI_COUNTER_GROUP)
    await ensure_group(r, PREDICT_REQUEST_STREAM, AI_PREDICTOR_GROUP)
    db = engine()
    reader = TuningReader(db)
    try:
        tuning = await asyncio.to_thread(reader.read)
    except Exception as e:   # bảng job_configs thiếu (chưa chạy migration V4) / không có quyền SELECT: vẫn chạy với mặc định, đọc lại mỗi phút
        log.error("Không đọc được job_configs (chạy migration V4? user DB chỉ đọc cần SELECT): dùng mặc định half_life=%d phút, shoe_weight=%d: %s",
                  DEFAULT_HALF_LIFE_MINUTES, DEFAULT_SHOE_WEIGHT, e)
        tuning = AiTuning(DEFAULT_HALF_LIFE_MINUTES, DEFAULT_SHOE_WEIGHT)
    sync_r = redis.from_url(url, decode_responses=True)
    try:
        await asyncio.to_thread(rebuild, sync_r, db, registry, tuning.half_life_minutes)
    finally:
        sync_r.close()

    svc = AiService(r, db, registry, tuning, url)
    log.info("AI service sẵn sàng (consumer=%s, model=%s, half_life=%s phút, shoe_weight=%s)", consumer, MODEL_VERSION,
             tuning.half_life_minutes or "tắt", tuning.shoe_weight)
    await asyncio.gather(
        svc.refresh_loop(reader, stop),
        consume(r, AI_RESULT_STREAM, AI_COUNTER_GROUP, consumer, AiResult, svc.on_ai_result, stop),
        consume(r, PREDICT_REQUEST_STREAM, AI_PREDICTOR_GROUP, consumer, PredictRequest, svc.on_request, stop,
                concurrency=MAX_CONCURRENT_PREDICTIONS),
        listen_rebuild(url, svc, stop),
    )
    await r.aclose()
