"""
Vector API router — Phase 6 FAISS endpoints.

Endpoints (declared before wildcard paths)
------------------------------------------
POST  /vector/build         Build FAISS index from current embeddings.
POST  /vector/search        Semantic similarity search.
GET   /vector/statistics    Index statistics (no vectors).
DELETE /vector/index        Delete the repository index from disk.

Raw float32 vectors are NEVER returned through these endpoints.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from app.models.vector_result import (
    BuildResponse,
    SearchRequest,
    SearchResponse,
    VectorStatistics,
)
from app.services.vector_store.faiss_service import build_index
from app.services.vector_store.index_manager import (
    FaissIndex,
    get as get_index,
    get_or_create,
    remove as remove_index,
)
from app.services.vector_store.search_service import search
from app.services.git_service import get_current_clone_dir
from app.config import settings

logger = logging.getLogger(__name__)

vector_router = APIRouter(prefix="/vector", tags=["Vector Store"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_repo_name(repository_name: str) -> str:
    if repository_name:
        return repository_name
    clone_dir = get_current_clone_dir()
    if clone_dir:
        parts = clone_dir.name.split("__", 1)
        return parts[1] if len(parts) == 2 else clone_dir.name
    return ""


def _require_index(repository_name: str) -> FaissIndex:
    idx = get_index(repository_name)
    if idx is None or not idx.is_ready:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No FAISS index found for repository '{repository_name}'. "
                "Run POST /vector/build first."
            ),
        )
    return idx


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@vector_router.post("/build", response_model=BuildResponse)
async def build(
    repository_name: str = Query(default="", description="Repository name override."),
):
    """
    Build (or rebuild) the FAISS index from the current EmbeddingStore.

    Prerequisites: POST /embeddings/generate must have run first.
    Heavy computation is offloaded to a thread so the event loop stays free.
    """
    repo_name = _resolve_repo_name(repository_name)
    if not repo_name:
        raise HTTPException(
            status_code=400,
            detail="repository_name is required. Clone a repository first.",
        )
    try:
        result = await asyncio.to_thread(build_index, repo_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("FAISS build failed")
        raise HTTPException(status_code=500, detail=f"Index build failed: {exc}") from exc
    return result


@vector_router.post("/search", response_model=SearchResponse)
async def semantic_search(
    body: SearchRequest,
    repository_name: str = Query(default="", description="Repository name override."),
):
    """
    Perform semantic similarity search against the FAISS index.

    Encodes the query with the same SentenceTransformer used in Phase 5,
    runs a nearest-neighbour search, and returns ranked chunk metadata.
    No AI generation is performed.
    """
    repo_name = _resolve_repo_name(repository_name)
    if not repo_name:
        raise HTTPException(status_code=400, detail="repository_name is required.")

    # Ensure the index is loaded (it may be persisted on disk from a previous run)
    get_or_create(repo_name)

    try:
        result = await asyncio.to_thread(search, repo_name, body)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("FAISS search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {exc}") from exc
    return result


@vector_router.get("/statistics", response_model=VectorStatistics)
def get_statistics(
    repository_name: str = Query(default="", description="Repository name override."),
):
    """Return aggregate statistics for the active FAISS index."""
    repo_name = _resolve_repo_name(repository_name)
    if not repo_name:
        raise HTTPException(status_code=400, detail="repository_name is required.")

    idx = _require_index(repo_name)
    return VectorStatistics(
        repository_name=idx.repository_name,
        total_vectors=idx.total_vectors,
        embedding_dimension=idx.embedding_dimension,
        index_type=FaissIndex.INDEX_TYPE,
        index_size_bytes=idx.index_size_bytes,
        last_updated=idx.last_updated,
        is_trained=idx.is_trained,
        model_name=settings.EMBEDDING_MODEL,
    )


@vector_router.delete("/index")
def delete_index(
    repository_name: str = Query(default="", description="Repository name override."),
):
    """Delete the FAISS index and metadata for the specified repository."""
    repo_name = _resolve_repo_name(repository_name)
    if not repo_name:
        raise HTTPException(status_code=400, detail="repository_name is required.")

    idx = get_index(repo_name)
    if idx:
        idx.delete()
        remove_index(repo_name)

    return {"status": "deleted", "repository_name": repo_name}
