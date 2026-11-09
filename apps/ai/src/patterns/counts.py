# src/patterns/counts.py
# Bảng đếm pattern trên Redis (AI sở hữu): ai:counts:{stream_id} (HASH "<pattern>|<B/P>" -> số lần)
# và ai:counted:{stream_id}:{shoe} (SET game_session_id đã đếm, TTL 48h) để cập nhật idempotent.
import itertools
import logging
from datetime import datetime, timedelta, timezone

import redis
import redis.asyncio as aioredis
from sqlalchemy import text

from .config import COUNTED_TTL_SECONDS, MAX_LEN, MIN_LEN, REBUILD_COUNTED_WINDOW_SECONDS
from .contract import ai_counted_key, ai_counts_key
from .pattern import PatternStats

log = logging.getLogger("pattern")

# KEYS[1] = ai:counted:{stream}:{shoe}, KEYS[2] = ai:counts:{stream}; ARGV = gsid, counted_ttl, result, pattern...
# Đánh dấu đã đếm + HINCRBY trong một script: trả 0 (và không đếm) nếu ván đã được đếm.
_COUNT_LUA = """
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('EXPIRE', KEYS[1], ARGV[2])
for i = 4, #ARGV do
  redis.call('HINCRBY', KEYS[2], ARGV[i] .. '|' .. ARGV[3], 1)
end
return 1
"""

_REBUILD_QUERY = text("""
    SELECT game_session_id, stream_id, road_shoe, road_count, created_at, result
    FROM game_sessions
    WHERE status = 'FINISHED' AND result IN ('B', 'P', 'T')
    ORDER BY stream_id, road_shoe, road_count
""")


class RedisCounts:
    def __init__(self, r: aioredis.Redis):
        self.r = r
        self._count = r.register_script(_COUNT_LUA)

    async def lookup(self, stream_id: str, patterns: list[str]) -> dict[str, tuple[int, int]]:
        """Một HMGET cho mọi pattern. Pattern chưa có -> (0, 0)."""
        if not patterns:
            return {}
        fields = [f"{p}|{o}" for p in patterns for o in ("B", "P")]
        vals = await self.r.hmget(ai_counts_key(stream_id), fields)
        return {p: (int(vals[2 * i] or 0), int(vals[2 * i + 1] or 0)) for i, p in enumerate(patterns)}

    async def add_result(self, stream_id: str, shoe: int, game_session_id: str, before: str, result: str) -> bool:
        """Đếm kết quả `result` với các đuôi k = 3..10 của `before` (B/P liền mạch ngay trước, cùng shoe).

        result = T thì không đếm (và không đánh dấu). Trả True nếu đã đếm, False nếu ván này đã đếm rồi.
        """
        if result not in ("B", "P"):
            return False
        before = before[-MAX_LEN:]
        patterns = [before[-n:] for n in range(MIN_LEN, len(before) + 1)]
        done = await self._count(
            keys=[ai_counted_key(stream_id, shoe), ai_counts_key(stream_id)],
            args=[game_session_id, COUNTED_TTL_SECONDS, result, *patterns],
        )
        return bool(done)


def rebuild(r: redis.Redis, engine) -> dict:
    """Dựng lại bảng đếm từ DB (chỉ đọc) vào Redis. Chạy lúc khởi động, TRƯỚC khi consume.

    - ai:counts:{stream}: đếm bằng PatternStats.add_result (cùng quy tắc với script Lua) vào key tạm rồi RENAME đè.
    - ai:counted:{stream}:{shoe}: chỉ tạo cho shoe có ván trong REBUILD_COUNTED_WINDOW_SECONDS gần nhất.
    """
    since = datetime.now(timezone.utc) - timedelta(seconds=REBUILD_COUNTED_WINDOW_SECONDS)
    totals = {"streams": 0, "results": 0, "patterns": 0, "counted_sets": 0}

    with engine.connect().execution_options(stream_results=True) as conn:
        rows = conn.execute(_REBUILD_QUERY)
        for stream_id, stream_rows in itertools.groupby(rows, key=lambda x: str(x.stream_id)):
            stats = PatternStats()
            shoes: dict[int, dict] = {}
            for shoe, shoe_rows in itertools.groupby(stream_rows, key=lambda x: x.road_shoe):
                info = shoes[shoe] = {"gsids": [], "latest": None}
                before = ""
                for row in shoe_rows:
                    totals["results"] += 1
                    info["latest"] = max(filter(None, [info["latest"], row.created_at]), default=None)
                    if row.result == "T":
                        continue
                    stats.add_result(before, row.result)
                    info["gsids"].append(str(row.game_session_id))
                    before = (before + row.result)[-MAX_LEN:]

            _write_counts(r, stream_id, stats)
            totals["streams"] += 1
            totals["patterns"] += len(stats.counts)
            for shoe, info in shoes.items():
                if info["gsids"] and info["latest"] is not None and info["latest"] >= since:
                    key = ai_counted_key(stream_id, shoe)
                    pipe = r.pipeline()
                    pipe.delete(key)
                    for i in range(0, len(info["gsids"]), 1000):
                        pipe.sadd(key, *info["gsids"][i:i + 1000])
                    pipe.expire(key, COUNTED_TTL_SECONDS)
                    pipe.execute()
                    totals["counted_sets"] += 1
    log.info("Dựng lại bảng đếm: %(streams)d stream, %(results)d kết quả, %(patterns)d pattern, %(counted_sets)d tập counted", totals)
    return totals


def _write_counts(r: redis.Redis, stream_id: str, stats: PatternStats) -> None:
    real, tmp = ai_counts_key(stream_id), f"ai:counts:tmp:{stream_id}"
    mapping = {f"{p}|{o}": n for p, c in stats.counts.items() for o, n in c.items()}
    pipe = r.pipeline()
    pipe.delete(tmp)
    if mapping:
        items = list(mapping.items())
        for i in range(0, len(items), 5000):
            pipe.hset(tmp, mapping=dict(items[i:i + 5000]))
        pipe.rename(tmp, real)
    else:
        pipe.delete(real)
    pipe.execute()
