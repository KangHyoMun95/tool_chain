import logging

from config import SX_LOBBY, SX_CATEGORY_1

from models.sx_lobby.message.base_detection import BaseDetection
from datetime import datetime, timezone, timedelta

# Ký hiệu kết quả của nguồn Sexy, theo thứ tự trong winCounts (khớp results của config/categories/bacarat.json)
RESULT_SYMBOLS = ("B", "P", "T")
logger = logging.getLogger("Lobby")

VN_TZ = timezone(timedelta(hours=7))
FORMAT_DATETIME = "%Y-%m-%d %H:%M:%S"

class BigRoad:
    show_x: int = None
    show_y: int = None
    count: int = None
    road: int = None
    d_road: int = None
    stamp_time: str = None

    def __init__(self, show_x: int = None, show_y: int = None, count: int = None, road: int = None,
                 d_road: int = None, stamp_time: int = None):
        self.show_x = show_x
        self.show_y = show_y
        self.count = count
        self.road = road
        self.d_road = d_road
        self.stamp_time = datetime.fromtimestamp(stamp_time / 1000).strftime(FORMAT_DATETIME) if stamp_time is not None else None


class SXLobby:
    lobby_name: str = None
    category_name: str = None
    stream_id: str = None
    stream_name: str = None
    stream_round: str = None
    stream_shoe: str = None
    streamer_name: str = None
    streamer_country: str = None
    player_count: int = 0
    player_value: float = 0.0
    status: str = None
    actual_result: str = None
    totals: dict = None            # {"B": n, "P": n, "T": n}: tổng theo ký hiệu (winCounts của nguồn, thứ tự B, P, T)

    # More information
    i_time: int = None
    shuffle: int = None
    streamer_id: str = None
    streamer_domain: int = None
    streamer_image: str = None
    stream_hall: int = None
    stream_code: int = None
    maintenance: int = None
    support_web: int = None
    new_game: int = None
    good_road_type: int = None
    good_road_count: int = None
    prev_good_road_json: list[str] = []
    curr_good_road_json: list[str] = []
    big_roads: list[BigRoad] = []

    deliver_time: str = None
    timestamp: str = None
    stamp_time: str = None
    round_start_time: str = None
    repaint_time: str = None

    def __init__(self):
        self.lobby_name = SX_LOBBY
        self.category_name = SX_CATEGORY_1
        # Trạng thái theo TỪNG ván (shoe, round). Thuộc tính bắt đầu bằng "_" không đi vào payload (xem shot_message).
        self.totals = {}
        self._round_status: dict = {}
        self._current_round = None

    def destructure_message(self, message: dict):
        parent_cls = BaseDetection(message=message)

        self.streamer_name, self.streamer_country,_ = self._get_streamer(parent_cls.get_key("dealerId"))
        self.stream_name = parent_cls.get_key("tableName") or self.stream_name
        self.stream_round = parent_cls.get_key("gameRound") or self.stream_round
        self.stream_shoe = parent_cls.get_key("gameShoe") or self.stream_shoe
        self.stream_id = parent_cls.get_key("tableID") or self.stream_id
        self.player_count = parent_cls.get_key("betCount") or self.player_count
        self.player_value = parent_cls.get_key("betCurrent") or self.player_value
        self._update_status(self._get_status(parent_cls.get_key("eventType")))
        self.actual_result = self._get_actual_result(parent_cls.get_key("winCounts"))
        self.totals = self._get_win_counts(parent_cls.get_key("winCounts"))

        # More Information
        self.i_time = parent_cls.get_key("iTime") or self.i_time
        self.shuffle = parent_cls.get_key("shuffle") or self.shuffle
        self.streamer_id = parent_cls.get_key("dealerId") or self.streamer_id
        self.streamer_domain = parent_cls.get_key("dealerDomain") or self.streamer_domain
        self.streamer_image = parent_cls.get_key("dealerImage") or self.streamer_image
        self.stream_hall = parent_cls.get_key("gameHall") or self.stream_hall
        self.stream_code = parent_cls.get_key("gameCode") or self.stream_code
        self.maintenance = parent_cls.get_key("maintenance") or self.maintenance
        self.support_web = parent_cls.get_key("supportWeb") or self.support_web
        self.new_game = parent_cls.get_key("newGame") or self.new_game
        self.good_road_type = parent_cls.get_key("goodRoadType") or self.good_road_type
        self.good_road_count = parent_cls.get_key("goodRoadCount") or self.good_road_count
        self.prev_good_road_json = parent_cls.get_key("prevGoodRoadJson") or self.prev_good_road_json
        self.curr_good_road_json = parent_cls.get_key("currGoodRoadJson") or self.curr_good_road_json
        self.big_roads = self._get_big_roads(parent_cls.get_key("bigRoads"))

        self.deliver_time = parent_cls.ms_to_dt("deliverTime") or self.deliver_time
        self.timestamp = parent_cls.ms_to_dt("timestamp") or self.timestamp
        self.stamp_time = parent_cls.ms_to_dt("stampTime") or self.stamp_time
        self.round_start_time = parent_cls.ms_to_dt("roundStartTime") or self.round_start_time
        self.repaint_time = parent_cls.ms_to_dt("repaintTime") or self.repaint_time

    def _update_status(self, event_status):
        """Trạng thái gắn với ván (shoe, round), không mang sang ván khác.

        Message của ván mới (gameRound đổi) thường đến TRƯỚC GP_NEW_GAME_START của nó; nếu giữ status cũ thì tick đầu của ván
        mới mang SUMMARY_RESULT / GET_RESULT của ván trước, và api (chỉ cho status tiến) không bao giờ nhận IN_PROGRESS của ván mới.
        Message muộn của ván cũ (GP_WINNER, kết quả) đưa round lùi lại: khôi phục đúng status đã biết của ván đó.
        """
        key = (self.stream_shoe, self.stream_round)
        if key != self._current_round:
            self._current_round = key
            self.status = self._round_status.get(key)
        if event_status:
            self.status = event_status
            self._round_status[key] = event_status
            while len(self._round_status) > 8:   # chỉ cần vài ván gần nhất
                self._round_status.pop(next(iter(self._round_status)))

    def _get_streamer(self, dealer_id):
        if dealer_id is None:
            return [self.streamer_name, self.streamer_country, None]
        dl = dealer_id.split("/")
        return [dl[0] or self.streamer_name, dl[1] or self.streamer_country, dl[2] or None]

    @staticmethod
    def _get_status(event_type: str):
        match event_type:
            case "GP_NEW_GAME_START":
                return "IN_PROGRESS"
            case "GP_RANDOM_PAY":
                return "DONE"
            case "GP_ONE_CARD_DRAWN":
                return "GET_RESULT"
            case "GP_WINNER":
                return "SUMMARY_RESULT"
            case _:
                logger.info(f"Appear new Status {event_type}")
                return None

    def _get_win_counts(self, w_count: list[int]):
        """winCounts của nguồn: đúng 3 số theo thứ tự RESULT_SYMBOLS. Sai độ dài / thiếu ⇒ giữ totals cũ."""
        if w_count is None or len(w_count) != 3:
            return self.totals
        return dict(zip(RESULT_SYMBOLS, w_count))

    def _get_actual_result(self, win_counts: list[int]):
        if win_counts is None or len(win_counts) != 3:
            return None
        if any(v is None for v in win_counts):
            return None

        old = [self.totals.get(s, 0) for s in RESULT_SYMBOLS]
        if sum(win_counts) - sum(old) != 1:
            return None

        for symbol, new_val, old_val in zip(RESULT_SYMBOLS, win_counts, old):
            if new_val > old_val:
                return symbol
        return None

    def _get_big_roads(self, roads: list[dict]):
        if roads is None:
            return self.big_roads
        return [
            BigRoad(
                show_x=i.get("showX", None),
                show_y=i.get("showY", None),
                count=i.get("count", None),
                road=i.get("road", None),
                d_road=i.get("dRoad", None),
                stamp_time=i.get("stampTime", None),
            )
            for i in roads
        ]

    def to_dict(self, obj):
        if isinstance(obj, dict):
            return {k: self.to_dict(v) for k, v in obj.items()}

        if isinstance(obj, (list, tuple, set)):
            return [self.to_dict(v) for v in obj]

        if hasattr(obj, "__dict__"):
            return self.to_dict(obj.__dict__)

        return obj

    @staticmethod
    def _is_empty(val: str):
        return not val or not val.strip()

    def _is_missing_fields(self):
        return self._is_empty(self.lobby_name) or self._is_empty(self.category_name) or self._is_empty(self.stream_name) or self._is_empty(self.streamer_id)

    def shot_message(self):
        if self._is_missing_fields():
            return None
        return self.to_dict({k: v for k, v in self.__dict__.items() if not k.startswith("_")})