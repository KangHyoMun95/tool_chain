"""
getToken client + cơ chế re-call, dựng lại từ network log (đã xác nhận bằng body thật, 2026-11-07).

Chuỗi login (đã xác nhận):
  1. [KUBET]  GET  https://www.zhav373.net/CheckGame?gameType=AES&subGameType=AESLive&dt=<user><ticks>
              cookie: BBOAUTH, BBOSID, IT, _culture
              HTML có:  gameUrl = '{"RedirectUrl":"https://gci.usplaynet.com/player/login/apiLogin0?agentId=hv2&x=..."}'
  2. [GCI]    GET  apiLogin0?agentId=hv2&x=...        -> Set-Cookie JSESSIONID (usplaynet.com)
              HTML: <form id=form1 action=/player/login/apiLogin> với userId, tokenId, trace...
              JS điền trafficStatistics* (fingerprint hash của trình duyệt) rồi submit.
  3. [GCI]    POST /player/login/apiLogin (x-www-form-urlencoded)
              body: <script>location.replace("https://<GAME_HOST>/api/MexAWS031/login?user=..&key=..&...")</script>
              GAME_HOST THAY ĐỔI theo phiên (vd bpcdf.tgmeq.com, bpcdf.mex777.com) -> phải lấy từ đây.
  4. [GAME]   GET  /api/MexAWS031/login?...           -> Set-Cookie JSESSIONID (Domain=<game domain>), ROUTEID
              JS: document.cookie="rcr=987"; location.href="/api/player/MexAWS031/login?...(cùng query)&"
  5. [GAME]   GET  /api/player/MexAWS031/login?...&   -> JS onload: location.href="/player/webMain.jsp?dm=1&title=1"
  6. [GAME]   GET  /player/webMain.jsp?dm=1&title=1
  7. [GAME]   POST /player/query/getToken (body rỗng) -> {"status":"200","token":"<JWT 60s>","host":null,"path":"/h54uk/"}
              WSS  wss://<GAME_HOST>/h54uk/?token=<JWT>

Cơ chế re-call (webSocket.js + log thật):
  - getToken chỉ gọi khi (re)connect WebSocket. Token chỉ dùng cho handshake, exp = +60s.
  - Heartbeat 5s; >2 nhịp không có message -> close + reconnect (=> gọi lại getToken).
    Log thật cho thấy getToken được gọi lại đúng mỗi ~15s = 3 nhịp heartbeat.
  - queryCurrentServerId poll 5s, "sI" đổi -> systemRolling -> reconnect.
  - Retry mỗi 5s khi lỗi.
  - JSESSIONID game chết -> getToken không trả "200" -> chạy lại chuỗi login từ bước 1.
"""
from __future__ import annotations

import base64
import json
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse

import requests

log = logging.getLogger("sexy_token")

UA = ("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/156.0.0.0 Safari/537.36")

# Giá trị fingerprint lấy từ payload apiLogin thật (trình duyệt của bạn tính bằng trafficStatistics.js).
# Server dùng để thống kê / chống bot; nếu bị chặn thì thay bằng giá trị mới lấy từ log.
DEFAULT_TRAFFIC = {
    "trafficStatistics": "1204048494",
    "trafficStatisticsCanvas": "808722930",
    "trafficStatisticsActivex": "1204048494",
    "trafficStatisticsResolution": "1395138588",
    "trafficStatistics2": "",
}


# ----------------------------------------------------------------------------- utils
def jwt_exp(token: str) -> int:
    """Đọc field exp (epoch giây) trong JWT, không verify chữ ký."""
    payload = token.split(".")[1]
    payload += "=" * (-len(payload) % 4)
    return int(json.loads(base64.urlsafe_b64decode(payload))["exp"])


def _short(text: str, n: int = 160) -> str:
    """Gộp khoảng trắng / dòng trống cho log gọn."""
    return re.sub(r"\s+", " ", text or "").strip()[:n]


def _dump_debug(tag: str, r: requests.Response) -> str:
    """Lưu response vào debug/ để xem server thật sự trả gì. Trả về đường dẫn (hoặc lỗi)."""
    try:
        d = Path("debug"); d.mkdir(exist_ok=True)
        p = d / f"{tag}_{time.strftime('%Y%m%d_%H%M%S')}.html"
        meta = {"url": r.url, "status": r.status_code, "history": [h.url for h in r.history],
                "set_cookie": r.headers.get("Set-Cookie"),
                "request_headers": {k: v for k, v in r.request.headers.items() if k.lower() != "cookie"},
                "request_cookie_names": [kv.split("=")[0].strip() for kv in (r.request.headers.get("Cookie") or "").split(";") if kv]}
        p.write_text(f"<!-- {json.dumps(meta, ensure_ascii=False)} -->\n{r.text}", encoding="utf-8")
        return str(p)
    except Exception as e:
        return f"(không lưu được: {e})"


def _js_redirect(html: str) -> str | None:
    """Bắt location.replace("...") / location.href = "..." (ưu tiên nhánh đầu tiên trong if/else)."""
    m = re.search(r"""location(?:\.href\s*=\s*|\.replace\(\s*|\.assign\(\s*)["']([^"']+)["']""", html)
    return m.group(1).replace("&amp;", "&") if m else None


class _FormParser(HTMLParser):
    """Lấy <form> đầu tiên + mọi <input name=...> không bị disabled (giống trình duyệt khi submit)."""

    def __init__(self):
        super().__init__()
        self.action, self.method, self.fields, self._in = None, "post", {}, False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "form" and self.action is None:
            self.action, self.method, self._in = a.get("action", ""), (a.get("method") or "post").lower(), True
        elif tag == "input" and self._in and a.get("name") and "disabled" not in a:
            self.fields[a["name"]] = a.get("value") or ""

    def handle_endtag(self, tag):
        if tag == "form":
            self._in = False


# ----------------------------------------------------------------------------- data
@dataclass
class WsToken:
    token: str
    path: str
    host: str | None
    exp: int
    fetched_at: float = field(default_factory=time.time)

    def ws_url(self, game_host: str, jsessionid: str = "") -> str:
        # JS: "wss://" + hostname + c.path + (";jsessionid="+srw nếu có) + "?token=" + c.token
        h = self.host or game_host
        js = f";jsessionid={jsessionid}" if jsessionid else ""
        return f"wss://{h}{self.path}{js}?token={self.token}"

    def seconds_left(self) -> float:
        return self.exp - time.time()


class SessionExpired(Exception):
    """getToken không trả 200 -> JSESSIONID game đã chết, cần login lại."""


class KubetSessionExpired(SessionExpired):
    """Cookie KUBET (BBOAUTH) đã chết -> Python không tự login được, cần browser (tầng 3)."""


# ----------------------------------------------------------------------------- client
class SexyTokenClient:
    def __init__(self, game_host: str | None = None,
                 kubet_host: str = "www.zhav373.net",
                 game_cookies: dict | None = None,
                 kubet_cookies: dict | None = None,
                 game_login_url: str | None = None,
                 traffic: dict | None = None,
                 browser_identity: dict | None = None):
        """
        game_host    : host game hiện tại (vd bpcdf.mex777.com). Có thể để None: sẽ lấy từ game_login_url
                       hoặc từ chuỗi login.
        game_cookies : cookie của host game (JSESSIONID, ROUTEID, rcr, load_balancer, __cflb)
                       -> đủ để gọi getToken ngay (bước 7).
        game_login_url: URL https://<game_host>/api/MexAWS031/login?user=..&key=.. (vào lại từ bước 4,
                       nếu key còn dùng lại được).
        kubet_cookies: cookie KUBET (BBOAUTH, BBOSID, IT, _culture) -> login lại toàn bộ từ bước 1.
        traffic      : giá trị trafficStatistics* (mặc định lấy từ log thật).
        browser_identity: {"user_agent", "sec_ch_ua", "sec_ch_ua_platform"} của chính Brave đã login
                       (KUBET gắn session với User-Agent: UA lệch -> CheckGame từ chối + xoá BBOAUTH).
        """
        self.kubet_host = kubet_host
        self.game_login_url = game_login_url
        self.game_host = game_host or (urlparse(game_login_url).hostname if game_login_url else None)
        self.traffic = {**DEFAULT_TRAFFIC, **(traffic or {})}
        self.s = requests.Session()
        self.s.headers.update({
            "User-Agent": UA,
            "Accept-Language": "en-US,en;q=0.9",
            "sec-ch-ua": '"Not:A-Brand";v="8", "Chromium";v="156", "Brave";v="156"',
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": '"Linux"',
        })
        self.browser_identity: dict = {}
        if browser_identity:
            self.set_browser_identity(browser_identity)
        if game_cookies and not self.game_host:
            raise ValueError("Có game_cookies thì phải có game_host (vd bpcdf.mex777.com)")
        for k, v in (game_cookies or {}).items():
            self.s.cookies.set(k, v, domain=self.game_host, path="/")
        for k, v in (kubet_cookies or {}).items():
            self.s.cookies.set(k, v, domain=kubet_host, path="/")
        self._lock = threading.Lock()
        self.current: WsToken | None = None

    # ---------------------------------------------------------------- helpers
    def _nav(self, method: str, url: str, referer: str | None = None, **kw) -> requests.Response:
        """Request kiểu 'điều hướng trang' (document)."""
        headers = {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Upgrade-Insecure-Requests": "1",
            "sec-fetch-dest": "document", "sec-fetch-mode": "navigate",
        }
        if referer:
            headers["Referer"] = referer
        r = self.s.request(method, url, headers=headers, timeout=20, allow_redirects=True, **kw)
        log.debug("%s %s -> %s (%dB)", method, url[:100], r.status_code, len(r.content))
        r.raise_for_status()
        return r

    def game_cookies(self) -> dict:
        """Cookie hiện có cho host game (để lưu lại / dùng cho WebSocket)."""
        out = {}
        for c in self.s.cookies:
            d = (c.domain or "").lstrip(".")
            if self.game_host and (self.game_host == d or self.game_host.endswith("." + d)):
                out[c.name] = c.value
        return out

    # ---------------------------------------------------------------- bước 7: getToken
    def get_token(self) -> WsToken:
        if not self.game_host:
            raise SessionExpired("Chưa biết game_host -> cần login")
        base = f"https://{self.game_host}"
        r = self.s.post(
            f"{base}/player/query/getToken",
            data=b"",
            headers={
                "Accept": "application/json, text/javascript, */*; q=0.01",
                "Origin": base,
                "Referer": f"{base}/player/webMain.jsp?dm=1&title=1",
                "X-Requested-With": "XMLHttpRequest",
                "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
            },
            timeout=5,  # giống JS: timeout 5E3
        )
        try:
            j = r.json()
        except ValueError:
            if "Auto Logout" in r.text[:2000]:
                raise SessionExpired("session game đã hết hạn (Auto Logout Relay)")
            raise SessionExpired(f"getToken trả non-JSON (HTTP {r.status_code}): {_short(r.text)}")
        if str(j.get("status")) != "200" or not j.get("token"):
            raise SessionExpired(f"getToken lỗi: {j}")
        t = WsToken(token=j["token"], path=j.get("path") or "/", host=j.get("host"), exp=jwt_exp(j["token"]))
        log.info("getToken OK host=%s path=%s ttl=%.0fs", self.game_host, t.path, t.seconds_left())
        self.current = t
        return t

    # ---------------------------------------------------------------- vào sảnh (để server đẩy GameHallInfo)
    def _xhr(self, path: str, data: str = "", referer_page: str = "webMain.jsp") -> dict:
        base = f"https://{self.game_host}"
        r = self.s.post(
            f"{base}{path}", data=data.encode(), timeout=10,
            headers={
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "Origin": base,
                "Referer": f"{base}/player/{referer_page}?dm=1&title=1",
                "X-Requested-With": "XMLHttpRequest",
                "sec-fetch-dest": "empty", "sec-fetch-mode": "cors", "sec-fetch-site": "same-origin",
            })
        r.raise_for_status()
        return r.json()

    def enter_game_hall(self):
        """Lặp lại đúng chuỗi XHR browser gọi sau mỗi lần WS connect (log 2026-11-07 08:06):
          lần đầu của session:  queryWebGameHallDatas(hallType=1) -> GET gamehall.jsp -> queryInitWebGameHall
          các lần reconnect:    queryInitWebGameHall(gameGroupId=-1)
        """
        base = f"https://{self.game_host}"
        session_id = self.game_cookies().get("JSESSIONID")
        if getattr(self, "_hall_session", None) != session_id:
            j = self._xhr("/player/query/queryWebGameHallDatas", "hallType=1", "webMain.jsp")
            log.info("queryWebGameHallDatas status=%s", j.get("status"))
            self._nav("GET", f"{base}/player/gamehall.jsp?dm=1&title=1",
                      referer=f"{base}/player/webMain.jsp?dm=1&title=1")
            self._hall_session = session_id
        j = self._xhr("/player/query/queryInitWebGameHall", "gameGroupId=-1", "gamehall.jsp")
        log.info("queryInitWebGameHall status=%s tables=%s", j.get("status"), len(j.get("tableItems") or []))
        return j

    def query_server_id(self) -> str | None:
        """Giống JS poll mỗi 5s; 'sI' đổi => server rolling => phải reconnect WS (gọi lại getToken)."""
        base = f"https://{self.game_host}"
        r = self.s.post(f"{base}/player/query/queryCurrentServerId", data=b"",
                        headers={"X-Requested-With": "XMLHttpRequest", "Origin": base,
                                 "Referer": f"{base}/player/webMain.jsp?dm=1&title=1"}, timeout=5)
        j = r.json()  # {"st":200,"sI":"bacweb07"}
        return j.get("sI") or j.get("serverId")

    # ---------------------------------------------------------------- bước 4-6: vào game bằng user/key
    def login_game(self, login_url: str, referer: str = "https://gci.usplaynet.com/"):
        host = urlparse(login_url).hostname
        self.game_host = host
        # bước 4: set JSESSIONID + ROUTEID
        r = self._nav("GET", login_url, referer=referer)
        # JS của trang làm: document.cookie = "rcr=987; path=/"
        self.s.cookies.set("rcr", "987", domain=host, path="/")
        nxt = _js_redirect(r.text)
        if not nxt or "/api/player/" not in nxt:
            # fallback: tự dựng URL bước 5 từ URL bước 4
            nxt = login_url.replace("/api/MexAWS031/", "/api/player/MexAWS031/") + "&"
        url5 = urljoin(r.url, nxt)
        # bước 5
        r = self._nav("GET", url5, referer=r.url)
        url6 = urljoin(r.url, _js_redirect(r.text) or "/player/webMain.jsp?dm=1&title=1")
        # bước 6
        self._nav("GET", url6, referer=url5)
        self.game_login_url = login_url
        log.info("login_game OK host=%s cookies=%s", host, list(self.game_cookies()))

    # ---------------------------------------------------------------- bước 1-3: từ KUBET
    def relogin_from_kubet(self, kubet_user: str):
        k = f"https://{self.kubet_host}"
        # bước 1: CheckGame
        dt = f"{kubet_user}{int(time.time() * 1000)}{int(time.time() * 1e6) % 1000:03d}"
        r = self._nav("GET", f"{k}/CheckGame?gameType=AES&subGameType=AESLive&dt={dt}", referer=f"{k}/Home/Index")
        m = re.search(r"gameUrl\s*=\s*'(\{.*?\})';", r.text)
        if not m:
            dump = _dump_debug("checkgame", r)
            raise KubetSessionExpired(f"CheckGame không có gameUrl (HTTP {r.status_code}, url cuối: {r.url}, "
                                      f"BBOAUTH sau request: {'còn' if self.has_kubet_auth() else 'BỊ XOÁ'}, "
                                      f"body: {dump}) -> session KUBET không hợp lệ")
        game = json.loads(m.group(1))
        url0 = game.get("RedirectUrl") or (game.get("RedirectUrls") or [None])[0]
        if game.get("IsError") or not url0:
            raise RuntimeError(f"CheckGame lỗi: {game}")

        # bước 2: apiLogin0 -> form
        r = self._nav("GET", url0, referer=f"{k}/")
        fp = _FormParser(); fp.feed(r.text)
        if "tokenId" not in fp.fields:
            raise RuntimeError(f"apiLogin0 không có form login: {r.text[:300]}")
        fields = dict(fp.fields)
        fields.update(self.traffic)               # JS điền fingerprint
        fields["referrer"] = f"{k}/"              # JS: form.find('#referrer').val(document.referrer)

        # bước 3: POST apiLogin -> location.replace("https://<GAME_HOST>/api/MexAWS031/login?...")
        action = urljoin(r.url, fp.action or "/player/login/apiLogin")
        origin = "{0.scheme}://{0.netloc}".format(urlparse(action))
        r = self.s.post(
            action, data=fields, timeout=20,
            headers={"Referer": url0, "Origin": origin,
                     "Content-Type": "application/x-www-form-urlencoded",
                     "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
                     "sec-fetch-dest": "document", "sec-fetch-mode": "navigate"})
        r.raise_for_status()
        login_url = _js_redirect(r.text)
        if not login_url or "/login?user=" not in login_url:
            raise RuntimeError(f"apiLogin không trả URL game: {r.text[:300]}")
        log.info("apiLogin -> %s", login_url.split("?")[0])

        # bước 4-6
        self.login_game(login_url, referer="https://gci.usplaynet.com/")

    # ---------------------------------------------------------------- nạp / xuất session
    def set_browser_identity(self, ident: dict):
        """Dùng đúng User-Agent / Client Hints của Brave đã login (lấy ở browser_login, lưu trong session.json)."""
        ua = ident.get("user_agent")
        if not ua:
            return
        self.browser_identity = {k: ident.get(k) for k in ("user_agent", "sec_ch_ua", "sec_ch_ua_platform")}
        self.s.headers["User-Agent"] = ua
        if ident.get("sec_ch_ua"):
            self.s.headers["sec-ch-ua"] = ident["sec_ch_ua"]
        if ident.get("sec_ch_ua_platform"):
            self.s.headers["sec-ch-ua-platform"] = ident["sec_ch_ua_platform"]
        log.info("Dùng User-Agent của browser: %s", ua)

    def set_kubet_cookies(self, host: str, cookies: dict):
        """Nạp cookie KUBET mới (vd lấy từ browser ở tầng 3). Xoá cookie KUBET cũ trước."""
        for c in list(self.s.cookies):
            if (c.domain or "").lstrip(".") in (self.kubet_host, host):
                self.s.cookies.clear(c.domain, c.path, c.name)
        self.kubet_host = host
        for k, v in cookies.items():
            self.s.cookies.set(k, v, domain=host, path="/")

    def kubet_keepalive(self, kubet_user: str | None = None) -> bool:
        """Chạm nhẹ vào KUBET để session (BBOAUTH) không hết hạn vì không hoạt động — giống browser v1 mở liên tục.
        GET /Home/Index (trang browser mở sau login): không cần requestverificationtoken.
        Cookie mới server trả (Set-Cookie) được requests tự lưu vào session.
        Trả về True nếu vẫn còn đăng nhập (đoán theo: có tên tài khoản trong HTML, không có nút #loginbutton)."""
        if not self.has_kubet_auth():
            return False
        k = f"https://{self.kubet_host}"
        r = self._nav("GET", f"{k}/Home/Index", referer=f"{k}/")
        html = r.text
        logged_in = (kubet_user.lower() in html.lower()) if kubet_user else ('id="loginbutton"' not in html)
        log.info("KUBET keepalive HTTP %s -> %s", r.status_code, "còn đăng nhập" if logged_in else "CÓ VẺ ĐÃ HẾT HẠN")
        return logged_in

    def kubet_cookies(self) -> dict:
        return {c.name: c.value for c in self.s.cookies if (c.domain or "").lstrip(".") == self.kubet_host}

    def has_kubet_auth(self) -> bool:
        return "BBOAUTH" in self.kubet_cookies()

    def export_session(self) -> dict:
        """Dữ liệu để lưu ra file (session_store) và nạp lại lần chạy sau."""
        return {
            "kubet_host": self.kubet_host,
            "kubet_cookies": self.kubet_cookies(),
            "game_host": self.game_host,
            "game_cookies": self.game_cookies(),
            "game_login_url": self.game_login_url,
            "traffic": self.traffic,
            "browser_identity": self.browser_identity,
        }

    # ---------------------------------------------------------------- API chính
    def ensure_token(self, kubet_user: str | None = None) -> WsToken:
        """Tầng 1: getToken bằng cookie game. Tầng 2: login lại bằng cookie KUBET.
        Ném KubetSessionExpired khi cả hai thất bại vì BBOAUTH chết -> caller phải chạy tầng 3 (browser)."""
        with self._lock:
            try:
                return self.get_token()                       # tầng 1
            except (SessionExpired, requests.RequestException, ValueError) as e:
                log.warning("[tầng 1] getToken thất bại: %s", e)
            if self.game_login_url:                           # tầng 1b: vào lại bằng user/key (nếu key còn dùng được)
                try:
                    self.login_game(self.game_login_url)
                    return self.get_token()
                except Exception as e:
                    log.info("[tầng 1b] user/key không dùng lại được: %s", e)
                    self.game_login_url = None
            if not kubet_user or not self.has_kubet_auth():
                raise KubetSessionExpired("Không có cookie KUBET (BBOAUTH)")
            log.info("[tầng 2] Login lại từ KUBET")
            self.relogin_from_kubet(kubet_user)               # có thể ném KubetSessionExpired
            return self.get_token()
