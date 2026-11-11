# src/patterns/service.py
# Hai consumer chạy song song trong một process:
#   ai:results       -> cập nhật bảng đếm pattern của stream
#   predict:requests -> tính dự đoán pattern-v1 -> predict:results
# AI KHÔNG ghi bảng nghiệp vụ nào trong DB: chỉ đọc DB (dựng lại bảng đếm) và ghi Redis của riêng nó + predict:results.
import asyncio
import logging
import os
import signal
import socket
from datetime import datetime, timezone

import redis
import redis.asyncio as aioredis

from sqlalchemy import Engine, text

from .config import HISTORY_DB_WINDOW_HOURS, MAX_CONCURRENT_PREDICTIONS, MISSING_PREVIOUS_DELAY_S, MISSING_PREVIOUS_RETRIES
from .contract import (
    AI_COUNTER_GROUP, AI_PREDICTOR_GROUP, AI_RESULT_STREAM, MODEL_VERSION, PREDICT_REQUEST_STREAM,
    PREDICT_RESULT_STREAM, STREAM_MAXLEN, AiResult, PredictRequest, PredictResult, prediction_id,
    recent_key, round_status_key,
)
from .counts import RedisCounts, rebuild
from .db import engine
from .pattern import choose_pick, format_detail, history_before, suffix_patterns
from .redis_io import consume, ensure_group

log = logging.getLogger("pattern")
LATE_STATUSES = {"DONE", "GET_RESULT", "SUMMARY_RESULT"}   # quá hạn dự đoán

# Bù history khi HASH recent thiếu round (Redis restart / mất key): chỉ ĐỌC, đúng (stream_id, road_shoe), round < round hiện tại.
_HISTORY_QUERY = text("""
    SELECT road_count, result FROM game_sessions
    WHERE stream_id = CAST(:stream_id AS uuid) AND road_shoe = :shoe AND road_count < :round
      AND result IS NOT NULL AND created_at > now() - make_interval(hours => :hours)
""")


class AiService:
    def __init__(self, r: aioredis.Redis, db: Engine):
        self.r = r
        self.db = db
        self.counts = RedisCounts(r)
        self.delay_s = int(os.environ.get("AI_ARTIFICIAL_DELAY_MS", "0")) / 1000   # giả lập AI chậm để thử hạn chót

    async def _recent(self, stream_id: str, shoe: int) -> dict[int, str]:
        raw = await self.r.hgetall(recent_key(stream_id, shoe))
        return {int(k): v for k, v in raw.items() if k.isdigit()}

    def _db_history(self, stream_id: str, shoe: int, round_: int) -> dict[int, str]:
        with self.db.connect() as c:
            rows = c.execute(_HISTORY_QUERY, {"stream_id": stream_id, "shoe": shoe, "round": round_, "hours": HISTORY_DB_WINDOW_HOURS})
            return {int(r.road_count): str(r.result) for r in rows}

    async def _history(self, msg: PredictRequest) -> tuple[str, bool, str]:
        """(history, missing_previous, nguồn). Giữ vòng chờ round - 1; HASH vẫn thiếu round nào trong 1..round-1 ⇒ bù từ DB."""
        recent: dict[int, str] = {}
        for attempt in range(MISSING_PREVIOUS_RETRIES + 1):
            recent = await self._recent(msg.stream_id, msg.shoe)
            _, missing = history_before(recent, msg.round)
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
        history, missing = history_before(recent, msg.round)
        return history, missing, source

    async def on_ai_result(self, msg: AiResult) -> None:
        before, missing = history_before(await self._recent(msg.stream_id, msg.shoe), msg.round)
        if missing:
            log.warning("ai:results thiếu round %d của stream %s shoe %d khi đếm round %d (bản dựng lại lúc khởi động sẽ sửa)",
                        msg.round - 1, msg.stream_id, msg.shoe, msg.round)
        counted = await self.counts.add_result(msg.stream_id, msg.shoe, msg.game_session_id, before, msg.result)
        log.debug("đếm %s shoe %d round %d result=%s: %s", msg.stream_id, msg.shoe, msg.round, msg.result, "mới" if counted else "đã đếm / T")

    async def on_request(self, msg: PredictRequest) -> None:
        status = await self.r.get(round_status_key(msg.game_session_id))
        if status in LATE_STATUSES:
            log.info("Bỏ qua yêu cầu %s shoe %d round %d: ván đã %s", msg.key_id, msg.shoe, msg.round, status)
            return

        history, missing, source = await self._history(msg)
        table = await self.counts.lookup(msg.stream_id, suffix_patterns(history))
        pick = choose_pick(history, lambda _patterns: table)
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


async def run() -> None:
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
        await asyncio.to_thread(rebuild, sync_r, db)
    finally:
        sync_r.close()

    svc = AiService(r, db)
    log.info("AI service sẵn sàng (consumer=%s, model=%s)", consumer, MODEL_VERSION)
    await asyncio.gather(
        consume(r, AI_RESULT_STREAM, AI_COUNTER_GROUP, consumer, AiResult, svc.on_ai_result, stop),
        consume(r, PREDICT_REQUEST_STREAM, AI_PREDICTOR_GROUP, consumer, PredictRequest, svc.on_request, stop,
                concurrency=MAX_CONCURRENT_PREDICTIONS),
    )
    await r.aclose()
