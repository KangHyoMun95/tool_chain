# src/patterns/category_config.py
# Nạp + kiểm tra NGHIÊM NGẶT config/categories/*.json (pydantic extra="forbid"). CÙNG MỘT BỘ LUẬT với bản TS ở
# apps/api/src/category-config/category-config.schema.ts (zod .strict()). Sai ⇒ KHÔNG khởi động, in TẤT CẢ lỗi một lần:
# `<tên file>: <đường dẫn trường>: <lỗi gì>`. Sửa luật ở một bên thì sửa bên kia trong cùng commit.
import json
import logging
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, StrictStr, ValidationError, field_validator

log = logging.getLogger("pattern")

SYMBOL_RE = re.compile(r"^[A-Z]$")
COLOR_RE = re.compile(r"^#[0-9A-Fa-f]{6}$")
NAME_MAX = 100


def normalize_name(s: str) -> str:
    """Trim, gộp khoảng trắng liên tiếp thành 1, lowercase (khớp normalizeName() ở packages/shared)."""
    return " ".join(s.split()).lower()


def category_key(lobby: str, category: str) -> str:
    return f"{normalize_name(lobby)}|{normalize_name(category)}"


class CategoryConfigError(Exception):
    """Cấu hình category sai: mang toàn bộ thông báo lỗi (nhiều dòng)."""


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


def _text(v: str) -> str:
    if v.strip() == "":
        raise ValueError("không được rỗng")
    return v


def _name(v: str) -> str:
    if normalize_name(v) == "":
        raise ValueError("không được rỗng")
    if "|" in v:
        raise ValueError("không được chứa ký tự '|' (trùng dấu phân tách key_id)")
    if "\u0000" in v:
        raise ValueError("không được chứa ký tự NUL")
    if len(v.strip()) > NAME_MAX:
        raise ValueError(f"quá dài (tối đa {NAME_MAX} ký tự)")
    return v


class Label(_Strict):
    vi: StrictStr
    en: StrictStr
    _v = field_validator("vi", "en")(_text)


class ResultDef(_Strict):
    label: Label
    color: StrictStr

    @field_validator("color")
    @classmethod
    def _color(cls, v: str) -> str:
        if not COLOR_RE.match(v):
            raise ValueError("phải đúng dạng #RRGGBB")
        return v


class CategoryConfig(_Strict):
    """Mọi khóa BẮT BUỘC (không có giá trị mặc định); khóa lạ bị từ chối. Quan hệ giữa các trường kiểm tra ở _semantic_issues."""
    lobby: StrictStr
    category: StrictStr
    results: dict[StrictStr, ResultDef]
    predictable: list[StrictStr]
    ignore_in_pattern: list[StrictStr]
    draw: list[StrictStr]
    totals: list[StrictStr]

    _n = field_validator("lobby", "category")(_name)

    @field_validator("results")
    @classmethod
    def _results(cls, v: dict) -> dict:
        if not v:
            raise ValueError("phải có ít nhất một ký hiệu")
        return v

    @field_validator("predictable")
    @classmethod
    def _predictable(cls, v: list) -> list:
        if not v:
            raise ValueError("không được rỗng")
        return v

    @property
    def key(self) -> str:
        return category_key(self.lobby, self.category)



def _fmt_path(loc: tuple) -> str:
    out = ""
    for p in loc:
        out += f"[{p}]" if isinstance(p, int) else f"{'.' if out else ''}{p}"
    return out or "(gốc)"


def _structural_issues(raw: dict) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    try:
        CategoryConfig.model_validate(raw)
        return out
    except ValidationError as e:
        for err in e.errors():
            t = err["type"]
            if t == "missing":
                out.append((_fmt_path(err["loc"]), "thiếu khóa bắt buộc"))
            elif t == "extra_forbidden":
                out.append((_fmt_path(err["loc"]), "khóa không được phép (không có trong schema)"))
            else:
                msg = err["msg"].removeprefix("Value error, ")
                out.append((_fmt_path(err["loc"]), msg))
    return out


def _semantic_issues(raw: dict) -> list[tuple[str, str]]:
    """Ký hiệu và quan hệ giữa các trường. Chạy trên dữ liệu thô, bỏ qua phần sai kiểu (đã báo ở _structural_issues)."""
    out: list[tuple[str, str]] = []
    results = raw.get("results") if isinstance(raw.get("results"), dict) else None
    known: set[str] = set()
    if results is not None:
        for k in results:
            if not SYMBOL_RE.match(k):
                out.append((f"results.{k}", "ký hiệu phải là đúng một chữ in hoa (A-Z)"))
            else:
                known.add(k)
    lists: dict[str, set[str]] = {}
    for field in ("predictable", "ignore_in_pattern", "draw", "totals"):
        arr = raw.get(field)
        if not isinstance(arr, list):
            continue
        seen: set[str] = set()
        for i, v in enumerate(arr):
            if not isinstance(v, str):
                continue
            p = f"{field}[{i}]"
            if not SYMBOL_RE.match(v):
                out.append((p, f'"{v}" không phải ký hiệu hợp lệ (đúng một chữ in hoa A-Z)'))
                continue
            if results is not None and v not in known:
                out.append((p, f'"{v}" không có trong results'))
            if v in seen:
                out.append((p, f'"{v}" bị trùng trong {field}'))
            seen.add(v)
        lists[field] = seen
    for a, b in (("predictable", "ignore_in_pattern"), ("predictable", "draw")):
        for v in sorted(lists.get(a, set()) & lists.get(b, set())):
            out.append((a, f'"{v}" nằm cả trong {a} và {b} (hai danh sách không được giao nhau)'))
    return out


def validate_files(files: list[tuple[str, str]]) -> tuple[list[CategoryConfig], list[str]]:
    """files: [(tên file, nội dung)]. Trả (configs, errors); configs chỉ đáng tin khi errors rỗng."""
    errors: list[str] = []
    configs: list[CategoryConfig] = []
    owner: dict[str, str] = {}
    if not files:
        errors.append("không có file .json nào trong thư mục cấu hình category")
    for name, text in files:
        try:
            raw: Any = json.loads(text)
        except json.JSONDecodeError as e:
            errors.append(f"{name}: (gốc): không phải JSON hợp lệ ({e})")
            continue
        if not isinstance(raw, dict):
            errors.append(f"{name}: (gốc): phải là một object JSON")
            continue
        issues = _structural_issues(raw) + _semantic_issues(raw)
        errors.extend(f"{name}: {p}: {m}" for p, m in issues)
        if issues:
            continue
        cfg = CategoryConfig.model_validate(raw)
        first = owner.get(cfg.key)
        if first:
            errors.append(f'{name}: lobby/category: trùng với {first} (lobby "{cfg.lobby}", category "{cfg.category}" sau khi chuẩn hóa tên)')
        else:
            owner[cfg.key] = name
            configs.append(cfg)
    return configs, errors


def resolve_config_dir() -> Path:
    """CATEGORY_CONFIG_DIR, hoặc config/categories ở thư mục chạy (docker: /app) / ở gốc repo (chạy từ apps/ai)."""
    env = os.environ.get("CATEGORY_CONFIG_DIR", "").strip()
    if env:
        return Path(env).resolve()
    here = Path(__file__).resolve()
    candidates = [Path.cwd() / "config/categories", Path.cwd() / "../../config/categories"]
    candidates += [here.parents[i] / "config/categories" for i in (2, 4) if len(here.parents) > i]
    return next((c.resolve() for c in candidates if c.is_dir()), candidates[0].resolve())


class CategoryRegistry:
    def __init__(self, configs: list[CategoryConfig]):
        self._by_key = {c.key: c for c in configs}

    def get(self, lobby: str, category: str) -> Optional[CategoryConfig]:
        return self._by_key.get(category_key(lobby, category))

    def by_key_id(self, key_id: str) -> Optional[CategoryConfig]:
        """key_id = `<lobby>|<category>|<stream>` đã chuẩn hóa."""
        parts = key_id.split("|")
        return self._by_key.get(f"{parts[0]}|{parts[1]}") if len(parts) >= 2 else None

    def __len__(self) -> int:
        return len(self._by_key)

    def keys(self) -> list[str]:
        return sorted(self._by_key)


def load_registry(directory: Optional[Path] = None) -> CategoryRegistry:
    """Nạp mọi file *.json; sai ⇒ ném CategoryConfigError (mọi lỗi, mỗi dòng một lỗi)."""
    d = directory or resolve_config_dir()
    try:
        files = [(p.name, p.read_text(encoding="utf-8")) for p in sorted(d.glob("*.json"))]
    except OSError as e:
        raise CategoryConfigError(f"Cấu hình category không hợp lệ: không đọc được thư mục {d} ({e})") from e
    configs, errors = validate_files(files)
    if errors:
        raise CategoryConfigError(f"Cấu hình category không hợp lệ ({d}), {len(errors)} lỗi:\n  " + "\n  ".join(errors))
    log.info("Đã nạp %d category: %s", len(configs), ", ".join(f"{c.lobby}|{c.category}" for c in configs))
    return CategoryRegistry(configs)
