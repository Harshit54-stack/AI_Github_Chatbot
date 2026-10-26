"""
Vector result Pydantic models for Phase 6 (FAISS).

Raw vectors are NEVER included in any of these models.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Search result models
# ---------------------------------------------------------------------------


class SearchResultItem(BaseModel):
    """A single hit returned by the FAISS similarity search."""

    chunk_id: str
    score: float = Field(description="Cosine similarity score (0–1, higher = more similar).")
    file_path: str
    symbol_name: str
    chunk_type: str
    language: str
    start_line: int
    end_line: int
    repository_name: str
    # Optional: include a short content preview (first 300 chars)
    content_preview: Optional[str] = None


class SearchRequest(BaseModel):
    """Request body for POST /vector/search."""

    query: str = Field(min_length=1, description="Natural-language query to search for.")
    top_k: int = Field(default=5, ge=1, le=50, description="Number of top results to return.")


class SearchResponse(BaseModel):
    """Response for POST /vector/search."""

    query: str
    top_k: int
    results: List[SearchResultItem]
    elapsed_ms: float


# ---------------------------------------------------------------------------
# Index statistics model
# ---------------------------------------------------------------------------


class VectorStatistics(BaseModel):
    """Response for GET /vector/statistics."""

    repository_name: str
    total_vectors: int
    embedding_dimension: int
    index_type: str = Field(description="e.g. 'IndexFlatIP' (inner-product / cosine).")
    index_size_bytes: int
    last_updated: Optional[datetime] = None
    is_trained: bool
    model_name: str


# ---------------------------------------------------------------------------
# Build response
# ---------------------------------------------------------------------------


class BuildResponse(BaseModel):
    """Response for POST /vector/build."""

    status: str = "success"
    repository_name: str
    total_vectors: int
    embedding_dimension: int
    index_type: str
    elapsed_seconds: float
