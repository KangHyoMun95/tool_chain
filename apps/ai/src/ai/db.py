# src/ai/db.py
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine

load_dotenv()

def engine():
    url = os.environ["DATABASE_URL"].replace("postgresql://", "postgresql+psycopg://", 1)
    return create_engine(url, pool_pre_ping=True)