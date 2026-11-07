import redis
import hashlib, json, time, os
from contract import TICK_STREAM, STREAM_MAXLEN, latest_key, dedup_key

REDIS_URL = os.environ.get("REDIS_URL")
if not REDIS_URL:
    raise RuntimeError("Thiếu REDIS_URL, ví dụ redis://:123456@localhost:6379")

r = redis.Redis.from_url(REDIS_URL, decode_responses=True)
r.ping()

def publish(item_id: str, data: dict, source_ts: float) -> bool:
    raw = json.dumps(data, sort_keys=True, separators=(",", ":"))
    h = hashlib.sha1(f"{item_id}|{source_ts}|{raw}".encode()).hexdigest()

    if not r.set(dedup_key(h), 1, nx=True, ex=60):
        return False

    tick = json.dumps({"id": h, "item_id": item_id, "ts": source_ts, "data": data},
                      separators=(",", ":"))
    pipe = r.pipeline(transaction=False)
    pipe.xadd(TICK_STREAM, {"item_id": item_id, "tick": tick},
              maxlen=STREAM_MAXLEN, approximate=True)
    pipe.set(latest_key(item_id), tick, ex=3600)
    pipe.execute()
    return True
