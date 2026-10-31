"""
SQLAlchemy User model — stores Google OAuth users.
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, Integer, String

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    google_sub = Column(String, unique=True, nullable=False, index=True)  # stable Google identifier
    email = Column(String, unique=True, nullable=False)
    name = Column(String, nullable=False)
    picture = Column(String, nullable=True)  # profile image URL
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
