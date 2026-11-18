# src/patterns/pattern_predict.py
# Chạy một lần (không cần Redis): đọc DB, in dự đoán pattern-v1 cho ván kế tiếp của từng stream đang hoạt động.
import json
import logging
import pandas as pd
from datetime import datetime, timezone

from .category_config import CategoryConfig, CategoryRegistry
from .config import MAX_GAP, MAX_LEN, MIN_LEN
from .dataset import add_segments, load_sessions
from .pattern import PatternStats, choose_pick, format_detail

log = logging.getLogger("pattern")


def load_all(refresh: bool = True, source: str = "db"):
    """Mọi ván FINISHED (kể cả T) đã gán `segment` (một segment = một shoe của một stream)."""
    return add_segments(load_sessions(refresh=refresh, source=source))


def config_of(registry: CategoryRegistry, sdf) -> CategoryConfig | None:
    return registry.get(str(sdf["lobby_name"].iloc[0]), str(sdf["category_name"].iloc[0]))


def load_clean(registry: CategoryRegistry, refresh: bool = True, source: str = "db"):
    """Mọi ván FINISHED của stream có cấu hình category, đã bỏ ký hiệu `ignore_in_pattern` (tách đoạn TRƯỚC khi bỏ)."""
    df = load_all(refresh=refresh, source=source)
    keep = []
    for sid, sdf in df.groupby("stream_id", sort=False):
        cfg = config_of(registry, sdf)
        if cfg is None:
            log.error("Bỏ qua stream %s: category %r / %r không có file định nghĩa trong config/categories",
                      sid, sdf["lobby_name"].iloc[0], sdf["category_name"].iloc[0])
            continue
        keep.append(sdf[sdf["result"].isin(cfg.results) & ~sdf["result"].isin(cfg.ignore_in_pattern)])
    return pd.concat(keep) if keep else df.iloc[0:0]


def build_stats(df, registry: CategoryRegistry) -> dict[str, PatternStats]:
    """Bảng đếm RIÊNG từng stream (gộp mọi shoe của stream đó, không nối qua ranh giới shoe)."""
    stats: dict[str, PatternStats] = {}
    for (sid, _), seg in df.groupby(["stream_id", "segment"], sort=False):
        cfg = config_of(registry, seg)
        stats.setdefault(str(sid), PatternStats(cfg.predictable)).add_sequence("".join(seg["result"]))
    return stats


def main(registry: CategoryRegistry, source: str = "db") -> None:
    df = load_clean(registry, refresh=source == "file", source=source)
    stats = build_stats(df, registry)
    log.info("%d stream, %d kết quả (đã bỏ ignore_in_pattern)", len(stats), len(df))

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
        pick = choose_pick(recent, stats[str(sid)].lookup, config_of(registry, sdf).predictable)
        log.info("stream %s\n%s", sid, format_detail(pick))
        log.info("json %s", json.dumps({"stream_id": str(sid), "generated_at": now.isoformat(), **pick}, ensure_ascii=False))
