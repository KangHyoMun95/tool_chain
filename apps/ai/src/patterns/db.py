# src/patterns/db.py
# Service chỉ ĐỌC DB (game_sessions). Ưu tiên DATABASE_URL_READONLY (user chỉ có SELECT), không có thì dùng DATABASE_URL.
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()


def database_url() -> str:
    url = os.environ.get("DATABASE_URL_READONLY") or os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("Thiếu DATABASE_URL_READONLY hoặc DATABASE_URL")
    return url.replace("postgresql://", "postgresql+psycopg://", 1)


def engine():
    return create_engine(database_url(), pool_pre_ping=True)
