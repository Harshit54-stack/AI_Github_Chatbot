"""
API router for core utility endpoints:
  GET  /          - root status
  GET  /health    - health check
  POST /test-gemini - send a message to Gemini and get a reply
"""

from fastapi import APIRouter, HTTPException
from app.models import ChatRequest, ChatResponse
from app.services import generate_reply

router = APIRouter()


@router.get("/", tags=["Root"])
async def root():
    """Application root – confirms the backend is running."""
    return {"message": "AI GitHub Repository Assistant Backend Running"}


@router.get("/health", tags=["Health"])
async def health_check():
    """Simple health-check endpoint."""
    return {"status": "healthy"}


@router.post("/test-gemini", response_model=ChatResponse, tags=["Gemini"])
async def test_gemini(payload: ChatRequest):
    """
    Send a message to the Gemini API and return its reply.

    Request body:
        { "message": "Hello" }

    Response body:
        { "reply": "<AI response>" }
    """
    try:
        reply = await generate_reply(payload.message)
        return ChatResponse(reply=reply)
    except ValueError as exc:
        # Missing API key or configuration error
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Gemini API error: {str(exc)}",
        ) from exc
