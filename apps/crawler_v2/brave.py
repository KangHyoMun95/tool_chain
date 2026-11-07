"""
Quản lý Brave automation qua start_brave.sh / stop_brave.sh — bật KHI CẦN, xong là tắt.

Hành vi của 2 script (đã kiểm tra):
- start_brave.sh: chạy Brave NỀN (&) rồi thoát ngay -> phải tự chờ cổng CDP sẵn sàng.
                  Nếu Brave (profile ~/.brave-automation) đang chạy -> exit 1, không mở thêm.
- stop_brave.sh : SIGTERM (cho Brave lưu profile/cookie) -> chờ 10s -> SIGKILL nếu cần.
- Profile riêng giữ cookie trên đĩa -> lần mở sau thường vẫn còn đăng nhập KUBET.

Màn hình (server / Docker không có màn hình thật):
- Nếu chưa có DISPLAY và máy có Xvfb -> start() tự bật Xvfb, stop() tắt Xvfb cùng Brave.
- Đã có DISPLAY (máy desktop) -> dùng luôn, không đụng tới.
- VNC=1 -> bật thêm x11vnc trên cổng 5900 để xem màn hình Brave khi debug.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests

log = logging.getLogger("brave")

CDP_URL = "http://127.0.0.1:9222"
SCRIPT_DIR = Path(__file__).resolve().parent           # start_brave.sh / stop_brave.sh nằm cạnh file này
START_SCRIPT = SCRIPT_DIR / "start_brave.sh"
STOP_SCRIPT = SCRIPT_DIR / "stop_brave.sh"
CDP_WAIT_SEC = 30

XVFB_DISPLAY = os.environ.get("XVFB_DISPLAY", ":99")
XVFB_SCREEN = os.environ.get("XVFB_SCREEN", "1366x768x24")

_http = requests.Session()
_http.trust_env = False                                  # localhost: không đi qua HTTP(S)_PROXY

_xvfb: subprocess.Popen | None = None                    # Xvfb do module này bật (None = không bật / dùng DISPLAY có sẵn)
_vnc: subprocess.Popen | None = None


# ---------------------------------------------------------------------------
# Màn hình ảo
# ---------------------------------------------------------------------------

def _start_display():
    """Bật Xvfb nếu cần. Đặt os.environ["DISPLAY"] để start_brave.sh (tiến trình con) dùng."""
    global _xvfb, _vnc
    if _xvfb and _xvfb.poll() is None:
        return
    if os.environ.get("DISPLAY") and _xvfb is None:
        log.info("[display] Dùng DISPLAY có sẵn %s", os.environ["DISPLAY"])
        return
    if not shutil.which("Xvfb"):
        log.warning("[display] Không có DISPLAY và không có Xvfb -> Brave có thể không mở được")
        return

    num = XVFB_DISPLAY.lstrip(":")
    for stale in (f"/tmp/.X{num}-lock", f"/tmp/.X11-unix/X{num}"):   # lock còn sót khi container bị kill
        try:
            os.remove(stale)
        except FileNotFoundError:
            pass
    _xvfb = subprocess.Popen(["Xvfb", XVFB_DISPLAY, "-screen", "0", XVFB_SCREEN, "-nolisten", "tcp"],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(40):
        if os.path.exists(f"/tmp/.X11-unix/X{num}"):
            break
        if _xvfb.poll() is not None:
            raise RuntimeError(f"Xvfb thoát ngay (exit {_xvfb.returncode})")
        time.sleep(0.25)
    os.environ["DISPLAY"] = XVFB_DISPLAY
    log.info("[display] Bật Xvfb %s (pid %s)", XVFB_DISPLAY, _xvfb.pid)

    if os.environ.get("VNC") == "1" and shutil.which("x11vnc"):
        _vnc = subprocess.Popen(["x11vnc", "-display", XVFB_DISPLAY, "-forever", "-shared", "-nopw",
                                 "-rfbport", "5900", "-quiet"],
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        log.info("[display] Bật x11vnc :5900")


def _stop_display():
    global _xvfb, _vnc
    for name, proc in (("x11vnc", _vnc), ("Xvfb", _xvfb)):
        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()
            log.info("[display] Tắt %s", name)
    if _xvfb is not None:
        os.environ.pop("DISPLAY", None)
    _xvfb = _vnc = None


# ---------------------------------------------------------------------------
# Brave
# ---------------------------------------------------------------------------

def cdp_ready() -> bool:
    try:
        return _http.get(f"{CDP_URL}/json/version", timeout=2).ok
    except requests.RequestException:
        return False


def _run(script: Path, timeout: int = 30) -> subprocess.CompletedProcess:
    if not script.exists():
        raise FileNotFoundError(f"Không thấy {script}")
    r = subprocess.run(["bash", str(script)], capture_output=True, text=True, timeout=timeout)
    out = (r.stdout + r.stderr).strip()
    log.info("[brave] %s -> exit %s: %s", script.name, r.returncode, out.replace("\n", " | "))
    return r


def start() -> bool:
    """Đảm bảo Brave automation đang chạy và CDP sẵn sàng (bật Xvfb trước nếu cần).
    Trả về True nếu hàm này mở Brave, False nếu Brave đã chạy từ trước."""
    if cdp_ready():
        log.info("[brave] CDP đã sẵn sàng, dùng Brave đang chạy")
        return False

    _start_display()
    r = _run(START_SCRIPT)
    if r.returncode == 1:
        # Process còn nhưng CDP không phản hồi (treo / đang tắt dở) -> tắt hẳn rồi mở lại
        log.warning("[brave] Brave chạy nhưng CDP không phản hồi -> restart")
        _run(STOP_SCRIPT)
        r = _run(START_SCRIPT)
    if r.returncode != 0:
        raise RuntimeError(f"start_brave.sh lỗi (exit {r.returncode})")

    deadline = time.time() + CDP_WAIT_SEC
    while time.time() < deadline:
        if cdp_ready():
            log.info("[brave] CDP sẵn sàng")
            return True
        time.sleep(0.5)
    raise RuntimeError(f"Sau {CDP_WAIT_SEC}s CDP {CDP_URL} vẫn chưa sẵn sàng (xem /tmp/brave.log)")


def stop():
    """Tắt Brave automation (graceful), rồi tắt Xvfb nếu chính module này đã bật."""
    try:
        _run(STOP_SCRIPT, timeout=30)
    finally:
        _stop_display()
