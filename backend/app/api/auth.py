"""
Auth API router — Google OAuth endpoints.

Endpoints
---------
POST   /auth/google    Verify Google ID token → create/find user → set session cookie
GET    /auth/me        Return current authenticated user (requires session cookie)
POST   /auth/logout    Clear session cookie and invalidate server-side session
"""
import logging

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.services.auth_service import (
    verify_google_token,
    get_or_create_user,
    create_session,
    get_user_id_from_session,
    delete_session,
)

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/auth", tags=["Auth"])

COOKIE_NAME = "session_id"
COOKIE_MAX_AGE = 7 * 24 * 60 * 60  # 7 days in seconds


class GoogleTokenRequest(BaseModel):
    credential: str  # Google ID token from the GSI callback


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    picture: str | None


def get_current_user(
    session_id: str | None = Cookie(default=None, alias=COOKIE_NAME),
    db: Session = Depends(get_db),
) -> User:
    """Dependency: resolve session cookie → User, or raise 401."""
    if not session_id:
        raise HTTPException(status_code=401, detail="Not authenticated.")
    user_id = get_user_id_from_session(session_id)
    if user_id is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid.")
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(status_code=401, detail="User not found.")
    return user


@auth_router.post("/google")
def google_auth(body: GoogleTokenRequest, response: Response, db: Session = Depends(get_db)):
    """
    1. Verify the Google ID token.
    2. Find or create the application user.
    3. Create a server-side session.
    4. Set an HttpOnly session cookie.
    """
    try:
        idinfo = verify_google_token(body.credential)
        user = get_or_create_user(db, idinfo)
    except ValueError as exc:
        logger.warning("Google authentication failed: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc))

    session_id = create_session(user.id, max_age=COOKIE_MAX_AGE)

    response = JSONResponse(
        content={
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "picture": user.picture,
        }
    )
    response.set_cookie(
        key=COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=False,   # Set to True behind HTTPS in production
        max_age=COOKIE_MAX_AGE,
        path="/",
    )
    return response


@auth_router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return UserResponse(
        id=current_user.id,
        email=current_user.email,
        name=current_user.name,
        picture=current_user.picture,
    )


@auth_router.post("/logout")
def logout(
    response: Response,
    session_id: str | None = Cookie(default=None, alias=COOKIE_NAME),
):
    """Invalidate the server-side session and clear the cookie."""
    if session_id:
        delete_session(session_id)
    resp = JSONResponse(content={"status": "logged_out"})
    resp.delete_cookie(key=COOKIE_NAME, path="/")
    return resp
