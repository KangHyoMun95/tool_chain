"""
Tầng 3: dùng browser CHỈ để lấy cookie đăng nhập KUBET, rồi tắt browser (tiết kiệm RAM).

  1. bash start_brave.sh (nếu CDP chưa chạy)
  2. connect_over_cdp -> lấy context
  3. truy cập + login như v1 (giữ nguyên selector, human_type, đóng popup)
  4. lấy cookie KUBET (BBOAUTH, ...)
  5. đóng page -> bash stop_brave.sh

Các hàm thao tác trang được chép nguyên từ main.py (v1); phần lobby / nghe network / TokenStore đã bỏ.
"""
from __future__ import annotations

import logging
import random
from urllib.parse import urlparse

from playwright.sync_api import Page, Playwright, TimeoutError as PWTimeout, Error as PWError, sync_playwright

import brave
from config import APP_PASSWORD, APP_USER, WEBSITE_URL
from exception import CycleError

logger = logging.getLogger("Crawler")

LOGIN_TEXT = "Đăng nhập"
NETWORK_ERROR = "Lỗi mạng, vui lòng làm mới giao diện"
STOP_BRAVE_AFTER = True          # tắt Brave sau khi lấy cookie (tiết kiệm RAM)


# ---------------------------------------------------------------------------
# Tiện ích thao tác trang (từ v1)
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
    """True nếu thấy nút Đăng nhập, False nếu đã đăng nhập."""
    login_btn = page.locator("#loginbutton")
    target = login_btn
    if account_text:
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
        if "ERR_ABORTED" not in str(e) and "detached" not in str(e):
            raise
        logger.info("[page] Reload bị cắt ngang do trang tự điều hướng, bỏ qua")
    return True


# ---------------------------------------------------------------------------
# Trình duyệt (từ v1)
# ---------------------------------------------------------------------------

def reuse_browser(playwright: Playwright):
    """Kết nối vào Brave đang mở. Trả về (browser, context, pages_before, page)."""
    try:
        browser = playwright.chromium.connect_over_cdp(brave.CDP_URL)
    except Exception as e:
        raise CycleError(f"Không kết nối được {brave.CDP_URL} ({e})")
    context = browser.contexts[0]
    pages_before = set(context.pages)
    page = context.new_page()
    return browser, context, pages_before, page


def cleanup(context, pages_before: set):
    """Đóng mọi tab script đã mở, giữ nguyên tab có sẵn."""
    try:
        for pg in context.pages:
            if pg not in pages_before and not pg.is_closed():
                pg.close()
        logger.info("[cleanup] Đã đóng các tab của script")
    except Exception as e:
        logger.warning(f"[cleanup] Bỏ qua lỗi khi dọn: {e}")


# ---------------------------------------------------------------------------
# Các bước (từ v1)
# ---------------------------------------------------------------------------

def access_website(page: Page):
    logger.info(f"[3] Đang truy cập {WEBSITE_URL}")
    page.goto(WEBSITE_URL, wait_until="domcontentloaded")
    start_host = urlparse(WEBSITE_URL).hostname
    try:
        page.wait_for_url(lambda url: urlparse(url).hostname != start_host, timeout=30_000)
    except PWTimeout:
        raise CycleError(f"Sau 30s vẫn ở {page.url}, không thấy chuyển domain")
    page.wait_for_load_state("domcontentloaded")
    logger.info(f"[3] Truy cập thành công: {page.url}")


def login_website(page: Page):
    login = page.locator("#loginbutton")
    try:
        login.wait_for(state="visible", timeout=15_000)
    except PWTimeout:
        raise CycleError(f"Không tìm thấy nút {LOGIN_TEXT}")

    page.wait_for_timeout(1_500)             # chờ popup kịp hiện rồi mới đóng
    dismiss_popups(page)
    login.click()

    dialog = page.locator("#login")
    try:
        dialog.wait_for(state="visible", timeout=10_000)
    except PWTimeout:
        raise CycleError("Đã bấm nhưng dialog đăng nhập không hiện ra")

    human_type(dialog.locator("#accountId"), APP_USER)
    page.wait_for_timeout(random.randint(300, 700))
    human_type(dialog.locator("#accountPwd"), APP_PASSWORD)

    try:
        page.wait_for_function("() => !document.querySelector('#signin').disabled", timeout=10_000)
    except PWTimeout:
        raise CycleError("Đã gõ nhưng nút Đăng nhập vẫn bị khóa")

    page.wait_for_timeout(random.randint(300, 800))
    dialog.locator("#signin").click()

    try:
        dialog.wait_for(state="hidden", timeout=20_000)
    except PWTimeout:
        check_bot(page)
        raise CycleError("Bấm Đăng nhập nhưng dialog không đóng (sai tài khoản?)")
    logger.info("[3] Đăng nhập thành công")
    page.wait_for_timeout(1_000)
    dismiss_popups(page)


def clean_after_login(context, pg, pages_before, wait_ms: int = 3_000):
    """Sau login: chờ popup hiện ra hết, rồi đóng mọi tab/cửa sổ mới và popup trong trang."""
    pg.wait_for_timeout(wait_ms)
    for p in context.pages:
        if p != pg and p not in pages_before and not p.is_closed():
            logger.info(f"[clean] Đóng tab: {p.url}")
            try:
                p.close()
            except Exception:
                pass
    pg.bring_to_front()
    dismiss_popups(pg)


# ---------------------------------------------------------------------------
# Tầng 3
# ---------------------------------------------------------------------------

def harvest_kubet_session() -> dict:
    """Chạy SYNC (gọi qua asyncio.to_thread). Trả về {"kubet_host", "kubet_cookies"}."""
    logger.info("[1] Khởi động Brave automation")
    brave.start()
    try:
        with sync_playwright() as p:
            logger.info("[2] Kết nối Brave qua CDP")
            browser, context, pages_before, pg = reuse_browser(p)
            try:
                access_website(pg)
                check_bot(pg)
                check_network_issue(pg)
                if need_login(pg, account_text=APP_USER):
                    login_website(pg)
                    check_bot(pg)
                else:
                    logger.info("[3] Profile còn đăng nhập, bỏ qua bước login")
                clean_after_login(context, pg, pages_before)

                host = urlparse(pg.url).hostname
                cookies = {c["name"]: c["value"] for c in context.cookies(f"https://{host}/")}
                if "BBOAUTH" not in cookies:
                    raise CycleError(f"Không thấy cookie BBOAUTH trên {host}: {list(cookies)}")
                logger.info(f"[4] Lấy được cookie KUBET {list(cookies)} từ {host}")
                # KUBET gắn session với User-Agent -> Python phải dùng đúng UA của Brave này
                ident = pg.evaluate("""() => {
                    const d = navigator.userAgentData;
                    return {
                        user_agent: navigator.userAgent,
                        sec_ch_ua: d ? d.brands.map(b => `"${b.brand}";v="${b.version}"`).join(", ") : null,
                        sec_ch_ua_platform: d ? `"${d.platform}"` : null,
                    };
                }""")
                logger.info(f"[4] User-Agent của browser: {ident.get('user_agent')}")
                return {"kubet_host": host, "kubet_cookies": cookies, "browser_identity": ident}
            finally:
                cleanup(context, pages_before)      # [5] đóng page
    finally:
        if STOP_BRAVE_AFTER:
            logger.info("[5] Tắt Brave")
            brave.stop()
