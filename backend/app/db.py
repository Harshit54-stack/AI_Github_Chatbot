"""
Database setup — SQLAlchemy SQLite for user/session persistence.
"""

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

# Absolute path to the backend/ directory (parent of app/)
_BASE_DIR = Path(__file__).resolve().parent.parent

# SQLite database file lives in backend/auth.db
DATABASE_URL = f"sqlite:///{_BASE_DIR / 'auth.db'}"

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},  # required for SQLite + multi-thread
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a database session and ensures it is closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_all_tables() -> None:
    """Create all tables defined on Base (safe to call multiple times — no-op if already exist)."""
    Base.metadata.create_all(bind=engine)
