"""
Conversation Manager — Phase 7 RAG.

Manages in-memory multi-turn conversation sessions.

Design
------
* Each session is identified by a UUID session_id generated client-side or
  assigned on first POST /chat.
* Sessions are stored in a module-level dict; they persist for the lifetime
  of the server process (no DB required for Phase 7).
* History is stored as Gemini-compatible message dicts so it can be passed
  directly to prompt_builder.build_messages() without transformation.
* Thread-safety: a per-session RLock serialises concurrent writes to the
  same session (unlikely in practice but safe under load).

Session lifecycle
-----------------
1. Client sends session_id="" (or omits it) → server creates new session.
2. Server returns session_id in every RAGResponse.
3. Client echoes session_id in subsequent requests → history is resumed.
4. DELETE /chat/history?session_id=<id> → session cleared.
"""

from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass, field
from datetime import datetime

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class ConversationSession:
    """Single multi-turn conversation context."""

    session_id: str
    repository_name: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    # Gemini-format message history: list of {"role": "user"/"model", "parts": [str]}
    history: list[dict] = field(default_factory=list)
    _lock: threading.RLock = field(default_factory=threading.RLock, repr=False)

    def append_turn(self, question: str, answer: str) -> None:
        """Append a (user, model) pair to history."""
        with self._lock:
            self.history.append({"role": "user", "parts": [question]})
            self.history.append({"role": "model", "parts": [answer]})
            self.updated_at = datetime.utcnow()

    def get_history(self) -> list[dict]:
        """Return a snapshot of the history list (thread-safe copy)."""
        with self._lock:
            return list(self.history)

    def clear(self) -> None:
        with self._lock:
            self.history.clear()
            self.updated_at = datetime.utcnow()

    @property
    def turn_count(self) -> int:
        with self._lock:
            return len(self.history) // 2


# ---------------------------------------------------------------------------
# Module-level session registry
# ---------------------------------------------------------------------------

_sessions: dict[str, ConversationSession] = {}
_registry_lock = threading.Lock()


def new_session_id() -> str:
    """Generate a fresh UUID4 session identifier."""
    return str(uuid.uuid4())


def get_or_create(session_id: str, repository_name: str) -> ConversationSession:
    """
    Return an existing session or create a new one.

    Args:
        session_id:      Client-supplied ID (empty string → create new).
        repository_name: Repository this session is associated with.

    Returns:
        ConversationSession (existing or newly created).
    """
    with _registry_lock:
        if session_id and session_id in _sessions:
            session = _sessions[session_id]
            return session

        # Create new session
        sid = session_id if session_id else new_session_id()
        session = ConversationSession(
            session_id=sid,
            repository_name=repository_name,
        )
        _sessions[sid] = session
        logger.info("New conversation session created: %s (repo='%s').", sid, repository_name)
        return session


def get_session(session_id: str) -> ConversationSession | None:
    """Return an existing session or None."""
    with _registry_lock:
        return _sessions.get(session_id)


def clear_session(session_id: str) -> bool:
    """
    Clear history for a session.

    Returns:
        True if the session existed and was cleared, False otherwise.
    """
    with _registry_lock:
        session = _sessions.get(session_id)
        if session is None:
            return False
        session.clear()
        logger.info("Session %s history cleared.", session_id)
        return True


def delete_session(session_id: str) -> bool:
    """Remove a session entirely from the registry."""
    with _registry_lock:
        existed = session_id in _sessions
        _sessions.pop(session_id, None)
        if existed:
            logger.info("Session %s deleted.", session_id)
        return existed


def list_sessions() -> list[dict]:
    """Return lightweight summaries of all active sessions."""
    with _registry_lock:
        return [
            {
                "session_id": s.session_id,
                "repository_name": s.repository_name,
                "turn_count": s.turn_count,
                "created_at": s.created_at.isoformat(),
                "updated_at": s.updated_at.isoformat(),
            }
            for s in _sessions.values()
        ]
