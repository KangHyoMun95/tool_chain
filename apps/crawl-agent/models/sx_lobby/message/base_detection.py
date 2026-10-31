from abc import ABC, abstractmethod
import time
from datetime import datetime, timezone, timedelta

VN_TZ = timezone(timedelta(hours=7))
FORMAT_DATETIME = "%Y-%m-%d %H:%M:%S"

class BaseDetection(ABC):
    message: dict = {}

    def __init__(self, message: dict) -> None:
        self.message = message

    def __new__(cls, message: dict):
        if cls is BaseDetection:
            cls = BaseDetection.detect(message)
        return super().__new__(cls)

    @classmethod
    def detect(cls, data: dict) -> type["BaseDetection"]:
        """Hỏi từng class con, trả về class con đầu tiên trả lời True."""
        for sub in cls.__subclasses__():
            if sub.detection_class(data):
                return sub
        return UnknownDetection

    @classmethod
    @abstractmethod
    def detection_class(cls, data: dict) -> bool:
        """Class con override: dict này có phải của mình không?"""

    @abstractmethod
    def get_key(self, key_name: str) -> str | int | dict | list | None:
        """Class con override: lấy key theo cách riêng."""

    def get_time(self, key_name: str) -> int | None:
        return self._seconds_from_now(self.get_key(key_name)) if self.get_key(key_name) else None

    def ms_to_dt(self, key_name: str, tz=VN_TZ) -> str | None:
        """Unix timestamp (mili giây) -> datetime có múi giờ."""
        return datetime.fromtimestamp(self.get_key(key_name) / 1000, tz).strftime(FORMAT_DATETIME) if self.get_key(key_name) else None

    @classmethod
    def _seconds_from_now(cls, ms: int | None) -> float | None:
        """Số giây giữa mốc `ms` và hiện tại.

        Dương: mốc đã qua bao nhiêu giây.  Âm: mốc còn bao nhiêu giây nữa mới tới.
        """
        now_ms = int(time.time() * 1000)
        if not ms:
            return None
        if now_ms is None:
            now_ms = time.time_ns() // 1_000_000
        return (now_ms - ms) / 1000


class UnknownDetection(BaseDetection):
    @classmethod
    def detection_class(cls, data: dict) -> bool:
        return False

    def get_key(self, key_name: str) -> str | int | dict | list | None:
        return None