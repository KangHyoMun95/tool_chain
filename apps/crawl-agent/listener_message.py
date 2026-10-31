import websockets
import json
import zlib
from urllib.parse import urlparse, quote
import asyncio

import msgpack

from exception import CycleError
from models.sx_lobby.message.base_detection import BaseDetection
from store.token_store import TokenStore


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


TABLE_ID = 1013

def get_win(current_win_count: list[int], prev_win_count: list[int]):
    if not current_win_count or not prev_win_count:
        return None
    if len(current_win_count) != 3 or len(prev_win_count) != 3:
        return None
    current_B, current_P, current_T = current_win_count
    prev_B, prev_P, prev_T = prev_win_count
    if current_B > prev_B:
        return 'B'
    if current_P > prev_P:
        return 'P'
    if current_T > prev_T:
        return 'T'
    return None

def get_information(dt: dict):
    tb_name = dt.get("table_name", "")
    tb_name = "C" + tb_name[2:] if not tb_name and len(tb_name) == 4 else tb_name
    dealer_id = dt.get("dealer_id", "").split('/', 1)[0]
    c_B, c_P, c_T = dt.get("win_counts", [0, 0, 0])
    status = None
    match dt.get("event_type"):
        case "GP_NEW_GAME_START":
            status = "Đang cược"
        case "GP_RANDOM_PAY":
            status = "Kết thúc cược"
        case "GP_ONE_CARD_DRAWN":
            status = "Mở bài"
        case "GP_WINNER":
            status = "Ghi Kết quả"
        case _:
            status = None

    return {
        "ID bàn": dt.get("table_id"),
        "Tên bàn": tb_name,
        "Tên dealer": dealer_id,
        "Số lượng cược": dt.get("bet_count"),
        "Tổng tiền cược": dt.get("current_bet"),
        "Tổng B": c_B,
        "Tổng P": c_P,
        "Tổng T": c_T,
        "Trạng thái": status,
        "Kết quả": dt.get("result")
    }

def destructure_message(message: dict):
    parent_cls = BaseDetection(message=message)

    dealer_id = parent_cls.get_key("dealerId")
    event_type = parent_cls.get_key("eventType")
    table_id = parent_cls.get_key("tableID")
    game_round = parent_cls.get_key("gameRound")
    game_shoe = parent_cls.get_key("gameShoe")
    round_start_time = parent_cls.get_time("roundStartTime")
    timestamp = parent_cls.get_time("timestamp")

    bet_count = parent_cls.get_key("betCount")
    current_bet = parent_cls.get_key("currentBet")

    repaint_time = parent_cls.get_time("repaintTime")
    win_counts = parent_cls.get_key("winCounts")
    good_road_type = parent_cls.get_key("goodRoadType")
    good_road_count = parent_cls.get_key("goodRoadCount")
    prev_good_road_json = parent_cls.get_key("prevGoodRoadJson")
    curr_good_road_json = parent_cls.get_key("currGoodRoadJson")
    big_roads = parent_cls.get_key("bigRoads")

    stamp_time = parent_cls.get_time("stampTime")
    table_name = parent_cls.get_key("tableName")
    maintenance = parent_cls.get_key("maintenance")

    return {
        "dealer_id": dealer_id,
        "event_type": event_type,
        "table_id": table_id,
        "game_round": game_round,
        # "game_shoe": game_shoe,
        # "round_start_time": round_start_time,
        # "timestamp": timestamp,
        "bet_count": bet_count,
        "current_bet": current_bet,
        # "repaint_time": repaint_time,
        "win_counts": win_counts,
        # "good_road_type": good_road_type,
        # "good_road_count": good_road_count,
        # "prev_good_road_json": prev_good_road_json,
        # "curr_good_road_json": curr_good_road_json,
        # "big_roads": big_roads,
        # "stamp_time": stamp_time,
        "table_name": table_name,
        # "maintenance": maintenance,
    }


BASE_SOCKET_URL = "wss://bpcdf.tgmeq.com"
URL_SOCKET = "{BASE_SOCKET_URL}{path}?token={token}"

async def listen_ws(store: TokenStore, on_message=None, token_wait: float = 120):
    """Kết nối websocket, in/xử lý từng message, tự kết nối lại khi rớt."""

    origin = f"{urlparse(BASE_SOCKET_URL).scheme}://{urlparse(BASE_SOCKET_URL).netloc}"
    version, (path, token, cookie) = await store.wait_newer(0)
    record_debugging = {"handler": set()}
    while True:
        url = URL_SOCKET.format_map({
            "BASE_SOCKET_URL": BASE_SOCKET_URL,
            "path": path,
            "token": quote(token, safe="")
        })
        headers = {"Cookie": cookie} if cookie else {}
        try:
            async with websockets.connect(url, origin=origin, additional_headers=headers, ping_interval=20) as ws:
                print(f"[ws] Đã kết nối {url.split('?')[0]}")

                async for raw in ws:
                    kind, msg = decode_message(raw)

                    if on_message:
                        on_message(kind, msg)
                        continue

                    if isinstance(msg, dict):
                        mtype = msg.get("messageType")
                        message = msg.get("message")
                        handler = msg.get("handler")

                        if mtype == "Connecting":
                            print(f"[ws] Connecting: status={msg.get('status')}")
                        elif mtype == "GameHallInfo":
                            val = destructure_message(message)
                            print(val)
                            # if val.get("table_id") != TABLE_ID:
                            #     continue
                            # new_record = {k: v for k, v in val.items() if v is not None}
                            # result = get_win(new_record.get("win_counts"), record_debugging.get("win_counts", [0, 0, 0]))
                            # if "handler" not in record_debugging or record_debugging["handler"] is None:
                            #     record_debugging["handler"] = set()
                            # record_debugging["handler"].add(handler)
                            # record_debugging = {
                            #     **record_debugging,
                            #     **new_record,
                            #     "result": result,
                            # }
                            # if len(record_debugging["handler"]) == 4:
                            #     print(get_information(record_debugging))
                            # else:
                            #     print("Đang nạp dữ liệu.........")
                        else:
                            print(f"[ws] {mtype}: {msg}")
                    else:
                        print(f"[ws] ({kind})", msg if kind != "unknown" else f"{len(msg)} bytes")


        except websockets.InvalidHandshake as e:
            # Gồm cả InvalidStatus (401/403...) -> token hỏng/hết hạn -> chờ token mới
            status = getattr(getattr(e, "response", None), "status_code", None)
            print(f"[ws] Handshake lỗi (status={status}): {e}. Chờ token mới...")
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


if __name__ == "__main__":
    msg = {'tableID': 1018, 'gameShoe': 6317, 'gameRound': 36, 'betCount': 327, 'currentBet': 5205.4375272835}
    destructure_message(msg)