# src/patterns/pattern_predict.py
import json
import logging
from datetime import datetime, timezone

from config import MAX_LEN, MIN_LEN, MAX_GAP, IGNORE
from dataset import load_sessions, add_segments
from pattern import PatternStats

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("pattern")

def load_clean(refresh: bool = True):
    df = add_segments(load_sessions(refresh=refresh))     # tách đoạn TRƯỚC khi bỏ T
    df = df[~df["result"].isin(IGNORE)]
    assert df["result"].str.len().eq(1).all(), "result phải là 1 ký tự (B/P...)"
    return df

def build_stats(df) -> PatternStats:
    stats = PatternStats()
    for _, seg in df.groupby("segment", sort=False):
        stats.add_sequence("".join(seg["result"]))
    return stats

def pretty(payload: dict) -> str:
    lines = [f"stream {payload['stream_id']}  recent={payload['recent']}"]
    for w in payload["windows"]:
        pct = "  ".join(f"{k}:{v:.1%}" for k, v in w["pct"].items()) or "-"
        lines.append(f"  trượt {w['length']:>2}  {w['pattern']:<10}  n={w['n']:<6} {pct}")
    b = payload["best"]
    lines.append(f"  => {b['result']} {b['pct']:.1%} (trượt {b['length']}, n={b['n']})" if b else "  => không đủ dữ liệu")
    return "\n".join(lines)

def main():
    df = load_clean()
    stats = build_stats(df)
    log.info("bảng đếm: %d pattern từ %d kết quả", len(stats.counts), len(df))

    now = datetime.now(timezone.utc)
    for sid, sdf in df.groupby("stream_id"):
        last_seg = sdf[sdf["segment"] == sdf["segment"].iloc[-1]]
        last_at = last_seg["created_at"].iloc[-1]
        if now - last_at > MAX_GAP:
            log.info("stream %s: ngưng từ %s, bỏ qua", sid, last_at)
            continue

        recent = "".join(last_seg["result"].tail(MAX_LEN))
        if len(recent) < MIN_LEN:
            continue

        payload = {
            "stream_id": int(sid),
            "generated_at": now.isoformat(),
            "last_result_at": last_at.isoformat(),
            **stats.analyze(recent),
        }
        log.info("\n%s", pretty(payload))
        log.info("json %s", json.dumps(payload, ensure_ascii=False))   # dòng này chính là nội dung jsonb sau này

if __name__ == "__main__":
    main()