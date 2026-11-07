"""
Mô phỏng WebSocketConstructor (webSocket.js) bằng Python: mở WS bằng token từ getToken,
heartbeat 5s, phát hiện mất kết nối / server rolling và re-call getToken để reconnect.

Có thể chạy NHIỀU runner song song (mỗi runner 1 host WSS + 1 on_message riêng), dùng chung
1 SexyTokenClient + 1 token_provider (session / login dùng chung).

pip install requests websockets msgpack
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Awaitable, Callable

import re

import msgpack
import websockets

from token_client import SexyTokenClient, WsToken

HEARTBEAT_SEC = 5      # u.start(): setInterval 5E3
MAX_MISSED = 2         # p += 1; if p > 2 -> close + reconnect
SERVER_POLL_SEC = 5    # H.cycleTime = 5 -> queryCurrentServerId
BACKOFF = [5, 5, 10, 20, 40, 60]   # giây chờ trước lần reconnect thứ n (lỗi liên tiếp)
STABLE_AFTER = 60      # WS sống quá 60s -> coi là ổn, reset bộ đếm lỗi
STATS_EVERY = 60       # log số message nhận được mỗi 60s
CONNECT_GRACE = 3      # sau khi mở WS, chờ tối đa 3s cho frame binary đầu tiên rồi mới tính idle
IDLE_BACKOFF = [0, 1, 2, 5, 10, 30]   # giây chờ trước lần reconnect-vì-idle thứ n (liên tiếp, chưa có data lại)
WS_SCHEME = "wss"


# Frame điều khiển (không phải dữ liệu game). JSON nằm nguyên trong bytes msgpack
# (vd b'\xbb{"messageType":"Heartbeat"}') -> nhận diện bằng regex, không cần unpack.
CONTROL_FRAME = re.compile(rb'"messageType"\s*:\s*"(?:Heartbeat|Connecting)"')


def default_is_data(raw) -> bool:
    """True nếu là frame DỮ LIỆU: binary và không phải Heartbeat / Connecting."""
    return isinstance(raw, (bytes, bytearray)) and not CONTROL_FRAME.search(raw[:200])


def encode(obj: dict) -> bytes:
    # JS: MessagePackUtil.encode(JSON.stringify(a))  -> msgpack của 1 STRING JSON (chỉ dùng cho chiều GỬI)
    return msgpack.packb(json.dumps(obj, separators=(",", ":")))


class TooManyFailures(Exception):
    pass


class WsRunner:
    def __init__(self, client: SexyTokenClient,
                 token_provider: Callable[[], Awaitable[WsToken]],
                 on_message: Callable[[bytes | str], None] | None = None,
                 ws_host: str | None = None,
                 name: str = "ws",
                 idle_timeout: float | None = None,
                 on_open: Callable[[], Awaitable[None]] | None = None,
                 on_idle: Callable[[], Awaitable[None]] | None = None,
                 is_data: Callable[[bytes | str], bool] = default_is_data,
                 max_fails: int = 10,
                 fatal: tuple[type[BaseException], ...] = ()):
        """
        token_provider: hàm async trả về WsToken; được gọi MỖI LẦN (re)connect.
        on_message    : nhận frame THÔ (bytes msgpack, hoặc str nếu server gửi text) — đặt code decode ở đây.
        ws_host       : host WSS cố định (vd "bpcdf.tgmeq.com"); None = host game hiện tại (giống browser).
        name          : tên runner, dùng trong log.
        idle_timeout  : x giây. Không có frame DỮ LIỆU (is_data) trong x giây:
                          B1: gọi on_idle() (vd vào lại sảnh), GIỮ WS
                          B2: thêm x giây vẫn không có dữ liệu -> đóng WS, re-call getToken, connect lại
                        Không có on_idle -> bỏ B1, đi thẳng B2. None = tắt (chỉ dựa vào heartbeat).
                        Reconnect vì idle KHÔNG tính vào max_fails, có backoff riêng IDLE_BACKOFF.
        is_data       : hàm phân biệt frame dữ liệu với frame điều khiển; mặc định bỏ qua Heartbeat/Connecting.
        on_idle       : hàm async cho bước B1 (lỗi chỉ log, vẫn chuyển sang B2 nếu không có dữ liệu).
        on_open       : hàm async chạy NỀN ngay sau frame đầu tiên (Connecting) của mỗi kết nối
                        (vd vào sảnh: queryInitWebGameHall). Lỗi trong on_open chỉ log, không làm rớt WS.
        max_fails     : lỗi liên tiếp quá ngưỡng -> ném TooManyFailures.
        fatal         : các exception phải dừng ngay, không retry (vd BotCheckError).
        """
        self.c = client
        self.token_provider = token_provider
        self.on_message = on_message or (lambda raw: None)
        self.ws_host = ws_host
        self.name = name
        self.max_fails = max_fails
        self.fatal = fatal
        self.server_id: str | None = None
        self.fails = 0
        self.idle_timeout = idle_timeout
        self.on_open = on_open
        self.on_idle = on_idle
        self.b1_tried = 0             # thống kê: số lần chạy B1
        self.b1_ok = 0                # thống kê: số lần B1 cứu được (dữ liệu chảy lại, không phải reconnect)
        self.is_data = is_data
        self.data_count = 0
        self.idle_streak = 0          # số lần reconnect vì idle liên tiếp (reset khi nhận được binary)
        self.msg_count = 0
        self.log = logging.getLogger(f"ws.{name}")

    def _host(self, tok: WsToken) -> str:
        return self.ws_host or tok.host or self.c.game_host

    async def _session(self):
        tok = await self.token_provider()                 # <-- re-call getToken mỗi lần (re)connect
        host = self._host(tok)
        url = f"{WS_SCHEME}://{host}{tok.path}?token={tok.token}"   # JS: "wss://"+hostname+c.path+"?token="+c.token
        headers = {"Origin": f"https://{host}", "User-Agent": self.c.s.headers["User-Agent"]}
        cookie = "; ".join(f"{k}={v}" for k, v in self.c.game_cookies().items())
        if cookie:
            headers["Cookie"] = cookie

        async with websockets.connect(url, additional_headers=headers, max_size=None, open_timeout=10) as ws:
            opened = time.time()
            self.log.info("WS open %s", url.split("?")[0])
            missed = 0
            stop = asyncio.Event()
            reason = "closed"
            last_binary = None        # thời điểm nhận frame DỮ LIỆU gần nhất (không tính Heartbeat/Connecting)
            b1_at = None              # thời điểm đã chạy B1 trong đợt im lặng hiện tại
            max_gap = 0.0             # khoảng cách lớn nhất giữa 2 frame dữ liệu (trong cửa sổ thống kê)

            async def heartbeat():
                nonlocal missed
                while not stop.is_set():
                    await asyncio.sleep(HEARTBEAT_SEC)
                    if time.time() - opened > STABLE_AFTER:
                        self.fails = 0
                    missed += 1
                    if missed > MAX_MISSED:
                        self.log.warning("heartCheck: %d nhịp không có message -> reconnect", missed - 1)
                        await ws.close(1000, "heartCheck")
                        return
                    await ws.send(encode({"router": "heartbeat"}))

            async def server_poll():
                while not stop.is_set():
                    await asyncio.sleep(SERVER_POLL_SEC)
                    try:
                        sid = await asyncio.to_thread(self.c.query_server_id)
                    except Exception as e:
                        self.log.debug("queryCurrentServerId lỗi: %s", e)
                        continue
                    if self.server_id and sid and sid != self.server_id:
                        self.log.warning("systemRolling %s -> %s -> reconnect", self.server_id, sid)
                        self.server_id = sid
                        await ws.close(1000, "systemRolling")
                        return
                    self.server_id = sid or self.server_id

            async def run_b1():
                try:
                    await self.on_idle()
                except Exception as e:
                    self.log.warning("B1 on_idle lỗi: %s: %s", type(e).__name__, e)

            async def idle_watch():
                nonlocal reason, b1_at
                x = self.idle_timeout
                while not stop.is_set():
                    await asyncio.sleep(0.1)
                    now = time.time()
                    if last_binary is None:                 # chưa có dữ liệu nào từ lúc mở: cho thêm thời gian handshake + vào sảnh
                        idle, limit = now - opened, max(x, CONNECT_GRACE)
                    else:
                        idle, limit = now - last_binary, x
                    if idle <= limit:
                        continue
                    if self.on_idle and b1_at is None:      # ---- B1: vào lại sảnh, giữ WS
                        b1_at = now
                        self.b1_tried += 1
                        self.log.warning("B1: %.1fs không có dữ liệu -> vào lại sảnh (giữ WS)", idle)
                        tasks.append(asyncio.create_task(run_b1()))
                        continue
                    if b1_at is not None and now - b1_at <= x:
                        continue                            # đang chờ kết quả B1
                    reason = "idle"                         # ---- B2: reconnect
                    self.log.warning("B2: %.1fs không có dữ liệu%s -> re-call getToken + reconnect",
                                     idle, " (B1 không cứu được)" if b1_at else "")
                    await ws.close(1000, "idle")
                    return

            async def stats():
                last = (self.msg_count, self.data_count)
                while not stop.is_set():
                    await asyncio.sleep(STATS_EVERY)
                    nonlocal max_gap
                    self.log.info("%ds qua: %d frame (%d dữ liệu), im lặng dài nhất %.2fs | tổng %d dữ liệu"
                                  " | B1 %d lần, cứu được %d",
                                  STATS_EVERY, self.msg_count - last[0], self.data_count - last[1], max_gap,
                                  self.data_count, self.b1_tried, self.b1_ok)
                    last = (self.msg_count, self.data_count)
                    max_gap = 0.0

            jobs = [heartbeat, server_poll, stats] + ([idle_watch] if self.idle_timeout else [])
            tasks = [asyncio.create_task(f()) for f in jobs]

            async def run_on_open():
                try:
                    await self.on_open()
                except Exception as e:
                    self.log.warning("on_open lỗi: %s: %s", type(e).__name__, e)
            first = True
            try:
                async for raw in ws:
                    missed = 0                              # JS: onmessage -> p = 0
                    self.msg_count += 1
                    if first:
                        first = False
                        if self.on_open:
                            tasks.append(asyncio.create_task(run_on_open()))
                    if self.is_data(raw):
                        now = time.time()
                        if last_binary is not None:
                            max_gap = max(max_gap, now - last_binary)
                        if b1_at is not None:               # dữ liệu chảy lại sau B1 -> B1 đã cứu được
                            self.b1_ok += 1
                            self.log.info("B1 OK: dữ liệu chảy lại sau %.2fs, không cần reconnect", now - b1_at)
                            b1_at = None
                        self.data_count += 1
                        last_binary = now
                        self.idle_streak = 0
                    try:
                        self.on_message(raw)
                    except Exception as e:                  # lỗi xử lý data không được làm rớt WS
                        self.log.exception("on_message lỗi: %s", e)
            finally:
                stop.set()
                for t in tasks:
                    t.cancel()
        return time.time() - opened, reason

    async def run_forever(self):
        while True:
            try:
                lived, reason = await self._session()
                if reason == "idle":
                    self.fails = 0                          # WS + getToken vẫn chạy được -> không phải lỗi
                    wait = IDLE_BACKOFF[min(self.idle_streak, len(IDLE_BACKOFF) - 1)]
                    self.idle_streak += 1
                    if wait:
                        self.log.info("idle lần %d liên tiếp -> chờ %ds rồi reconnect", self.idle_streak, wait)
                    await asyncio.sleep(wait)
                    continue
                self.log.info("WS đóng sau %.0fs -> reconnect", lived)
                if lived < STABLE_AFTER:
                    self.fails += 1
            except (asyncio.CancelledError, TooManyFailures):
                raise                                       # TooManyFailures (từ token_provider): dừng ngay, không retry
            except Exception as e:
                if self.fatal and isinstance(e, self.fatal):
                    raise
                self.fails += 1
                self.log.warning("[lỗi #%d] %s: %s", self.fails, type(e).__name__, e)
            if self.fails >= self.max_fails:
                raise TooManyFailures(f"[{self.name}] lỗi liên tiếp {self.fails} lần")
            await asyncio.sleep(BACKOFF[min(self.fails, len(BACKOFF) - 1)])
