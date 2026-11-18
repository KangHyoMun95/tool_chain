"""
Registry handler (GAME_GROUP_ID_<n>_HANDLER=<tên>). Mỗi mục: host WSS, idle_timeout, hàm trả về on_message.
Import muộn vì message_handler kết nối Redis ngay khi import.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class HandlerSpec:
    ws_host: str | None
    idle_timeout: float | None
    get: Callable[[], Callable]


def _sx_lobby():
    from message_handler import handle_message
    return handle_message


def _category2():
    from category2_handler import handle_message_2
    return handle_message_2


REGISTRY: dict[str, HandlerSpec] = {
    # Giống mục ("tgmeq", "bpcdf.tgmeq.com", handle_message, 2.0) của WS_TARGETS
    "sx_lobby": HandlerSpec("bpcdf.tgmeq.com", 2.0, _sx_lobby),
    "category2": HandlerSpec("bpcdf.tgmeq.com", 2.0, _category2),
}
