"""
Embeddings API router.

Endpoints
---------
POST  /embeddings/generate      Generate embeddings for all chunks.
POST  /embeddings/regenerate    Regenerate embeddings for changed chunks only.
GET   /embeddings/statistics    Aggregate statistics (no vectors).
GET   /embeddings/progress      Live generation progress snapshot.
GET   /embeddings/list          Paginated list of embedding metadata (no vectors).

Raw float32 vectors are NEVER returned through these endpoints.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.embedding import (
    EmbeddingGenerateResponse,
    EmbeddingListEntry,
    EmbeddingListResponse,
    EmbeddingProgress,
    EmbeddingStatistics,
)
from app.services.embedding.embedding_service import (
    generate_embeddings,
    get_embedding_store,
    get_progress,
)
from app.services.git_service import get_current_clone_dir
from app.config import settings

logger = logging.getLogger(__name__)

embeddings_router = APIRouter(prefix="/embeddings", tags=["Embeddings"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_store():
    store = get_embedding_store()
    if store is None or store.total_embeddings == 0:
        raise HTTPException(
            status_code=404,
            detail="No embeddings found. POST /embeddings/generate first.",
        )
    return store


def _resolve_repo_name(repository_name: str) -> str:
    if repository_name:
        return repository_name
    clone_dir = get_current_clone_dir()
    if clone_dir:
        parts = clone_dir.name.split("__", 1)
        return parts[1] if len(parts) == 2 else clone_dir.name
    return "unknown"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@embeddings_router.post("/generate", response_model=EmbeddingGenerateResponse)
async def generate(
    repository_name: str = Query(default="", description="Repository name override."),
):
    """
    Generate embeddings for every chunk in the active ChunkIndex.

    Requires a prior call to POST /chunk/generate.
    Uses content-hash caching — unchanged chunks reuse their cached vectors.
    Runs in a background thread to avoid blocking the event loop.
    """
    repo_name = _resolve_repo_name(repository_name)
    try:
        result = await asyncio.to_thread(generate_embeddings, repo_name, False)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Embedding generation failed")
        raise HTTPException(status_code=500, detail=f"Embedding generation failed: {exc}") from exc
    return result


@embeddings_router.post("/regenerate", response_model=EmbeddingGenerateResponse)
async def regenerate(
    repository_name: str = Query(default="", description="Repository name override."),
):
    """
    Regenerate embeddings only for chunks whose content has changed.

    Checks each chunk's SHA-256 content hash against the cache and skips
    any chunk that is already embedded with identical content.
    """
    repo_name = _resolve_repo_name(repository_name)
    try:
        result = await asyncio.to_thread(generate_embeddings, repo_name, True)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Embedding regeneration failed")
        raise HTTPException(status_code=500, detail=f"Embedding regeneration failed: {exc}") from exc
    return result


@embeddings_router.get("/statistics", response_model=EmbeddingStatistics)
def get_statistics():
    """Return aggregate statistics for the current embedding store."""
    store = _require_store()
    return EmbeddingStatistics(
        repository_name=store.repository_name,
        total_embeddings=store.total_embeddings,
        embedding_dimension=store.embedding_dimension,
        model_name=store.model_name,
        cache_hits=store.total_cache_hits,
        cache_hit_ratio=store.cache_hit_ratio,
        failed_chunks=store.total_failed,
        elapsed_seconds=store.elapsed_seconds,
        languages=store.languages,
        chunk_type_distribution=store.chunk_type_distribution,
    )


@embeddings_router.get("/progress", response_model=Optional[EmbeddingProgress])
def get_generation_progress():
    """
    Return the latest progress snapshot.

    Returns null if no generation has started yet.
    Poll this endpoint while POST /embeddings/generate is running to show
    a live progress bar on the frontend.
    """
    return get_progress()


@embeddings_router.get("/list", response_model=EmbeddingListResponse)
def list_embeddings(
    language: Optional[str] = Query(default=None),
    chunk_type: Optional[str] = Query(default=None),
    limit: int = Query(default=500, ge=1, le=5000),
    offset: int = Query(default=0, ge=0),
):
    """
    Return a paginated list of embedding metadata records.

    Raw float32 vectors are intentionally excluded from this response.
    """
    store = _require_store()
    all_meta = store.all_metadata()

    if language:
        all_meta = [m for m in all_meta if m.language.lower() == language.lower()]
    if chunk_type:
        all_meta = [m for m in all_meta if m.chunk_type.lower() == chunk_type.lower()]

    page = all_meta[offset : offset + limit]
    entries = [
        EmbeddingListEntry(
            embedding_id=m.embedding_id,
            chunk_id=m.chunk_id,
            file_path=m.file_path,
            language=m.language,
            chunk_type=m.chunk_type,
            model_name=m.model_name,
            embedding_dimension=m.embedding_dimension,
            was_cached=m.was_cached,
            created_at=m.created_at,
        )
        for m in page
    ]
    return EmbeddingListResponse(embeddings=entries, total=len(all_meta))
