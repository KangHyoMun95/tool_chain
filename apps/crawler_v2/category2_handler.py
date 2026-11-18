"""
Handler category 2 (GAME_GROUP_ID_<n>_HANDLER=category2). Cùng kiểu message_handler.handle_message:
nhận frame thô, giải mã bằng bộ giải mã chung decode_message. Tạm thời CHỈ log dữ liệu đã decode (không ghi file,
không publish). Phần xử lý sẽ viết sau.
"""
import logging

from message_handler import decode_message

logger = logging.getLogger("Listener Message 2")


def handle_message_2(raw):
    kind, msg = decode_message(raw)
    if isinstance(msg, dict):
        logger.info(f"[ws2] {msg.get('messageType')}: {msg}")
    else:
        logger.info(f"[ws2] ({kind}) {msg if kind != 'unknown' else f'{len(msg)} bytes'}")
