"""Ghi lại mọi network (API) mà page / new page đã gọi, kể cả khi page redirect, reload hay điều hướng sang trang khác.

Lắng nghe ở mức BrowserContext nên bắt được cả tab mở sau đó (popup, window.open) và mọi frame/iframe.
Tất cả lưu chung MỘT file output/network/network_<thời điểm>.jsonl, mỗi request một dòng JSON:

    {"api_url": "", "method": "", "status": 200, "resource_type": "", "redirect_location": null,
     "redirected_from": null, "request_header": {}, "payload": "", "response_header": {},
     "response_body": "", "body_source": "playwright|cdp-fetch|null"}

Cookie nằm sẵn trong header: `cookie` ở request_header, `set-cookie` ở response_header.

Cách dùng (Playwright sync, gọi trong cùng thread với Playwright):

    from tracking_network import NetworkTracker

    access_lobby(pg)
    tracker = NetworkTracker(context, only_api=False)   # only_api=False để lấy cả document (trang login/redirect)
    tracker.start()
    ...
    tracker.drain()                        # gọi đều đặn trong vòng lặp (vd watch_loop) để đọc body
    # hoặc thay cho pg.wait_for_timeout(ms):  tracker.wait(pg, 5_000)
    ...
    tracker.stop()

Body của trang (document) bị null trước đây vì sao, và đã sửa thế nào:
- Trước: body chỉ được đọc trong drain(), lúc đó trang đã điều hướng đi (form auto-submit, location.replace...)
  => Chrome đã xoá resource => response.body() lỗi => null.
- Giờ: với resource type Document, tracker bật CDP `Fetch` ở giai đoạn Response cho từng page. Trình duyệt
  TẠM DỪNG response, tracker đọc body ngay (Fetch.getResponseBody) rồi mới cho đi tiếp, nên không bao giờ mất.
  Request xhr/fetch vẫn đọc như cũ trong drain().
- Redirect 3xx thì vốn không có body: giờ ghi thêm `status` + `redirect_location` để thấy được chuỗi chuyển hướng.

Lưu ý:
- capture_documents dùng CDP => chỉ chạy với Chromium/Chrome/Brave (không chạy với Firefox/WebKit).
- Navigation đầu tiên của một tab mới (window.open) có thể diễn ra trước khi tracker kịp gắn CDP vào tab đó;
  các navigation sau đó (redirect, form submit) trong tab vẫn bắt được.
- File chứa cookie / token thật: nằm trong output/ (đã gitignore), không commit, không gửi đi đâu.
"""
import base64
import json
import logging
import threading
import time
from collections import defaultdict, deque
from pathlib import Path
from typing import Optional

from playwright.sync_api import BrowserContext, Page, Request

logger = logging.getLogger("Crawler")

API_RESOURCE_TYPES = {"xhr", "fetch", "eventsource", "ping"}
TEXT_HINTS = ("json", "text", "xml", "javascript", "x-www-form-urlencoded", "html", "msgpack-json")
REDIRECT_STATUSES = {301, 302, 303, 307, 308}


def _is_text(content_type: str) -> bool:
    ct = (content_type or "").lower()
    return any(h in ct for h in TEXT_HINTS)


def _b64(data: bytes) -> str:
    return base64.b64encode(data).decode("ascii")


class NetworkTracker:
    def __init__(
        self,
        context: BrowserContext,
        out_dir: str = "output/network",
        only_api: bool = True,
        max_body_bytes: int = 2_000_000,
        capture_documents: bool = True,
    ):
        self.context = context
        self.only_api = only_api
        self.max_body_bytes = max_body_bytes
        # Chỉ cần bắt body document khi có ghi document (only_api=False)
        self.capture_documents = capture_documents and not only_api
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        stamp = time.strftime("%Y%m%d_%H%M%S")
        self.path = Path(out_dir) / f"network_{stamp}.jsonl"
        self._queue: deque = deque()
        self._lock = threading.Lock()
        self._count = 0
        self._started = False
        # Body document bắt được qua CDP: key (method, url) -> deque các {status, headers, body, base64}
        self._doc_bodies: dict = defaultdict(deque)
        self._cdp_sessions: dict = {}           # page -> CDPSession

    # ------------------------------------------------------------------
    # Bật / tắt
    # ------------------------------------------------------------------

    def start(self):
        if self._started:
            return
        self.context.on("requestfinished", self._enqueue)
        self.context.on("requestfailed", self._enqueue)
        if self.capture_documents:
            for page in self.context.pages:
                self._attach_cdp(page)
            self.context.on("page", self._attach_cdp)
        self._started = True
        logger.info(f"[net] Bắt đầu ghi network -> {self.path}")

    def stop(self):
        if not self._started:
            return
        for event in ("requestfinished", "requestfailed"):
            try:
                self.context.remove_listener(event, self._enqueue)
            except Exception:
                pass
        if self.capture_documents:
            try:
                self.context.remove_listener("page", self._attach_cdp)
            except Exception:
                pass
            for session in list(self._cdp_sessions.values()):
                try:
                    session.send("Fetch.disable")
                    session.detach()
                except Exception:
                    pass
            self._cdp_sessions.clear()
        self._started = False
        self.drain()
        logger.info(f"[net] Đã dừng ghi network ({self._count} request) -> {self.path}")

    def wait(self, page: Page, ms: int, step_ms: int = 500):
        """Thay cho page.wait_for_timeout(ms): vừa chờ vừa drain để không lỡ body."""
        waited = 0
        while waited < ms:
            page.wait_for_timeout(min(step_ms, ms - waited))
            waited += step_ms
            self.drain()

    # ------------------------------------------------------------------
    # CDP Fetch: giữ body của document trước khi trang điều hướng đi
    # ------------------------------------------------------------------

    def _attach_cdp(self, page: Page):
        if page in self._cdp_sessions:
            return
        try:
            session = self.context.new_cdp_session(page)
            session.on("Fetch.requestPaused", lambda e, s=session: self._on_paused(s, e))
            session.send("Fetch.enable", {"patterns": [
                {"urlPattern": "*", "resourceType": "Document", "requestStage": "Response"},
            ]})
            self._cdp_sessions[page] = session
            page.on("close", lambda p: self._cdp_sessions.pop(p, None))
        except Exception as e:
            logger.warning(f"[net] Không gắn được CDP vào page {page.url}: {type(e).__name__}: {e}")

    def _on_paused(self, session, event: dict):
        # Phải luôn continueRequest, nếu không trang sẽ treo => để trong finally
        request_id = event["requestId"]
        try:
            status = event.get("responseStatusCode")
            if event.get("responseErrorReason") or status is None or status in REDIRECT_STATUSES:
                return  # 3xx/lỗi: không có body; status + location đã có ở bản ghi Playwright
            res = session.send("Fetch.getResponseBody", {"requestId": request_id})
            raw = base64.b64decode(res["body"]) if res.get("base64Encoded") else res["body"].encode("utf-8")
            req = event.get("request", {})
            with self._lock:
                q = self._doc_bodies[(req.get("method", "GET"), req.get("url", ""))]
                q.append(raw[: self.max_body_bytes])
                while len(q) > 5:        # tránh phình bộ nhớ nếu không được drain
                    q.popleft()
        except Exception as e:
            logger.debug(f"[net] Fetch.getResponseBody lỗi: {type(e).__name__}: {e}")
        finally:
            try:
                session.send("Fetch.continueRequest", {"requestId": request_id})
            except Exception:
                pass

    def _pop_doc_body(self, request: Request) -> Optional[bytes]:
        key = (request.method, request.url)
        with self._lock:
            q = self._doc_bodies.get(key)
            if q:
                body = q.popleft()
                if not q:
                    self._doc_bodies.pop(key, None)
                return body
        # URL có fragment (#...) hoặc khác encoding: thử khớp bỏ fragment
        base = request.url.split("#", 1)[0]
        with self._lock:
            for (m, u), q in list(self._doc_bodies.items()):
                if m == request.method and u.split("#", 1)[0] == base and q:
                    return q.popleft()
        return None

    # ------------------------------------------------------------------
    # Thu thập
    # ------------------------------------------------------------------

    def _enqueue(self, request: Request):
        # Chỉ xếp hàng: không gọi API Playwright (body, headers...) trong callback
        self._queue.append(request)

    def drain(self):
        """Đọc body/header của các request đã xong và ghi ra file. Gọi trong thread Playwright."""
        if not self._queue:
            return
        with self.path.open("a", encoding="utf-8") as f:
            while self._queue:
                request = self._queue.popleft()
                try:
                    if self.only_api and request.resource_type not in API_RESOURCE_TYPES:
                        continue
                    record = self._build_record(request)
                except Exception as e:
                    logger.warning(f"[net] Bỏ qua request lỗi: {type(e).__name__}: {e}")
                    continue
                f.write(json.dumps(record, ensure_ascii=False) + "\n")
                f.flush()

    def _build_record(self, request: Request) -> dict:
        self._count += 1
        prev = self._safe(lambda: request.redirected_from)
        record: dict = {
            "api_url": request.url,
            "method": request.method,
            "status": None,
            "resource_type": request.resource_type,
            "redirect_location": None,
            "redirected_from": prev.url if prev else None,
            "request_header": self._safe(request.all_headers) or request.headers,
            "payload": self._payload(request),
            "response_header": None,
            "response_body": None,
            "body_source": None,
            "failure": self._safe(lambda: request.failure),
        }
        response = self._safe(request.response)       # None khi request lỗi / bị hủy
        if response is None:
            return record
        headers = self._safe(response.all_headers) or response.headers
        record["response_header"] = headers
        record["status"] = response.status
        if response.status in REDIRECT_STATUSES:
            record["redirect_location"] = headers.get("location")
            return record                             # 3xx không có body

        body, source = None, None
        try:
            body, source = response.body(), "playwright"
        except Exception:                             # trang đã điều hướng đi: lấy bản CDP đã giữ lại
            pass
        if body is None and request.resource_type == "document":
            body = self._pop_doc_body(request)
            source = "cdp-fetch" if body is not None else None
        elif request.resource_type == "document":
            self._pop_doc_body(request)               # đã có body từ Playwright: bỏ bản CDP trùng
        if body is None:
            return record

        body = body[: self.max_body_bytes]
        record["body_source"] = source
        if _is_text(headers.get("content-type", "")):
            record["response_body"] = body.decode("utf-8", errors="replace")
        else:
            record["response_body"] = _b64(body)
        return record

    def _payload(self, request: Request) -> Optional[str]:
        text = self._safe(lambda: request.post_data)
        if text is not None:
            return text
        buf = self._safe(lambda: request.post_data_buffer)
        return _b64(buf) if buf else None

    @staticmethod
    def _safe(fn):
        try:
            return fn()
        except Exception:
            return None