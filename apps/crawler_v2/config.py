import os

from categories import sx_lobby_names

WEBSITE_URL = os.environ.get('WEBSITE_URL')
BRAVE_PATH = os.environ.get('BRAVE_PATH')
# Thay SX_LOBBY / SX_CATEGORY_1 cũ: lấy từ GAME_GROUP_ID_<n>_LOBBY / _CATEGORY của category có HANDLER=sx_lobby
SX_LOBBY, SX_CATEGORY_1 = sx_lobby_names()
