# src/ai/dataset.py
from pathlib import Path
import pandas as pd
from sqlalchemy import text
from db import engine
from patterns.config import RESET_ON_ROAD_DROP, MAX_GAP

CACHE = Path("data/sessions.parquet")

QUERY = text("""
    SELECT game_session_id, stream_id, road_count, created_at, result
    FROM game_sessions
    WHERE result IS NOT NULL
      AND created_at >= :since
      AND status = 'FINISHED'
    ORDER BY stream_id, created_at
""")

def load_sessions(since: str = "2026-01-01", refresh: bool = False) -> pd.DataFrame:
    """Lấy từ DB một lần, lưu parquet; các lần thử nghiệm sau đọc file cho nhanh."""
    if CACHE.exists() and not refresh:
        return pd.read_parquet(CACHE)
    df = pd.read_sql(QUERY, engine(), params={"since": since})
    CACHE.parent.mkdir(exist_ok=True)
    df.to_parquet(CACHE, index=False)
    return df

def add_segments(df: pd.DataFrame) -> pd.DataFrame:
    """Gán số đoạn: đổi stream, cách quá MAX_GAP, hoặc road_count giảm thì sang đoạn mới."""
    df = df.sort_values(["stream_id", "created_at", "road_count"]).copy()
    new_stream = df["stream_id"].ne(df["stream_id"].shift())
    gap = df["created_at"].diff() > MAX_GAP
    brk = new_stream | gap
    if RESET_ON_ROAD_DROP:
        brk |= df["road_count"].diff() < 0
    df["segment"] = brk.cumsum()
    return df

# src/ai/dataset.py (tiếp)
def _streak(s: pd.Series) -> pd.Series:
    """Độ dài chuỗi liên tiếp cùng kết quả, tính tới phiên ngay trước."""
    prev = s.shift(1)
    run = (prev != prev.shift(1)).cumsum()
    return prev.groupby(run).cumcount() + 1

def build_features(df: pd.DataFrame, n_lags: int = 10):
    df = df.sort_values(["stream_id", "created_at"]).copy()
    df["result"] = df["result"].astype("category")
    classes = list(df["result"].cat.categories)
    df["y"] = df["result"].cat.codes

    g = df.groupby("stream_id")["y"]
    feats = []

    # Kết quả của n phiên trước
    for k in range(1, n_lags + 1):
        df[f"lag_{k}"] = g.shift(k)
        feats.append(f"lag_{k}")

    # Tỉ lệ mỗi kết quả trong 20 phiên gần nhất
    for i, c in enumerate(classes):
        col = f"freq20_{c}"
        df[col] = g.transform(lambda s, i=i:(s.shift(1) == i).astype(float)
                                              .rolling(20, min_periods=5).mean())
        feats.append(col)

    # Chuỗi liên tiếp hiện tại
    df["streak"] = df.groupby("stream_id", group_keys=False)["y"].apply(_streak)
    feats.append("streak")

    # Thời gian
    df["hour"] = df["created_at"].dt.hour
    feats.append("hour")

    df = df.dropna(subset=[f"lag_{n_lags}"])   # bỏ các phiên đầu chưa đủ lịch sử
    return df, feats, classes