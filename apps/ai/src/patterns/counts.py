# src/patterns/counts.py
# Bảng đếm pattern trên Redis (AI sở hữu): ai:counts:{stream_id} (HASH "<pattern>|<ký hiệu predictable>" -> số lần)
# và ai:counted:{stream_id}:{shoe} (SET game_session_id đã đếm, TTL 48h) để cập nhật idempotent.
import itertools
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Sequence

import redis
import redis.asyncio as aioredis
from sqlalchemy import text

from .config import COUNTED_TTL_SECONDS, MAX_LEN, MIN_LEN, REBUILD_COUNTED_WINDOW_SECONDS, SHOE_WCOUNTS_TTL_SECONDS
from .category_config import CategoryRegistry
from .contract import ai_counted_key, ai_counts_key, ai_shoe_wcounts_key, ai_wcounts_key
from .pattern import PatternStats

log = logging.getLogger("pattern")

# KEYS[1] = ai:counted:{stream}:{shoe}, KEYS[2] = ai:counts:{stream}, KEYS[3] = ai:wcounts:{stream}, KEYS[4] = ai:wcounts:{stream}:{shoe};
# ARGV = gsid, counted_ttl, result, weight ('' = không đếm có trọng số), shoe_wcounts_ttl, pattern...
# Đánh dấu đã đếm + HINCRBY (+ HINCRBYFLOAT trọng số của cả bàn và của shoe) trong một script: trả 0 (và không đếm) nếu ván đã được đếm.
_COUNT_LUA = """
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return 0 end
redis.call('EXPIRE', KEYS[1], ARGV[2])
for i = 6, #ARGV do
  local field = ARGV[i] .. '|' .. ARGV[3]
  redis.call('HINCRBY', KEYS[2], field, 1)
  if ARGV[4] ~= '' then
    redis.call('HINCRBYFLOAT', KEYS[3], field, ARGV[4])
    redis.call('HINCRBYFLOAT', KEYS[4], field, ARGV[4])
  end
end
if ARGV[4] ~= '' then redis.call('EXPIRE', KEYS[4], ARGV[5]) end
return 1
"""

# Kèm tên lobby / category để tra cấu hình (ignore_in_pattern / predictable); ký hiệu ngoài results của category bị bỏ ở rebuild().
_REBUILD_QUERY = text("""
    SELECT gs.game_session_id, gs.stream_id, gs.road_shoe, gs.road_count, COALESCE(gs.ended_at, gs.created_at) AS happened_at, gs.result, l.lobby_name, c.category_name
    FROM game_sessions gs
    JOIN streams s ON s.stream_id = gs.stream_id
    JOIN categories c ON c.category_id = s.category_id
    JOIN lobbies l ON l.lobby_id = c.lobby_id
    WHERE gs.status = 'FINISHED' AND gs.result IS NOT NULL
    ORDER BY gs.stream_id, gs.road_shoe, gs.road_count
""")


class RedisCounts:
    def __init__(self, r: aioredis.Redis):
        self.r = r
        self._count = r.register_script(_COUNT_LUA)

    async def lookup(self, stream_id: str, patterns: list[str], predictable: Sequence[str]) -> dict[str, dict[str, int]]:
        """Một HMGET cho mọi (pattern, ký hiệu predictable). Chưa có -> 0."""
        if not patterns:
            return {}
        fields = [f"{p}|{o}" for p in patterns for o in predictable]
        vals = await self.r.hmget(ai_counts_key(stream_id), fields)
        n = len(predictable)
        return {p: {o: int(vals[n * i + j] or 0) for j, o in enumerate(predictable)} for i, p in enumerate(patterns)}

    async def wlookup(self, stream_id: str, shoe: int, patterns: list[str], predictable: Sequence[str]) -> tuple[dict, dict]:
        """(bàn, shoe hiện tại): số đếm có trọng số (ai:wcounts, ai:wcounts:{stream}:{shoe}) cho từng (pattern, ký hiệu predictable), chưa có -> 0.
        Chưa chuẩn hóa / chưa nhân hệ số shoe: pattern.combine_weighted làm việc đó."""
        if not patterns:
            return {}, {}
        fields = [f"{p}|{o}" for p in patterns for o in predictable]
        pipe = self.r.pipeline()
        pipe.hmget(ai_wcounts_key(stream_id), fields)
        pipe.hmget(ai_shoe_wcounts_key(stream_id, shoe), fields)
        table_vals, shoe_vals = await pipe.execute()
        n = len(predictable)
        shape = lambda vals: {p: {o: float(vals[n * i + j] or 0) for j, o in enumerate(predictable)} for i, p in enumerate(patterns)}
        return shape(table_vals), shape(shoe_vals)

    async def add_result(self, stream_id: str, shoe: int, game_session_id: str, before: str, result: str, predictable: Sequence[str],
                         weight: float | None = None) -> bool:
        """Đếm kết quả `result` với các đuôi k = 3..10 của `before` (chuỗi liền mạch đã bỏ ignore_in_pattern ngay trước, cùng shoe).

        result ngoài `predictable` thì không đếm (và không đánh dấu). Trả True nếu đã đếm, False nếu ván này đã đếm rồi.
        weight: trọng số theo độ mới của ván (recency_weight); None = không cập nhật ai:wcounts.
        """
        if result not in predictable:
            return False
        before = before[-MAX_LEN:]
        patterns = [before[-n:] for n in range(MIN_LEN, len(before) + 1)]
        done = await self._count(
            keys=[ai_counted_key(stream_id, shoe), ai_counts_key(stream_id), ai_wcounts_key(stream_id), ai_shoe_wcounts_key(stream_id, shoe)],
            args=[game_session_id, COUNTED_TTL_SECONDS, result, "" if weight is None else repr(float(weight)), SHOE_WCOUNTS_TTL_SECONDS, *patterns],
        )
        return bool(done)


def rebuild(r: redis.Redis, engine, registry: CategoryRegistry, half_life_minutes: int | None) -> dict:
    """Dựng lại bảng đếm từ DB (chỉ đọc) vào Redis. Chạy lúc khởi động (trước khi consume) và khi AI_HALF_LIFE đổi / số mũ trọng số vượt ngưỡng.

    - ai:counts:{stream}: đếm bằng PatternStats.add_result (cùng quy tắc với script Lua) vào key tạm rồi RENAME đè.
    - ai:wcounts:{stream}: cùng quy tắc nhưng cộng trọng số theo độ mới, mốc t0 = lúc bắt đầu dựng lại (trả về trong kết quả; ván cũ < 1).
      half_life_minutes = None (tắt) ⇒ xóa ai:wcounts.
    - ai:wcounts:{stream}:{shoe}: chỉ cho shoe hiện tại (shoe có ván mới nhất) của mỗi stream, nếu ván đó nằm trong SHOE_WCOUNTS_TTL_SECONDS gần nhất.
    - Thời điểm của ván = COALESCE(ended_at, created_at): ended_at là lúc ingestion ghi result (gần nhất với `received_at` mà đường realtime dùng).
    - Stream của category không có cấu hình bị bỏ qua (log ERROR); ván có result ngoài `results` của category cũng bị bỏ (log WARN).
    - ai:counted:{stream}:{shoe}: chỉ tạo cho shoe có ván trong REBUILD_COUNTED_WINDOW_SECONDS gần nhất.
    """
    since = datetime.now(timezone.utc) - timedelta(seconds=REBUILD_COUNTED_WINDOW_SECONDS)
    totals = {"streams": 0, "results": 0, "patterns": 0, "counted_sets": 0, "skipped_streams": 0, "bad_results": 0}
    t0 = time.time()
    shoe_since = t0 - SHOE_WCOUNTS_TTL_SECONDS

    with engine.connect().execution_options(stream_results=True) as conn:
        rows = conn.execute(_REBUILD_QUERY)
        for stream_id, stream_rows in itertools.groupby(rows, key=lambda x: str(x.stream_id)):
            first = next(stream_rows)
            cfg = registry.get(first.lobby_name, first.category_name)
            if cfg is None:
                log.error("Bỏ qua stream %s khi dựng lại bảng đếm: category %r / %r không có file định nghĩa trong config/categories",
                          stream_id, first.lobby_name, first.category_name)
                totals["skipped_streams"] += 1
                continue
            stats = PatternStats(cfg.predictable, half_life_minutes=half_life_minutes, t0=t0)
            shoes: dict[int, dict] = {}
            current: tuple[float, int, dict] | None = None      # (thời điểm ván mới nhất, shoe, bảng có trọng số của shoe đó)
            for shoe, shoe_rows in itertools.groupby(itertools.chain([first], stream_rows), key=lambda x: x.road_shoe):
                info = shoes[shoe] = {"gsids": [], "latest": None}
                stats.begin_shoe()
                before = ""
                for row in shoe_rows:
                    totals["results"] += 1
                    info["latest"] = max(filter(None, [info["latest"], row.happened_at]), default=None)
                    if row.result not in cfg.results:
                        totals["bad_results"] += 1
                        log.warning("Bỏ qua ván %s: result %r không thuộc results của category %s", row.game_session_id, row.result, cfg.key)
                        continue
                    if row.result in cfg.ignore_in_pattern:
                        continue
                    stats.add_result(before, row.result, row.happened_at.timestamp() if row.happened_at else None)
                    if row.result in cfg.predictable:      # chỉ ván được đếm mới vào tập counted (khớp script Lua)
                        info["gsids"].append(str(row.game_session_id))
                    before = (before + row.result)[-MAX_LEN:]
                if info["latest"] is not None and (current is None or info["latest"].timestamp() > current[0]):
                    current = (info["latest"].timestamp(), shoe, {p: dict(c) for p, c in stats.shoe_wcounts.items()})

            _write_counts(r, stream_id, stats, half_life_minutes is not None)
            for old in r.scan_iter(match=f"ai:wcounts:{stream_id}:*", count=500):   # bảng shoe của mốc t0 cũ không còn dùng được
                r.delete(old)
            if half_life_minutes is not None and current is not None and current[0] >= shoe_since:
                _write_shoe_counts(r, stream_id, current[1], current[2])
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
    totals["t0"] = t0
    log.info("Dựng lại bảng đếm: %(streams)d stream (bỏ qua %(skipped_streams)d do thiếu cấu hình), %(results)d kết quả (%(bad_results)d ngoài results), %(patterns)d pattern, %(counted_sets)d tập counted", totals)
    return totals


def _write_counts(r: redis.Redis, stream_id: str, stats: PatternStats, weighted: bool) -> None:
    pipe = r.pipeline()
    _replace_hash(pipe, ai_counts_key(stream_id), f"ai:counts:tmp:{stream_id}", {f"{p}|{o}": n for p, c in stats.counts.items() for o, n in c.items()})
    mapping = {f"{p}|{o}": n for p, c in stats.wcounts.items() for o, n in c.items()} if weighted else {}
    _replace_hash(pipe, ai_wcounts_key(stream_id), f"ai:wcounts:tmp:{stream_id}", mapping)
    pipe.execute()


def _write_shoe_counts(r: redis.Redis, stream_id: str, shoe: int, table: dict[str, dict[str, float]]) -> None:
    pipe = r.pipeline()
    _replace_hash(pipe, ai_shoe_wcounts_key(stream_id, shoe), f"ai:wcounts:tmp:{stream_id}:{shoe}", {f"{p}|{o}": n for p, c in table.items() for o, n in c.items()})
    pipe.expire(ai_shoe_wcounts_key(stream_id, shoe), SHOE_WCOUNTS_TTL_SECONDS)
    pipe.execute()


def _replace_hash(pipe, real: str, tmp: str, mapping: dict) -> None:
    pipe.delete(tmp)
    if mapping:
        items = list(mapping.items())
        for i in range(0, len(items), 5000):
            pipe.hset(tmp, mapping=dict(items[i:i + 5000]))
        pipe.rename(tmp, real)
    else:
        pipe.delete(real)
