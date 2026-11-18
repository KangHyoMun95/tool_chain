# src/patterns/pattern.py
# Thuật toán pattern-v1 TỔNG QUÁT theo cấu hình category (config/categories/*.json): chuỗi dựng từ mọi ký hiệu trừ
# `ignore_in_pattern`; pick chỉ trong `predictable`. Hàm thuần, không I/O.
from collections import defaultdict
from typing import Callable, Iterable, Mapping, Sequence

from .config import MAX_LEN, MIN_COUNT, MIN_LEN

# patterns -> {pattern: {ký_hiệu predictable: số lần}}; pattern / ký hiệu không có trong bảng đếm thì 0
CountLookup = Callable[[list[str]], Mapping[str, Mapping[str, int]]]


def history_before(results: Mapping[int, str], round_: int, ignore: Iterable[str] = (), limit: int = MAX_LEN) -> tuple[str, bool]:
    """Chuỗi ký hiệu (đã bỏ `ignore`) của các ván TRƯỚC `round_` trong cùng một shoe, cũ -> mới, tối đa `limit` ký tự.

    results: round -> result. Trả (history, missing_previous); missing_previous = True khi round - 1 > 0 mà chưa có kết quả.
    """
    skip = set(ignore)
    rounds = sorted(r for r in results if r < round_)
    seq = "".join(results[r] for r in rounds if results[r] not in skip)
    return seq[-limit:], round_ - 1 > 0 and (round_ - 1) not in results


def suffix_patterns(history: str) -> list[str]:
    """Các đuôi k = MIN_LEN..min(MAX_LEN, len) của history; chính là những pattern choose_pick sẽ tra bảng đếm."""
    history = history[-MAX_LEN:]
    return [history[-k:] for k in range(MIN_LEN, len(history) + 1)]


def choose_pick(history: str, lookup: CountLookup, predictable: Sequence[str], min_count: int = MIN_COUNT) -> dict:
    """HÀM THUẦN (không I/O) của pattern-v1; service và backtest dùng chung.

    history: chuỗi ký hiệu đã bỏ ignore_in_pattern, cũ -> mới (chỉ lấy MAX_LEN ký tự cuối).
    Với mỗi k = MIN_LEN..min(MAX_LEN, len): pattern = k ký tự cuối, total = tổng counts của các ký hiệu `predictable`,
    đuôi hợp lệ (eligible) khi total >= min_count VÀ ký hiệu nhiều nhất là DUY NHẤT (2 ký hiệu: count_x != count_y).
    Chọn: % của ký hiệu nhiều nhất cao nhất -> total lớn hơn -> k ngắn hơn.
    Trả {pick, confidence, chosen, detail, history_used, reason} theo contract predict:results.
    """
    history = history[-MAX_LEN:]
    out = {"pick": None, "confidence": None, "chosen": None, "detail": [], "history_used": history, "reason": "NOT_ENOUGH_HISTORY"}
    if len(history) < MIN_LEN:
        return out

    table = lookup(suffix_patterns(history))
    detail, candidates = [], []
    for k in range(MIN_LEN, len(history) + 1):
        pat = history[-k:]
        got = table.get(pat, {})
        counts = {s: int(got.get(s, 0)) for s in predictable}
        total = sum(counts.values())
        top = max(counts.values())
        winners = [s for s, n in counts.items() if n == top]
        eligible = total >= min_count and len(winners) == 1
        detail.append({
            "k": k, "pattern": pat, "counts": counts, "total": total,
            "pct": {s: round(n / total, 4) if total else None for s, n in counts.items()},
            "eligible": eligible,
        })
        if eligible:
            candidates.append((top / total, total, -k, winners[0], detail[-1]))

    out["detail"] = detail
    if not candidates:
        out["reason"] = "NO_ELIGIBLE_SUFFIX"
        return out

    pct, total, _, pick, row = max(candidates, key=lambda c: c[:3])
    out.update(
        pick=pick,
        confidence=round(pct, 4),
        chosen={"k": row["k"], "pattern": row["pattern"], "occurrences": total, "pct": dict(row["pct"])},
        reason="OK",
    )
    return out


def format_detail(result: dict) -> str:
    lines = [f"  history={result['history_used'] or '-'}  reason={result['reason']}"]
    for row in result["detail"]:
        pct = "  ".join(f"{s} {p:.1%}" for s, p in row["pct"].items()) if row["total"] else "-"
        cnt = " ".join(f"{s}={n:<5}" for s, n in row["counts"].items())
        lines.append(f"  k={row['k']:<2} {row['pattern']:<10} {cnt} n={row['total']:<5} {pct:<22}"
                     f"{'eligible' if row['eligible'] else ''}")
    c = result["chosen"]
    lines.append(f"  => {result['pick']} {result['confidence']:.1%} (k={c['k']}, n={c['occurrences']})" if c else "  => không dự đoán")
    return "\n".join(lines)


class PatternStats:
    """Bảng đếm trong bộ nhớ của MỘT stream: pattern -> {ký_hiệu predictable: n}. Dùng cho backtest, verify và dựng lại bảng đếm."""

    def __init__(self, predictable: Sequence[str], min_len: int = MIN_LEN, max_len: int = MAX_LEN):
        self.predictable = tuple(predictable)
        self.min_len, self.max_len = min_len, max_len
        self.counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def add_sequence(self, seq: str) -> None:
        """Đếm mọi pattern (gối đầu) có ký hiệu predictable theo sau, trong một chuỗi liền mạch (đã bỏ ignore) của MỘT shoe (brute-force)."""
        for n in range(self.min_len, self.max_len + 1):
            for i in range(len(seq) - n):          # bỏ lần xuất hiện cuối chưa có kết quả
                if seq[i + n] in self.predictable:
                    self.counts[seq[i:i + n]][seq[i + n]] += 1

    def add_result(self, before: str, result: str) -> None:
        """Cập nhật tăng dần khi có một kết quả mới; `before` là chuỗi liền mạch (đã bỏ ignore) ngay trước nó (cùng shoe).

        Cùng quy tắc với script Lua của service. result ngoài `predictable` không được đếm.
        """
        if result not in self.predictable:
            return
        before = before[-self.max_len:]
        for n in range(self.min_len, min(self.max_len, len(before)) + 1):
            self.counts[before[-n:]][result] += 1

    def lookup(self, patterns: Iterable[str]) -> dict[str, dict[str, int]]:
        return {p: dict(self.counts.get(p, {})) for p in patterns}
