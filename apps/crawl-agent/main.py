import asyncio
import logging
import random
import time
from threading import Event, Thread
from urllib.parse import urlparse

from playwright.sync_api import (
    Browser, BrowserContext, Error as PWError, Page, Playwright,
    TimeoutError as PWTimeout, sync_playwright,
)

from config import APP_PASSWORD, APP_USER, BRAVE_PATH, WEBSITE_URL
from exception import CycleError, BotCheckError
from listener_message import listen_ws
from store.token_store import TokenStore

logger = logging.getLogger("Crawler")

CDP_URL = "http://127.0.0.1:9222"
LOGIN_TEXT = "Đăng nhập"
HEADLESS = True

LOBBY = "LIVE CASINO"           # <-- điền text thật
LOBBY_1 = "SEXY"
ACCESS_LOBBY = "Vào trò chơi"
NETWORK_ERROR = "Lỗi mạng, vui lòng làm mới giao diện"
TOKEN_API = "/player/query/getToken"

TOKEN_IDLE_LIMIT = 15 * 60   # quá 15 phút không có getToken mới -> chạy lại
MAX_NETWORK_RELOAD = 3       # reload vì NETWORK_ERROR quá 3 lần liên tiếp -> chạy lại
MAX_FAILS = 10               # lỗi liên tiếp quá 10 lần -> dừng hẳn
STABLE_AFTER = 10 * 60       # chạy ổn quá 10 phút -> reset bộ đếm lỗi


# ---------------------------------------------------------------------------
# Tiện ích thao tác trang
# ---------------------------------------------------------------------------

def human_type(locator, text, min_delay=80, max_delay=200):
    """Gõ từng ký tự như người thật, mỗi phím cách nhau một khoảng ngẫu nhiên."""
    locator.click()
    locator.press("Control+A")   # xóa nội dung cũ (nếu có)
    locator.press("Backspace")
    for ch in text:
        locator.press_sequentially(ch)
        locator.page.wait_for_timeout(random.randint(min_delay, max_delay))


def dismiss_popups(page: Page, rounds=3):
    """Đóng các popup tự hiện. Lặp vài vòng vì có popup đóng xong popup khác mới hiện."""
    close_selectors = [
        ".fancybox-close",
        "[class*='close']:visible",
        "[aria-label*='lose']:visible",
    ]
    for _ in range(rounds):
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        closed = False
        for sel in close_selectors:
            for btn in page.locator(sel).all():
                try:
                    if btn.is_visible():
                        btn.click(timeout=1_000)
                        closed = True
                except Exception:
                    pass
        if not closed:
            break
        page.wait_for_timeout(500)


def check_bot(page: Page):
    """Ném BotCheckError nếu thấy dấu hiệu bị check bot.
    TODO: thay bằng dấu hiệu thật của màn hình check bot."""
    # if page.get_by_text("...").locator("visible=true").count():
    #     raise BotCheckError("Bị check bot")
    pass


def need_login(page: Page, timeout: int = 10_000, account_text: str | None = None) -> bool:
    """True nếu thấy nút Đăng nhập, False nếu đã đăng nhập.

    Chờ tối đa `timeout` ms tới khi hiện nút Đăng nhập HOẶC tên tài khoản,
    tránh kết luận sai khi trang load chậm.
    """
    login_btn = page.locator("#loginbutton")
    target = login_btn
    if account_text:
        # get_by_text mặc định không phân biệt hoa thường -> khớp cả khi site viết hoa tên
        target = login_btn.or_(page.get_by_text(account_text).locator("visible=true"))
    try:
        target.first.wait_for(state="visible", timeout=timeout)
    except PWTimeout:
        return False
    return login_btn.is_visible()


def check_network_issue(page: Page) -> bool:
    """Nếu trang đang hiện NETWORK_ERROR thì reload. Trả về True nếu đã reload."""
    err = page.get_by_text(NETWORK_ERROR, exact=False).locator("visible=true")
    if err.count() == 0:
        return False

    logger.warning(f"[page] Thấy '{NETWORK_ERROR}', reload...")
    try:
        page.reload(wait_until="domcontentloaded", timeout=30_000)
    except PWError as e:
        # Trang tự chuyển domain giữa chừng làm reload bị hủy -> coi như vẫn ổn
        if "ERR_ABORTED" not in str(e) and "detached" not in str(e):
            raise
        logger.info("[page] Reload bị cắt ngang do trang tự điều hướng, bỏ qua")
    return True


# ---------------------------------------------------------------------------
# Trình duyệt
# ---------------------------------------------------------------------------

def reuse_browser(playwright: Playwright):
    """Kết nối vào Brave đang mở. Trả về (browser, context, pages_before, page)."""
    try:
        browser = playwright.chromium.connect_over_cdp(CDP_URL)
    except Exception as e:
        raise CycleError(f"Không kết nối được {CDP_URL}. Đã chạy start_brave.sh chưa? ({e})")

    context = browser.contexts[0]            # phiên của cửa sổ đang mở
    pages_before = set(context.pages)        # tab có sẵn của bạn -> không đóng khi dọn
    page = context.new_page()
    return browser, context, pages_before, page


def open_browser(playwright: Playwright):
    """(Dự phòng) Tự mở Brave bằng Playwright."""
    browser = playwright.chromium.launch(executable_path=BRAVE_PATH, headless=HEADLESS)
    context = browser.new_context()
    return browser, context.new_page()


def cleanup(context: BrowserContext, pages_before: set):
    """Đóng mọi tab script đã mở trong chu kỳ này, giữ nguyên tab có sẵn."""
    try:
        if not pages_before:                 # giữ lại 1 tab để Brave không tự thoát
            context.new_page()
        for pg in context.pages:
            if pg not in pages_before and not pg.is_closed():
                pg.close()
        logger.info("[cleanup] Đã đóng các tab của chu kỳ")
    except Exception as e:
        logger.warning(f"[cleanup] Bỏ qua lỗi khi dọn: {e}")


# ---------------------------------------------------------------------------
# Các bước
# ---------------------------------------------------------------------------

def access_website(page: Page):
    logger.info(f"[1] Đang truy cập {WEBSITE_URL}")
    page.goto(WEBSITE_URL, wait_until="domcontentloaded")

    start_host = urlparse(WEBSITE_URL).hostname
    try:
        page.wait_for_url(lambda url: urlparse(url).hostname != start_host, timeout=30_000)
    except PWTimeout:
        raise CycleError(f"Sau 30s vẫn ở {page.url}, không thấy chuyển domain")

    page.wait_for_load_state("domcontentloaded")
    logger.info(f"[2] Truy cập thành công: {page.url}")


def login_website(page: Page):
    login = page.locator("#loginbutton")
    try:
        login.wait_for(state="visible", timeout=15_000)
    except PWTimeout:
        raise CycleError(f"Không tìm thấy nút {LOGIN_TEXT}")
    logger.info(f"[3] Đã tìm thấy nút {LOGIN_TEXT}")

    page.wait_for_timeout(1_500)             # chờ popup kịp hiện rồi mới đóng
    dismiss_popups(page)
    login.click()

    dialog = page.locator("#login")
    try:
        dialog.wait_for(state="visible", timeout=10_000)
    except PWTimeout:
        raise CycleError("Đã bấm nhưng dialog đăng nhập không hiện ra")
    logger.info("[4] Dialog đăng nhập đã hiện")

    human_type(dialog.locator("#accountId"), APP_USER)
    page.wait_for_timeout(random.randint(300, 700))
    human_type(dialog.locator("#accountPwd"), APP_PASSWORD)

    try:
        page.wait_for_function("() => !document.querySelector('#signin').disabled",
                               timeout=10_000)
    except PWTimeout:
        raise CycleError("Đã gõ nhưng nút Đăng nhập vẫn bị khóa")

    page.wait_for_timeout(random.randint(300, 800))
    dialog.locator("#signin").click()

    # Đăng nhập thành công = dialog đóng lại
    try:
        dialog.wait_for(state="hidden", timeout=20_000)
    except PWTimeout:
        check_bot(page)
        raise CycleError("Bấm Đăng nhập nhưng dialog không đóng (sai tài khoản?)")
    logger.info("[5] Đăng nhập thành công")

    page.wait_for_timeout(1_000)
    dismiss_popups(page)


def access_lobby(page: Page):
    """LOBBY (hover) -> LOBBY_1 (click) -> ACCESS_LOBBY (click, mở tab mới)."""
    menu = page.get_by_text(LOBBY, exact=True).locator("visible=true").first
    try:
        menu.wait_for(state="visible", timeout=15_000)
    except PWTimeout:
        raise CycleError(f"Không thấy menu '{LOBBY}'")
    menu.hover()

    item = page.get_by_text(LOBBY_1, exact=True).locator("visible=true").first
    try:
        item.wait_for(state="visible", timeout=5_000)
    except PWTimeout:
        raise CycleError(f"Hover '{LOBBY}' nhưng không thấy mục '{LOBBY_1}'")

    page.wait_for_timeout(300)
    item.hover()                             # giữ chuột trong vùng menu
    page.wait_for_timeout(200)
    item.click()

    target = page.get_by_text(ACCESS_LOBBY, exact=True).locator("visible=true").first
    try:
        target.wait_for(state="visible", timeout=10_000)
    except PWTimeout:
        raise CycleError(f"Không thấy '{ACCESS_LOBBY}' sau khi mở popup")

    target.scroll_into_view_if_needed()
    page.wait_for_timeout(300)
    target.click()
    logger.info("[6] Đã vào sảnh")


def handle_token_response(res, store: TokenStore):
    """Đọc response getToken -> đẩy path/token/cookie vào store."""
    try:
        rs = res.json()
    except Exception:
        logger.warning(f"[token] getToken {res.status} không phải JSON, bỏ qua")
        return

    path, token = rs.get("path"), rs.get("token")
    if not path or not token:
        logger.warning(f"[token] Response thiếu path/token: keys={list(rs.keys())}")
        return

    cookie = res.request.all_headers().get("cookie")
    if not cookie:
        jar = res.frame.page.context.cookies(res.url)
        cookie = "; ".join(f"{c['name']}={c['value']}" for c in jar)

    store.update(path, token, cookie)


def watch_loop(context: BrowserContext, pg: Page, pending: list,
               store: TokenStore, stop_event: Event):
    """Nghe getToken mãi mãi + canh các lỗi. Gặp lỗi -> ném CycleError."""
    lobby_page = None
    last_token_at = time.time()
    last_check = 0.0
    network_reloads = 0

    while not stop_event.is_set():
        pg.wait_for_timeout(300)             # giữ Playwright xử lý event

        while pending:
            res = pending.pop(0)
            lobby_page = lobby_page or res.frame.page
            handle_token_response(res, store)
            last_token_at = time.time()
            network_reloads = 0

        if time.time() - last_check < 3:
            continue
        last_check = time.time()

        if pg.is_closed() or (lobby_page and lobby_page.is_closed()):
            raise CycleError("Tab bị đóng")
        if time.time() - last_token_at > TOKEN_IDLE_LIMIT:
            raise CycleError("Quá lâu không có getToken mới")

        watch = lobby_page or pg
        check_bot(watch)
        if need_login(pg, timeout=500, account_text=APP_USER):
            raise CycleError("Phiên đăng nhập hết hạn")
        if check_network_issue(watch):
            network_reloads += 1
            if network_reloads > MAX_NETWORK_RELOAD:
                raise CycleError(f"NETWORK_ERROR lặp lại {network_reloads} lần")


# ---------------------------------------------------------------------------
# Một chu kỳ trong thread Playwright
# ---------------------------------------------------------------------------

def browser_worker(store: TokenStore, stop_event: Event, report):
    """report(exc): báo kết quả về supervisor. Không để lỗi thoát khỏi thread."""
    try:
        with sync_playwright() as playwright:
            _, context, pages_before, pg = reuse_browser(playwright)
            pending = []

            def on_response(res):
                if TOKEN_API in res.url:
                    pending.append(res)      # chỉ giữ lại, đọc body ngoài callback

            try:
                access_website(pg)
                check_bot(pg)
                check_network_issue(pg)

                if need_login(pg, account_text=APP_USER):
                    login_website(pg)
                    check_bot(pg)

                # Bật nghe TRƯỚC khi click ACCESS_LOBBY, để không lỡ getToken đầu tiên
                context.on("response", on_response)
                access_lobby(pg)
                watch_loop(context, pg, pending, store, stop_event)
            finally:
                try:
                    context.remove_listener("response", on_response)
                except Exception:
                    pass
                cleanup(context, pages_before)
    except BotCheckError as e:
        report(e)
    except Exception as e:
        report(e if isinstance(e, CycleError) else CycleError(f"{type(e).__name__}: {e}"))
    else:
        report(None)


# ---------------------------------------------------------------------------
# Supervisor: lỗi -> dọn dẹp -> chạy lại
# ---------------------------------------------------------------------------

async def run_one_cycle():
    loop = asyncio.get_running_loop()
    store = TokenStore()                     # mỗi chu kỳ một store mới
    store.bind_loop(loop)

    worker_done = loop.create_future()

    def report(exc):
        loop.call_soon_threadsafe(
            lambda: worker_done.done() or worker_done.set_result(exc))

    stop_event = Event()
    worker = Thread(target=browser_worker, args=(store, stop_event, report), daemon=True)
    worker.start()
    ws_task = asyncio.create_task(listen_ws(store))

    try:
        done, _ = await asyncio.wait({ws_task, worker_done},
                                     return_when=asyncio.FIRST_COMPLETED)
        if worker_done in done:
            raise worker_done.result() or CycleError("Thread trình duyệt dừng bất thường")
        ws_task.result()                     # ném lỗi của websocket nếu có
        raise CycleError("Websocket dừng bất thường")
    finally:
        stop_event.set()
        ws_task.cancel()
        await asyncio.gather(ws_task, return_exceptions=True)
        await asyncio.to_thread(worker.join, 30)


async def supervisor():
    fails, backoff = 0, 5
    while True:
        started = time.time()
        try:
            await run_one_cycle()
        except BotCheckError as e:
            logger.error(f"[STOP] {e}. Dừng hẳn, không chạy lại.")
            return
        except Exception as e:
            if time.time() - started > STABLE_AFTER:
                fails, backoff = 0, 5
            fails += 1
            logger.warning(f"[restart] Lỗi lần {fails}: {e}. Chạy lại sau {backoff}s")
            if fails >= MAX_FAILS:
                logger.error(f"[STOP] Lỗi liên tiếp {fails} lần, dừng để tránh khóa tài khoản.")
                return
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 300)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    try:
        asyncio.run(supervisor())
    except KeyboardInterrupt:
        logger.info("Dừng.")