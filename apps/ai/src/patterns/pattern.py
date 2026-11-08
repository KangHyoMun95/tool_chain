# src/patterns/pattern.py
from collections import defaultdict
from config import MIN_LEN, MAX_LEN, MIN_COUNT

class PatternStats:
    """Bảng đếm: pattern -> {kết quả kế tiếp: số lần}."""

    def __init__(self, min_len: int = MIN_LEN, max_len: int = MAX_LEN):
        self.min_len, self.max_len = min_len, max_len
        self.counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def add_sequence(self, seq: str) -> None:
        """Đếm mọi pattern (gối đầu) có kết quả theo sau, trong một chuỗi liền mạch."""
        for n in range(self.min_len, self.max_len + 1):
            for i in range(len(seq) - n):          # bỏ lần xuất hiện cuối chưa có kết quả
                self.counts[seq[i:i + n]][seq[i + n]] += 1

    def add_result(self, before: str, result: str) -> None:
        """Cập nhật tăng dần khi có một kết quả mới; `before` là chuỗi liền mạch ngay trước nó."""
        for n in range(self.min_len, min(self.max_len, len(before)) + 1):
            self.counts[before[-n:]][result] += 1

    def analyze(self, recent: str, min_count: int = MIN_COUNT) -> dict:
        """recent: các kết quả gần nhất, cũ → mới. Trả về bảng mọi độ dài trượt + lựa chọn tốt nhất."""
        windows = []
        for n in range(self.min_len, min(self.max_len, len(recent)) + 1):
            pat = recent[-n:]
            c = dict(self.counts.get(pat, {}))
            total = sum(c.values())
            windows.append({
                "length": n,
                "pattern": pat,
                "n": total,
                "counts": c,
                "pct": {k: round(v / total, 4) for k, v in sorted(c.items())} if total else {},
            })

        # Ứng viên: (%, số lần, -độ dài) → max = % cao nhất, rồi nhiều lần hơn, rồi trượt ngắn hơn
        candidates = [
            (p, w["n"], -w["length"], res, w)
            for w in windows if w["n"] >= min_count
            for res, p in w["pct"].items()
        ]
        best = None
        if candidates:
            p, n, _, res, w = max(candidates, key=lambda x: (x[0], x[1], x[2]))
            best = {"length": w["length"], "pattern": w["pattern"], "result": res, "pct": p, "n": n}

        return {"recent": recent, "windows": windows, "best": best}