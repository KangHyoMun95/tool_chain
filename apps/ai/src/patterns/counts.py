# src/patterns/counts.py
# Bảng đếm pattern trên Redis (AI sở hữu): ai:counts:{stream_id} (HASH "<pattern>|<ký hiệu predictable>" -> số lần)
# và ai:counted:{stream_id}:{shoe} (SET game_session_id đã đếm, TTL 48h) để cập nhật idempotent.
import itertools
import logging
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Sequence

import redis
import redis.asyncio as aioredis
from sqlalchemy import text

from .config import COUNTED_TTL_SECONDS, MAX_LEN, MIN_LEN, REBUILD_COUNTED_WINDOW_SECONDS, SHOE_WCOUNTS_TTL_SECONDS
from .category_config import CategoryRegistry
from .contract import AI_WSTATE_KEY, ai_counted_key, ai_counts_key, ai_shoe_wcounts_key, ai_wcounts_key
from .pattern import PatternStats

log = logging.getLogger("pattern")

# KEYS[1] = ai:counted:{stream}:{shoe}, KEYS[2] = ai:counts:{stream}, KEYS[3] = ai:wcounts:{stream}, KEYS[4] = ai:wcounts:{stream}:{shoe}, KEYS[5] = ai:wstate;
# ARGV = gsid, counted_ttl, result, ts (epoch giây của ván), shoe_wcounts_ttl, pattern...
# Một script: đánh dấu đã đếm + HINCRBY (+ HINCRBYFLOAT trọng số của bàn và của shoe). Trọng số = 2^((ts - t0) / half-life) với t0 / half-life ĐỌC TRONG
# SCRIPT từ ai:wstate (nên luôn khớp với bảng, kể cả khi rebuild vừa đổi bảng); half-life rỗng ⇒ không đếm trọng số.
# Trả {đã đếm (1/0), số mũ trọng số (chuỗi; "0" khi không đếm trọng số)}; số mũ chỉ để caller biết khi nào cần dựng lại.
_COUNT_LUA = """
if redis.call('SADD', KEYS[1], ARGV[1]) == 0 then return {0, '0'} end
redis.call('EXPIRE', KEYS[1], ARGV[2])
local w, expo = nil, 0
local st = redis.call('HMGET', KEYS[5], 't0', 'half_life_minutes')
if st[1] and st[2] and st[2] ~= '' then
  expo = (tonumber(ARGV[4]) - tonumber(st[1])) / (tonumber(st[2]) * 60)
  w = string.format('%.17g', 2 ^ math.min(expo, 1000))
end
for i = 6, #ARGV do
  local field = ARGV[i] .. '|' .. ARGV[3]
  redis.call('HINCRBY', KEYS[2], field, 1)
  if w then
    redis.call('HINCRBYFLOAT', KEYS[3], field, w)
    redis.call('HINCRBYFLOAT', KEYS[4], field, w)
  end
end
if w then redis.call('EXPIRE', KEYS[4], ARGV[5]) end
return {1, tostring(expo)}
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


class Snapshot:
    """Một lần đọc NHẤT QUÁN (một MULTI/EXEC) của các bảng đếm + trạng thái trọng số, nên t0 luôn khớp với bảng dù rebuild đổi bảng giữa chừng."""

    def __init__(self, raw, table_w, shoe_w, t0: float | None, half_life_minutes: int | None):
        self.raw, self.table_w, self.shoe_w = raw, table_w, shoe_w
        self.t0, self.half_life_minutes = t0, half_life_minutes


class RedisCounts:
    def __init__(self, r: aioredis.Redis):
        self.r = r
        self._count = r.register_script(_COUNT_LUA)

    async def snapshot(self, stream_id: str, shoe: int, patterns: list[str], predictable: Sequence[str]) -> Snapshot:
        """Số lần thật (ai:counts), số có trọng số của bàn và của shoe, cùng (t0, half-life) đang dùng; chưa có -> 0. Trọng số rỗng khi tắt."""
        fields = [f"{p}|{o}" for p in patterns for o in predictable]
        pipe = self.r.pipeline(transaction=True)
        pipe.hgetall(AI_WSTATE_KEY)
        if fields:
            pipe.hmget(ai_counts_key(stream_id), fields)
            pipe.hmget(ai_wcounts_key(stream_id), fields)
            pipe.hmget(ai_shoe_wcounts_key(stream_id, shoe), fields)
        out = await pipe.execute()
        state = out[0]
        t0 = float(state["t0"]) if state.get("t0") else None
        half_life = int(state["half_life_minutes"]) if state.get("half_life_minutes") else None
        if not fields:
            return Snapshot({}, {}, {}, t0, half_life)
        n = len(predictable)
        shape = lambda vals, cast: {p: {o: cast(vals[n * i + j] or 0) for j, o in enumerate(predictable)} for i, p in enumerate(patterns)}
        return Snapshot(shape(out[1], int), shape(out[2], float), shape(out[3], float), t0, half_life)

    async def add_result(self, stream_id: str, shoe: int, game_session_id: str, before: str, result: str, predictable: Sequence[str],
                         ts: float) -> tuple[bool, float]:
        """Đếm kết quả `result` với các đuôi k = 3..10 của `before` (chuỗi liền mạch đã bỏ ignore_in_pattern ngay trước, cùng shoe).

        result ngoài `predictable` thì không đếm (và không đánh dấu). ts = thời điểm ván ra kết quả (epoch giây).
        Trả (đã đếm, số mũ trọng số): False nếu ván này đã đếm rồi; số mũ để caller dựng lại khi vượt MAX_WEIGHT_EXPONENT.
        """
        if result not in predictable:
            return False, 0.0
        before = before[-MAX_LEN:]
        patterns = [before[-n:] for n in range(MIN_LEN, len(before) + 1)]
        done, expo = await self._count(
            keys=[ai_counted_key(stream_id, shoe), ai_counts_key(stream_id), ai_wcounts_key(stream_id), ai_shoe_wcounts_key(stream_id, shoe), AI_WSTATE_KEY],
            args=[game_session_id, COUNTED_TTL_SECONDS, result, repr(float(ts)), SHOE_WCOUNTS_TTL_SECONDS, *patterns],
        )
        return bool(int(done)), float(expo)


def rebuild(r: redis.Redis, engine, registry: CategoryRegistry, half_life_minutes: int | None) -> dict:
    """Dựng lại bảng đếm từ DB (chỉ đọc) vào Redis, NGUYÊN TỬ. Chạy lúc khởi động (trước khi consume) và khi AI_HALF_LIFE đổi / số mũ trọng số vượt ngưỡng.

    Mọi bảng của MỌI stream (ai:counts, ai:wcounts, ai:wcounts:{stream}:{shoe} của shoe hiện tại, ai:counted) được dựng vào key tạm `ai:tmp:{run}:...`
    với MỘT t0 mới (= lúc bắt đầu); xong hết mới đổi tất cả key + ai:wstate (t0, half-life) trong một MULTI/EXEC. Lỗi giữa chừng ⇒ xóa key tạm,
    bảng và t0 cũ giữ nguyên, ném lại lỗi (caller log ERROR và thử lại).
    - Thời điểm của ván = COALESCE(ended_at, created_at): ended_at là lúc ingestion ghi result (gần nhất với `received_at` mà đường realtime dùng).
    - half_life_minutes = None (tắt) ⇒ xóa mọi ai:wcounts*, ai:wstate không có half-life.
    - ai:wcounts:{stream}:{shoe}: chỉ shoe hiện tại (có ván mới nhất) của mỗi stream, nếu ván đó nằm trong SHOE_WCOUNTS_TTL_SECONDS gần nhất.
    - Stream của category không có cấu hình bị bỏ qua (log ERROR); ván có result ngoài `results` của category cũng bị bỏ (log WARN).
    - ai:counted:{stream}:{shoe}: chỉ tạo cho shoe có ván trong REBUILD_COUNTED_WINDOW_SECONDS gần nhất.
    """
    since = datetime.now(timezone.utc) - timedelta(seconds=REBUILD_COUNTED_WINDOW_SECONDS)
    totals = {"streams": 0, "results": 0, "patterns": 0, "counted_sets": 0, "skipped_streams": 0, "bad_results": 0}
    run = uuid.uuid4().hex
    tmp_prefix = f"ai:tmp:{run}:"
    built: list[tuple[str, str]] = []        # (key tạm, key thật) sẽ RENAME
    empty: list[str] = []                    # key thật cần xóa (stream chưa có số đếm nào)
    for stale in r.scan_iter(match="ai:tmp:*", count=500):    # còn sót của lần dựng lại bị ngắt giữa chừng (process chết)
        r.delete(stale)
    t0 = time.time()
    shoe_since = t0 - SHOE_WCOUNTS_TTL_SECONDS

    def stage(real: str, mapping: dict, ttl: int | None = None) -> None:
        """Ghi `mapping` (HASH) vào key tạm của `real` (rỗng ⇒ ghi nhận cần xóa key thật)."""
        if not mapping:
            empty.append(real)
            return
        tmp = tmp_prefix + real
        pipe = r.pipeline()
        items = list(mapping.items())
        for i in range(0, len(items), 5000):
            pipe.hset(tmp, mapping=dict(items[i:i + 5000]))
        if ttl:
            pipe.expire(tmp, ttl)
        pipe.execute()
        built.append((tmp, real))

    try:
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

                stage(ai_counts_key(stream_id), {f"{p}|{o}": n for p, c in stats.counts.items() for o, n in c.items()})
                if half_life_minutes is not None:
                    stage(ai_wcounts_key(stream_id), {f"{p}|{o}": n for p, c in stats.wcounts.items() for o, n in c.items()})
                    if current is not None and current[0] >= shoe_since:
                        stage(ai_shoe_wcounts_key(stream_id, current[1]), {f"{p}|{o}": n for p, c in current[2].items() for o, n in c.items()},
                              SHOE_WCOUNTS_TTL_SECONDS)
                totals["streams"] += 1
                totals["patterns"] += len(stats.counts)
                for shoe, info in shoes.items():
                    if info["gsids"] and info["latest"] is not None and info["latest"] >= since:
                        tmp = tmp_prefix + ai_counted_key(stream_id, shoe)
                        pipe = r.pipeline()
                        for i in range(0, len(info["gsids"]), 1000):
                            pipe.sadd(tmp, *info["gsids"][i:i + 1000])
                        pipe.expire(tmp, COUNTED_TTL_SECONDS)
                        pipe.execute()
                        built.append((tmp, ai_counted_key(stream_id, shoe)))
                        totals["counted_sets"] += 1

        # Đổi TẤT CẢ trong một MULTI/EXEC: xóa mọi bảng có trọng số cũ (mốc t0 cũ), đặt bảng mới, đổi ai:wstate. Không ai thấy trạng thái nửa vời.
        old_weighted = [k for k in r.scan_iter(match="ai:wcounts:*", count=500)]
        pipe = r.pipeline(transaction=True)
        for k in old_weighted:
            pipe.delete(k)
        for real in empty:
            pipe.delete(real)
        for tmp, real in built:
            pipe.rename(tmp, real)
        pipe.hset(AI_WSTATE_KEY, mapping={"t0": repr(t0), "half_life_minutes": str(half_life_minutes) if half_life_minutes else ""})
        pipe.execute()
    except BaseException:
        leftovers = [tmp for tmp, _ in built] + list(r.scan_iter(match=tmp_prefix + "*", count=500))
        if leftovers:
            r.delete(*set(leftovers))
        raise
    totals["t0"] = t0
    log.info("Dựng lại bảng đếm: %(streams)d stream (bỏ qua %(skipped_streams)d do thiếu cấu hình), %(results)d kết quả (%(bad_results)d ngoài results), %(patterns)d pattern, %(counted_sets)d tập counted", totals)
    return totals
