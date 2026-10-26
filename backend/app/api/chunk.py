"""
Chunk API router.

Endpoints
---------
POST  /chunk/generate          Generate chunks from the parsed index.
GET   /chunk/list              List all chunks (with optional filters).
GET   /chunk/statistics        Aggregate statistics for the chunk index.
GET   /chunk/{chunk_id}        Full detail for a single chunk.

Note: /chunk/statistics and /chunk/list must be declared before
      /chunk/{chunk_id} so FastAPI does not mistake "statistics"
      or "list" for a chunk_id path parameter.
"""

from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.models.chunk import (
    Chunk,
    ChunkListEntry,
    ChunkListResponse,
    ChunkStatistics,
    ChunkType,
    GenerateResponse,
)
from app.services.chunking.chunk_service import generate_chunks
from app.services.chunking.chunk_storage import get_chunk_index
from app.services.git_service import get_current_clone_dir

logger = logging.getLogger(__name__)

chunk_router = APIRouter(prefix="/chunk", tags=["Chunking"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_index():
    index = get_chunk_index()
    if index is None:
        raise HTTPException(
            status_code=404,
            detail="No chunk index found. POST /chunk/generate first.",
        )
    return index


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@chunk_router.post("/generate", response_model=GenerateResponse)
async def generate(repository_name: str = Query(default="")):
    """
    Generate semantic chunks from the parsed repository index.

    Requires a prior call to POST /parser/parse.
    Runs in a background thread to avoid blocking the event loop.
    """
    clone_dir = get_current_clone_dir()
    if clone_dir is None:
        raise HTTPException(
            status_code=404,
            detail="No repository is cloned. Clone a repository first.",
        )

    # Derive repo name from folder if not provided
    if not repository_name:
        folder_name = clone_dir.name
        parts = folder_name.split("__", 1)
        repository_name = parts[1] if len(parts) == 2 else folder_name

    try:
        result = await asyncio.to_thread(generate_chunks, repository_name)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Chunk generation failed")
        raise HTTPException(status_code=500, detail=f"Chunk generation failed: {exc}") from exc

    return result


@chunk_router.get("/statistics", response_model=ChunkStatistics)
def get_statistics():
    """Return aggregate statistics for the current chunk index."""
    index = _require_index()
    return ChunkStatistics(
        repository_name=index.repository_name,
        total_chunks=index.total_chunks,
        average_chunk_size=index.average_chunk_size,
        largest_chunk_lines=index.largest_chunk_lines,
        smallest_chunk_lines=index.smallest_chunk_lines,
        chunk_type_distribution=index.chunk_type_distribution,
        languages=index.languages,
    )


@chunk_router.get("/list", response_model=ChunkListResponse)
def list_chunks(
    language: Optional[str] = Query(default=None, description="Filter by language name."),
    chunk_type: Optional[ChunkType] = Query(default=None, description="Filter by chunk type."),
    search: Optional[str] = Query(default=None, description="Search symbol name or file path."),
    file_path: Optional[str] = Query(default=None, description="Filter by exact relative file path."),
    limit: int = Query(default=500, ge=1, le=5000, description="Maximum number of results."),
    offset: int = Query(default=0, ge=0, description="Pagination offset."),
):
    """
    Return the flat list of chunks with optional filtering and pagination.

    Filters are combined with AND logic. All string comparisons are
    case-insensitive.
    """
    index = _require_index()

    filtered = index.filter_chunks(
        language=language,
        chunk_type=chunk_type,
        search=search,
        file_path=file_path,
    )

    page = filtered[offset: offset + limit]

    entries = [
        ChunkListEntry(
            chunk_id=c.chunk_id,
            symbol_name=c.symbol_name,
            chunk_type=c.chunk_type,
            language=c.language,
            file_path=c.file_path,
            start_line=c.start_line,
            end_line=c.end_line,
            total_lines=c.total_lines,
            parent_class=c.parent_class,
        )
        for c in page
    ]

    return ChunkListResponse(chunks=entries, total=len(filtered))


@chunk_router.get("/{chunk_id}", response_model=Chunk)
def get_chunk(chunk_id: str):
    """Return full detail (including source content) for a single chunk."""
    index = _require_index()
    chunk = index.get_chunk(chunk_id)
    if chunk is None:
        raise HTTPException(
            status_code=404,
            detail=f"Chunk '{chunk_id}' not found in the index.",
        )
    return chunk
