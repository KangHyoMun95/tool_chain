import logging
from time import time

from contract import build_key_id
from models.sx_lobby.message.base_detection import BaseDetection
from message_handler import decode_message
from models.sx_lobby.sx_group_2 import SXGroup2
from publisher import publish

logger = logging.getLogger("Listener Message 2")


def handle_message_2(raw):
    kind, msg = decode_message(raw)
    if isinstance(msg, dict):
        mtype = msg.get("messageType")
        message = msg.get("message", {})
        handler = msg.get("handler")

        if mtype == "Connecting":
            logger.info(f"[ws] Connecting: status={msg.get('status')}")
        elif mtype == "GameHallInfo":
            shot_message(message)
        else:
            logger.info(f"[ws] {mtype}: {msg}")
    else:
        logger.info(f"[ws] ({kind})", msg if kind != "unknown" else f"{len(msg)} bytes")


manage_record = {}
def shot_message(message_dict: dict):
    cls = BaseDetection(message=message_dict)
    table_id = str(cls.get_key("tableID"))
    rd = manage_record.get(table_id, SXGroup2())
    rd.destructure_message(message_dict)
    manage_record.update({table_id: rd})
    message_shot = rd.shot_message()
    if message_shot:
        publish(
            item_id=build_key_id(rd.lobby_name, rd.category_name, rd.stream_name),
            data=message_shot,
            source_ts=time(),
        )
        logger.info(f"[shot_message] Shot success {rd.stream_name} at {rd.stream_round} Round")
