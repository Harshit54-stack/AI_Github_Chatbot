"""
FAISS Index Manager — creates, persists, loads, and deletes FAISS indexes.

Index type
----------
We use IndexFlatIP (inner-product) on L2-normalised vectors, which is
equivalent to cosine similarity search. This is the correct pairing for
the normalised vectors produced by EmbeddingModel.encode_texts().

Persistence layout (relative to settings.VECTOR_STORE_DIR)
-----------------------------------------------------------
    <repository_name>.faiss              ← FAISS binary index
    <repository_name>_metadata.json      ← MetadataStore JSON

Thread safety
-------------
A per-index RLock is used so that reads and writes to the same repository
index are serialised while different repositories can be served concurrently.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from pathlib import Path
from threading import RLock
from typing import Dict, Optional

import faiss
import numpy as np

from app.services.vector_store.metadata_store import MetadataStore, MetadataEntry
from app.config import settings

logger = logging.getLogger(__name__)


class FaissIndex:
    """
    Wraps a FAISS index together with its MetadataStore for one repository.

    Args:
        repository_name: Used to derive file paths under VECTOR_STORE_DIR.
    """

    INDEX_TYPE = "IndexFlatIP"

    def __init__(self, repository_name: str) -> None:
        self.repository_name = repository_name
        self._lock = RLock()

        store_dir: Path = settings.VECTOR_STORE_DIR
        store_dir.mkdir(parents=True, exist_ok=True)

        self._index_path = store_dir / f"{repository_name}.faiss"
        self._meta_path = store_dir / f"{repository_name}_metadata.json"

        self._index: Optional[faiss.IndexFlatIP] = None
        self._meta: MetadataStore = MetadataStore(self._meta_path)
        self.last_updated: Optional[datetime] = None
        self.embedding_dimension: int = 0

    # ----------------------------------------------------------------
    # Creation
    # ----------------------------------------------------------------

    def build(
        self,
        vectors: np.ndarray,
        entries: list[MetadataEntry],
    ) -> None:
        """
        (Re-)build the FAISS index from scratch.

        Args:
            vectors:  float32 ndarray of shape (N, dim), L2-normalised.
            entries:  MetadataEntry list aligned with vectors (same order).
        """
        if vectors.ndim != 2 or vectors.shape[0] == 0:
            raise ValueError("vectors must be a non-empty 2-D float32 array.")
        if len(vectors) != len(entries):
            raise ValueError(
                f"vectors ({len(vectors)}) and entries ({len(entries)}) must have the same length."
            )

        dim = vectors.shape[1]
        vectors = vectors.astype(np.float32)

        with self._lock:
            self._index = faiss.IndexFlatIP(dim)
            self._index.add(vectors)

            self._meta.clear()
            for entry in entries:
                self._meta.add(entry)

            self.embedding_dimension = dim
            self.last_updated = datetime.utcnow()

        logger.info(
            "Built FAISS index for '%s' — %d vectors, dim=%d.",
            self.repository_name, len(vectors), dim,
        )

    # ----------------------------------------------------------------
    # Search
    # ----------------------------------------------------------------

    def search(
        self,
        query_vector: np.ndarray,
        top_k: int = 5,
    ) -> list[tuple[int, float]]:
        """
        Search for the top-K nearest vectors.

        Args:
            query_vector: 1-D float32 array of length dim.
            top_k:        Number of results to return.

        Returns:
            List of (faiss_id, score) tuples, highest score first.
        """
        with self._lock:
            if self._index is None or self._index.ntotal == 0:
                return []

            q = query_vector.astype(np.float32).reshape(1, -1)
            k = min(top_k, self._index.ntotal)
            scores, ids = self._index.search(q, k)

        pairs = [
            (int(ids[0][i]), float(scores[0][i]))
            for i in range(k)
            if ids[0][i] >= 0
        ]
        return pairs

    def get_metadata(self, faiss_id: int) -> Optional[MetadataEntry]:
        return self._meta.get(faiss_id)

    # ----------------------------------------------------------------
    # Persistence
    # ----------------------------------------------------------------

    def save(self) -> None:
        """Write FAISS binary + metadata JSON to disk."""
        with self._lock:
            if self._index is None:
                return
            faiss.write_index(self._index, str(self._index_path))
            self._meta.save()
        logger.info("FaissIndex for '%s' saved to disk.", self.repository_name)

    def load(self) -> bool:
        """
        Load FAISS index + metadata from disk.

        Returns:
            True if both files exist and were loaded, False otherwise.
        """
        if not self._index_path.exists() or not self._meta_path.exists():
            return False
        try:
            with self._lock:
                self._index = faiss.read_index(str(self._index_path))
                self.embedding_dimension = self._index.d
                meta_loaded = self._meta.load()
            if not meta_loaded:
                return False
            logger.info(
                "FaissIndex loaded for '%s' — %d vectors, dim=%d.",
                self.repository_name, self._index.ntotal, self._index.d,
            )
            return True
        except Exception as exc:
            logger.error(
                "Failed to load FaissIndex for '%s': %s", self.repository_name, exc
            )
            return False

    def delete(self) -> None:
        """Remove this index from disk and reset in-memory state."""
        with self._lock:
            if self._index_path.exists():
                self._index_path.unlink()
            self._meta.delete()
            self._index = None
            self.last_updated = None
            self.embedding_dimension = 0
        logger.info("FaissIndex for '%s' deleted.", self.repository_name)

    # ----------------------------------------------------------------
    # Properties
    # ----------------------------------------------------------------

    @property
    def total_vectors(self) -> int:
        with self._lock:
            return self._index.ntotal if self._index else 0

    @property
    def is_ready(self) -> bool:
        with self._lock:
            return self._index is not None and self._index.ntotal > 0

    @property
    def index_size_bytes(self) -> int:
        """Approximate on-disk size of the FAISS binary file."""
        try:
            return self._index_path.stat().st_size
        except FileNotFoundError:
            # Estimate from in-memory data: 4 bytes * dim * n
            dim = self.embedding_dimension or 0
            n = self.total_vectors
            return dim * n * 4

    @property
    def is_trained(self) -> bool:
        with self._lock:
            return self._index.is_trained if self._index else False


# ---------------------------------------------------------------------------
# Module-level registry — one FaissIndex per repository name
# ---------------------------------------------------------------------------

_registry: Dict[str, FaissIndex] = {}
_registry_lock = RLock()


def get_or_create(repository_name: str) -> FaissIndex:
    """Return the FaissIndex for *repository_name*, creating it if needed."""
    with _registry_lock:
        if repository_name not in _registry:
            idx = FaissIndex(repository_name)
            idx.load()  # no-op if files don't exist yet
            _registry[repository_name] = idx
        return _registry[repository_name]


def get(repository_name: str) -> Optional[FaissIndex]:
    """Return an existing FaissIndex, or None if never built/loaded."""
    with _registry_lock:
        return _registry.get(repository_name)


def remove(repository_name: str) -> None:
    """Remove a FaissIndex from the registry (after deletion)."""
    with _registry_lock:
        _registry.pop(repository_name, None)
