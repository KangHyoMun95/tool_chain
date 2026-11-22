# src/patterns/service.py
# Hai consumer chạy song song trong một process:
#   ai:results       -> cập nhật bảng đếm pattern của stream
#   predict:requests -> tính dự đoán pattern-v1 -> predict:results
# AI KHÔNG ghi bảng nghiệp vụ nào trong DB: chỉ đọc DB (dựng lại bảng đếm) và ghi Redis của riêng nó + predict:results.
import asyncio
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
    HISTORY_DB_WINDOW_HOURS, MAX_CONCURRENT_PREDICTIONS, MISSING_PREVIOUS_DELAY_S, MISSING_PREVIOUS_RETRIES, REBUILD_SIGNAL_DELAY_S,
)
from .contract import (
    AI_COUNTER_GROUP, AI_REBUILD_CHANNEL, AI_PREDICTOR_GROUP, AI_RESULT_STREAM, MODEL_VERSION, PREDICT_REQUEST_STREAM,
    PREDICT_RESULT_STREAM, STREAM_MAXLEN, AiResult, PredictRequest, PredictResult, prediction_id,
    recent_key, round_status_key,
)
from .counts import RedisCounts, rebuild
from .db import engine
from .pattern import choose_pick, format_detail, history_before, suffix_patterns
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
    def __init__(self, r: aioredis.Redis, db: Engine, registry: CategoryRegistry):
        self.r = r
        self.db = db
        self.registry = registry
        self._last_error: dict[str, float] = {}
        self.counts = RedisCounts(r)
        # Khóa ĐẾM: on_ai_result giữ khi đếm; rebuild_now giữ suốt lúc dựng lại (chờ lần đếm đang dở xong, rồi chặn đếm mới).
        # Dự đoán (on_request) KHÔNG dùng khóa này nên vẫn chạy bằng bảng cũ; kết quả mới nằm lại trong ai:results, đếm bù sau RENAME.
        self._count_lock = asyncio.Lock()
        self.rebuilding = False
        self.delay_s = int(os.environ.get("AI_ARTIFICIAL_DELAY_MS", "0")) / 1000   # giả lập AI chậm để thử hạn chót

    async def _recent(self, stream_id: str, shoe: int) -> dict[int, str]:
        raw = await self.r.hgetall(recent_key(stream_id, shoe))
        return {int(k): v for k, v in raw.items() if k.isdigit()}

    def _db_history(self, stream_id: str, shoe: int, round_: int) -> dict[int, str]:
        with self.db.connect() as c:
            rows = c.execute(_HISTORY_QUERY, {"stream_id": stream_id, "shoe": shoe, "round": round_, "hours": HISTORY_DB_WINDOW_HOURS})
            return {int(r.road_count): str(r.result) for r in rows}

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
        async with self._count_lock:
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
        counted = await self.counts.add_result(msg.stream_id, msg.shoe, msg.game_session_id, before, msg.result, cfg.predictable)
        log.debug("đếm %s shoe %d round %d result=%s: %s", msg.stream_id, msg.shoe, msg.round, msg.result, "mới" if counted else "đã đếm / không predictable")

    async def rebuild_now(self, url: str, reason: str) -> None:
        """Dựng lại bảng đếm từ DB không restart (tín hiệu ai:rebuild). Bảng cũ vẫn dùng cho dự đoán cho tới lúc RENAME; chỉ tạm dừng ĐẾM."""
        self.rebuilding = True
        try:
            await asyncio.sleep(REBUILD_SIGNAL_DELAY_S)
            started = time.monotonic()
            log.info("Dựng lại bảng đếm bắt đầu (tín hiệu %s): tạm dừng ĐẾM kết quả mới, dự đoán vẫn chạy", reason)
            async with self._count_lock:
                sync_r = redis.from_url(url, decode_responses=True)
                try:
                    totals = await asyncio.to_thread(rebuild, sync_r, self.db, self.registry)
                finally:
                    sync_r.close()
            log.info("Dựng lại bảng đếm kết thúc sau %.1fs: nạp %d kết quả (%d stream, %d pattern); tiếp tục đếm",
                     time.monotonic() - started, totals["results"], totals["streams"], totals["patterns"])
        except Exception:
            log.exception("Dựng lại bảng đếm theo tín hiệu %s lỗi (bảng đếm giữ nguyên; restart AI để dựng lại từ DB)", reason)
        finally:
            self.rebuilding = False

    async def on_request(self, msg: PredictRequest) -> None:
        cfg = self._config(msg.key_id, "dự đoán")
        if cfg is None:
            return
        status = await self.r.get(round_status_key(msg.game_session_id))
        if status in LATE_STATUSES:
            log.info("Bỏ qua yêu cầu %s shoe %d round %d: ván đã %s", msg.key_id, msg.shoe, msg.round, status)
            return

        history, missing, source = await self._history(msg, cfg)
        table = await self.counts.lookup(msg.stream_id, suffix_patterns(history), cfg.predictable)
        pick = choose_pick(history, lambda _patterns: table, cfg.predictable)
        log.info("Dự đoán %s shoe %d round %d history=%s%s\n%s", msg.key_id, msg.shoe, msg.round, source,
                 " (THIẾU round trước)" if missing else "", format_detail(pick))

        if self.delay_s:
            await asyncio.sleep(self.delay_s)
        result = PredictResult(
            schema_version=1, prediction_id=prediction_id(msg.game_session_id),
            game_session_id=msg.game_session_id, stream_id=msg.stream_id, key_id=msg.key_id,
            shoe=msg.shoe, round=msg.round, missing_previous=missing, model_version=MODEL_VERSION,
            created_at=datetime.now(timezone.utc).isoformat(), **pick,
        )
        await self.r.xadd(PREDICT_RESULT_STREAM, {"payload": result.model_dump_json()}, maxlen=STREAM_MAXLEN, approximate=True)


async def listen_rebuild(url: str, svc: AiService, stop: asyncio.Event) -> None:
    """Nghe ai:rebuild (Redis Pub/Sub). Đang dựng lại mà có tín hiệu thêm thì bỏ qua. Mất kết nối thì tự nghe lại."""
    tasks: set[asyncio.Task] = set()
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
                if svc.rebuilding:
                    log.info("Bỏ qua tín hiệu %s (%s): đang dựng lại", AI_REBUILD_CHANNEL, reason)
                    continue
                svc.rebuilding = True      # đặt ngay để tín hiệu kế tiếp (kể cả trong lúc chờ) bị bỏ qua
                task = asyncio.create_task(svc.rebuild_now(url, reason))
                tasks.add(task)
                task.add_done_callback(tasks.discard)
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
    sync_r = redis.from_url(url, decode_responses=True)
    try:
        await asyncio.to_thread(rebuild, sync_r, db, registry)
    finally:
        sync_r.close()

    svc = AiService(r, db, registry)
    log.info("AI service sẵn sàng (consumer=%s, model=%s)", consumer, MODEL_VERSION)
    await asyncio.gather(
        consume(r, AI_RESULT_STREAM, AI_COUNTER_GROUP, consumer, AiResult, svc.on_ai_result, stop),
        consume(r, PREDICT_REQUEST_STREAM, AI_PREDICTOR_GROUP, consumer, PredictRequest, svc.on_request, stop,
                concurrency=MAX_CONCURRENT_PREDICTIONS),
        listen_rebuild(url, svc, stop),
    )
    await r.aclose()
