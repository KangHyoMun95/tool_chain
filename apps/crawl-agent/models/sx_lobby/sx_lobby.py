import json

from models.sx_lobby.message.base_detection import BaseDetection
from datetime import datetime, timezone, timedelta

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
    total_B: int = 0
    total_P: int = 0
    total_T: int = 0

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
        self.lobby_name = "ABC_LOBBY"
        self.category_name = "ABC_CATEGORY"

    def destructure_message(self, message: dict):
        parent_cls = BaseDetection(message=message)

        self.streamer_name, self.streamer_country,_ = self._get_streamer(parent_cls.get_key("dealerId"))
        self.stream_name = parent_cls.get_key("tableName") or self.stream_name
        self.stream_round = parent_cls.get_key("gameRound") or self.stream_round
        self.stream_shoe = parent_cls.get_key("gameShoe") or self.stream_shoe
        self.stream_id = parent_cls.get_key("tableID") or self.stream_id
        self.player_count = parent_cls.get_key("betCount") or self.player_count
        self.player_value = parent_cls.get_key("betCurrent") or self.player_value
        self.status = self._get_status(parent_cls.get_key("eventType")) or self.status
        self.actual_result = self._get_actual_result(parent_cls.get_key("winCounts"))
        self.total_B, self.total_P, self.total_T = (self._get_win_counts(parent_cls.get_key("winCounts"))
                                                    or [self.total_B, self.total_P, self.total_T])

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

    def _get_streamer(self, dealer_id: str):
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
                return None

    def _get_win_counts(self, w_count: list[int]):
        if w_count is None or len(w_count) != 3:
            return [self.total_B, self.total_P, self.total_T]
        return w_count[0], w_count[1], w_count[2]

    def _get_actual_result(self, win_counts: list[int]):
        if win_counts is None or len(win_counts) != 3:
            return None
        new_val_b, new_val_p, new_val_t = win_counts

        if new_val_b is None or new_val_p is None or new_val_t is None:
            return None

        if (new_val_b + new_val_p + new_val_t) - (self.total_B + self.total_P + self.total_T) != 1:
            return None

        if new_val_b > self.total_B:
            return "B"
        if new_val_p > self.total_P:
            return "P"
        if new_val_t > self.total_T:
            return "T"
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

    @staticmethod
    def _is_empty(val: str):
        return not val or not val.strip()

    def _is_full(self):
        return self._is_empty(self.lobby_name) or self._is_empty(self.category_name) or self._is_empty(self.stream_name) or self._is_empty(self.streamer_id)

    def shot_message(self):
        if not self._is_full():
            return None
        return json.dumps(self.__dict__, default=lambda obj: obj.__dict__, ensure_ascii=False, indent=2)