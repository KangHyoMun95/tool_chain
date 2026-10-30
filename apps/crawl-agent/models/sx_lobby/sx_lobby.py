from models.sx_lobby.message.base_detection import BaseDetection


class SXLobby:
    lobby_name: str
    category_name: str
    stream_id: str
    stream_name: str
    stream_round: str
    streamer_id: str
    status: str
    actual_result: str
    total_B: int
    total_P: int
    total_T: int

    def __init__(self):
        self.lobby_name = "ABC_LOBBY"
        self.category_name = "ABC_CATEGORY"

    def destructure_message(self, message: dict):
        parent_cls = BaseDetection(message=message)

        self.streamer_id = parent_cls.get_key("dealerId")
        self.stream_name = parent_cls.get_key("tableName")
        self.stream_round = parent_cls.get_key("gameRound")
        self.stream_id = parent_cls.get_key("tableID")
        self.status = self._get_status(parent_cls.get_key("eventType"))

        self.total_B, self.total_P, self.total_T = self._get_win_counts(parent_cls.get_key("winCounts"))

    @staticmethod
    def _get_status(event_type: str):
        match event_type:
            case "GP_NEW_GAME_START":
                status = "IN_PROGRESS"
            case "GP_RANDOM_PAY":
                status = "DONE"
            case "GP_ONE_CARD_DRAWN":
                status = "GET_RESULT"
            case "GP_WINNER":
                status = "SUMMARY_RESULT"
            case _:
                status = None
        return status

    @staticmethod
    def _get_win_counts(w_count: list[int]):
        return w_count[0], w_count[1], w_count[2]

    # def _get_actual_result(self, ):

