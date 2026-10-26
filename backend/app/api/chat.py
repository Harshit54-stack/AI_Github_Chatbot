"""
Chat API router — Phase 7 RAG endpoints.

Endpoints
---------
POST   /chat             Full RAG response (JSON).
POST   /chat/stream      Streaming RAG via Server-Sent Events.
GET    /chat/history     Retrieve conversation history for a session.
DELETE /chat/history     Clear conversation history for a session.

Design notes
------------
* POST /chat/stream returns text/event-stream using sse-starlette's
  EventSourceResponse. Each SSE event data field is a JSON object with
  a "type" discriminator (chunk | sources | done | error).
* The blocking Gemini SDK is always called inside asyncio.to_thread()
  so the FastAPI event loop is never stalled.
* Raw prompt text and internal chunk vectors are never returned.
"""

from __future__ import annotations

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from app.models.rag_models import (
    ChatHistoryResponse,
    ConversationTurn,
    RAGRequest,
    RAGResponse,
)
from app.services.rag import conversation_manager as conv_mgr
from app.services.rag.rag_service import answer, answer_stream

logger = logging.getLogger(__name__)

chat_router = APIRouter(prefix="/chat", tags=["RAG Chat"])


# ---------------------------------------------------------------------------
# POST /chat  — full (non-streaming) answer
# ---------------------------------------------------------------------------


@chat_router.post("", response_model=RAGResponse)
async def rag_chat(body: RAGRequest):
    """
    Run the full RAG pipeline and return a complete AI answer.

    Prerequisites: repository must be cloned, parsed, chunked, embedded,
    and indexed (POST /vector/build) before calling this endpoint.
    """
    try:
        response = await answer(body)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("RAG pipeline error")
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred in the RAG pipeline.",
        ) from exc
    return response


# ---------------------------------------------------------------------------
# POST /chat/stream  — SSE streaming answer
# ---------------------------------------------------------------------------


@chat_router.post("/stream")
async def rag_chat_stream(body: RAGRequest):
    """
    Run the RAG pipeline with streaming output via Server-Sent Events.

    Each SSE event carries a JSON data payload:
      {"type":"chunk",   "text":"..."}
      {"type":"sources", "sources":[...]}
      {"type":"done",    "confidence":0.9, "retrieved_chunks":5, "session_id":"..."}
      {"type":"error",   "message":"..."}
    """
    async def event_generator():
        try:
            async for json_str in answer_stream(body):
                yield {"data": json_str}
        except Exception as exc:
            logger.exception("SSE stream error")
            import json
            yield {"data": json.dumps({"type": "error", "message": str(exc)})}

    return EventSourceResponse(event_generator())


# ---------------------------------------------------------------------------
# GET /chat/history  — retrieve session history
# ---------------------------------------------------------------------------


@chat_router.get("/history", response_model=ChatHistoryResponse)
def get_chat_history(
    session_id: str = Query(..., description="Session ID to retrieve history for."),
):
    """Return the conversation history for a session."""
    session = conv_mgr.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Session '{session_id}' not found.",
        )

    turns = [
        ConversationTurn(role=msg["role"], content=msg["parts"][0])
        for msg in session.get_history()
    ]

    return ChatHistoryResponse(
        session_id=session.session_id,
        repository_name=session.repository_name,
        turn_count=session.turn_count,
        turns=turns,
    )


# ---------------------------------------------------------------------------
# DELETE /chat/history  — clear session
# ---------------------------------------------------------------------------


@chat_router.delete("/history")
def clear_chat_history(
    session_id: str = Query(..., description="Session ID to clear."),
):
    """Clear conversation history for a session without deleting the session."""
    cleared = conv_mgr.clear_session(session_id)
    return {
        "status": "cleared" if cleared else "not_found",
        "session_id": session_id,
    }
