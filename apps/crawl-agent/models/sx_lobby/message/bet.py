from models.sx_lobby.message.base_detection import BaseDetection


class Bet(BaseDetection):

    @classmethod
    def detection_class(cls, data: dict) -> bool:
        return "betCount" in data

    def get_key(self, key_name: str) -> str | int | dict | list | None:
        return self.message.get(key_name)
