"""
Chunk Storage — in-memory repository chunk index singleton.

Stores the result of the most recent chunk generation run.
The index is thread-safe and designed to be consumed by Phase 5
(embedding generation) without modification.

Structure
---------
ChunkIndex
  ├── repository_name: str
  ├── chunks: List[Chunk]          ← flat list, all chunk types
  └── generated_at: datetime
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional

from app.models.chunk import Chunk, ChunkType

_lock = threading.Lock()


@dataclass
class ChunkIndex:
    """
    In-memory index of all chunks for the active repository.

    Phase 5 will consume this directly for embedding generation.
    """

    repository_name: str
    chunks: List[Chunk] = field(default_factory=list)
    generated_at: datetime = field(default_factory=datetime.utcnow)

    # ----------------------------------------------------------------
    # Computed properties
    # ----------------------------------------------------------------

    @property
    def total_chunks(self) -> int:
        return len(self.chunks)

    @property
    def languages(self) -> List[str]:
        return sorted({c.language for c in self.chunks})

    @property
    def chunk_type_distribution(self) -> Dict[str, int]:
        dist: Dict[str, int] = {}
        for chunk in self.chunks:
            key = chunk.chunk_type.value
            dist[key] = dist.get(key, 0) + 1
        return dist

    @property
    def average_chunk_size(self) -> float:
        if not self.chunks:
            return 0.0
        return round(sum(c.total_lines for c in self.chunks) / len(self.chunks), 2)

    @property
    def largest_chunk_lines(self) -> int:
        return max((c.total_lines for c in self.chunks), default=0)

    @property
    def smallest_chunk_lines(self) -> int:
        return min((c.total_lines for c in self.chunks), default=0)

    # ----------------------------------------------------------------
    # Lookup helpers
    # ----------------------------------------------------------------

    def get_chunk(self, chunk_id: str) -> Optional[Chunk]:
        """Return a chunk by its ID, or None."""
        for chunk in self.chunks:
            if chunk.chunk_id == chunk_id:
                return chunk
        return None

    def filter_chunks(
        self,
        *,
        language: Optional[str] = None,
        chunk_type: Optional[ChunkType] = None,
        search: Optional[str] = None,
        file_path: Optional[str] = None,
    ) -> List[Chunk]:
        """
        Filter the chunk list by optional criteria.

        All supplied criteria are combined with AND logic.
        String comparisons are case-insensitive for search.
        """
        results = self.chunks

        if language:
            results = [c for c in results if c.language.lower() == language.lower()]

        if chunk_type:
            results = [c for c in results if c.chunk_type == chunk_type]

        if file_path:
            results = [c for c in results if c.file_path == file_path]

        if search:
            term = search.lower()
            results = [
                c for c in results
                if term in c.symbol_name.lower() or term in c.file_path.lower()
            ]

        return results


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_chunk_index: Optional[ChunkIndex] = None


def store_chunk_index(index: ChunkIndex) -> None:
    """Replace the current chunk index with a new one."""
    global _chunk_index
    with _lock:
        _chunk_index = index


def get_chunk_index() -> Optional[ChunkIndex]:
    """Return the current chunk index, or None if chunking has not run."""
    with _lock:
        return _chunk_index


def clear_chunk_index() -> None:
    """Discard the current chunk index."""
    global _chunk_index
    with _lock:
        _chunk_index = None
