# src/patterns/pattern.py
from collections import defaultdict
from typing import Callable, Iterable, Mapping

from .config import MAX_LEN, MIN_COUNT, MIN_LEN

# patterns -> {pattern: (count_B, count_P)}; pattern không có trong bảng đếm thì (0, 0)
CountLookup = Callable[[list[str]], Mapping[str, tuple[int, int]]]


def history_before(results: Mapping[int, str], round_: int, limit: int = MAX_LEN) -> tuple[str, bool]:
    """Chuỗi B/P (đã bỏ T) của các ván TRƯỚC `round_` trong cùng một shoe, cũ -> mới, tối đa `limit` ký tự.

    results: round -> result (B/P/T). Trả (history, missing_previous); missing_previous = True khi round - 1 > 0 mà chưa có kết quả.
    """
    rounds = sorted(r for r in results if r < round_)
    seq = "".join(results[r] for r in rounds if results[r] in ("B", "P"))
    return seq[-limit:], round_ - 1 > 0 and (round_ - 1) not in results


def suffix_patterns(history: str) -> list[str]:
    """Các đuôi k = MIN_LEN..min(MAX_LEN, len) của history; chính là những pattern choose_pick sẽ tra bảng đếm."""
    history = history[-MAX_LEN:]
    return [history[-k:] for k in range(MIN_LEN, len(history) + 1)]


def choose_pick(history: str, lookup: CountLookup, min_count: int = MIN_COUNT) -> dict:
    """HÀM THUẦN (không I/O) của pattern-v1; service và backtest dùng chung.

    history: chuỗi B/P đã bỏ T, cũ -> mới (chỉ lấy MAX_LEN ký tự cuối).
    Với mỗi k = MIN_LEN..min(MAX_LEN, len): pattern = k ký tự cuối, total = count_B + count_P,
    đuôi hợp lệ (eligible) khi total >= min_count VÀ count_B != count_P.
    Chọn: % của kết quả nhiều hơn cao nhất -> total lớn hơn -> k ngắn hơn.
    Trả {pick, confidence, chosen, detail, history_used, reason} theo contract predict:results.
    """
    history = history[-MAX_LEN:]
    out = {"pick": None, "confidence": None, "chosen": None, "detail": [], "history_used": history, "reason": "NOT_ENOUGH_HISTORY"}
    if len(history) < MIN_LEN:
        return out

    ks = range(MIN_LEN, len(history) + 1)
    counts = lookup(suffix_patterns(history))
    detail, candidates = [], []
    for k in ks:
        pat = history[-k:]
        cb, cp = counts.get(pat, (0, 0))
        total = cb + cp
        eligible = total >= min_count and cb != cp
        detail.append({
            "k": k, "pattern": pat, "count_B": cb, "count_P": cp, "total": total,
            "pct_B": round(cb / total, 4) if total else None,
            "pct_P": round(cp / total, 4) if total else None,
            "eligible": eligible,
        })
        if eligible:
            pick = "B" if cb > cp else "P"
            candidates.append((max(cb, cp) / total, total, -k, pick, detail[-1]))

    out["detail"] = detail
    if not candidates:
        out["reason"] = "NO_ELIGIBLE_SUFFIX"
        return out

    pct, total, _, pick, row = max(candidates, key=lambda c: c[:3])
    out.update(
        pick=pick,
        confidence=round(pct, 4),
        chosen={"k": row["k"], "pattern": row["pattern"], "occurrences": total, "pct_B": row["pct_B"], "pct_P": row["pct_P"]},
        reason="OK",
    )
    return out


def format_detail(result: dict) -> str:
    lines = [f"  history={result['history_used'] or '-'}  reason={result['reason']}"]
    for row in result["detail"]:
        pct = f"B {row['pct_B']:.1%}  P {row['pct_P']:.1%}" if row["total"] else "-"
        lines.append(f"  k={row['k']:<2} {row['pattern']:<10} B={row['count_B']:<5} P={row['count_P']:<5} n={row['total']:<5} {pct:<22}"
                     f"{'eligible' if row['eligible'] else ''}")
    c = result["chosen"]
    lines.append(f"  => {result['pick']} {result['confidence']:.1%} (k={c['k']}, n={c['occurrences']})" if c else "  => không dự đoán")
    return "\n".join(lines)


class PatternStats:
    """Bảng đếm trong bộ nhớ của MỘT stream: pattern -> {B: n, P: n}. Dùng cho backtest, verify và dựng lại bảng đếm."""

    def __init__(self, min_len: int = MIN_LEN, max_len: int = MAX_LEN):
        self.min_len, self.max_len = min_len, max_len
        self.counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))

    def add_sequence(self, seq: str) -> None:
        """Đếm mọi pattern (gối đầu) có kết quả theo sau, trong một chuỗi B/P liền mạch của MỘT shoe (brute-force)."""
        for n in range(self.min_len, self.max_len + 1):
            for i in range(len(seq) - n):          # bỏ lần xuất hiện cuối chưa có kết quả
                self.counts[seq[i:i + n]][seq[i + n]] += 1

    def add_result(self, before: str, result: str) -> None:
        """Cập nhật tăng dần khi có một kết quả mới; `before` là chuỗi B/P liền mạch ngay trước nó (cùng shoe).

        Cùng quy tắc với script Lua của service. result ngoài B/P (vd T) không được đếm.
        """
        if result not in ("B", "P"):
            return
        before = before[-self.max_len:]
        for n in range(self.min_len, min(self.max_len, len(before)) + 1):
            self.counts[before[-n:]][result] += 1

    def lookup(self, patterns: Iterable[str]) -> dict[str, tuple[int, int]]:
        out = {}
        for p in patterns:
            c = self.counts.get(p)
            out[p] = (c["B"], c["P"]) if c else (0, 0)
        return out
