"""
Pydantic models for chat-related request and response payloads.
"""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, description="User message to send to Gemini")


class ChatResponse(BaseModel):
    reply: str = Field(..., description="AI-generated reply from Gemini")
