"""
Nguồn dữ liệu:
  - actual_result: roadInfo.bigRoads[0].bS (bigRoads[0] là kết quả của ván roadInfo.gameRound), ánh xạ ở RESULT_MAP.
  - totals: roadInfo.winCounts lấy TRỰC TIẾP (không cộng dồn), ánh xạ theo vị trí ở TOTALS_SYMBOLS. Message khác không có
    winCounts thì giữ totals gần nhất của bàn (để portal không ẩn khung tỉ lệ ở các tick khác).
  - status: ánh xạ eventType ở STATUS_MAP (một chỗ duy nhất).
"""
import logging
import os
import time
from models.sx_lobby.message.base_detection import BaseDetection

logger = logging.getLogger("SXGroup3")

ENV_LOBBY = "GAME_GROUP_ID_3_LOBBY"
ENV_CATEGORY = "GAME_GROUP_ID_3_CATEGORY"

# eventType của nguồn -> status chuẩn. Muốn đổi tên trạng thái thì chỉ sửa bảng này.
STATUS_MAP = {
    "GP_NEW_GAME_START": "IN_PROGRESS",
    "GP_RANDOM_PAY": "DONE",
    "GP_ONE_CARD_DRAWN": "GET_RESULT",
    "GP_WINNER": "SUMMARY_RESULT",
}
# Status chỉ để hiển thị (giống SXLobby): message đầu tiên của ván mới khi chưa có eventType.
STARTING_NEW_ROUND = "STARTING_NEW_ROUND"
SEEN_ROUNDS_MAX = 16

RESULT_MAP = {"Big": "T", "Small": "X", "Triple": "B"}
TOTALS_SYMBOLS = ("T", "X", "B")

PENDING_TIMEOUT_SEC = 60
RESOLVED_MAX = 16

FORMAT_DATETIME = "%Y-%m-%d %H:%M:%S"


def resolve_names(lobby_name: str | None = None, category_name: str | None = None) -> tuple[str, str]:
    """Tham số truyền vào, nếu không có thì lấy từ env. Thiếu / rỗng -> ValueError nêu rõ biến nào."""
    lobby = (lobby_name or os.environ.get(ENV_LOBBY) or "").strip()
    category = (category_name or os.environ.get(ENV_CATEGORY) or "").strip()
    missing = [n for n, v in ((ENV_LOBBY, lobby), (ENV_CATEGORY, category)) if not v]
    if missing:
        raise ValueError(f"SXGroup3: thiếu cấu hình {', '.join(missing)}")
    return lobby, category


class SXGroup3:
    lobby_name: str = None
    category_name: str = None
    stream_id: str = None
    stream_name: str = None
    stream_round: str = None
    stream_shoe: str = None
    streamer_id: str = None
    streamer_name: str = None
    streamer_country: str = None
    player_count: int = 0
    player_value: float = 0.0
    status: str = None
    actual_result: str = None
    totals: dict = None

    deliver_time: str = None
    timestamp: str = None
    stamp_time: str = None
    round_start_time: str = None
    repaint_time: str = None

    def __init__(self, lobby_name: str | None = None, category_name: str | None = None):
        self.lobby_name, self.category_name = resolve_names(lobby_name, category_name)
        # Trạng thái theo từng ván (shoe, round). Thuộc tính bắt đầu bằng "_" không đi vào payload (xem shot_message).
        self._round_status: dict = {}
        self._current_round = None
        self._seen_rounds: dict = {}
        self._pending = None
        self._pending_since = 0.0
        self._resolved: dict = {}
        self._hold = False

    def destructure_message(self, message: dict):
        parent_cls = BaseDetection(message=message)

        dealer_id = parent_cls.get_key("dealerId")
        self.streamer_name, self.streamer_country = self._get_streamer(dealer_id)
        self.streamer_id = dealer_id or self.streamer_id
        self.stream_name = parent_cls.get_key("tableName") or self.stream_name
        self.stream_round = parent_cls.get_key("gameRound") or self.stream_round
        self.stream_shoe = parent_cls.get_key("gameShoe") or self.stream_shoe
        self.stream_id = parent_cls.get_key("tableID") or self.stream_id
        self.player_count = parent_cls.get_key("betCount") or self.player_count
        self.player_value = parent_cls.get_key("currentBet") or self.player_value

        actual = self._get_actual_result(parent_cls.get_key("bigRoads"), parent_cls.get_key("gameRound"))
        self._update_status(STATUS_MAP.get(parent_cls.get_key("eventType")), actual is not None)
        self.actual_result = actual
        if self.status == STARTING_NEW_ROUND:
            self.actual_result = None
        self.totals = self._get_totals(parent_cls.get_key("winCounts"))

        self.deliver_time = parent_cls.ms_to_dt("deliverTime") or self.deliver_time
        self.timestamp = parent_cls.ms_to_dt("timestamp") or self.timestamp
        self.stamp_time = parent_cls.ms_to_dt("stampTime") or self.stamp_time
        self.round_start_time = parent_cls.ms_to_dt("roundStartTime") or self.round_start_time
        self.repaint_time = parent_cls.ms_to_dt("repaintTime") or self.repaint_time

    def _update_status(self, event_status, has_result: bool = False):
        """Giống SXLobby: status gắn với ván (shoe, round), không mang sang ván khác."""
        key = (self.stream_shoe, self.stream_round)
        if key != self._current_round:
            starting = event_status is None and self._is_new_round(self._current_round, key)
            self._current_round = key
            self._seen_rounds[key] = True
            while len(self._seen_rounds) > SEEN_ROUNDS_MAX:
                self._seen_rounds.pop(next(iter(self._seen_rounds)))
            self.status = self._round_status.get(key)
            if starting:
                self.status = STARTING_NEW_ROUND
                self._round_status[key] = STARTING_NEW_ROUND
        if event_status:
            self.status = event_status
            self._round_status[key] = event_status
            while len(self._round_status) > 8:
                self._round_status.pop(next(iter(self._round_status)))
        self._update_hold(key, event_status, has_result)

    def _update_hold(self, key, event_status, has_result: bool):
        """Message ván mới có thể đến TRƯỚC kết quả ván trước. Ván đã GP_WINNER mà chưa có kết quả -> không publish gì
        (kể cả message ván mới) cho tới khi kết quả về; GP_NEW_GAME_START của ván khác hoặc quá hạn -> bỏ chờ (miss kết quả).
        Chỉ bỏ message, không đệm: state vẫn cập nhật nên message publish kế tiếp mang trạng thái mới nhất."""
        now = time.monotonic()
        if has_result:
            self._resolved[key] = True
            while len(self._resolved) > RESOLVED_MAX:
                self._resolved.pop(next(iter(self._resolved)))
        if self._pending is not None and now - self._pending_since > PENDING_TIMEOUT_SEC:
            logger.warning("Quá %ss chưa có kết quả shoe=%s round=%s (table=%s) -> bỏ chờ",
                           PENDING_TIMEOUT_SEC, self._pending[0], self._pending[1], self.stream_id)
            self._pending = None
        if self._pending is None and event_status == STATUS_MAP["GP_WINNER"] and not has_result and key not in self._resolved:
            self._pending, self._pending_since = key, now
        if self._pending is None:
            self._hold = False
        elif key == self._pending:
            if has_result:
                self._pending = None
            self._hold = self._pending is not None
        elif event_status == STATUS_MAP["GP_NEW_GAME_START"]:
            logger.warning("Miss kết quả shoe=%s round=%s (table=%s): ván mới shoe=%s round=%s đã bắt đầu",
                           self._pending[0], self._pending[1], self.stream_id, key[0], key[1])
            self._pending = None
            self._hold = False
        else:
            self._hold = True

    def _is_new_round(self, prev, key) -> bool:
        if prev is None or key in self._seen_rounds:
            return False
        try:
            prev_round, new_round = int(prev[1]), int(key[1])
        except (TypeError, ValueError):
            return False
        return new_round > prev_round or new_round == 1

    def _get_streamer(self, dealer_id):
        """dealerId dạng 'Tên/Quốc gia/Mã'; thiếu phần nào giữ giá trị cũ."""
        if not dealer_id:
            return self.streamer_name, self.streamer_country
        parts = str(dealer_id).split("/")
        name = parts[0] if parts and parts[0] else self.streamer_name
        country = parts[1] if len(parts) > 1 and parts[1] else self.streamer_country
        return name, country

    def _get_actual_result(self, b_roads, round_of_message):
        if not isinstance(b_roads, list) or not b_roads or not isinstance(b_roads[0], dict):
            return None
        first = b_roads[0]
        raw = first.get("bigSmall")
        if raw is None:
            return None
        road_round = first.get("gameRound")
        if road_round is not None and round_of_message is not None and road_round != round_of_message:
            logger.warning("bigRoads[0].gameRound=%r khác roadInfo.gameRound=%r (table=%s) -> bỏ actual_result",
                           road_round, round_of_message, self.stream_id)
            return None
        symbol = RESULT_MAP.get(raw)
        if symbol is None:
            logger.warning("bigSmall lạ %r (table=%s shoe=%s round=%s) -> actual_result = null",
                           raw, self.stream_id, self.stream_shoe, self.stream_round)
        return symbol

    def _get_totals(self, win_counts):
        """winCounts lấy trực tiếp theo vị trí. Không có / sai dạng -> giữ totals gần nhất."""
        if not isinstance(win_counts, list) or len(win_counts) != len(TOTALS_SYMBOLS):
            if win_counts is not None:
                logger.warning("winCounts sai dạng %r (table=%s) -> giữ totals cũ", win_counts, self.stream_id)
            return self.totals
        return dict(zip(TOTALS_SYMBOLS, win_counts))

    def to_dict(self, obj):
        if isinstance(obj, dict):
            return {k: self.to_dict(v) for k, v in obj.items()}
        if isinstance(obj, (list, tuple, set)):
            return [self.to_dict(v) for v in obj]
        return obj

    @staticmethod
    def _is_empty(val):
        return not val or not str(val).strip()

    def _is_missing_fields(self):
        return (self._is_empty(self.lobby_name) or self._is_empty(self.category_name)
                or self._is_empty(self.stream_name) or self._is_empty(self.streamer_id))

    def shot_message(self):
        if self._hold or self._is_missing_fields():
            return None
        return self.to_dict({k: v for k, v in self.__dict__.items() if not k.startswith("_")})
