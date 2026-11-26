# src/patterns/shape_model.py
# Mô hình HÌNH DẠNG tự học (THỬ NGHIỆM; hàm thuần, không I/O; chưa dùng trong service). Không có hình nào viết sẵn.
# Mọi đuôi độ dài kmin..kmax của chuỗi (đã bỏ ignore_in_pattern, cùng một shoe) là một "hình" ứng viên; hai chiều ký hiệu được gộp
# (dạng chuẩn: ký hiệu đầu đuôi = 1, còn lại = 2). Mỗi hình đếm [n lần xuất hiện, h lần ván kế tiếp trùng ký hiệu đầu].
# Dự đoán: chỉ dùng hình có n >= min_n và |z nhị thức so 50%| >= z_gate (đủ bằng chứng); nhiều hình khớp ⇒ ưu tiên đuôi DÀI nhất (k từ kmax xuống kmin = 3), lấy hình đầu tiên đủ bằng chứng.
# Xác suất báo ra được co về 0.5 (p = (h + a) / (n + 2a)) để hình ít dữ liệu không báo quá tự tin. Không đủ bằng chứng ⇒ None (không can thiệp).
import math
from typing import Sequence


def canon(tail: str) -> tuple[str, str]:
    first = tail[0]
    return "".join("1" if c == first else "2" for c in tail), first


class ShapeModel:
    def __init__(self, predictable: Sequence[str], kmin: int = 3, kmax: int = 10, min_n: int = 30, z_gate: float = 3.0, shrink: float = 10.0):
        if len(predictable) != 2:
            raise ValueError("ShapeModel chỉ dùng cho category có đúng 2 ký hiệu predictable")
        self.predictable = tuple(predictable)
        self.kmin, self.kmax, self.min_n, self.z_gate, self.shrink = kmin, kmax, min_n, z_gate, shrink
        self.table: dict[str, list[int]] = {}

    def update(self, before: str, result: str) -> None:
        """Có kết quả mới `result` (thuộc predictable) sau chuỗi `before` cùng shoe: cộng vào mọi hình khớp đuôi."""
        if result not in self.predictable:
            return
        for k in range(self.kmin, min(self.kmax, len(before)) + 1):
            key, first = canon(before[-k:])
            e = self.table.setdefault(key, [0, 0])
            e[0] += 1
            e[1] += result == first

    @staticmethod
    def _z(n: int, h: int) -> float:
        return (h - n / 2) / math.sqrt(n / 4)

    def predict(self, before: str) -> dict | None:
        """Hình đủ bằng chứng khớp đuôi của `before`, DUYỆT TỪ DÀI XUỐNG NGẮN (k = min(kmax, len) .. kmin) và lấy hình đầu tiên đủ bằng chứng:
        {pick, p, shape, k, n, z}; không có hình đủ bằng chứng ⇒ None."""
        best = None
        for k in range(min(self.kmax, len(before)), self.kmin - 1, -1):
            key, first = canon(before[-k:])
            e = self.table.get(key)
            if not e or e[0] < self.min_n:
                continue
            z = self._z(*e)
            if abs(z) >= self.z_gate:
                best = (z, key, first, k, e)
                break
        if best is None:
            return None
        z, key, first, k, (n, h) = best
        p_same = (h + self.shrink) / (n + 2 * self.shrink)           # xác suất ván kế = ký hiệu đầu đuôi, đã co về 0.5
        other = self.predictable[1] if first == self.predictable[0] else self.predictable[0]
        pick, p = (first, p_same) if p_same > 0.5 else (other, 1 - p_same)
        return {"pick": pick, "p": p, "shape": key, "k": k, "n": n, "z": z}

    def top_shapes(self, top: int = 10) -> list[tuple[str, int, float, float]]:
        """Các hình đủ bằng chứng mạnh nhất lúc này: (dạng, n, tỉ lệ 'kế tiếp = ký hiệu đầu', z)."""
        rows = [(k, n, h / n, self._z(n, h)) for k, (n, h) in self.table.items() if n >= self.min_n]
        return sorted(rows, key=lambda r: -abs(r[3]))[:top]


# ---------------------------------------------------------------------------------------------------------------------------------
# Dùng trong SERVICE: dựng mô hình từ DB, đọc cấu hình từ env, trộn tín hiệu hình vào kết quả pattern-v1.
import logging
import os
from dataclasses import dataclass

log = logging.getLogger("pattern")


@dataclass(frozen=True)
class ShapeSettings:
    weight: float      # trọng số của hình khi trộn vào % của pattern-v1 (0 = TẮT hẳn)
    z_gate: float      # ngưỡng bằng chứng |z|
    min_n: int         # số lần xuất hiện tối thiểu của một hình


def shape_settings() -> ShapeSettings:
    """AI_SHAPE_WEIGHT (mặc định 0.3; 0 = tắt), AI_SHAPE_Z (3.0), AI_SHAPE_MIN_N (30). Sai giá trị ⇒ ném ValueError lúc khởi động."""
    s = ShapeSettings(float(os.environ.get("AI_SHAPE_WEIGHT", "0.3")), float(os.environ.get("AI_SHAPE_Z", "3.0")), int(os.environ.get("AI_SHAPE_MIN_N", "30")))
    if not 0 <= s.weight <= 1 or s.z_gate <= 0 or s.min_n < 1:
        raise ValueError(f"AI_SHAPE_WEIGHT phải trong 0..1, AI_SHAPE_Z > 0, AI_SHAPE_MIN_N >= 1 (đang {s})")
    return s


def build_models(engine, registry, settings: ShapeSettings) -> dict[str, ShapeModel]:
    """Dựng mô hình hình dạng (mỗi category 2 ký hiệu predictable một mô hình, GỘP mọi stream) từ mọi ván FINISHED trong DB (chỉ đọc).

    Chuỗi của từng (stream, shoe) bỏ ignore_in_pattern, không nối qua shoe: cùng quy tắc với bảng đếm pattern-v1.
    """
    import itertools
    from .counts import _REBUILD_QUERY
    from .config import MAX_LEN

    models: dict[str, ShapeModel] = {}
    n = 0
    with engine.connect().execution_options(stream_results=True) as conn:
        for _, rows in itertools.groupby(conn.execute(_REBUILD_QUERY), key=lambda x: (str(x.stream_id), x.road_shoe)):
            first = next(rows)
            cfg = registry.get(first.lobby_name, first.category_name)
            if cfg is None or len(cfg.predictable) != 2:
                continue
            model = models.get(cfg.key)
            if model is None:
                model = models[cfg.key] = ShapeModel(cfg.predictable, kmax=MAX_LEN, min_n=settings.min_n, z_gate=settings.z_gate)
            before = ""
            for row in itertools.chain([first], rows):
                if row.result not in cfg.results or row.result in cfg.ignore_in_pattern:
                    continue
                model.update(before, row.result)
                n += 1
                before = (before + row.result)[-MAX_LEN:]
    log.info("Dựng mô hình hình dạng: %d category, %d kết quả", len(models), n)
    return models


def apply_shape(pick: dict, shape: dict, weight: float, predictable: Sequence[str]) -> dict:
    """Trộn tín hiệu hình vào kết quả pattern-v1 `pick` (CHỈ khi pattern-v1 có dự đoán): pct'[x] = (1 - w) * pct[x] + w * (x == shape.pick).

    Trả bản sao đã sửa `pick`, `confidence`, `chosen.pct`; `detail` giữ nguyên (số của pattern-v1). Hòa ⇒ giữ pick của pattern-v1.
    """
    chosen = pick.get("chosen")
    if not chosen or shape is None or weight <= 0:
        return pick
    pct = {s: float(chosen["pct"].get(s) or 0.0) for s in predictable}
    mixed = {s: (1 - weight) * p + (weight if s == shape["pick"] else 0.0) for s, p in pct.items()}
    top = max(mixed.values())
    winners = [s for s, v in mixed.items() if v == top]
    final = pick["pick"] if pick["pick"] in winners else winners[0]
    from .config import MAX_CONFIDENCE
    out = dict(pick)
    out.update(pick=final, confidence=round(min(mixed[final], MAX_CONFIDENCE), 4),
               chosen={**chosen, "pct": {s: round(v, 4) for s, v in mixed.items()}})
    return out
