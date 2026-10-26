"""
Embedding Service — orchestrates the full embedding pipeline.

Workflow
--------
1. Read the ChunkIndex from Phase 4.
2. For each chunk compute a content-hash (SHA-256 of source text).
3. Cache hit → reuse the stored vector.
4. Cache miss → collect text into a batch and encode with the model.
5. Persist all metadata and vectors in the EmbeddingStore singleton.
6. Return an EmbeddingGenerateResponse for the API layer.

Key design decisions
--------------------
* Batch encoding: texts are grouped into batches of EMBEDDING_BATCH_SIZE
  (default 32) to balance GPU/CPU utilisation and memory usage.
* Regenerate-only mode: the ``changed_only`` flag skips chunks whose
  content-hash is already in the store, enabling cheap incremental updates.
* No vector exposure: raw numpy arrays live only in EmbeddingStore._vectors
  and are never serialised or sent to the client.
* Progress tracking: an EmbeddingProgress dataclass is updated after every
  batch so the /embeddings/progress endpoint always has a fresh snapshot.
"""

from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import numpy as np

from app.models.chunk import Chunk
from app.models.embedding import (
    EmbeddingGenerateResponse,
    EmbeddingListEntry,
    EmbeddingMetadata,
    EmbeddingProgress,
    EmbeddingStatistics,
)
from app.services.chunking.chunk_storage import get_chunk_index
from app.services.embedding.embedding_cache import embedding_cache
from app.services.embedding.embedding_model import EmbeddingModel
from app.services.embedding.embedding_utils import (
    batch,
    content_hash,
    make_embedding_id,
    truncate_text,
)
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-memory embedding store (singleton)
# ---------------------------------------------------------------------------


@dataclass
class EmbeddingStore:
    """
    Holds all embedding metadata and the raw float32 vectors.

    Phase 6 (FAISS) will consume _vectors directly.
    The public API only exposes metadata (EmbeddingMetadata).
    """

    repository_name: str = ""
    _metadata: Dict[str, EmbeddingMetadata] = field(default_factory=dict)
    _vectors: Dict[str, np.ndarray] = field(default_factory=dict)
    generated_at: Optional[datetime] = None

    # Run statistics (preserved across calls for the statistics endpoint)
    total_cache_hits: int = 0
    total_failed: int = 0
    total_new: int = 0
    elapsed_seconds: float = 0.0
    model_name: str = ""
    embedding_dimension: int = 0

    # ----------------------------------------------------------------
    # Storage operations
    # ----------------------------------------------------------------

    def add(
        self,
        metadata: EmbeddingMetadata,
        vector: np.ndarray,
    ) -> None:
        self._metadata[metadata.embedding_id] = metadata
        self._vectors[metadata.embedding_id] = vector

    def get_vector(self, embedding_id: str) -> Optional[np.ndarray]:
        return self._vectors.get(embedding_id)

    def get_metadata(self, embedding_id: str) -> Optional[EmbeddingMetadata]:
        return self._metadata.get(embedding_id)

    def all_metadata(self) -> List[EmbeddingMetadata]:
        return list(self._metadata.values())

    def all_vectors(self) -> Dict[str, np.ndarray]:
        """Return mapping embedding_id → vector for Phase 6 consumption."""
        return dict(self._vectors)

    @property
    def total_embeddings(self) -> int:
        return len(self._metadata)

    @property
    def languages(self) -> List[str]:
        return sorted({m.language for m in self._metadata.values()})

    @property
    def chunk_type_distribution(self) -> Dict[str, int]:
        dist: Dict[str, int] = {}
        for m in self._metadata.values():
            dist[m.chunk_type] = dist.get(m.chunk_type, 0) + 1
        return dist

    @property
    def cache_hit_ratio(self) -> float:
        total = self.total_cache_hits + self.total_new + self.total_failed
        return round(self.total_cache_hits / total, 4) if total else 0.0


# ---------------------------------------------------------------------------
# Singleton + progress tracker
# ---------------------------------------------------------------------------

_store_lock = threading.Lock()
_store: Optional[EmbeddingStore] = None

_progress_lock = threading.Lock()
_progress: Optional[EmbeddingProgress] = None


def get_embedding_store() -> Optional[EmbeddingStore]:
    with _store_lock:
        return _store


def _set_embedding_store(store: EmbeddingStore) -> None:
    global _store
    with _store_lock:
        _store = store


def get_progress() -> Optional[EmbeddingProgress]:
    with _progress_lock:
        return _progress


def _set_progress(p: EmbeddingProgress) -> None:
    global _progress
    with _progress_lock:
        _progress = p


# ---------------------------------------------------------------------------
# Core generation logic
# ---------------------------------------------------------------------------


def _encode_batch(
    model: EmbeddingModel,
    chunks_batch: List[Chunk],
) -> Tuple[List[np.ndarray], int]:
    """
    Encode a batch of chunks.

    Returns (vectors_list, failed_count).
    Each entry in vectors_list corresponds to the chunk at the same index.
    Failed chunks get a zero-vector placeholder so indices stay aligned.
    """
    texts = [truncate_text(c.content) for c in chunks_batch]
    try:
        vectors = model.encode_texts(texts, batch_size=len(texts))
        return list(vectors), 0
    except Exception as exc:
        logger.error("Batch encode failed (%d chunks): %s", len(chunks_batch), exc)
        dim = model.dimension or 768
        return [np.zeros(dim, dtype=np.float32) for _ in chunks_batch], len(chunks_batch)


def generate_embeddings(
    repository_name: str,
    changed_only: bool = False,
) -> EmbeddingGenerateResponse:
    """
    Generate embeddings for all chunks in the active ChunkIndex.

    Args:
        repository_name: Used in store metadata.
        changed_only:    If True, skip chunks whose content-hash is already
                         cached (incremental regeneration).

    Returns:
        EmbeddingGenerateResponse with aggregate statistics.

    Raises:
        RuntimeError: If no ChunkIndex is available.
    """
    chunk_index = get_chunk_index()
    if chunk_index is None:
        logger.info("No chunk index found in memory. Running auto-chunking...")
        from app.services.chunking.chunk_service import generate_chunks
        try:
            generate_chunks(repository_name)
            chunk_index = get_chunk_index()
        except Exception as exc:
            logger.exception("Auto-chunking failed")
            raise RuntimeError(f"Failed to auto-generate chunks during embedding: {exc}") from exc

    if chunk_index is None:
        raise RuntimeError(
            "No chunk index found. Run POST /chunk/generate before generating embeddings."
        )

    chunks = chunk_index.chunks
    total = len(chunks)
    logger.info(
        "Starting embedding generation for '%s' — %d chunks (changed_only=%s)",
        repository_name, total, changed_only,
    )

    model = EmbeddingModel.get()
    store = EmbeddingStore(
        repository_name=repository_name,
        model_name=model.model_name,
        embedding_dimension=model.dimension,
    )

    # Initialise progress
    _set_progress(EmbeddingProgress(
        total_chunks=total,
        processed_chunks=0,
        remaining_chunks=total,
        failed_chunks=0,
        cache_hits=0,
        elapsed_seconds=0.0,
        is_complete=False,
    ))

    t_start = time.perf_counter()
    cache_hits = 0
    failed = 0
    new_count = 0

    # Split all chunks into batches; handle cache hits before encoding
    to_encode_indices: List[int] = []
    to_encode_chunks: List[Chunk] = []
    hashes: List[str] = []

    for i, chunk in enumerate(chunks):
        h = content_hash(chunk.content)
        hashes.append(h)
        cached_vec = embedding_cache.get(h)

        if cached_vec is not None and (not changed_only or True):
            # Cache hit — store immediately
            emb_id = make_embedding_id(chunk.chunk_id, chunk.content)
            meta = EmbeddingMetadata(
                embedding_id=emb_id,
                chunk_id=chunk.chunk_id,
                repository_name=repository_name,
                file_path=chunk.file_path,
                language=chunk.language,
                chunk_type=chunk.chunk_type.value,
                embedding_dimension=model.dimension,
                model_name=model.model_name,
                was_cached=True,
            )
            store.add(meta, cached_vec)
            cache_hits += 1
        else:
            to_encode_indices.append(i)
            to_encode_chunks.append(chunk)

    logger.info(
        "Cache hits: %d / %d — encoding %d chunks",
        cache_hits, total, len(to_encode_chunks),
    )

    # Batch-encode all cache misses
    for batch_chunks in batch(to_encode_chunks, settings.EMBEDDING_BATCH_SIZE):
        vectors, batch_failed = _encode_batch(model, batch_chunks)

        for chunk, vec in zip(batch_chunks, vectors):
            h = content_hash(chunk.content)
            embedding_cache.put(h, vec)

            emb_id = make_embedding_id(chunk.chunk_id, chunk.content)
            meta = EmbeddingMetadata(
                embedding_id=emb_id,
                chunk_id=chunk.chunk_id,
                repository_name=repository_name,
                file_path=chunk.file_path,
                language=chunk.language,
                chunk_type=chunk.chunk_type.value,
                embedding_dimension=model.dimension,
                model_name=model.model_name,
                was_cached=False,
            )
            store.add(meta, vec)

        failed += batch_failed
        new_count += len(batch_chunks) - batch_failed

        # Update progress snapshot
        processed = cache_hits + new_count + failed
        _set_progress(EmbeddingProgress(
            total_chunks=total,
            processed_chunks=processed,
            remaining_chunks=max(0, total - processed),
            failed_chunks=failed,
            cache_hits=cache_hits,
            elapsed_seconds=round(time.perf_counter() - t_start, 2),
            is_complete=False,
        ))

    elapsed = round(time.perf_counter() - t_start, 2)

    # Persist run statistics on the store
    store.total_cache_hits = cache_hits
    store.total_failed = failed
    store.total_new = new_count
    store.elapsed_seconds = elapsed
    store.generated_at = datetime.utcnow()
    _set_embedding_store(store)

    # Final progress
    _set_progress(EmbeddingProgress(
        total_chunks=total,
        processed_chunks=total,
        remaining_chunks=0,
        failed_chunks=failed,
        cache_hits=cache_hits,
        elapsed_seconds=elapsed,
        is_complete=True,
    ))

    logger.info(
        "Embedding generation complete — total=%d new=%d cached=%d failed=%d elapsed=%.2fs",
        store.total_embeddings, new_count, cache_hits, failed, elapsed,
    )

    return EmbeddingGenerateResponse(
        status="success",
        repository_name=repository_name,
        total_embeddings=store.total_embeddings,
        new_embeddings=new_count,
        cache_hits=cache_hits,
        failed_chunks=failed,
        model_name=model.model_name,
        embedding_dimension=model.dimension,
        elapsed_seconds=elapsed,
    )
