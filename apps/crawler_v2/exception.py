class BotCheckError(Exception):
    """Bị site phát hiện bot -> KHÔNG chạy lại."""


class CycleError(Exception):
    """Lỗi bình thường -> dọn dẹp và chạy lại từ đầu."""


def check_bot(page):
    """Ném BotCheckError nếu thấy dấu hiệu bị check bot.
    TODO: thay bằng dấu hiệu thật (text/phần tử của màn hình check bot)."""
    # if page.get_by_text("...").locator("visible=true").count():
    #     raise BotCheckError("Bị check bot")
    pass