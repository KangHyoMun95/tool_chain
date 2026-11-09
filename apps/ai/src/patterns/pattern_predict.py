# src/patterns/pattern_predict.py
# Chạy một lần (không cần Redis): đọc DB, in dự đoán pattern-v1 cho ván kế tiếp của từng stream đang hoạt động.
import json
import logging
from datetime import datetime, timezone

from .config import IGNORE, MAX_GAP, MAX_LEN, MIN_LEN
from .dataset import add_segments, load_sessions
from .pattern import PatternStats, choose_pick, format_detail

log = logging.getLogger("pattern")


def load_all(refresh: bool = True, source: str = "db"):
    """Mọi ván FINISHED (kể cả T) đã gán `segment` (một segment = một shoe của một stream)."""
    return add_segments(load_sessions(refresh=refresh, source=source))


def load_clean(refresh: bool = True, source: str = "db"):
    df = load_all(refresh=refresh, source=source)           # tách đoạn TRƯỚC khi bỏ T
    df = df[~df["result"].isin(IGNORE)]
    assert df["result"].str.len().eq(1).all(), "result phải là 1 ký tự (B/P...)"
    return df


def build_stats(df) -> dict[str, PatternStats]:
    """Bảng đếm RIÊNG từng stream (gộp mọi shoe của stream đó, không nối qua ranh giới shoe)."""
    stats: dict[str, PatternStats] = {}
    for (sid, _), seg in df.groupby(["stream_id", "segment"], sort=False):
        stats.setdefault(str(sid), PatternStats()).add_sequence("".join(seg["result"]))
    return stats


def main(source: str = "db") -> None:
    df = load_clean(refresh=source == "file", source=source)
    stats = build_stats(df)
    log.info("%d stream, %d kết quả B/P", len(stats), len(df))

    now = datetime.now(timezone.utc)
    for sid, sdf in df.groupby("stream_id"):
        last_seg = sdf[sdf["segment"] == sdf["segment"].iloc[-1]]
        last_at = last_seg["created_at"].iloc[-1]
        if now - last_at > MAX_GAP:
            log.info("stream %s: ngưng từ %s, bỏ qua", sid, last_at)
            continue
        recent = "".join(last_seg["result"].tail(MAX_LEN))
        if len(recent) < MIN_LEN:
            continue
        pick = choose_pick(recent, stats[str(sid)].lookup)
        log.info("stream %s\n%s", sid, format_detail(pick))
        log.info("json %s", json.dumps({"stream_id": str(sid), "generated_at": now.isoformat(), **pick}, ensure_ascii=False))
