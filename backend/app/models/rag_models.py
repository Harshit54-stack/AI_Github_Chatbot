"""
RAG Pydantic models — Phase 7.

These models are the only public data contracts between the RAG pipeline
and the API layer / frontend. Raw vectors, internal prompt text, and
FAISS internals are never included.
"""

from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Source Reference — one cited code chunk
# ---------------------------------------------------------------------------


class SourceReference(BaseModel):
    """A single source chunk cited in an AI answer."""

    file: str = Field(description="Repository-relative file path.")
    symbol_name: str = Field(description="Function / class / module name.")
    chunk_type: str = Field(description="'function', 'class', 'method', 'module', etc.")
    language: str = Field(description="Programming language.")
    start_line: int = Field(description="First line of the chunk (1-indexed).")
    end_line: int = Field(description="Last line of the chunk (1-indexed).")
    score: float = Field(description="Cosine similarity score (0–1).")


# ---------------------------------------------------------------------------
# Request / Response
# ---------------------------------------------------------------------------


class RAGRequest(BaseModel):
    """Request body for POST /chat and POST /chat/stream."""

    repository: str = Field(
        min_length=1,
        description="Repository name (must match the FAISS index).",
    )
    question: str = Field(
        min_length=1,
        description="Natural-language question about the repository.",
    )
    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of chunks to retrieve from FAISS.",
    )
    session_id: str = Field(
        default="",
        description="Conversation session ID. Empty string = new session.",
    )


class RAGResponse(BaseModel):
    """Response for POST /chat (non-streaming)."""

    answer: str = Field(description="AI-generated answer grounded in repository code.")
    sources: List[SourceReference] = Field(
        default_factory=list,
        description="Code chunks cited in the answer.",
    )
    retrieved_chunks: int = Field(description="Number of chunks included in context.")
    confidence: float = Field(description="Estimated confidence (mean top-3 cosine score).")
    session_id: str = Field(description="Session ID for multi-turn continuity.")
    elapsed_ms: float = Field(description="Total pipeline time in milliseconds.")


# ---------------------------------------------------------------------------
# Conversation history
# ---------------------------------------------------------------------------


class ConversationTurn(BaseModel):
    """One (user, assistant) exchange."""

    role: str = Field(description="'user' or 'model'.")
    content: str


class ChatHistoryResponse(BaseModel):
    """Response for GET /chat/history."""

    session_id: str
    repository_name: str
    turn_count: int
    turns: List[ConversationTurn]
