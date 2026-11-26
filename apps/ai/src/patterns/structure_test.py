# src/patterns/structure_test.py
# Kiểm định hoán vị: dữ liệu thật có CẤU TRÚC (hình) hơn dữ liệu xáo trộn không? Chỉ để phân tích offline, không đụng service.
# Mỗi shoe: chuỗi ký hiệu (đã bỏ ignore_in_pattern, nên ván hòa của baccarat không xuất hiện). Null = xáo trộn thứ tự TRONG shoe
# (giữ nguyên số lượng từng ký hiệu), n_perm lần. Đo: (a) tỉ lệ "ván sau trùng ván trước"; (b) tỉ lệ đúng của từng luật khi
# hình đủ mạnh (repeat: k >= min_repeat; mirror: L >= min_mirror; run: mọi ván). p = tỉ lệ lần xáo trộn có kết quả >= thật (một phía).
import logging
import random

import pandas as pd

from .category_config import CategoryRegistry
from .config import MAX_LEN
from .run_rule import mirror_match, repeat_match, rule_signal

log = logging.getLogger("pattern")


def _shoes(df: pd.DataFrame, cfg, ignore) -> list[str]:
    out = []
    for _, seg in df.groupby("segment"):
        seq = "".join(r for r in seg.sort_values("road_count")["result"] if r in cfg.results and r not in ignore)
        if len(seq) > 3:
            out.append(seq)
    return out


def _measure(shoes: list[str], predictable, min_repeat: int, min_mirror: int) -> dict:
    same = tot = 0
    hits = {"repeat": [0, 0], "mirror": [0, 0], "run": [0, 0]}      # [đúng, số lần hình kích hoạt]
    for seq in shoes:
        for i in range(1, len(seq)):
            if seq[i] not in predictable:
                continue
            before, actual = seq[max(0, i - MAX_LEN):i], seq[i]
            tot += 1
            same += before[-1] == actual
            s, k = repeat_match(before, predictable)
            if s and k >= min_repeat:
                hits["repeat"][1] += 1
                hits["repeat"][0] += s == actual
            s, k = mirror_match(before, predictable)
            if s and k >= min_mirror:
                hits["mirror"][1] += 1
                hits["mirror"][0] += s == actual
            s = rule_signal(before, predictable)
            if s:
                hits["run"][1] += 1
                hits["run"][0] += s == actual
    m = {"same": same / tot if tot else float("nan"), "n": tot}
    for name, (h, n) in hits.items():
        m[name], m[f"{name}_n"] = (h / n if n else float("nan")), n
    return m


def main(df: pd.DataFrame, registry: CategoryRegistry, n_perm: int = 100, min_repeat: int = 4, min_mirror: int = 3, seed: int = 1) -> None:
    rng = random.Random(seed)
    rows = []
    for (lobby, category), cdf in df.groupby(["lobby_name", "category_name"]):
        cfg = registry.get(str(lobby), str(category))
        if cfg is None or len(cfg.predictable) != 2:
            continue
        shoes = _shoes(cdf, cfg, set(cfg.ignore_in_pattern))
        real = _measure(shoes, cfg.predictable, min_repeat, min_mirror)
        null = []
        for _ in range(n_perm):
            shuffled = []
            for s in shoes:
                c = list(s)
                rng.shuffle(c)
                shuffled.append("".join(c))
            null.append(_measure(shuffled, cfg.predictable, min_repeat, min_mirror))
        nd = pd.DataFrame(null)
        for key, label in (("same", "ván sau trùng ván trước"), ("run", "luật run"),
                           ("repeat", f"luật repeat (k>={min_repeat})"), ("mirror", f"luật mirror (L>={min_mirror})")):
            r, mu, sd = real[key], nd[key].mean(), nd[key].std()
            rows.append({"category": cfg.key, "phép đo": label, "số ván": real["n"] if key == "same" else real[f"{key}_n"],
                         "thật": f"{r:.4f}", "xáo trộn (TB)": f"{mu:.4f}", "độ lệch chuẩn": f"{sd:.4f}",
                         "z": f"{(r - mu) / sd:+.2f}" if sd else "-",
                         "p (>= thật)": f"{(nd[key] >= r).mean():.3f}"})
    if not rows:
        print("Không có category 2 ký hiệu predictable nào để kiểm định.")
        return
    print(f"\nKiểm định hoán vị ({n_perm} lần xáo trộn trong từng shoe, seed {seed}); z ≈ 0 và p không nhỏ = giống dữ liệu ngẫu nhiên:\n")
    print(pd.DataFrame(rows).to_string(index=False))
    print("\nLưu ý: nhiều phép đo cùng lúc nên vài dòng p < 0.05 vẫn có thể là may rủi; chỉ tin khi p rất nhỏ (vd < 0.005) và lặp lại ở dữ liệu khác.")
