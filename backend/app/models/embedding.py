"""
Pydantic models for embedding metadata.

Raw embedding vectors are NEVER exposed through the API.
Only lightweight metadata is surfaced to callers.
"""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Core metadata model
# ---------------------------------------------------------------------------


class EmbeddingMetadata(BaseModel):
    """
    Metadata record stored for every generated embedding.

    The actual float vector is kept in EmbeddingStore (in-memory, numpy)
    and is intentionally absent from this schema so it is never
    accidentally serialised to JSON and sent over the wire.
    """

    embedding_id: str = Field(
        description="SHA-256 prefix of the chunk content (also used as cache key)."
    )
    chunk_id: str
    repository_name: str
    file_path: str
    language: str
    chunk_type: str
    embedding_dimension: int
    model_name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    was_cached: bool = Field(
        default=False,
        description="True if this embedding was reused from the content-hash cache.",
    )


# ---------------------------------------------------------------------------
# Progress tracker
# ---------------------------------------------------------------------------


class EmbeddingProgress(BaseModel):
    """Live progress snapshot exposed by the API during generation."""

    total_chunks: int
    processed_chunks: int
    remaining_chunks: int
    failed_chunks: int
    cache_hits: int
    elapsed_seconds: float
    is_complete: bool


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------


class EmbeddingGenerateResponse(BaseModel):
    """Response for POST /embeddings/generate and /embeddings/regenerate."""

    status: str = "success"
    repository_name: str
    total_embeddings: int
    new_embeddings: int
    cache_hits: int
    failed_chunks: int
    model_name: str
    embedding_dimension: int
    elapsed_seconds: float


class EmbeddingStatistics(BaseModel):
    """Response for GET /embeddings/statistics."""

    repository_name: str
    total_embeddings: int
    embedding_dimension: int
    model_name: str
    cache_hits: int
    cache_hit_ratio: float = Field(description="Fraction of embeddings served from cache (0–1).")
    failed_chunks: int
    elapsed_seconds: float
    languages: List[str]
    chunk_type_distribution: dict[str, int]


class EmbeddingListEntry(BaseModel):
    """One row returned by GET /embeddings/list (no vector)."""

    embedding_id: str
    chunk_id: str
    file_path: str
    language: str
    chunk_type: str
    model_name: str
    embedding_dimension: int
    was_cached: bool
    created_at: datetime


class EmbeddingListResponse(BaseModel):
    """Response envelope for GET /embeddings/list."""

    embeddings: List[EmbeddingListEntry]
    total: int
