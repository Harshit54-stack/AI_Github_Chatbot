"""
Pydantic models for code chunks.

A Chunk is the atomic unit of the repository index — a self-contained
logical block of code or documentation ready for embedding in Phase 5.
"""

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Chunk type enumeration
# ---------------------------------------------------------------------------


class ChunkType(str, Enum):
    FUNCTION = "function"
    CLASS = "class"
    METHOD = "method"
    MODULE = "module"
    README = "readme"
    MARKDOWN_SECTION = "markdown_section"


# ---------------------------------------------------------------------------
# Core Chunk model
# ---------------------------------------------------------------------------


class Chunk(BaseModel):
    """
    A single semantic chunk extracted from a repository file.

    Contains the full source content of a logical code unit
    (function, class, module, or documentation section) together
    with all metadata needed for retrieval and display.
    """

    chunk_id: str = Field(description="Unique identifier for this chunk (SHA-256 hex digest).")
    repository_name: str
    file_path: str = Field(description="Relative path from repository root.")
    language: str
    chunk_type: ChunkType
    symbol_name: str = Field(description="Name of the function, class, section, or file.")
    parent_class: Optional[str] = Field(
        default=None,
        description="Class name for method chunks; None for top-level symbols.",
    )
    start_line: int = Field(ge=1)
    end_line: int = Field(ge=1)
    total_lines: int = Field(ge=0)
    content: str = Field(description="Full source text of this chunk.")
    imports: List[str] = Field(
        default_factory=list,
        description="Import statements at the top of the enclosing file.",
    )
    docstring: Optional[str] = Field(
        default=None,
        description="Extracted docstring / leading comment.",
    )
    created_at: datetime = Field(default_factory=datetime.utcnow)


# ---------------------------------------------------------------------------
# API response models
# ---------------------------------------------------------------------------


class ChunkListEntry(BaseModel):
    """Lightweight summary row for GET /chunk/list."""

    chunk_id: str
    symbol_name: str
    chunk_type: ChunkType
    language: str
    file_path: str
    start_line: int
    end_line: int
    total_lines: int
    parent_class: Optional[str] = None


class ChunkListResponse(BaseModel):
    """Response envelope for GET /chunk/list."""

    chunks: List[ChunkListEntry]
    total: int


class ChunkStatistics(BaseModel):
    """Response for GET /chunk/statistics."""

    repository_name: str
    total_chunks: int
    average_chunk_size: float = Field(description="Average lines per chunk.")
    largest_chunk_lines: int
    smallest_chunk_lines: int
    chunk_type_distribution: dict[str, int]
    languages: List[str]


class GenerateResponse(BaseModel):
    """Response for POST /chunk/generate."""

    status: str = "success"
    repository_name: str
    total_chunks: int
    chunk_type_distribution: dict[str, int]
    languages: List[str]
