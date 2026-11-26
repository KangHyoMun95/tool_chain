# src/patterns/pattern.py
# Thuật toán pattern-v1 TỔNG QUÁT theo cấu hình category (config/categories/*.json): chuỗi dựng từ mọi ký hiệu trừ
# `ignore_in_pattern`; pick chỉ trong `predictable`. Hàm thuần, không I/O.
from collections import defaultdict
from typing import Callable, Iterable, Mapping, Sequence

from .config import MAX_CONFIDENCE, MAX_LEN, MAX_WEIGHT_EXPONENT, MIN_COUNT, MIN_LEN, WEIGHTED_CONFIDENCE_SCALE

# patterns -> {pattern: {ký_hiệu predictable: số lần}}; pattern / ký hiệu không có trong bảng đếm thì 0
CountLookup = Callable[[list[str]], Mapping[str, Mapping[str, int]]]
# Như CountLookup nhưng số đếm CÓ trọng số theo độ mới (float), ĐÃ gồm hệ số shoe hiện tại và đã chuẩn hóa (xem combine_weighted).
WeightedLookup = Callable[[list[str]], Mapping[str, Mapping[str, float]]]


def recency_weight(ts: float, t0: float, half_life_minutes: float) -> float:
    """Trọng số 2^((ts - t0) / half-life). Chỉ tỉ lệ giữa các trọng số có ý nghĩa nên t0 tùy ý: t0 = lúc dựng lại bảng đếm
    ⇒ ván cũ < 1, ván mới sau đó > 1. Clamp ở 2^1000 để không tràn; caller dựng lại bảng trước khi số mũ vượt MAX_WEIGHT_EXPONENT."""
    return 2.0 ** min((ts - t0) / (half_life_minutes * 60.0), 1000.0)


def weight_scale(now: float, t0: float, half_life_minutes: float) -> float:
    """Hệ số đưa trọng số (tính từ t0) về "một kết quả xảy ra lúc `now` có trọng số 1" ⇒ số đếm có trọng số dễ đọc (lần hiệu dụng)."""
    return 2.0 ** min(-(now - t0) / (half_life_minutes * 60.0), 1000.0)


def combine_weighted(table_w: Mapping[str, Mapping[str, float]], shoe_w: Mapping[str, Mapping[str, float]], shoe_weight: int,
                     scale: float, patterns: Iterable[str], predictable: Sequence[str]) -> dict[str, dict[str, float]]:
    """W[R] = (W_bàn[R] + (shoe_weight - 1) * W_shoe_hiện_tại[R]) * scale, cho từng pattern và ký hiệu predictable R."""
    out: dict[str, dict[str, float]] = {}
    for p in patterns:
        t, sh = table_w.get(p, {}), shoe_w.get(p, {})
        out[p] = {r: (float(t.get(r, 0.0)) + (shoe_weight - 1) * float(sh.get(r, 0.0))) * scale for r in predictable}
    return out


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
                wlookup: WeightedLookup | None = None) -> dict:
    """HÀM THUẦN (không I/O) của pattern-v1; service và backtest dùng chung.

    history: chuỗi ký hiệu đã bỏ ignore_in_pattern, cũ -> mới (chỉ lấy MAX_LEN ký tự cuối).
    Với mỗi k = MIN_LEN..min(MAX_LEN, len): pattern = k ký tự cuối.
    - Không có wlookup (tắt trọng số): đúng pattern-v1: total = tổng số lần thật của các ký hiệu `predictable`, đuôi hợp lệ (eligible) khi
      total >= min_count VÀ ký hiệu nhiều nhất là DUY NHẤT; chọn % cao nhất -> total lớn hơn -> k ngắn hơn.
    - Có wlookup (số đếm có trọng số theo độ mới, đã gồm hệ số shoe hiện tại): điều kiện số lần THẬT (`lookup`) total >= min_count giữ nguyên,
      nhưng ký hiệu nhiều nhất DUY NHẤT, %, và thứ tự ưu tiên (% cao nhất -> tổng trọng số lớn hơn -> k ngắn hơn) đều tính trên số có trọng số.
      Tổng trọng số = 0 (mọi lần xuất hiện cũ tới mức trọng số về 0) thì đuôi không hợp lệ.
    `confidence` = % của đuôi được chọn nhưng không vượt MAX_CONFIDENCE; khi có wlookup thì % (và chosen.pct) được co về đều nhau theo
    WEIGHTED_CONFIDENCE_SCALE (xem config.py) vì % có trọng số gần như luôn ~100%. Việc chọn pick và detail vẫn theo % chưa co.
    detail (contract predict:results): counts / total / pct là số CÓ trọng số (tắt trọng số thì chính là số lần thật); KHÔNG chứa số lần thật.
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
        raw_total = sum(int(got.get(s, 0)) for s in predictable)
        if wtable is None:
            w: dict[str, float] = {s: int(got.get(s, 0)) for s in predictable}
        else:
            w = {s: float(wtable.get(pat, {}).get(s, 0.0)) for s in predictable}
        wtotal = sum(w.values())
        top = max(w.values())
        winners = [s for s, v in w.items() if v == top]
        eligible = raw_total >= min_count and wtotal > 0 and len(winners) == 1
        shown = (lambda v: v) if wtable is None else (lambda v: round(v, 6))
        detail.append({
            "k": k, "pattern": pat, "counts": {s: shown(v) for s, v in w.items()}, "total": shown(wtotal),
            "pct": {s: round(v / wtotal, 4) if wtotal > 0 else None for s, v in w.items()},
            "eligible": eligible,
        })
        if eligible:
            candidates.append((top / wtotal, wtotal, -k, winners[0], detail[-1]))

    out["detail"] = detail
    if not candidates:
        out["reason"] = "NO_ELIGIBLE_SUFFIX"
        return out

    pct, total, _, pick, row = max(candidates, key=lambda c: c[:3])
    chosen_pct = dict(row["pct"])
    if wtable is not None:
        c, m = WEIGHTED_CONFIDENCE_SCALE, len(predictable)
        pct = (1 - c) / m + c * pct
        chosen_pct = {s: round((1 - c) / m + c * v, 4) for s, v in chosen_pct.items()}
    out.update(
        pick=pick,
        confidence=round(min(pct, MAX_CONFIDENCE), 4),
        chosen={"k": row["k"], "pattern": row["pattern"], "occurrences": row["total"], "pct": chosen_pct},
        reason="OK",
    )
    return out


def format_detail(result: dict) -> str:
    lines = [f"  history={result['history_used'] or '-'}  reason={result['reason']}"]
    for row in result["detail"]:
        pct = "  ".join(f"{s} {p:.1%}" for s, p in row["pct"].items()) if row["total"] else "-"
        cnt = " ".join(f"{s}={n:<7g}" for s, n in row["counts"].items())
        lines.append(f"  k={row['k']:<2} {row['pattern']:<10} {cnt} n={row['total']:<7g} {pct:<22}"
                     f"{'eligible' if row['eligible'] else ''}")
    c = result["chosen"]
    lines.append(f"  => {result['pick']} {result['confidence']:.1%} (k={c['k']}, n={c['occurrences']:g})" if c else "  => không dự đoán")
    return "\n".join(lines)


class PatternStats:
    """Bảng đếm trong bộ nhớ của MỘT stream: pattern -> {ký_hiệu predictable: n}. Dùng cho backtest, verify và dựng lại bảng đếm.

    Ngoài số lần thật (`counts`) còn có số lần CÓ trọng số theo độ mới (khi half_life_minutes != None): `wcounts` (cả stream) và
    `shoe_wcounts` (chỉ shoe hiện tại, gọi begin_shoe() khi sang shoe mới). Trọng số 2^((ts - t0) / half-life); số mũ vượt MAX_WEIGHT_EXPONENT
    thì tự đặt lại t0 (nhân mọi trọng số với hệ số tương ứng) nên không tràn dù dữ liệu dài.
    """

    def __init__(self, predictable: Sequence[str], min_len: int = MIN_LEN, max_len: int = MAX_LEN,
                 half_life_minutes: float | None = None, t0: float | None = None):
        self.predictable = tuple(predictable)
        self.min_len, self.max_len = min_len, max_len
        self.half_life_minutes, self.t0 = half_life_minutes, t0
        self.counts: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
        self.wcounts: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        self.shoe_wcounts: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))

    def begin_shoe(self) -> None:
        self.shoe_wcounts = defaultdict(lambda: defaultdict(float))

    def _weight(self, ts: float) -> float:
        if self.t0 is None:
            self.t0 = ts
        if (ts - self.t0) / (self.half_life_minutes * 60.0) > MAX_WEIGHT_EXPONENT:
            f = weight_scale(ts, self.t0, self.half_life_minutes)      # đặt lại t0 = ts
            for table in (self.wcounts, self.shoe_wcounts):
                for cell in table.values():
                    for r in cell:
                        cell[r] *= f
            self.t0 = ts
        return recency_weight(ts, self.t0, self.half_life_minutes)

    def add_sequence(self, seq: str) -> None:
        """Đếm mọi pattern (gối đầu) có ký hiệu predictable theo sau, trong một chuỗi liền mạch (đã bỏ ignore) của MỘT shoe (brute-force)."""
        for n in range(self.min_len, self.max_len + 1):
            for i in range(len(seq) - n):          # bỏ lần xuất hiện cuối chưa có kết quả
                if seq[i + n] in self.predictable:
                    self.counts[seq[i:i + n]][seq[i + n]] += 1

    def add_result(self, before: str, result: str, ts: float | None = None) -> None:
        """Cập nhật tăng dần khi có một kết quả mới; `before` là chuỗi liền mạch (đã bỏ ignore) ngay trước nó (cùng shoe).

        Cùng quy tắc với script Lua của service. result ngoài `predictable` không được đếm.
        ts: thời điểm ván ra kết quả (epoch giây); có ts và half_life_minutes thì cộng thêm trọng số vào wcounts / shoe_wcounts.
        """
        if result not in self.predictable:
            return
        before = before[-self.max_len:]
        w = self._weight(ts) if self.half_life_minutes and ts is not None else None
        for n in range(self.min_len, min(self.max_len, len(before)) + 1):
            self.counts[before[-n:]][result] += 1
            if w is not None:
                self.wcounts[before[-n:]][result] += w
                self.shoe_wcounts[before[-n:]][result] += w

    def lookup(self, patterns: Iterable[str]) -> dict[str, dict[str, int]]:
        return {p: dict(self.counts.get(p, {})) for p in patterns}

    def wlookup(self, patterns: Iterable[str], shoe_weight: int, now: float) -> dict[str, dict[str, float]]:
        """Số đếm có trọng số cho dự đoán lúc `now`: W = W_bàn + (shoe_weight - 1) * W_shoe_hiện_tại, chuẩn hóa theo `now`."""
        if self.t0 is None:
            return {p: {r: 0.0 for r in self.predictable} for p in patterns}
        return combine_weighted(self.wcounts, self.shoe_wcounts, shoe_weight,
                                weight_scale(now, self.t0, self.half_life_minutes), patterns, self.predictable)
