"""
Embedding Cache — in-memory LRU cache keyed by SHA-256 content hash.

Design
------
* Key:   SHA-256 hex digest of the chunk's raw source text.
* Value: numpy float32 vector (the computed embedding).

Cache semantics
---------------
* If a chunk's content has not changed since the last generation run,
  its hash is unchanged, so the cached vector is returned immediately
  and we avoid a model forward pass.
* The cache is NOT persisted to disk in Phase 5.  Persistence (e.g. via
  numpy.save / shelve) can be added in a later phase without touching
  the public interface.
* A max_size cap prevents unbounded memory growth.

Thread safety
-------------
A threading.Lock guards all reads and writes so the cache is safe to
use from asyncio.to_thread calls.
"""

from __future__ import annotations

import logging
import threading
from collections import OrderedDict
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

# Default maximum number of cached vectors.
# At 768 float32 values per vector ≈ 3 KB each → 100 000 entries ≈ 300 MB.
_DEFAULT_MAX_SIZE = 50_000


class EmbeddingCache:
    """
    Thread-safe LRU cache mapping content-hash → embedding vector.

    Args:
        max_size: Maximum number of entries to keep.  When the cache
                  exceeds this size the oldest entry is evicted.
    """

    def __init__(self, max_size: int = _DEFAULT_MAX_SIZE) -> None:
        self._max_size = max_size
        self._store: OrderedDict[str, np.ndarray] = OrderedDict()
        self._lock = threading.Lock()
        self._hits = 0
        self._misses = 0

    # ----------------------------------------------------------------
    # Core operations
    # ----------------------------------------------------------------

    def get(self, content_hash: str) -> Optional[np.ndarray]:
        """
        Return the cached vector for *content_hash*, or None on a miss.

        On a hit the entry is moved to the end of the LRU order.
        """
        with self._lock:
            if content_hash in self._store:
                self._store.move_to_end(content_hash)
                self._hits += 1
                return self._store[content_hash]
            self._misses += 1
            return None

    def put(self, content_hash: str, vector: np.ndarray) -> None:
        """
        Store *vector* under *content_hash*.

        If the cache is full, the least-recently-used entry is evicted.
        """
        with self._lock:
            if content_hash in self._store:
                self._store.move_to_end(content_hash)
            self._store[content_hash] = vector
            if len(self._store) > self._max_size:
                evicted_key, _ = self._store.popitem(last=False)
                logger.debug("Cache evicted entry '%s…'", evicted_key[:8])

    def clear(self) -> None:
        """Remove all cached entries and reset statistics."""
        with self._lock:
            self._store.clear()
            self._hits = 0
            self._misses = 0
        logger.info("Embedding cache cleared.")

    # ----------------------------------------------------------------
    # Statistics
    # ----------------------------------------------------------------

    @property
    def size(self) -> int:
        with self._lock:
            return len(self._store)

    @property
    def hits(self) -> int:
        with self._lock:
            return self._hits

    @property
    def misses(self) -> int:
        with self._lock:
            return self._misses

    @property
    def hit_ratio(self) -> float:
        with self._lock:
            total = self._hits + self._misses
            return round(self._hits / total, 4) if total else 0.0


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

#: Global cache instance reused across all generation runs.
embedding_cache = EmbeddingCache()
