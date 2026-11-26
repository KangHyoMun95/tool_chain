# src/patterns/pattern_backtest.py
# Backtest pattern-v1 dùng CHUNG hàm thuần choose_pick với service. Mỗi ván chỉ dùng dữ liệu TRƯỚC nó:
# bảng đếm riêng từng stream, chuỗi theo (stream, shoe) sắp theo round, bỏ ignore_in_pattern, không nối qua shoe.
# Ký hiệu predictable / ignore_in_pattern / draw lấy từ config/categories theo category của stream (stream thiếu cấu hình bị bỏ qua).
# Baseline: luôn chọn ký hiệu predictable xuất hiện nhiều nhất (duy nhất) trong lịch sử của stream tính đến thời điểm đó.
import logging

import pandas as pd

from .category_config import CategoryRegistry
from .config import MAX_LEN, MIN_LEN
from .dataset import add_segments, load_sessions
from .pattern import PatternStats, choose_pick
from .run_rule import RULES, blend_pick

log = logging.getLogger("pattern")


def _epoch(ts) -> float:
    """created_at (naive = UTC) -> epoch giây."""
    t = pd.Timestamp(ts)
    return (t.tz_localize("UTC") if t.tzinfo is None else t).timestamp()


def run(df: pd.DataFrame, registry: CategoryRegistry, half_life_minutes: int | None = None, shoe_weight: int = 1,
        rule_weights: tuple[float, ...] = (), rules: tuple[str, ...] = ("run",)) -> tuple[pd.DataFrame, int]:
    """df đã có cột segment (xem add_segments) và lobby_name / category_name. Trả (bảng mỗi ván có dự đoán, tổng số ván).

    half_life_minutes: bán rã trọng số theo độ mới (None = tắt, đúng pattern-v1); shoe_weight: hệ số shoe hiện tại (chỉ khi có half_life).
    Thời điểm của ván = cột happened_at (ended_at, như rebuild của service) nếu có, không thì created_at.
    """
    rows = []
    time_col = "happened_at" if "happened_at" in df.columns else "created_at"
    for sid, sdf in df.groupby("stream_id", sort=False):
        cfg = registry.get(str(sdf["lobby_name"].iloc[0]), str(sdf["category_name"].iloc[0]))
        if cfg is None:
            log.error("Bỏ qua stream %s: category %r / %r không có file định nghĩa trong config/categories",
                      sid, sdf["lobby_name"].iloc[0], sdf["category_name"].iloc[0])
            continue
        stats = PatternStats(cfg.predictable, half_life_minutes=half_life_minutes)
        seen = {s: 0 for s in cfg.predictable}                   # lịch sử cộng dồn của stream (cho baseline)
        # Các shoe/đoạn của stream theo thứ tự thời gian của ván đầu; trong đoạn theo round
        for _, seg in sorted(sdf.groupby("segment"), key=lambda kv: kv[1]["created_at"].min()):
            before = ""
            stats.begin_shoe()
            for res, created in zip(*(seg.sort_values("road_count")[c] for c in ("result", time_col))):
                if res not in cfg.results:
                    log.warning("Bỏ qua ván của stream %s: result %r không thuộc results của %s", sid, res, cfg.key)
                    continue
                row = {"stream_id": sid, "actual": res, "is_draw": res in cfg.draw, "pattern_pick": None, "baseline_pick": None}
                signals = {name: RULES[name](before, cfg.predictable) for name in rules}   # luật hình thù (độc lập với pattern-v1)
                for name, sig in signals.items():
                    row[f"rule_{name}"] = sig
                if len(before) >= MIN_LEN:
                    wl = (lambda pats, now=_epoch(created): stats.wlookup(pats, shoe_weight, now)) if half_life_minutes else None
                    p = choose_pick(before, stats.lookup, cfg.predictable, wlookup=wl)
                    if p["pick"]:
                        row.update(pattern_pick=p["pick"], pct=p["confidence"], length=p["chosen"]["k"], n=p["chosen"]["occurrences"])
                        for name, sig in signals.items():
                            for w in rule_weights:
                                row[f"blend_{name}_{w}"] = blend_pick(p, sig, w, cfg.predictable)[0]
                top = max(seen.values())
                winners = [s for s, n in seen.items() if n == top]
                if len(winners) == 1:
                    row["baseline_pick"] = winners[0]
                rows.append(row)
                stats.add_result(before, res, _epoch(created))
                if res in seen:
                    seen[res] += 1
                if res not in cfg.ignore_in_pattern:
                    before = (before + res)[-MAX_LEN:]
    return pd.DataFrame(rows), len(rows)


def _summary(name: str, r: pd.DataFrame, col: str, total: int) -> dict:
    picked = r[r[col].notna()]
    scored = picked[~picked["is_draw"]]                         # ván ra kết quả "hòa" (draw) chưa tính đúng/sai
    hit = (scored[col] == scored["actual"]).sum()
    return {
        "mô hình": name, "ván có dự đoán": len(picked), "độ phủ": f"{len(picked) / total:.1%}" if total else "-",
        "đúng": int(hit), "sai": len(scored) - int(hit), "hòa (draw)": len(picked) - len(scored),
        "tỉ lệ đúng": f"{hit / len(scored):.2%}" if len(scored) else "-",
    }


def main(registry: CategoryRegistry, source: str = "file", refresh: bool = False,
         half_life_minutes: int | None = None, shoe_weight: int = 1,
         rule_weights: tuple[float, ...] = (), rules: tuple[str, ...] = ("run",)) -> None:
    df = add_segments(load_sessions(source=source, refresh=refresh))
    r, total = run(df, registry, half_life_minutes, shoe_weight, rule_weights, rules)
    weighting = f"half-life {half_life_minutes} phút, shoe_weight {shoe_weight}" if half_life_minutes else "tắt (pattern-v1)"
    print(f"{total} ván, {df['stream_id'].nunique()} stream (nguồn: {source}); trọng số theo độ mới: {weighting}\n")
    if not total:
        print("Không có ván nào để backtest: DB trả 0 ván FINISHED có result (từ 2026-01-01), hoặc mọi stream bị bỏ qua vì category không có file trong config/categories. "
              "Kiểm tra DATABASE_URL_READONLY có trỏ đúng DB có dữ liệu không và log ERROR phía trên.")
        return
    print(pd.DataFrame([_summary("pattern-v1", r, "pattern_pick", total),
                        _summary("baseline (nhiều hơn trong lịch sử)", r, "baseline_pick", total),
                        *[_summary(f"luật {n} (riêng)", r, f"rule_{n}", total) for n in rules],
                        *[_summary(f"pattern-v1 + {n} (w={w})", r, f"blend_{n}_{w}", total) for n in rules for w in rule_weights]]).to_string(index=False))

    both = r[r["pattern_pick"].notna() & r["baseline_pick"].notna() & ~r["is_draw"]]
    skipped = int((r["pattern_pick"].notna() & r["baseline_pick"].isna()).sum())
    if len(both):
        print(f"\nCùng một tập ván (pattern có dự đoán và baseline có ký hiệu nhiều nhất duy nhất): {len(both)} ván, bỏ qua {skipped} ván do hòa số lần trong lịch sử")
        print(f"  pattern-v1: {(both['pattern_pick'] == both['actual']).mean():.2%}   baseline: {(both['baseline_pick'] == both['actual']).mean():.2%}")

    p = r[r["pattern_pick"].notna() & ~r["is_draw"]].copy()
    if p.empty:
        return
    p["hit"] = p["pattern_pick"] == p["actual"]
    print(f"\n% hiển thị trung bình: {p['pct'].mean():.2%}")
    p["bucket"] = pd.cut(p["pct"], [0, .5, .6, .7, .8, .9, 1.0], include_lowest=True)
    print("\nTheo mức % hiển thị:")
    print(p.groupby("bucket", observed=True).agg(so_lan=("hit", "size"), pct_hien_thi=("pct", "mean"),
                                                 dung_thuc_te=("hit", "mean")).round(4))
    print("\nTheo độ dài đuôi k được chọn:")
    print(p.groupby("length").agg(so_lan=("hit", "size"), pct_hien_thi=("pct", "mean"),
                                  dung_thuc_te=("hit", "mean")).round(4))
