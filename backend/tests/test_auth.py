"""
Tests for Phase 11 — Google OAuth Authentication and Session Management.

Tests:
1. First-time Google signup (creates user, sets session cookie)
2. Returning Google login (finds user, does not duplicate)
3. Invalid ID token rejection (401)
4. Expired token rejection
5. Incorrect audience rejection
6. Session retrieval via GET /auth/me
7. Rejection of unauthenticated requests to GET /auth/me
8. Rejection of invalid/forged session cookies
9. Logout and session invalidation via POST /auth/logout
10. Rejection of GET /auth/me after logout
"""

from unittest.mock import patch, MagicMock
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.db import Base, engine, SessionLocal, create_all_tables
from app.models.user import User
from app.services.auth_service import (
    verify_google_token,
    create_session,
    delete_session,
    get_user_id_from_session,
    _sessions,
)


@pytest.fixture(autouse=True)
def setup_and_teardown_db():
    """Ensure tables exist and clear test state before each test."""
    create_all_tables()
    _sessions.clear()
    db = SessionLocal()
    try:
        db.query(User).delete()
        db.commit()
    finally:
        db.close()
    yield
    _sessions.clear()


@pytest.fixture
def client():
    return TestClient(app)


# ---------------------------------------------------------------------------
# 1. Token Verification Unit Tests
# ---------------------------------------------------------------------------

def test_verify_google_token_invalid():
    """Invalid token string raises ValueError."""
    with pytest.raises(ValueError, match="Invalid Google token"):
        verify_google_token("invalid.jwt.token")


@patch("google.oauth2.id_token.verify_oauth2_token")
def test_verify_google_token_wrong_issuer(mock_verify):
    """Token with issuer other than Google is rejected."""
    mock_verify.return_value = {
        "sub": "12345",
        "iss": "https://evil.com",
        "email": "user@example.com",
    }
    with pytest.raises(ValueError, match="Token issuer is not Google"):
        verify_google_token("some.token")


@patch("google.oauth2.id_token.verify_oauth2_token")
def test_verify_google_token_expired(mock_verify):
    """Expired token raises ValueError."""
    mock_verify.side_effect = Exception("Token expired")
    with pytest.raises(ValueError, match="Invalid Google token"):
        verify_google_token("expired.token")


@patch("google.oauth2.id_token.verify_oauth2_token")
def test_verify_google_token_wrong_audience(mock_verify):
    """Wrong audience raises ValueError."""
    mock_verify.side_effect = Exception("Wrong recipient, expected another client_id")
    with pytest.raises(ValueError, match="Invalid Google token"):
        verify_google_token("wrong_aud.token")


# ---------------------------------------------------------------------------
# 2. POST /auth/google Integration Tests
# ---------------------------------------------------------------------------

def test_google_login_invalid_token(client):
    """Sending a malformed token returns 401."""
    response = client.post("/auth/google", json={"credential": "invalid_token_string"})
    assert response.status_code == 401
    assert "Invalid Google token" in response.json()["detail"]


@patch("app.api.auth.verify_google_token")
def test_first_time_google_signup(mock_verify, client):
    """First-time Google user creates account and receives session cookie."""
    mock_verify.return_value = {
        "sub": "google-user-123456",
        "email": "testuser@gmail.com",
        "name": "Test User",
        "picture": "https://lh3.googleusercontent.com/test.jpg",
    }

    response = client.post("/auth/google", json={"credential": "valid_dummy_credential"})
    assert response.status_code == 200

    data = response.json()
    assert data["email"] == "testuser@gmail.com"
    assert data["name"] == "Test User"
    assert data["picture"] == "https://lh3.googleusercontent.com/test.jpg"
    assert "id" in data

    # Verify session cookie was set
    assert "session_id" in response.cookies
    session_id = response.cookies["session_id"]
    assert len(session_id) > 10

    # Verify user exists in SQLite database
    db = SessionLocal()
    user = db.query(User).filter(User.google_sub == "google-user-123456").first()
    assert user is not None
    assert user.email == "testuser@gmail.com"
    db.close()


@patch("app.api.auth.verify_google_token")
def test_returning_google_login(mock_verify, client):
    """Returning Google user re-uses existing account (no duplicate user created)."""
    mock_verify.return_value = {
        "sub": "returning-google-id-789",
        "email": "returning@gmail.com",
        "name": "Returning User",
        "picture": None,
    }

    # First login (signup)
    res1 = client.post("/auth/google", json={"credential": "dummy_cred_1"})
    assert res1.status_code == 200
    user_id_1 = res1.json()["id"]

    # Second login (returning)
    res2 = client.post("/auth/google", json={"credential": "dummy_cred_2"})
    assert res2.status_code == 200
    user_id_2 = res2.json()["id"]

    # Same user ID must be returned
    assert user_id_1 == user_id_2

    # Verify only one user in DB
    db = SessionLocal()
    count = db.query(User).filter(User.google_sub == "returning-google-id-789").count()
    assert count == 1
    db.close()


# ---------------------------------------------------------------------------
# 3. GET /auth/me Session Validation Tests
# ---------------------------------------------------------------------------

def test_get_me_unauthenticated(client):
    """Requesting /auth/me without session cookie returns 401."""
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Not authenticated."


def test_get_me_invalid_session(client):
    """Requesting /auth/me with unknown session cookie returns 401."""
    client.cookies.set("session_id", "non-existent-session-id")
    response = client.get("/auth/me")
    assert response.status_code == 401
    assert "Session expired or invalid" in response.json()["detail"]


def test_get_me_expired_session(client):
    """Requesting /auth/me with an expired session cookie returns 401 and clears the session."""
    # Create a user in DB
    db = SessionLocal()
    user = User(google_sub="sub-expired", email="exp@example.com", name="Expired User")
    db.add(user)
    db.commit()
    db.refresh(user)
    user_id = user.id
    db.close()

    # Create an already-expired session (max_age = -1 second)
    expired_session_id = create_session(user_id, max_age=-1)
    client.cookies.set("session_id", expired_session_id)

    response = client.get("/auth/me")
    assert response.status_code == 401
    assert "Session expired or invalid" in response.json()["detail"]

    # Verify session was purged from in-memory store
    assert expired_session_id not in _sessions


@patch("app.api.auth.verify_google_token")
def test_google_signup_email_collision_rejected(mock_verify, client):
    """If an account with the same email already exists under a different sub, reject."""
    db = SessionLocal()
    existing_user = User(google_sub="original-sub", email="collision@gmail.com", name="Original User")
    db.add(existing_user)
    db.commit()
    db.close()

    # Different google_sub attempting to use the same email
    mock_verify.return_value = {
        "sub": "different-sub-attempt",
        "email": "collision@gmail.com",
        "name": "Different User",
        "picture": None,
    }

    res = client.post("/auth/google", json={"credential": "dummy"})
    assert res.status_code == 401
    assert "An account with this email address already exists" in res.json()["detail"]


@patch("app.api.auth.verify_google_token")
def test_get_me_authenticated(mock_verify, client):
    """Requesting /auth/me with valid session cookie returns user data."""
    mock_verify.return_value = {
        "sub": "auth-me-sub-999",
        "email": "authme@gmail.com",
        "name": "Auth Me",
        "picture": "https://example.com/pic.png",
    }

    login_res = client.post("/auth/google", json={"credential": "dummy"})
    assert login_res.status_code == 200

    # Cookie is stored in the TestClient session
    me_res = client.get("/auth/me")
    assert me_res.status_code == 200
    me_data = me_res.json()
    assert me_data["email"] == "authme@gmail.com"
    assert me_data["name"] == "Auth Me"


# ---------------------------------------------------------------------------
# 4. POST /auth/logout Tests
# ---------------------------------------------------------------------------

@patch("app.api.auth.verify_google_token")
def test_logout(mock_verify, client):
    """Logout invalidates the session and deletes the cookie."""
    mock_verify.return_value = {
        "sub": "logout-test-sub",
        "email": "logout@gmail.com",
        "name": "Logout Tester",
        "picture": None,
    }

    login_res = client.post("/auth/google", json={"credential": "dummy"})
    assert login_res.status_code == 200

    # Confirm authenticated
    assert client.get("/auth/me").status_code == 200

    # Logout
    logout_res = client.post("/auth/logout")
    assert logout_res.status_code == 200
    assert logout_res.json() == {"status": "logged_out"}

    # Subsequent request to /auth/me must fail with 401
    me_after_logout = client.get("/auth/me")
    assert me_after_logout.status_code == 401
