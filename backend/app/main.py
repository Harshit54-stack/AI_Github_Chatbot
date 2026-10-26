"""
FastAPI application entry point.
Configures CORS, mounts routers, and registers global exception handlers.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.api import router, repository_router, parser_router, chunk_router, embeddings_router, vector_router, chat_router

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Backend API for the AI GitHub Repository Assistant",
)

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------
app.include_router(router)
app.include_router(repository_router)
app.include_router(parser_router)
app.include_router(chunk_router)
app.include_router(embeddings_router)
app.include_router(vector_router)
app.include_router(chat_router)

# ---------------------------------------------------------------------------
# Global exception handlers
# ---------------------------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all handler for unexpected server errors."""
    return JSONResponse(
        status_code=500,
        content={"error": "An unexpected error occurred.", "detail": str(exc)},
    )
