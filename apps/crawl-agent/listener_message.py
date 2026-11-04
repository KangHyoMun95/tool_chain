from time import time

import logging
import websockets
import json
import zlib
from urllib.parse import urlparse, quote
import asyncio

import msgpack

from contract import build_key_id
from exception import CycleError
from models.sx_lobby.message.base_detection import BaseDetection
from models.sx_lobby.sx_lobby import SXLobby
from publisher import publish
from store.token_store import TokenStore

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


BASE_SOCKET_URL = "wss://bpcdf.tgmeq.com"
URL_SOCKET = "{BASE_SOCKET_URL}{path}?token={token}"

async def listen_ws(store: TokenStore, on_message=None, token_wait: float = 120):
    """Kết nối websocket, in/xử lý từng message, tự kết nối lại khi rớt."""

    origin = f"{urlparse(BASE_SOCKET_URL).scheme}://{urlparse(BASE_SOCKET_URL).netloc}"
    version, (path, token, cookie) = await store.wait_newer(0)
    while True:
        url = URL_SOCKET.format_map({
            "BASE_SOCKET_URL": BASE_SOCKET_URL,
            "path": path,
            "token": quote(token, safe="")
        })
        headers = {"Cookie": cookie} if cookie else {}
        try:
            async with websockets.connect(url, origin=origin, additional_headers=headers, ping_interval=20) as ws:
                logger.info(f"[ws] Đã kết nối {url.split('?')[0]}")

                async for raw in ws:
                    kind, msg = decode_message(raw)

                    if on_message:
                        on_message(kind, msg)
                        continue

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


        except websockets.InvalidHandshake as e:
            # Gồm cả InvalidStatus (401/403...) -> token hỏng/hết hạn -> chờ token mới
            status = getattr(getattr(e, "response", None), "status_code", None)
            logger.info(f"[ws] Handshake lỗi (status={status}): {e}. Chờ token mới...")
            try:
                version, (path, token, cookie) = await store.wait_newer(version, timeout=token_wait)
            except asyncio.TimeoutError:
                raise CycleError("Handshake lỗi và không có token mới")
            continue
        except (websockets.ConnectionClosed, OSError) as e:
            raise CycleError(f"Websocket mất kết nối: {e}")

        # Trước khi kết nối lại: nếu đã có token mới hơn thì dùng luôn
        v, data = store.get()
        if v > version:
            version, (path, token, cookie) = v, data

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
