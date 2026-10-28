from abc import ABC

from models.base_detection import BaseDetection


class Dealer(BaseDetection):
    @classmethod
    def detection_class(cls, data: dict) -> bool:
        return "dealerId" in data


    def get_key(self, key_name: str) -> str | int | dict | list | None:
        return self.message.get(key_name)
