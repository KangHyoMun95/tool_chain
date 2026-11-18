"""
Cấu hình các category (mỗi category một tài khoản) từ env theo chỉ số <n> (không cần liên tục):

  GAME_GROUP_ID_<n>=<gameGroupId>      GAME_GROUP_ID_<n>_USERNAME / _PASSWORD
  GAME_GROUP_ID_<n>_LOBBY / _CATEGORY  (tên lobby / category gửi lên api)
  GAME_GROUP_ID_<n>_HANDLER=<tên trong handlers.REGISTRY>
  GAME_GROUP_ID_<n>_ENABLED=<true|false, bỏ trống = true>

Kiểm tra lúc khởi động (ném ConfigError, gom mọi lỗi): thiếu biến bắt buộc của category đang bật, HANDLER không có
trong registry, trùng USERNAME giữa các category đang bật, không có category nào bật.
Kiểm tra nhanh:  python -m categories
"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import Iterable, Mapping

_INDEX_RE = re.compile(r"^GAME_GROUP_ID_(\d+)$")
_FALSE = {"0", "false", "no", "off"}


class ConfigError(Exception):
    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("Cấu hình category sai: " + "; ".join(errors))


@dataclass(frozen=True)
class CategoryConfig:
    index: int
    group_id: str
    username: str
    password: str
    lobby: str
    category: str
    handler: str

    def __repr__(self) -> str:   # che mật khẩu
        return (f"CategoryConfig(index={self.index}, group_id={self.group_id!r}, username={self.username!r}, "
                f"lobby={self.lobby!r}, category={self.category!r}, handler={self.handler!r})")


def _indexes(env: Mapping[str, str]) -> list[int]:
    return sorted(int(m.group(1)) for k in env if (m := _INDEX_RE.match(k)))


def _enabled(env: Mapping[str, str], n: int) -> bool:
    return (env.get(f"GAME_GROUP_ID_{n}_ENABLED") or "").strip().lower() not in _FALSE


def load_categories(known_handlers: Iterable[str], env: Mapping[str, str] | None = None) -> list[CategoryConfig]:
    """Các category ĐANG BẬT theo thứ tự chỉ số."""
    env = os.environ if env is None else env
    known = set(known_handlers)
    errors: list[str] = []
    out: list[CategoryConfig] = []
    for n in _indexes(env):
        if not _enabled(env, n):
            continue
        tag = f"GAME_GROUP_ID_{n}"
        v = {k: (env.get(f"{tag}_{k}") or "").strip() for k in ("USERNAME", "LOBBY", "CATEGORY", "HANDLER")}
        v["PASSWORD"] = env.get(f"{tag}_PASSWORD") or ""
        group_id = (env.get(tag) or "").strip()
        if not group_id:
            errors.append(f"{tag} bị thiếu")
        for k in ("USERNAME", "PASSWORD", "LOBBY", "CATEGORY", "HANDLER"):
            if not v[k]:
                errors.append(f"{tag}_{k} bị thiếu")
        if v["HANDLER"] and v["HANDLER"] not in known:
            errors.append(f"{tag}_HANDLER='{v['HANDLER']}' không có trong registry ({', '.join(sorted(known))})")
        out.append(CategoryConfig(n, group_id, v["USERNAME"], v["PASSWORD"], v["LOBBY"], v["CATEGORY"], v["HANDLER"]))
    seen: dict[str, int] = {}
    for c in out:
        if c.username:
            if c.username.lower() in seen:
                errors.append(f"USERNAME '{c.username}' bị dùng chung bởi category {seen[c.username.lower()]} và {c.index}")
            seen.setdefault(c.username.lower(), c.index)
    if not out:
        errors.append("Không có category nào được bật")
    if errors:
        raise ConfigError(errors)
    return out


def sx_lobby_names(env: Mapping[str, str] | None = None) -> tuple[str | None, str | None]:
    """(lobby, category) của category có HANDLER=sx_lobby (chỉ số nhỏ nhất) — thay cho SX_LOBBY / SX_CATEGORY_1 cũ."""
    env = os.environ if env is None else env
    for n in _indexes(env):
        if (env.get(f"GAME_GROUP_ID_{n}_HANDLER") or "").strip() == "sx_lobby":
            return ((env.get(f"GAME_GROUP_ID_{n}_LOBBY") or None), (env.get(f"GAME_GROUP_ID_{n}_CATEGORY") or None))
    return None, None


if __name__ == "__main__":
    reg = {"sx_lobby", "category2"}
    base = {"GAME_GROUP_ID_1": "-1", "GAME_GROUP_ID_1_ENABLED": "false", "GAME_GROUP_ID_1_HANDLER": "sx_lobby",
            "GAME_GROUP_ID_1_LOBBY": "casino", "GAME_GROUP_ID_1_CATEGORY": "bacarat",
            "GAME_GROUP_ID_5": "7", "GAME_GROUP_ID_5_USERNAME": "u5", "GAME_GROUP_ID_5_PASSWORD": "p",
            "GAME_GROUP_ID_5_LOBBY": "l", "GAME_GROUP_ID_5_CATEGORY": "c", "GAME_GROUP_ID_5_HANDLER": "category2"}
    out = load_categories(reg, base)
    assert [c.index for c in out] == [5] and out[0].group_id == "7", out
    assert sx_lobby_names(base) == ("casino", "bacarat")

    def bad(env, needle):
        try:
            load_categories(reg, env)
        except ConfigError as e:
            assert any(needle in x for x in e.errors), (needle, e.errors)
        else:
            raise AssertionError(f"phải lỗi: {needle}")

    bad({"GAME_GROUP_ID_1": "-1"}, "USERNAME bị thiếu")
    bad({**base, "GAME_GROUP_ID_5_HANDLER": "x"}, "không có trong registry")
    bad({**base, "GAME_GROUP_ID_1_ENABLED": "true", "GAME_GROUP_ID_1_USERNAME": "U5", "GAME_GROUP_ID_1_PASSWORD": "p"},
        "dùng chung")
    bad({"GAME_GROUP_ID_1": "-1", "GAME_GROUP_ID_1_ENABLED": "false"}, "Không có category nào")
    print("categories: OK")
