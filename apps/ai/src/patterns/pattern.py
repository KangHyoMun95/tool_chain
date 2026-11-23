# src/patterns/pattern.py
# Thuật toán pattern-v1 TỔNG QUÁT theo cấu hình category (config/categories/*.json): chuỗi dựng từ mọi ký hiệu trừ
# `ignore_in_pattern`; pick chỉ trong `predictable`. Hàm thuần, không I/O.
from collections import defaultdict
from typing import Callable, Iterable, Mapping, Sequence

from .config import MAX_CONFIDENCE, MAX_LEN, MAX_WEIGHT_EXPONENT, MIN_COUNT, MIN_LEN, RECENCY_BLEND

# patterns -> {pattern: {ký_hiệu predictable: số lần}}; pattern / ký hiệu không có trong bảng đếm thì 0
CountLookup = Callable[[list[str]], Mapping[str, Mapping[str, int]]]
# Như CountLookup nhưng số đếm CÓ trọng số theo độ mới (float).
WeightedLookup = Callable[[list[str]], Mapping[str, Mapping[str, float]]]


def recency_weight(ts: float, t0: float, half_life_hours: float) -> float:
    """Trọng số 2^((ts - t0) / half-life). Chỉ tỉ lệ giữa các trọng số có ý nghĩa nên t0 tùy ý:
    t0 = lúc dựng lại bảng đếm ⇒ ván cũ < 1, ván mới sau đó > 1 (clamp ở 2^MAX_WEIGHT_EXPONENT để không tràn float)."""
    return 2.0 ** min((ts - t0) / (half_life_hours * 3600.0), MAX_WEIGHT_EXPONENT)


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


def choose_pick(history: str, lookup: CountLookup, predictable: Sequence[str], min_count: int = MIN_COUNT,
                wlookup: WeightedLookup | None = None, blend: float = RECENCY_BLEND) -> dict:
    """HÀM THUẦN (không I/O) của pattern-v1; service và backtest dùng chung.

    history: chuỗi ký hiệu đã bỏ ignore_in_pattern, cũ -> mới (chỉ lấy MAX_LEN ký tự cuối).
    Với mỗi k = MIN_LEN..min(MAX_LEN, len): pattern = k ký tự cuối, total = tổng counts của các ký hiệu `predictable`,
    đuôi hợp lệ (eligible) khi total >= min_count VÀ ký hiệu nhiều nhất là DUY NHẤT (2 ký hiệu: count_x != count_y).
    Chọn: % của ký hiệu nhiều nhất cao nhất -> total lớn hơn -> k ngắn hơn. `confidence` = % đó nhưng không vượt MAX_CONFIDENCE.
    wlookup (tùy chọn): số đếm có trọng số theo độ mới. Có ⇒ tỉ lệ của mỗi ký hiệu = (1 - blend) * tỉ lệ số lần thật + blend * tỉ lệ có trọng số,
    pct / pick / confidence tính trên tỉ lệ đó (lịch sử lặp lại gần đây nặng hơn lịch sử cũ); `counts`, `total` và điều kiện eligible vẫn theo
    số lần thật. Không có ⇒ như cũ (mọi lần cùng trọng số).
    Trả {pick, confidence, chosen, detail, history_used, reason} theo contract predict:results.
    """
    history = history[-MAX_LEN:]
    out = {"pick": None, "confidence": None, "chosen": None, "detail": [], "history_used": history, "reason": "NOT_ENOUGH_HISTORY"}
    if len(history) < MIN_LEN:
        return out

    patterns = suffix_patterns(history)
    table = lookup(patterns)
    wtable = wlookup(patterns) if wlookup else None
    detail, candidates = [], []
    for k in range(MIN_LEN, len(history) + 1):
        pat = history[-k:]
        got = table.get(pat, {})
        counts = {s: int(got.get(s, 0)) for s in predictable}
        total = sum(counts.values())
        top = max(counts.values())
        winners = [s for s, n in counts.items() if n == top]
        eligible = total >= min_count and len(winners) == 1
        # Tỉ lệ dùng để chọn pick / hiển thị: trộn số lần thật với số lần có trọng số (nếu có và tổng > 0), ngược lại số lần thật.
        shares: dict[str, float] = {s: n / total if total else 0.0 for s, n in counts.items()}
        if wtable is not None and total:
            w = {s: float(wtable.get(pat, {}).get(s, 0.0)) for s in predictable}
            wsum = sum(w.values())
            if wsum > 0:
                shares = {s: (1 - blend) * shares[s] + blend * w[s] / wsum for s in predictable}
        share_total = sum(shares.values())
        pct = {s: round(v / share_total, 4) if share_total else None for s, v in shares.items()}
        detail.append({"k": k, "pattern": pat, "counts": counts, "total": total, "pct": pct, "eligible": eligible})
        if eligible:
            best = max(shares.values())
            leaders = [s for s, v in shares.items() if v == best]
            # Hòa sau khi có trọng số (rất hiếm): rơi về ký hiệu nhiều nhất theo số lần thật.
            pick_symbol = leaders[0] if len(leaders) == 1 else winners[0]
            candidates.append((shares[pick_symbol] / share_total, total, -k, pick_symbol, detail[-1]))

    out["detail"] = detail
    if not candidates:
        out["reason"] = "NO_ELIGIBLE_SUFFIX"
        return out

    pct, total, _, pick, row = max(candidates, key=lambda c: c[:3])
    out.update(
        pick=pick,
        confidence=round(min(pct, MAX_CONFIDENCE), 4),
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

    def __init__(self, predictable: Sequence[str], min_len: int = MIN_LEN, max_len: int = MAX_LEN,
                 half_life_hours: float = 0.0, t0: float = 0.0):
        self.predictable = tuple(predictable)
        self.min_len, self.max_len = min_len, max_len
        self.half_life_hours, self.t0 = half_life_hours, t0   # half_life_hours = 0: không tính số đếm có trọng số
        self.counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.wcounts: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    def add_sequence(self, seq: str) -> None:
        """Đếm mọi pattern (gối đầu) có ký hiệu predictable theo sau, trong một chuỗi liền mạch (đã bỏ ignore) của MỘT shoe (brute-force)."""
        for n in range(self.min_len, self.max_len + 1):
            for i in range(len(seq) - n):          # bỏ lần xuất hiện cuối chưa có kết quả
                if seq[i + n] in self.predictable:
                    self.counts[seq[i:i + n]][seq[i + n]] += 1

    def add_result(self, before: str, result: str, ts: float | None = None) -> None:
        """Cập nhật tăng dần khi có một kết quả mới; `before` là chuỗi liền mạch (đã bỏ ignore) ngay trước nó (cùng shoe).

        Cùng quy tắc với script Lua của service. result ngoài `predictable` không được đếm.
        """
        if result not in self.predictable:
            return
        before = before[-self.max_len:]
        w = recency_weight(ts, self.t0, self.half_life_hours) if self.half_life_hours and ts is not None else None
        for n in range(self.min_len, min(self.max_len, len(before)) + 1):
            self.counts[before[-n:]][result] += 1
            if w is not None:
                self.wcounts[before[-n:]][result] += w

    def lookup(self, patterns: Iterable[str]) -> dict[str, dict[str, int]]:
        return {p: dict(self.counts.get(p, {})) for p in patterns}

    def wlookup(self, patterns: Iterable[str]) -> dict[str, dict[str, float]]:
        return {p: dict(self.wcounts.get(p, {})) for p in patterns}
