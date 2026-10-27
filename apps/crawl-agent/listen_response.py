from threading import Event

from playwright.sync_api import Page

from store.token_store import TokenStore

TOKEN_API = "/player/query/getToken"

def handle_token_response(res, store: TokenStore):
    """Đọc response getToken -> đẩy vào store. Chạy trong thread Playwright."""
    try:
        rs = res.json()
    except Exception:
        print(f"[token] getToken {res.status} không phải JSON, bỏ qua")
        return

    path, token = rs.get("path"), rs.get("token")
    if not path or not token:
        print(f"[token] response thiếu path/token: keys={list(rs.keys())}")
        return

    cookie = res.request.all_headers().get("cookie")
    if not cookie:
        jar = res.frame.page.context.cookies(res.url)
        cookie = "; ".join(f"{c['name']}={c['value']}" for c in jar)

    store.update(path, token, cookie)

def start_token_capture(pg: Page, store: TokenStore, stop_event: Event):
    """Bật nghe getToken trên mọi tab của context. Gọi TRƯỚC khi click ACCESS_LOBBY."""
    pending = []

    def on_response(res):
        if TOKEN_API in res.url and not pending:
            pending.append(res)

    pg.context.on("response", on_response)
    try:
        while not stop_event.is_set():
            pg.wait_for_timeout(300)
            while pending:
                handle_token_response(pending.pop(0), store)
    finally:
        pg.context.remove_listener("response", on_response)
