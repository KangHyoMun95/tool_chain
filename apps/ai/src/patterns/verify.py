# src/patterns/verify.py
# So khớp ai:counts:{stream} trên Redis với cách đếm brute-force từ DB (PatternStats.add_sequence trên từng shoe).
# Chênh lệch nhỏ có thể bình thường: kết quả mới chưa kịp ghi DB (batch tới 3 giây) làm Redis nhỉnh hơn DB.
import itertools
import logging
import os
import sys

import redis
from sqlalchemy import text

from .contract import ai_counts_key
from .db import engine
from .pattern import PatternStats

log = logging.getLogger("pattern")

_QUERY = text("""
    SELECT stream_id, road_shoe, road_count, result FROM game_sessions
    WHERE status = 'FINISHED' AND result IN ('B', 'P') ORDER BY stream_id, road_shoe, road_count
""")


def expected_from_db() -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    with engine().connect().execution_options(stream_results=True) as conn:
        for stream_id, rows in itertools.groupby(conn.execute(_QUERY), key=lambda x: str(x.stream_id)):
            stats = PatternStats()
            for _, shoe_rows in itertools.groupby(rows, key=lambda x: x.road_shoe):
                stats.add_sequence("".join(r.result for r in shoe_rows))      # bỏ T, không nối qua shoe
            out[stream_id] = {f"{p}|{o}": n for p, c in stats.counts.items() for o, n in c.items()}
    return out


def main() -> int:
    r = redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    expected = expected_from_db()
    bad = 0
    for stream_id, exp in expected.items():
        got = {k: int(v) for k, v in r.hgetall(ai_counts_key(stream_id)).items()}
        diffs = [(k, exp.get(k, 0), got.get(k, 0)) for k in sorted(exp.keys() | got.keys()) if exp.get(k, 0) != got.get(k, 0)]
        if diffs:
            bad += 1
            log.warning("stream %s: %d pattern lệch (field, DB, Redis):", stream_id, len(diffs))
            for k, e, g in diffs[:20]:
                log.warning("  %-14s DB=%-6d Redis=%d", k, e, g)
    log.info("Đã kiểm %d stream, %d stream lệch", len(expected), bad)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
