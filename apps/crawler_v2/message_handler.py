from time import time
import json
import zlib
import logging

import msgpack

from contract import build_key_id
from models.sx_lobby.message.base_detection import BaseDetection
from models.sx_lobby.sx_lobby import SXLobby
from publisher import publish

logger = logging.getLogger("Listener Message")

def _maybe_json(obj):
    """Nếu obj là chuỗi chứa JSON thì parse ra dict/list, không thì giữ nguyên."""
    if isinstance(obj, str) and obj[:1] in ("{", "["):
        try:
            return json.loads(obj)
        except json.JSONDecodeError:
            pass
    return obj


def decode_message(raw):
    """Thử giải mã message websocket. Trả về (kiểu, dữ liệu)."""
    if isinstance(raw, str):                       # TextMessage
        try:
            return "json", json.loads(raw)
        except json.JSONDecodeError:
            return "text", raw

    # BinaryMessage
    # 1) MessagePack (có thể nhiều object nối liền nhau trong 1 frame)
    try:
        up = msgpack.Unpacker(raw=False, strict_map_key=False)
        up.feed(raw)
        objs = [_maybe_json(o) for o in up]
        if objs:
            return "msgpack", objs[0] if len(objs) == 1 else objs
    except Exception:
        pass

    # 2) Nén zlib/gzip rồi bên trong là JSON hoặc msgpack
    for wbits in (zlib.MAX_WBITS, 16 + zlib.MAX_WBITS, -zlib.MAX_WBITS):
        try:
            inner = zlib.decompress(raw, wbits)
            try:
                return "zlib+json", json.loads(inner)
            except Exception:
                return "zlib+msgpack", msgpack.unpackb(inner, raw=False, strict_map_key=False)
        except Exception:
            continue

    return "unknown", raw

def handle_message(raw):
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
    rd = manage_record.get(table_id, SXLobby())
    rd.destructure_message(message_dict)
    manage_record.update({table_id: rd})
    message_shot = rd.shot_message()
    if message_shot:
        publish(
            item_id=build_key_id(
                lobby_name=rd.lobby_name,
                stream_name=rd.stream_name,
                category_name=rd.category_name
            ),
            data=message_shot,
            source_ts=time()
        )
        logger.info(f"[shot_message] Shot success {rd.stream_name} at {rd.stream_round} Round")