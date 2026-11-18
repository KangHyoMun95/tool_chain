class BotCheckError(Exception):
    """Bị site phát hiện bot -> KHÔNG chạy lại."""


class SessionError(Exception):
    """Lỗi cấp tài khoản / phiên dùng chung (vượt giới hạn login browser, cookie vừa login vẫn bị từ chối).
    Mọi WSS đều dính -> cả process thoát mã 1 để Docker khởi động lại (không tự retry ở từng WSS)."""


class CycleError(Exception):
    """Lỗi bình thường -> dọn dẹp và chạy lại từ đầu."""


def check_bot(page):
    """Ném BotCheckError nếu thấy dấu hiệu bị check bot.
    TODO: thay bằng dấu hiệu thật (text/phần tử của màn hình check bot)."""
    # if page.get_by_text("...").locator("visible=true").count():
    #     raise BotCheckError("Bị check bot")
    pass