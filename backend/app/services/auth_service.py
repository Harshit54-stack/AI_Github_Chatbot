"""
Authentication service — Google ID token verification and user management.
"""
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.models.user import User

# In-memory session store: { session_id: {"user_id": int, "expires_at": float} }
# Sessions are lost on server restart. Sufficient for local development.
_sessions: dict[str, Any] = {}

SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60  # 7 days in seconds


def verify_google_token(token: str) -> dict:
    """
    Verify a Google ID token and return the decoded payload.
    Raises ValueError on invalid/expired/wrong-audience tokens.
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            settings.GOOGLE_CLIENT_ID,
        )
    except Exception as exc:
        raise ValueError(f"Invalid Google token: {exc}") from exc

    if idinfo.get("iss") not in ("accounts.google.com", "https://accounts.google.com"):
        raise ValueError("Token issuer is not Google.")

    return idinfo


def get_or_create_user(db: Session, idinfo: dict) -> User:
    """
    Find existing user by google_sub, or create a new one safely.
    Handles concurrent signup requests and unique constraint collisions.
    """
    google_sub = idinfo["sub"]
    user = db.query(User).filter(User.google_sub == google_sub).first()
    if user is None:
        user = User(
            google_sub=google_sub,
            email=idinfo.get("email", ""),
            name=idinfo.get("name", ""),
            picture=idinfo.get("picture"),
        )
        try:
            db.add(user)
            db.commit()
            db.refresh(user)
        except IntegrityError:
            db.rollback()
            # If concurrent signup created the user with same google_sub, retrieve it
            user = db.query(User).filter(User.google_sub == google_sub).first()
            if user is None:
                # Collision on unique email with a different google_sub
                raise ValueError("An account with this email address already exists.")
    return user


def create_session(user_id: int, max_age: int = SESSION_MAX_AGE_SECONDS) -> str:
    """Create a new server-side session with expiration and return the session ID."""
    session_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc).timestamp() + max_age
    _sessions[session_id] = {
        "user_id": user_id,
        "expires_at": expires_at,
    }
    return session_id


def get_user_id_from_session(session_id: str) -> Optional[int]:
    """
    Return the user_id for a session, or None if not found or expired.
    Automatically purges expired sessions.
    """
    session_data = _sessions.get(session_id)
    if session_data is None:
        return None

    # Handle structured session with expiration
    if isinstance(session_data, dict):
        if datetime.now(timezone.utc).timestamp() > session_data.get("expires_at", 0):
            delete_session(session_id)
            return None
        return session_data["user_id"]

    # Fallback if stored as bare integer
    return session_data


def delete_session(session_id: str) -> None:
    """Invalidate a session."""
    _sessions.pop(session_id, None)
