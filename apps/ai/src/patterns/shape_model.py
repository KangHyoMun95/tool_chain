# src/patterns/shape_model.py
# Mô hình HÌNH DẠNG tự học (THỬ NGHIỆM; hàm thuần, không I/O; chưa dùng trong service). Không có hình nào viết sẵn.
# Mọi đuôi độ dài kmin..kmax của chuỗi (đã bỏ ignore_in_pattern, cùng một shoe) là một "hình" ứng viên; hai chiều ký hiệu được gộp
# (dạng chuẩn: ký hiệu đầu đuôi = 1, còn lại = 2). Mỗi hình đếm [n lần xuất hiện, h lần ván kế tiếp trùng ký hiệu đầu].
# Dự đoán: chỉ dùng hình có n >= min_n và |z nhị thức so 50%| >= z_gate (đủ bằng chứng); nhiều hình khớp ⇒ lấy hình |z| lớn nhất.
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
        """Hình có bằng chứng mạnh nhất khớp đuôi của `before`: {pick, p, shape, k, n, z}; không có hình đủ bằng chứng ⇒ None."""
        best = None
        for k in range(self.kmin, min(self.kmax, len(before)) + 1):
            key, first = canon(before[-k:])
            e = self.table.get(key)
            if not e or e[0] < self.min_n:
                continue
            z = self._z(*e)
            if abs(z) >= self.z_gate and (best is None or abs(z) > abs(best[0])):
                best = (z, key, first, k, e)
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
