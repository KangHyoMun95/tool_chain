# src/ai/pattern_backtest.py
from collections import defaultdict
import pandas as pd

from config import MAX_LEN, MIN_LEN
from pattern import PatternStats
from pattern_predict import load_clean

def main():
    df = load_clean(refresh=False).sort_values("created_at")   # thứ tự thời gian toàn cục
    stats = PatternStats()
    recent = defaultdict(str)                                  # segment -> tối đa MAX_LEN kết quả gần nhất
    rows = []

    for seg, res in zip(df["segment"], df["result"]):
        before = recent[seg]
        if len(before) >= MIN_LEN:
            best = stats.analyze(before)["best"]
            if best:
                rows.append({**best, "actual": res, "hit": best["result"] == res})
        stats.add_result(before, res)
        recent[seg] = (before + res)[-MAX_LEN:]

    r = pd.DataFrame(rows)
    print(f"{len(r)} lần chọn, tỉ lệ đúng thực tế: {r['hit'].mean():.2%}")
    print(f"% hiển thị trung bình: {r['pct'].mean():.2%}")
    print(f"Mốc so sánh — luôn chọn kết quả phổ biến nhất: {r['actual'].value_counts(normalize=True).max():.2%}\n")

    r["bucket"] = pd.cut(r["pct"], [0, .5, .6, .7, .8, .9, 1.0], include_lowest=True)
    print("Theo mức % hiển thị:")
    print(r.groupby("bucket", observed=True).agg(so_lan=("hit", "size"),
                                                 pct_hien_thi=("pct", "mean"),
                                                 dung_thuc_te=("hit", "mean")).round(4))
    print("\nTheo độ dài trượt được chọn:")
    print(r.groupby("length").agg(so_lan=("hit", "size"),
                                  pct_hien_thi=("pct", "mean"),
                                  dung_thuc_te=("hit", "mean")).round(4))

if __name__ == "__main__":
    main()