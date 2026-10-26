"""
In-memory Repository Index.

Stores the result of the most recent parse run as a module-level singleton.
The index is rebuilt on each POST /parser/parse call and persists for the
lifetime of the server process — ready to be consumed by Phase 4 (RAG).

Thread safety: FastAPI runs async routes in a single thread by default.
Blocking parse operations are dispatched via asyncio.to_thread, so we use
a simple module-level variable guarded by a threading.Lock.
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional

from app.models.parsed_file import ParsedFile

_lock = threading.Lock()


@dataclass
class RepositoryIndex:
    """Flat collection of parsed files with aggregate metadata."""

    repository_name: str
    files: List[ParsedFile] = field(default_factory=list)
    parsed_at: datetime = field(default_factory=datetime.utcnow)

    # ----------------------------------------------------------------
    # Computed properties
    # ----------------------------------------------------------------

    @property
    def total_classes(self) -> int:
        return sum(len(f.classes) for f in self.files)

    @property
    def total_functions(self) -> int:
        return sum(len(f.functions) + sum(len(c.methods) for c in f.classes) for f in self.files)

    @property
    def languages(self) -> List[str]:
        return sorted({f.language for f in self.files})

    def get_file(self, relative_path: str) -> Optional[ParsedFile]:
        """Return a ParsedFile by its relative path, or None."""
        for f in self.files:
            if f.relative_path == relative_path:
                return f
        return None


# ---------------------------------------------------------------------------
# Singleton access
# ---------------------------------------------------------------------------

_index: Optional[RepositoryIndex] = None


def store_index(index: RepositoryIndex) -> None:
    """Replace the current index with a new one."""
    global _index
    with _lock:
        _index = index


def get_index() -> Optional[RepositoryIndex]:
    """Return the current index, or None if parsing has not yet run."""
    with _lock:
        return _index


def clear_index() -> None:
    """Discard the current index (called when a repository is deleted)."""
    global _index
    with _lock:
        _index = None
