# src/patterns/run_rule.py
# Các luật "hình thù" (THỬ NGHIỆM, chỉ dùng trong backtest). Hàm thuần, không I/O. Mỗi luật: (history, predictable) -> ký hiệu | None.
# RULES: run (độ dài đoạn), repeat (đuôi đã xuất hiện trước đó trong shoe), mirror (đối xứng).
#
# --- run: luật "cầu theo độ dài đoạn" ---
# Chuỗi (đã bỏ ignore_in_pattern) tách thành các đoạn liên tiếp cùng ký hiệu, vd 12212 -> 1|22|1|2.
# Độ dài đoạn mục tiêu = độ dài đoạn cùng ký hiệu liền trước (cách 2 đoạn); không có thì dùng đoạn ngay trước;
# không có đoạn nào trước đó (chuỗi toàn một ký hiệu) thì không có mục tiêu = tiếp tục (bệt).
# Đoạn hiện tại < mục tiêu (hoặc không có mục tiêu) -> tiếp tục ký hiệu cuối; ngược lại -> đổi sang ký hiệu kia.
# Chỉ áp dụng khi category có đúng 2 ký hiệu predictable (nếu không "ký hiệu kia" không xác định).
from typing import Sequence


def runs(seq: str) -> list[list]:
    out: list[list] = []
    for c in seq:
        if out and out[-1][0] == c:
            out[-1][1] += 1
        else:
            out.append([c, 1])
    return out


def rule_signal(history: str, predictable: Sequence[str]) -> str | None:
    """Ký hiệu luật dự đoán cho ván kế, hoặc None (history rỗng, không đúng 2 predictable, ký hiệu cuối ngoài predictable)."""
    if len(predictable) != 2 or not history or history[-1] not in predictable:
        return None
    r = runs(history)
    last_sym, cur = r[-1]
    target = r[-3][1] if len(r) >= 3 else (r[-2][1] if len(r) == 2 else None)
    if target is None or cur < target:
        return last_sym
    return predictable[1] if last_sym == predictable[0] else predictable[0]


def repeat_match(history: str, predictable: Sequence[str]) -> tuple[str | None, int]:
    """Lặp lại: tìm đuôi DÀI NHẤT của history đã xuất hiện trước đó trong chính history (cùng shoe); dự đoán ký hiệu
    đứng ngay sau lần xuất hiện GẦN NHẤT của đuôi đó. 1221 -> 2 (đuôi "1" từng đứng trước 2); 12212 -> 2 ("12" -> 2);
    1222 -> 2; 12221 -> 2. Ký hiệu đứng sau phải thuộc predictable (ngoài ra: bỏ qua lần xuất hiện đó).
    Trả (ký hiệu, độ dài k của đuôi khớp = "độ mạnh" của hình); không có -> (None, 0)."""
    n = len(history)
    for k in range(n - 1, 0, -1):
        tail = history[-k:]
        i = history.rfind(tail, 0, n - 1)       # lần xuất hiện trước đó, phải còn ký tự đứng sau
        while i != -1:
            nxt = history[i + k]
            if nxt in predictable:
                return nxt, k
            i = history.rfind(tail, 0, i + k - 1) if i > 0 else -1
    return None, 0


def repeat_signal(history: str, predictable: Sequence[str]) -> str | None:
    return repeat_match(history, predictable)[0]


def mirror_match(history: str, predictable: Sequence[str]) -> tuple[str | None, int]:
    """Đối xứng: đuôi có dạng gương (nửa sau = nửa trước đảo ngược, độ dài mỗi nửa L >= 2, L lớn nhất); dự đoán ký hiệu
    ở vị trí đối xứng tiếp theo = ký tự đứng ngay trước nửa trước (…x [12][21] -> x). Trả (ký hiệu, L); không có -> (None, 0)."""
    n = len(history)
    for L in range(n // 2, 1, -1):
        if history[-L:] == history[-2 * L:-L][::-1] and n > 2 * L:
            nxt = history[-2 * L - 1]
            return (nxt, L) if nxt in predictable else (None, 0)
    return None, 0


def mirror_signal(history: str, predictable: Sequence[str]) -> str | None:
    return mirror_match(history, predictable)[0]


RULES = {"run": rule_signal, "repeat": repeat_signal, "mirror": mirror_signal}
# Độ mạnh của hình (độ dài khớp) cho báo cáo theo độ mạnh; luật không có thì không có báo cáo này.
STRENGTH = {"repeat": lambda h, p: repeat_match(h, p)[1], "mirror": lambda h, p: mirror_match(h, p)[1]}


def blend_pick(result: dict, signal: str | None, weight: float, predictable: Sequence[str]) -> tuple[str | None, float | None]:
    """Trộn % của pattern-v1 với luật: pct'[x] = (1 - weight) * pct[x] + weight * (x == signal).

    Chỉ trộn khi pattern-v1 có dự đoán (giữ độ phủ như pattern-v1); không có signal thì giữ nguyên.
    Hòa nhau ⇒ giữ pick của pattern-v1. Trả (pick, % sau trộn của pick).
    """
    chosen = result.get("chosen")
    if not chosen:
        return None, None
    pct = {s: float(chosen["pct"].get(s) or 0.0) for s in predictable}
    if signal is None:
        return result["pick"], pct[result["pick"]]
    mixed = {s: (1 - weight) * p + (weight if s == signal else 0.0) for s, p in pct.items()}
    top = max(mixed.values())
    winners = [s for s, v in mixed.items() if v == top]
    pick = result["pick"] if result["pick"] in winners else winners[0]
    return pick, mixed[pick]
