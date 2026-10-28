from models.base_detection import BaseDetection


class TableInfo(BaseDetection):
    @classmethod
    def detection_class(cls, data: dict) -> bool:
        return "tableInfo" in data

    def get_key(self, key_name: str) -> str | int | dict | list | None:
        return self.message.get("tableInfo").get(key_name)
