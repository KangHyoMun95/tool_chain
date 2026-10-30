# apps/crawl-agent/contract.py
# Phải khớp packages/shared/src/realtime.ts (sửa một bên thì sửa bên kia trong cùng commit).
from typing import Optional, TypedDict, Union

TICK_STREAM = "ticks"
STREAM_MAXLEN = 500_000   # giới hạn bộ nhớ Redis

def latest_key(item_id: str) -> str: return f"latest:{item_id}"
def dedup_key(h: str) -> str: return f"dedup:{h}"


class CrawlPayload(TypedDict):
    """Payload gửi liên tục, nhiều lần cho cùng một ván.

    Ghi DB: lobby_name, category_name, stream_name, stream_shoe, stream_round, streamer_id, actual_result.
    Chỉ hiển thị (chỉ đi qua realtime/SSE, không ghi DB): player_count, player_value, status, total_B/P/T.
    stream_id là id text phía nguồn (không phải streams.stream_id), ingestion bỏ qua.
    """
    lobby_name: str
    category_name: str
    stream_id: str
    stream_name: str
    stream_shoe: Union[int, str]       # số nguyên (shoe hiện tại); round có thể reset khi đổi shoe
    stream_round: Union[int, str]      # số nguyên (= game_sessions.road_count)
    streamer_id: str
    player_count: int
    player_value: float
    status: str
    actual_result: Optional[str]       # None khi ván chưa có kết quả
    total_B: int
    total_P: int
    total_T: int


def normalize_name(s: str) -> str:
    """Trim, gộp khoảng trắng liên tiếp thành 1, lowercase (khớp normalizeName() bên api). Chỉ để chống trùng, không lưu."""
    return " ".join(s.split()).lower()


def build_key_id(lobby_name: str, category_name: str, stream_name: str) -> str:
    """item_id của tick: <lobby>|<category>|<stream> đã chuẩn hoá."""
    return "|".join(normalize_name(x) for x in (lobby_name, category_name, stream_name))
