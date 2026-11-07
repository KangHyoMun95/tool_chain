"""
Lưu / nạp session (cookie KUBET + cookie game + host) ra file JSON để lần chạy sau dùng lại,
không phải mở browser.

File chứa cookie đăng nhập thật -> để trong output/ (đã gitignore), không commit.
"""
from __future__ import annotations

import json
import logging
import os
import time
from pathlib import Path

log = logging.getLogger("session_store")

DEFAULT_PATH = Path("output/session.json")


class SessionStore:
    def __init__(self, path: str | Path = DEFAULT_PATH):
        self.path = Path(path)
        self.data: dict = {}

    def load(self) -> dict:
        if self.path.exists():
            try:
                self.data = json.loads(self.path.read_text(encoding="utf-8"))
                age = time.time() - self.data.get("updated_at", 0)
                log.info("Nạp session %s (cập nhật %.0f phút trước)", self.path, age / 60)
            except Exception as e:
                log.warning("Không đọc được %s: %s", self.path, e)
                self.data = {}
        return self.data

    def save(self, session: dict, reason: str = ""):
        """Ghi atomically (file tạm rồi rename) để không hỏng file nếu bị kill giữa chừng."""
        self.data = {**self.data, **session, "updated_at": time.time(), "updated_reason": reason}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, self.path)
        log.info("Đã lưu session (%s)", reason)

    def record_browser_login(self):
        """Ghi lại các lần phải dùng browser -> biết BBOAUTH sống bao lâu."""
        hist = self.data.setdefault("browser_logins", [])
        hist.append(time.strftime("%Y-%m-%d %H:%M:%S"))
        self.data["browser_logins"] = hist[-50:]
