from models.sx_lobby.message.base_detection import BaseDetection


class RoadInfo(BaseDetection):
    @classmethod
    def detection_class(cls, data: dict) -> bool:
        return "roadInfo" in data

    def get_key(self, key_name: str) -> str | int | dict | list | None:
        return self.message.get("roadInfo").get(key_name)