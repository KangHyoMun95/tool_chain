# src/patterns/verify.py
# So khớp ai:counts:{stream} trên Redis với cách đếm brute-force từ DB (PatternStats.add_sequence trên từng shoe).
# Chênh lệch nhỏ có thể bình thường: kết quả mới chưa kịp ghi DB (batch tới 3 giây) làm Redis nhỉnh hơn DB.
import itertools
import logging
import os
import sys

import redis
from sqlalchemy import text

from .category_config import CategoryRegistry, load_registry
from .contract import ai_counts_key
from .db import engine
from .pattern import PatternStats

log = logging.getLogger("pattern")

_QUERY = text("""
    SELECT gs.stream_id, gs.road_shoe, gs.road_count, gs.result, l.lobby_name, c.category_name
    FROM game_sessions gs
    JOIN streams s ON s.stream_id = gs.stream_id
    JOIN categories c ON c.category_id = s.category_id
    JOIN lobbies l ON l.lobby_id = c.lobby_id
    WHERE gs.status = 'FINISHED' AND gs.result IS NOT NULL ORDER BY gs.stream_id, gs.road_shoe, gs.road_count
""")


def expected_from_db(registry: CategoryRegistry) -> dict[str, dict[str, int]]:
    out: dict[str, dict[str, int]] = {}
    with engine().connect().execution_options(stream_results=True) as conn:
        for stream_id, rows in itertools.groupby(conn.execute(_QUERY), key=lambda x: str(x.stream_id)):
            first = next(rows)
            cfg = registry.get(first.lobby_name, first.category_name)
            if cfg is None:
                log.error("Bỏ qua stream %s: category %r / %r không có file định nghĩa", stream_id, first.lobby_name, first.category_name)
                continue
            stats = PatternStats(cfg.predictable)
            for _, shoe_rows in itertools.groupby(itertools.chain([first], rows), key=lambda x: x.road_shoe):
                # bỏ ignore_in_pattern và ký hiệu ngoài results, không nối qua shoe
                stats.add_sequence("".join(r.result for r in shoe_rows if r.result in cfg.results and r.result not in cfg.ignore_in_pattern))
            out[stream_id] = {f"{p}|{o}": n for p, c in stats.counts.items() for o, n in c.items()}
    return out


def main(registry: CategoryRegistry | None = None) -> int:
    registry = registry or load_registry()
    r = redis.from_url(os.environ["REDIS_URL"], decode_responses=True)
    expected = expected_from_db(registry)
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
