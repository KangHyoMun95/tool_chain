# apps/crawl-agent/src/crawl_agent/contract.py
TICK_STREAM = "ticks"
STREAM_MAXLEN = 500_000   # giới hạn bộ nhớ Redis

def latest_key(item_id: str) -> str: return f"latest:{item_id}"
def dedup_key(h: str) -> str: return f"dedup:{h}"