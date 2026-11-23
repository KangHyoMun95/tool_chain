# src/patterns/job_config.py
# Cấu hình chạy của AI đọc từ bảng job_configs (Flyway V4: type, value, unit, updated_at), đọc lại mỗi CONFIG_REFRESH_SECONDS. Chỉ ĐỌC DB.
#   AI_HALF_LIFE   unit 'minute' | 'hour', value >= 1; value NULL = tắt trọng số (chạy đúng pattern-v1)
#   AI_SHOE_WEIGHT unit 'times', value nguyên >= 1
# Dòng thiếu / không hợp lệ ⇒ WARN (chỉ khi lý do đổi, không lặp mỗi phút) và dùng mặc định.
import logging
from dataclasses import dataclass
from typing import Iterable, Mapping

from sqlalchemy import Engine, text

from .config import DEFAULT_HALF_LIFE_MINUTES, DEFAULT_SHOE_WEIGHT

log = logging.getLogger("pattern")

HALF_LIFE_KEY = "AI_HALF_LIFE"
SHOE_WEIGHT_KEY = "AI_SHOE_WEIGHT"
_UNIT_MINUTES = {"minute": 1, "hour": 60}


@dataclass(frozen=True)
class AiTuning:
    half_life_minutes: int | None   # None = tắt trọng số (pattern-v1)
    shoe_weight: int                # >= 1; bỏ qua khi half_life_minutes là None


def _int(v) -> int | None:
    return v if isinstance(v, int) and not isinstance(v, bool) else None


def parse(rows: Iterable[Mapping], warn=lambda msg: None) -> AiTuning:
    """rows: {type, value, unit}. `warn(msg)` được gọi cho mỗi dòng thiếu / không hợp lệ."""
    by_key = {r["type"]: r for r in rows}

    half_life: int | None = DEFAULT_HALF_LIFE_MINUTES
    row = by_key.get(HALF_LIFE_KEY)
    if row is None:
        warn(f"{HALF_LIFE_KEY}: không có dòng, dùng mặc định {DEFAULT_HALF_LIFE_MINUTES} phút")
    elif row["value"] is None:
        half_life = None                              # tắt có chủ ý
    elif _int(row["value"]) is None or row["value"] < 1 or row["unit"] not in _UNIT_MINUTES:
        warn(f"{HALF_LIFE_KEY}: giá trị {row['value']!r} / unit {row['unit']!r} không hợp lệ (cần số nguyên >= 1, unit minute|hour), "
             f"dùng mặc định {DEFAULT_HALF_LIFE_MINUTES} phút")
    else:
        half_life = row["value"] * _UNIT_MINUTES[row["unit"]]

    shoe_weight = DEFAULT_SHOE_WEIGHT
    row = by_key.get(SHOE_WEIGHT_KEY)
    if row is None:
        warn(f"{SHOE_WEIGHT_KEY}: không có dòng, dùng mặc định {DEFAULT_SHOE_WEIGHT}")
    elif _int(row["value"]) is None or row["value"] < 1 or row["unit"] != "times":
        warn(f"{SHOE_WEIGHT_KEY}: giá trị {row['value']!r} / unit {row['unit']!r} không hợp lệ (cần số nguyên >= 1, unit times), "
             f"dùng mặc định {DEFAULT_SHOE_WEIGHT}")
    else:
        shoe_weight = row["value"]
    return AiTuning(half_life, shoe_weight)


_QUERY = text("SELECT type, value, unit FROM job_configs WHERE type IN (:a, :b)")


class TuningReader:
    """Đọc job_configs; DB lỗi ⇒ giữ giá trị gần nhất (WARN). WARN giống lần trước không lặp lại."""

    def __init__(self, engine: Engine):
        self.engine = engine
        self._last_warnings: set[str] = set()

    def read(self) -> AiTuning:
        with self.engine.connect() as c:
            rows = [dict(r._mapping) for r in c.execute(_QUERY, {"a": HALF_LIFE_KEY, "b": SHOE_WEIGHT_KEY})]
        warnings: set[str] = set()
        tuning = parse(rows, warnings.add)
        for w in sorted(warnings - self._last_warnings):
            log.warning("job_configs: %s", w)
        self._last_warnings = warnings
        return tuning
