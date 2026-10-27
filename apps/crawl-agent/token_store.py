import asyncio
import threading


class TokenStore:
    """Giữ (path, token, cookie) mới nhất. Thread Playwright ghi, asyncio đọc/chờ."""

    def __init__(self):
        self._lock = threading.Lock()
        self._data = None          # (path, token, cookie)
        self.version = 0           # tăng mỗi lần có token MỚI
        self._loop = None
        self._event = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop):
        """Gọi trong asyncio trước khi start thread Playwright."""
        self._loop = loop
        self._event = asyncio.Event()

    def update(self, path: str, token: str, cookie: str | None):
        """Gọi từ thread Playwright."""
        with self._lock:
            if self._data and self._data[1] == token:
                self._data = (path, token, cookie)   # cùng token, chỉ cập nhật cookie
                return
            self._data = (path, token, cookie)
            self.version += 1
            v = self.version
        print(f"[token] nhận token mới (v{v})")
        if self._loop:
            self._loop.call_soon_threadsafe(self._event.set)   # đánh thức phía asyncio

    def get(self):
        with self._lock:
            return self.version, self._data

    async def wait_newer(self, version: int, timeout: float | None = None):
        """Chờ tới khi có token với version > `version`. Hết giờ -> asyncio.TimeoutError."""
        while True:
            v, data = self.get()
            if v > version:
                return v, data
            self._event.clear()
            v, data = self.get()          # kiểm tra lại sau clear, tránh lỡ tín hiệu
            if v > version:
                return v, data
            await asyncio.wait_for(self._event.wait(), timeout)