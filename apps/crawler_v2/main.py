"""
Crawler v2 — chế độ API. Browser chỉ dùng khi cookie KUBET hết hạn, xong là tắt.

Luồng mỗi lần cần mở WS (token_provider):
  tầng 1: getToken bằng cookie game (output/session.json)          -> rẻ nhất
  tầng 2: cookie game chết -> login lại bằng cookie KUBET (Python)   -> ~1s
  tầng 3: cookie KUBET chết -> browser_login.harvest_kubet_session():
            [1] bash start_brave.sh  [2] connect CDP  [3] truy cập + login như v1
            [4] lấy cookie KUBET     [5] đóng page + bash stop_brave.sh
          -> quay lại tầng 2
  -> [6] getToken -> [7] connect WSS -> on_message(raw)
  Nghe nhiều WSS song song (WS_TARGETS), mỗi WSS 1 handler, bật / tắt bằng env WS_ENABLED_<TÊN> (mặc định bật).
  Mỗi WSS là một task ĐỘC LẬP: tự getToken, tự reconnect, lỗi quá ngưỡng thì tự khởi động lại (backoff), không kéo WSS khác.
  Session / login dùng chung. Lỗi cấp phiên (BotCheckError, SessionError) -> cả process thoát mã 1 (Docker chạy lại).
  heartbeat fail / WS rớt / server rolling -> gọi lại token_provider (bắt đầu lại từ tầng 1)

Chạy:  python main.py
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import signal
import sys
import time
from pathlib import Path

from categories import CategoryConfig, load_categories
from exception import BotCheckError, SessionError
from message_handler import handle_message
from handlers import REGISTRY
from session_store import SessionStore
from token_client import KubetSessionExpired, SexyTokenClient, WsToken
from ws_runner import TooManyFailures, WsRunner

logger = logging.getLogger("Crawler")

MAX_BROWSER_LOGINS_PER_HOUR = 3   # chặn vòng lặp login browser (tránh khoá tài khoản)
MAX_FAILS = 10                    # lỗi liên tiếp quá ngưỡng -> dừng hẳn
RUNNER_BACKOFF_MIN = 5            # chờ trước khi khởi động lại MỘT WSS vừa lỗi quá ngưỡng (giây), nhân đôi mỗi lần
RUNNER_BACKOFF_MAX = 300
RUNNER_STABLE_AFTER = 10 * 60     # WSS chạy ổn quá ngưỡng này trước khi lỗi -> reset backoff
RESTART_DELAY = int(os.environ.get("RESTART_DELAY", "600"))   # [STOP] lỗi cấp phiên -> chờ rồi mới thoát mã 1 cho Docker chạy lại (tránh dồn dập khi bị check bot)
KUBET_KEEPALIVE_SEC = 15 * 60     # chu kỳ giữ session KUBET (chỉ dùng khi bật kubet_keepalive_loop)


# ---------------------------------------------------------------------------
# Session
# ---------------------------------------------------------------------------

def build_client(store: SessionStore) -> SexyTokenClient:
    d = store.load()
    c = SexyTokenClient(
        game_host=d.get("game_host"),
        kubet_host=d.get("kubet_host") or "www.zhav373.net",
        game_cookies=d.get("game_cookies") if d.get("game_host") else None,
        kubet_cookies=d.get("kubet_cookies"),
        game_login_url=d.get("game_login_url"),
        traffic=d.get("traffic"),
        browser_identity=d.get("browser_identity"),
    )
    logger.info("[session] kubet=%s auth=%s | game=%s cookies=%s",
                c.kubet_host, c.has_kubet_auth(), c.game_host, list(c.game_cookies()))
    return c


class TokenProvider:
    """Gọi mỗi lần (re)connect WS. Tự nâng tầng khi tầng dưới thất bại, lưu session khi có thay đổi."""

    def __init__(self, client: SexyTokenClient, store: SessionStore, username: str, password: str,
                 profile_dir: str | None = None):
        """Mỗi category một TokenProvider (tài khoản + profile Brave riêng)."""
        self.c = client
        self.store = store
        self.username = username
        self.password = password
        self.profile_dir = profile_dir
        self._browser_logins: list[float] = []
        self._last_saved: dict | None = None
        self._lock = asyncio.Lock()

    def _save_if_changed(self, reason: str):
        snap = self.c.export_session()
        if snap != self._last_saved:
            self.store.save(snap, reason)
            self._last_saved = snap

    async def _browser_login(self):
        now = time.time()
        self._browser_logins = [t for t in self._browser_logins if now - t < 3600]
        if len(self._browser_logins) >= MAX_BROWSER_LOGINS_PER_HOUR:
            raise SessionError(f"Đã login bằng browser {len(self._browser_logins)} lần trong 1 giờ")
        self._browser_logins.append(now)

        logger.warning("[tầng 3] Cookie KUBET hết hạn -> dùng browser")
        from browser_login import harvest_kubet_session      # import muộn: chỉ load Playwright khi cần
        sess = await asyncio.to_thread(harvest_kubet_session, self.username, self.password, self.profile_dir)
        self.c.set_kubet_cookies(sess["kubet_host"], sess["kubet_cookies"])
        if sess.get("browser_identity"):
            self.c.set_browser_identity(sess["browser_identity"])
        self.store.record_browser_login()
        self._save_if_changed("browser login")

    async def __call__(self) -> WsToken:
        async with self._lock:
            try:
                tok = await asyncio.to_thread(self.c.ensure_token, self.username)     # tầng 1 -> 2
            except KubetSessionExpired as e:
                logger.warning("[token] %s", e)
                await self._browser_login()                                       # tầng 3
                try:
                    tok = await asyncio.to_thread(self.c.ensure_token, self.username) # tầng 2 với cookie mới
                except KubetSessionExpired as e2:
                    # Cookie VỪA login bằng browser mà vẫn bị từ chối -> login lại nữa cũng vô ích
                    # (và login dồn dập dễ khoá tài khoản) -> dừng hẳn, xem file trong debug/
                    raise SessionError(f"Cookie vừa login bằng browser vẫn bị từ chối: {e2}")
            logger.info("[6] getToken OK (ttl %.0fs)", tok.seconds_left())
            self._save_if_changed("token ok")
            return tok


# ---------------------------------------------------------------------------
# Message — mỗi WSS một handler
# ---------------------------------------------------------------------------

def on_message_dynamic(raw: bytes | str):
    """WSS host game hiện tại (giống browser: bpcdf.tgmeq.com / bpcdf.mex777.com / ... đổi theo phiên).
    TODO: dán code decode / xử lý. Chạy trong event loop -> đừng block lâu."""
    pass


def on_message_tgmeq(raw: bytes | str):
    """WSS bpcdf.tgmeq.com cố định (giống v1: BASE_SOCKET_URL).
    TODO: dán code decode / xử lý. Chạy trong event loop -> đừng block lâu."""
    pass


# (tên, host WSS, handler, idle_timeout)
#   host=None        -> host game hiện tại
#   idle_timeout=x   -> x giây không có frame dữ liệu (bỏ qua Heartbeat/Connecting):
#                       B1 vào lại sảnh (giữ WS) -> thêm x giây vẫn không có -> B2 getToken + reconnect
#                       None = tắt, chỉ dựa vào heartbeat (~10-15s)
# Mọi target dùng chung 1 tài khoản / 1 session. CHƯA kiểm tra giới hạn kết nối / tài khoản của server: log cũ (10:51) cho thấy
# kết nối mới có thể đá kết nối cũ (~60ms). Nếu thêm target thứ hai mà thấy hai WSS đá nhau thì phải tách tài khoản / container.
# Bật / tắt từng target: env WS_ENABLED_<TÊN IN HOA> = true|false (mặc định true), vd WS_ENABLED_TGMEQ=false.
WS_TARGETS = [
    ("tgmeq", "bpcdf.tgmeq.com", handle_message, 2.0),
    # ("dynamic", None, on_message_dynamic, None),
]


# ---------------------------------------------------------------------------
# Giữ session KUBET (tuỳ chọn)
# ---------------------------------------------------------------------------

async def kubet_keepalive_loop(client: SexyTokenClient, provider: "TokenProvider"):
    """Mỗi KUBET_KEEPALIVE_SEC: GET /Home/Index để BBOAUTH không hết hạn vì không hoạt động.
    v1 mở browser liên tục nên session luôn "có hoạt động"; v2 chỉ chạm KUBET khi login lại game.
    Bật bằng cách bỏ comment 1 dòng trong supervisor() nếu browser_logins (output/session.json) xuất hiện dày.
    Không bao giờ ném lỗi ra ngoài (không làm dừng chương trình)."""
    while True:
        await asyncio.sleep(KUBET_KEEPALIVE_SEC)
        try:
            alive = await asyncio.to_thread(client.kubet_keepalive, provider.username)
            provider._save_if_changed("kubet keepalive")      # lưu cookie mới nếu server gia hạn/đổi
            if not alive:
                logger.warning("[keepalive] KUBET có vẻ đã hết hạn — lần login lại game tới sẽ dùng browser (tầng 3)")
        except Exception as e:
            logger.warning(f"[keepalive] lỗi: {type(e).__name__}: {e}")


# ---------------------------------------------------------------------------
# Supervisor
# ---------------------------------------------------------------------------

def ws_enabled(name: str) -> bool:
    return os.environ.get(f"WS_ENABLED_{name.upper()}", "true").strip().lower() not in ("0", "false", "no", "off")


async def run_isolated(name: str, make_runner):
    """Chạy MỘT WSS, tự khởi động lại khi runner lỗi quá ngưỡng (TooManyFailures) hoặc lỗi không lường trước.
    Chỉ lỗi cấp phiên (BotCheckError, SessionError) và hủy task mới thoát ra ngoài (supervisor xử lý cho cả process)."""
    log = logging.getLogger(f"ws.{name}")
    backoff = RUNNER_BACKOFF_MIN
    while True:
        started = time.time()
        try:
            await make_runner().run_forever()
        except (asyncio.CancelledError, BotCheckError, SessionError):
            raise
        except TooManyFailures as e:
            log.error("[restart] %s. Khởi động lại riêng WSS này sau %ds, WSS khác không bị ảnh hưởng", e, backoff)
        except Exception as e:
            log.error("[restart] lỗi không lường trước: %s: %s. Khởi động lại riêng WSS này sau %ds", type(e).__name__, e, backoff, exc_info=True)
        if time.time() - started > RUNNER_STABLE_AFTER:
            backoff = RUNNER_BACKOFF_MIN
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, RUNNER_BACKOFF_MAX)


PROFILES_DIR = os.path.expanduser("~/.brave-profiles")          # mỗi tài khoản một profile Brave riêng (volume brave-profiles)
SESSIONS_DIR = Path("output/sessions")                          # mỗi tài khoản một file session (volume bot-output)


def _safe_name(username: str) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "_", username)


def profile_dir_for(username: str) -> str:
    """Đuôi '.p' (tên đã bị thay mọi ký tự lạ nên không chứa '.') để pgrep -f '--user-data-dir=<dir>' trong
    start/stop_brave.sh không khớp nhầm profile khác có tên bắt đầu giống."""
    return os.path.join(PROFILES_DIR, _safe_name(username) + ".p")


def session_path_for(username: str) -> Path:
    return SESSIONS_DIR / f"{_safe_name(username)}.json"


async def supervisor() -> int:
    """Trả về exit code cho Docker (restart: unless-stopped):
      0 = dừng theo yêu cầu (docker stop / SIGINT)
      1 = lỗi cấp phiên / tài khoản (BotCheckError, SessionError) hoặc lỗi không lường trước: chờ RESTART_DELAY rồi thoát để Docker chạy lại.
    Mỗi category (GAME_GROUP_ID_<n>) = 1 tài khoản + 1 client + 1 session file + 1 TokenProvider + 1 WSS, task độc lập
    (run_isolated). Lỗi của MỘT category không đi tới đây: run_isolated tự khởi động lại category đó.
    Cấu hình sai: load_categories ném ConfigError (thoát như lỗi khởi động bất kỳ)."""
    cats = load_categories(REGISTRY)

    def factory(c: CategoryConfig):
        spec = REGISTRY[c.handler]
        store = SessionStore(session_path_for(c.username))
        client = build_client(store)
        provider = TokenProvider(client, store, c.username, c.password, profile_dir_for(c.username))
        handler = spec.get()

        async def enter_hall():                      # giống browser: sau mỗi lần WS connect -> vào sảnh (gameGroupId của category)
            await asyncio.to_thread(client.enter_game_hall, c.group_id)

        logger.info("[config] category '%s' (%s): tài khoản=%s gameGroupId=%s handler=%s session=%s",
                    c.category, c.lobby, c.username, c.group_id, c.handler, store.path)
        return lambda: WsRunner(client, provider, on_message=handler, ws_host=spec.ws_host, name=c.category,
                                idle_timeout=spec.idle_timeout, on_open=enter_hall, on_idle=enter_hall,
                                max_fails=MAX_FAILS, fatal=(BotCheckError,))

    tasks = {asyncio.create_task(run_isolated(c.category, factory(c)), name=c.category) for c in cats}

    # Giữ session KUBET: BỎ COMMENT dòng dưới nếu cookie KUBET hết hạn nhanh hơn v1
    # (xem "browser_logins" trong output/session.json — nếu vài giờ lại phải login browser 1 lần).
    # tasks.add(asyncio.create_task(kubet_keepalive_loop(client, provider), name="kubet_keepalive"))
    code = 1
    try:
        # run_isolated không bao giờ tự kết thúc: một task xong = lỗi cấp phiên -> dừng tất cả để thoát mã 1
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for t in done:
            e = t.exception()
            if isinstance(e, BotCheckError):
                logger.error(f"[STOP] [{t.get_name()}] Bị check bot: {e}. Thoát mã 1 sau {RESTART_DELAY}s.")
            elif isinstance(e, SessionError):
                logger.error(f"[STOP] [{t.get_name()}] {e}. Thoát mã 1 sau {RESTART_DELAY}s để tránh khoá tài khoản.")
            elif e:
                logger.error(f"[STOP] [{t.get_name()}] lỗi không lường trước", exc_info=e)
    finally:
        for t in tasks:
            t.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        _stop_brave_if_running()
    logger.info(f"Chờ {RESTART_DELAY}s rồi thoát (exit 1) để Docker chạy lại")
    await asyncio.sleep(RESTART_DELAY)
    return code


def _stop_brave_if_running():
    """Thoát giữa lúc đang login browser (tầng 3) -> tắt Brave/Xvfb cho sạch."""
    try:
        import brave
        if brave.cdp_ready():
            brave.stop()
    except Exception as e:
        logger.warning(f"Tắt Brave lỗi: {e}")


async def _main() -> int:
    task = asyncio.create_task(supervisor())
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):        # docker stop gửi SIGTERM
        loop.add_signal_handler(sig, task.cancel)
    try:
        return await task
    except asyncio.CancelledError:
        logger.info("Nhận tín hiệu dừng -> thoát.")
        return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    sys.exit(asyncio.run(_main()))
