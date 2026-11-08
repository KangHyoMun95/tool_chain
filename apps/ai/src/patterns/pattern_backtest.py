# src/patterns/pattern_backtest.py
# Backtest pattern-v1 dùng CHUNG hàm thuần choose_pick với service. Mỗi ván chỉ dùng dữ liệu TRƯỚC nó:
# bảng đếm riêng từng stream, chuỗi theo (stream, shoe) sắp theo round, bỏ T, không nối qua shoe.
# Baseline: luôn chọn kết quả (B/P) xuất hiện nhiều hơn trong lịch sử của stream tính đến thời điểm đó.
import logging

import pandas as pd

from .config import MAX_LEN, MIN_LEN
from .dataset import add_segments, load_sessions
from .pattern import PatternStats, choose_pick

log = logging.getLogger("pattern")


def run(df: pd.DataFrame) -> tuple[pd.DataFrame, int]:
    """df đã có cột segment (xem add_segments). Trả (bảng mỗi ván có dự đoán, tổng số ván)."""
    rows = []
    for sid, sdf in df.groupby("stream_id", sort=False):
        stats = PatternStats()
        seen = {"B": 0, "P": 0}                                  # lịch sử cộng dồn của stream (cho baseline)
        # Các shoe/đoạn của stream theo thứ tự thời gian của ván đầu; trong đoạn theo round
        for _, seg in sorted(sdf.groupby("segment"), key=lambda kv: kv[1]["created_at"].min()):
            before = ""
            for res in seg.sort_values("road_count")["result"]:
                row = {"stream_id": sid, "actual": res, "pattern_pick": None, "baseline_pick": None}
                if len(before) >= MIN_LEN:
                    p = choose_pick(before, stats.lookup)
                    if p["pick"]:
                        row.update(pattern_pick=p["pick"], pct=p["confidence"], length=p["chosen"]["k"], n=p["chosen"]["occurrences"])
                if seen["B"] != seen["P"]:
                    row["baseline_pick"] = "B" if seen["B"] > seen["P"] else "P"
                rows.append(row)
                stats.add_result(before, res)
                if res in seen:
                    seen[res] += 1
                    before = (before + res)[-MAX_LEN:]
    return pd.DataFrame(rows), len(rows)


def _summary(name: str, r: pd.DataFrame, col: str, total: int) -> dict:
    picked = r[r[col].notna()]
    scored = picked[picked["actual"] != "T"]                    # ván ra T chưa tính đúng/sai
    hit = (scored[col] == scored["actual"]).sum()
    return {
        "mô hình": name, "ván có dự đoán": len(picked), "độ phủ": f"{len(picked) / total:.1%}" if total else "-",
        "đúng": int(hit), "sai": len(scored) - int(hit), "hòa (T)": len(picked) - len(scored),
        "tỉ lệ đúng": f"{hit / len(scored):.2%}" if len(scored) else "-",
    }


def main(source: str = "file", refresh: bool = False) -> None:
    df = add_segments(load_sessions(source=source, refresh=refresh))
    r, total = run(df)
    print(f"{total} ván, {df['stream_id'].nunique()} stream (nguồn: {source})\n")
    print(pd.DataFrame([_summary("pattern-v1", r, "pattern_pick", total),
                        _summary("baseline (nhiều hơn trong lịch sử)", r, "baseline_pick", total)]).to_string(index=False))

    both = r[r["pattern_pick"].notna() & r["baseline_pick"].notna() & (r["actual"] != "T")]
    skipped = int((r["pattern_pick"].notna() & r["baseline_pick"].isna()).sum())
    if len(both):
        print(f"\nCùng một tập ván (pattern có dự đoán và baseline không hòa B/P): {len(both)} ván, bỏ qua {skipped} ván do B = P trong lịch sử")
        print(f"  pattern-v1: {(both['pattern_pick'] == both['actual']).mean():.2%}   baseline: {(both['baseline_pick'] == both['actual']).mean():.2%}")

    p = r[r["pattern_pick"].notna() & (r["actual"] != "T")].copy()
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
