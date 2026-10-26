"""
Metadata Store — persists and retrieves the mapping from FAISS integer ID
to chunk metadata (file path, symbol name, language, etc.).

Design
------
* FAISS only stores float32 vectors; all human-readable metadata lives here.
* The store is serialised to JSON on disk so it survives server restarts.
* Format:
    vector_store/<repository_name>_metadata.json
    {
        "0": { "chunk_id": "...", "file_path": "...", ... },
        "1": { ... },
        ...
    }

  Key is the string representation of the FAISS integer index (faiss_id).

Thread safety
-------------
A threading.Lock guards reads and writes so the store is safe under
concurrent FastAPI requests.
"""

from __future__ import annotations

import json
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class MetadataEntry:
    """Lightweight container for per-vector metadata."""

    __slots__ = (
        "faiss_id",
        "chunk_id",
        "repository_name",
        "file_path",
        "symbol_name",
        "chunk_type",
        "language",
        "start_line",
        "end_line",
        "content_preview",
    )

    def __init__(
        self,
        *,
        faiss_id: int,
        chunk_id: str,
        repository_name: str,
        file_path: str,
        symbol_name: str,
        chunk_type: str,
        language: str,
        start_line: int,
        end_line: int,
        content_preview: str = "",
    ) -> None:
        self.faiss_id = faiss_id
        self.chunk_id = chunk_id
        self.repository_name = repository_name
        self.file_path = file_path
        self.symbol_name = symbol_name
        self.chunk_type = chunk_type
        self.language = language
        self.start_line = start_line
        self.end_line = end_line
        self.content_preview = content_preview

    def to_dict(self) -> dict:
        return {k: getattr(self, k) for k in self.__slots__}

    @classmethod
    def from_dict(cls, d: dict) -> "MetadataEntry":
        return cls(**d)


class MetadataStore:
    """
    Manages the faiss_id → MetadataEntry mapping for one repository.

    Args:
        store_path: Path to the JSON file on disk.
    """

    def __init__(self, store_path: Path) -> None:
        self._path = store_path
        self._lock = threading.Lock()
        self._data: Dict[int, MetadataEntry] = {}

    # ----------------------------------------------------------------
    # CRUD
    # ----------------------------------------------------------------

    def add(self, entry: MetadataEntry) -> None:
        with self._lock:
            self._data[entry.faiss_id] = entry

    def get(self, faiss_id: int) -> Optional[MetadataEntry]:
        with self._lock:
            return self._data.get(faiss_id)

    def get_by_chunk_id(self, chunk_id: str) -> Optional[MetadataEntry]:
        with self._lock:
            for entry in self._data.values():
                if entry.chunk_id == chunk_id:
                    return entry
        return None

    def all(self) -> List[MetadataEntry]:
        with self._lock:
            return list(self._data.values())

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._data)

    # ----------------------------------------------------------------
    # Persistence
    # ----------------------------------------------------------------

    def save(self) -> None:
        """Serialise to JSON. Creates parent directories if needed."""
        self._path.parent.mkdir(parents=True, exist_ok=True)
        payload = {str(k): v.to_dict() for k, v in self._data.items()}
        tmp = self._path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        tmp.replace(self._path)
        logger.debug("MetadataStore saved to '%s' (%d entries).", self._path, len(payload))

    def load(self) -> bool:
        """
        Load from JSON.

        Returns:
            True if the file existed and was loaded successfully, False otherwise.
        """
        if not self._path.exists():
            return False
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
            with self._lock:
                self._data = {
                    int(k): MetadataEntry.from_dict(v) for k, v in payload.items()
                }
            logger.info(
                "MetadataStore loaded from '%s' (%d entries).", self._path, len(self._data)
            )
            return True
        except Exception as exc:
            logger.error("Failed to load MetadataStore from '%s': %s", self._path, exc)
            return False

    def delete(self) -> None:
        """Remove the JSON file from disk."""
        if self._path.exists():
            self._path.unlink()
            logger.info("MetadataStore file deleted: '%s'.", self._path)
        self.clear()
