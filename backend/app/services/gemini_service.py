"""
Gemini AI service layer.
Handles all interactions with the Google Generative AI SDK.
Wraps synchronous SDK calls in asyncio.to_thread for non-blocking execution.
"""

import asyncio
import google.generativeai as genai
from app.config import settings


def _get_model() -> genai.GenerativeModel:
    """Initialize and return a configured Gemini GenerativeModel instance."""
    if not settings.GEMINI_API_KEY:
        raise ValueError("GEMINI_API_KEY is not set in environment variables.")
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel(settings.GEMINI_MODEL)


async def generate_reply(message: str) -> str:
    """
    Send a message to Gemini and return the text response.

    The underlying SDK call is synchronous, so it is offloaded to a thread
    pool via asyncio.to_thread to avoid blocking the FastAPI event loop.

    Args:
        message: The user's input message.

    Returns:
        The AI-generated reply as a plain string.

    Raises:
        ValueError: If the API key is missing.
        Exception: Propagates unexpected SDK errors.
    """
    model = _get_model()
    # Run the blocking SDK call in a thread so we don't stall the event loop
    response = await asyncio.to_thread(model.generate_content, message)
    return response.text
