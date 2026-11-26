# src/patterns/dataset.py
import logging
from pathlib import Path

import pandas as pd
from sqlalchemy import text

from .config import MAX_GAP, RESET_ON_ROAD_DROP
from .db import engine

log = logging.getLogger("pattern")

CACHE = Path(__file__).parent / "data" / "sessions.parquet"

QUERY = text("""
    SELECT gs.game_session_id, gs.stream_id, gs.road_shoe, gs.road_count, gs.created_at, COALESCE(gs.ended_at, gs.created_at) AS happened_at,
           gs.result, l.lobby_name, c.category_name
    FROM game_sessions gs
    JOIN streams s ON s.stream_id = gs.stream_id
    JOIN categories c ON c.category_id = s.category_id
    JOIN lobbies l ON l.lobby_id = c.lobby_id
    WHERE gs.result IS NOT NULL
      AND gs.created_at >= :since
      AND gs.status = 'FINISHED'
    ORDER BY gs.stream_id, gs.road_shoe, gs.road_count
""")


def load_sessions(since: str = "2026-01-01", refresh: bool = False, source: str = "file") -> pd.DataFrame:
    """source='file': đọc parquet (không có thì lấy từ DB và lưu); 'db': luôn lấy từ DB (không ghi file)."""
    if source == "file" and CACHE.exists() and not refresh:
        df = pd.read_parquet(CACHE)
        if {"lobby_name", "category_name", "happened_at"} <= set(df.columns):
            return df
        log.warning("File cache %s thiếu cột lobby_name / category_name / happened_at (bản cũ): lấy lại từ DB", CACHE)
    df = pd.read_sql(QUERY, engine(), params={"since": since})
    if df.empty:
        info = pd.read_sql(text("SELECT status, count(*) AS n, count(result) AS co_result, min(created_at) AS som_nhat, max(created_at) AS muon_nhat "
                                "FROM game_sessions GROUP BY status"), engine())
        log.warning("Không có ván FINISHED có result từ %s. game_sessions theo status:\n%s\nDữ liệu cũ hơn thì dùng --since YYYY-MM-DD.", since, info.to_string(index=False))
    if source == "file":
        CACHE.parent.mkdir(exist_ok=True)
        df.to_parquet(CACHE, index=False)
    return df


def add_segments(df: pd.DataFrame) -> pd.DataFrame:
    """Gán số đoạn (một đoạn = một chuỗi liền mạch, bảng đếm không nối qua ranh giới đoạn).

    Có road_shoe: đoạn = (stream_id, road_shoe), sắp theo road_count (số).
    Thiếu road_shoe (file parquet cũ): đoán đoạn theo khoảng cách thời gian (MAX_GAP) / road_count giảm và CẢNH BÁO.
    Cột `segment` tăng dần theo thứ tự thời gian của ván đầu đoạn trong từng stream.
    """
    if "road_shoe" in df.columns and df["road_shoe"].notna().all():
        df = df.sort_values(["stream_id", "road_shoe", "road_count"]).copy()
        df["segment"] = df.groupby(["stream_id", "road_shoe"], sort=False).ngroup()
        return df

    log.warning("Dữ liệu THIẾU road_shoe: chia chuỗi theo khoảng cách thời gian (%s) / road_count giảm, "
                "có thể khác shoe thật. Chạy lại với --source db (hoặc --refresh) để có road_shoe.", MAX_GAP)
    df = df.sort_values(["stream_id", "created_at", "road_count"]).copy()
    brk = df["stream_id"].ne(df["stream_id"].shift()) | (df["created_at"].diff() > MAX_GAP)
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