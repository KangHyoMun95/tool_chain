# src/patterns/shape_backtest.py
# Backtest mô hình hình dạng tự học (shape_model.py) THEO THỨ TỰ THỜI GIAN thật: mỗi ván chỉ dùng dữ liệu của các ván TRƯỚC nó,
# mô hình hình dạng học GỘP mọi stream của cùng category (xử lý ván theo thời gian toàn cục, nên không rò rỉ tương lai);
# pattern-v1 vẫn học riêng từng stream như service. Chỉ báo tỉ lệ trên những ván mô hình CÓ nhận ra hình (không gộp ván không có hình).
import logging
import math

import pandas as pd

from .category_config import CategoryRegistry
from .config import MAX_LEN, MIN_LEN
from .pattern import PatternStats, choose_pick
from .run_rule import blend_pick
from .shape_model import ShapeModel

log = logging.getLogger("pattern")


def run(df: pd.DataFrame, registry: CategoryRegistry, z_gate: float, weights: tuple[float, ...], min_n: int = 30, kmax: int = 10):
    rows, finals = [], {}
    for (lobby, category), cdf in df.groupby(["lobby_name", "category_name"]):
        cfg = registry.get(str(lobby), str(category))
        if cfg is None or len(cfg.predictable) != 2:
            continue
        model = ShapeModel(cfg.predictable, kmax=min(kmax, MAX_LEN), min_n=min_n, z_gate=z_gate)
        stats: dict[str, PatternStats] = {}
        before: dict[tuple, str] = {}
        for rec in cdf.sort_values(["created_at", "stream_id", "road_count"]).itertuples():
            res = rec.result
            if res not in cfg.results:
                continue
            key = (rec.stream_id, rec.segment)
            hist = before.get(key, "")
            st = stats.setdefault(rec.stream_id, PatternStats(cfg.predictable))
            row = {"category": cfg.key, "actual": res, "is_draw": res in cfg.draw, "pv1": None, "shape": None}
            pv1 = choose_pick(hist, st.lookup, cfg.predictable) if len(hist) >= MIN_LEN else None
            if pv1 and pv1["pick"]:
                row["pv1"] = pv1["pick"]
            sh = model.predict(hist) if len(hist) >= model.kmin else None
            if sh:
                row.update(shape=sh["pick"], p=sh["p"], k=sh["k"], n=sh["n"])
                if pv1 and pv1["pick"]:
                    for w in weights:
                        row[f"blend_{w}"] = blend_pick(pv1, sh["pick"], w, cfg.predictable)[0]
            rows.append(row)
            st.add_result(hist, res)
            model.update(hist, res)
            if res not in cfg.ignore_in_pattern:
                before[key] = (hist + res)[-MAX_LEN:]
        finals[cfg.key] = model.top_shapes()
    return pd.DataFrame(rows), finals


def _acc(d: pd.DataFrame, col: str) -> str:
    s = d[d[col].notna() & ~d["is_draw"]]
    if s.empty:
        return "-"
    n, h = len(s), int((s[col] == s["actual"]).sum())
    r = h / n
    return f"{r:.2%} ±{2 * math.sqrt(r * (1 - r) / n):.2%} (n={n}, z={(h - n / 2) / math.sqrt(n / 4):+.2f})"


def main(df: pd.DataFrame, registry: CategoryRegistry, z_gates: tuple[float, ...], weights: tuple[float, ...]) -> None:
    for z in z_gates:
        r, finals = run(df, registry, z, weights)
        if r.empty:
            print("Không có category 2 ký hiệu predictable nào để chạy.")
            return
        print(f"\n######## MÔ HÌNH HÌNH DẠNG TỰ HỌC, ngưỡng bằng chứng |z| >= {z} (học gộp mọi stream của category, đi tới theo thời gian) ########")
        for cat, d in [("TẤT CẢ", r)] + [(c, g) for c, g in r.groupby("category")]:
            fired = d[d["shape"].notna()]
            print(f"\n[{cat}] {len(d)} ván; mô hình nhận ra hình ở {len(fired)} ván ({len(fired) / len(d):.1%})")
            print(f"  CHỈ ván có hình:  hình dạng  {_acc(fired, 'shape')}")
            print(f"                    pattern-v1 {_acc(fired, 'pv1')}   (cùng những ván đó)")
            for w in weights:
                print(f"                    pattern-v1 + hình (w={w}) {_acc(fired, f'blend_{w}')}")
            print(f"  Mọi ván (để so):  pattern-v1 {_acc(d, 'pv1')}")
            for w in weights:
                both = d.copy()
                both[f"mix_{w}"] = both[f"blend_{w}"].where(both["shape"].notna(), both["pv1"]) if f"blend_{w}" in both else both["pv1"]
                print(f"                    pattern-v1 + hình (w={w}) {_acc(both, f'mix_{w}')}")
        print("\nHình mô hình tin nhất ở cuối dữ liệu (dạng chuẩn: 1 = ký hiệu đầu; 'kế tiếp=1' là tỉ lệ ván kế trùng ký hiệu đầu):")
        for cat, shapes in finals.items():
            print(f"  {cat}:")
            for key, n, rate, zz in shapes:
                print(f"    {key:<12} n={n:<5} kế tiếp=1: {rate:.3f}  z={zz:+.2f}")
