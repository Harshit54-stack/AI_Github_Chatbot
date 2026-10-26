"""
FAISS Service — builds and rebuilds FAISS indexes from the EmbeddingStore.

Responsibilities
----------------
* Pull vectors + metadata from the in-memory EmbeddingStore (Phase 5).
* Align them into parallel arrays (same ordering).
* Delegate index construction to IndexManager.FaissIndex.build().
* Persist the index to disk after building.
* Return a BuildResponse for the API layer.

This module is intentionally free of HTTP logic so it can be called
from both FastAPI endpoints and CLI scripts.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime
from typing import Optional

import numpy as np

from app.models.vector_result import BuildResponse
from app.services.embedding.embedding_service import get_embedding_store
from app.services.vector_store.index_manager import FaissIndex, get_or_create
from app.services.vector_store.metadata_store import MetadataEntry
from app.config import settings

logger = logging.getLogger(__name__)


def build_index(repository_name: str) -> BuildResponse:
    """
    Build (or rebuild) the FAISS index for *repository_name*.

    Reads vectors from the in-memory EmbeddingStore that was populated
    during Phase 5 embedding generation.

    Args:
        repository_name: Must match the name used in Phase 5.

    Returns:
        BuildResponse with aggregate statistics.

    Raises:
        RuntimeError: If no EmbeddingStore is available.
    """
    store = get_embedding_store()
    if store is None or store.total_embeddings == 0:
        logger.info("No embeddings found in memory. Running auto-embeddings generation...")
        from app.services.embedding.embedding_service import generate_embeddings
        try:
            generate_embeddings(repository_name)
            store = get_embedding_store()
        except Exception as exc:
            logger.exception("Auto-embedding generation failed")
            raise RuntimeError(f"Failed to auto-generate embeddings during index build: {exc}") from exc

    if store is None or store.total_embeddings == 0:
        raise RuntimeError(
            "No embeddings found. Run POST /embeddings/generate before building the vector index."
        )

    # Collect chunk data from the Phase 4 ChunkIndex so we have content previews
    from app.services.chunking.chunk_storage import get_chunk_index
    chunk_index = get_chunk_index()
    chunk_map = {c.chunk_id: c for c in (chunk_index.chunks if chunk_index else [])}

    t_start = time.perf_counter()

    # Build parallel arrays: one row per embedding
    all_metadata = store.all_metadata()
    vectors_list = []
    entries: list[MetadataEntry] = []

    for i, meta in enumerate(all_metadata):
        vec = store.get_vector(meta.embedding_id)
        if vec is None:
            logger.warning("Vector missing for embedding_id '%s', skipping.", meta.embedding_id)
            continue

        vectors_list.append(vec)

        chunk = chunk_map.get(meta.chunk_id)
        preview = (chunk.content[:300] if chunk else "")

        entries.append(MetadataEntry(
            faiss_id=len(entries),   # sequential 0-based FAISS id
            chunk_id=meta.chunk_id,
            repository_name=meta.repository_name,
            file_path=meta.file_path,
            symbol_name=(chunk.symbol_name if chunk else meta.chunk_id),
            chunk_type=meta.chunk_type,
            language=meta.language,
            start_line=(chunk.start_line if chunk else 0),
            end_line=(chunk.end_line if chunk else 0),
            content_preview=preview,
        ))

    if not vectors_list:
        raise RuntimeError("No usable vectors found in the EmbeddingStore.")

    vectors = np.stack(vectors_list, axis=0).astype(np.float32)

    faiss_index: FaissIndex = get_or_create(repository_name)
    faiss_index.build(vectors, entries)
    faiss_index.save()

    elapsed = round(time.perf_counter() - t_start, 2)
    logger.info(
        "FAISS index built for '%s' — %d vectors, dim=%d, %.2fs.",
        repository_name, len(vectors), vectors.shape[1], elapsed,
    )

    return BuildResponse(
        status="success",
        repository_name=repository_name,
        total_vectors=faiss_index.total_vectors,
        embedding_dimension=faiss_index.embedding_dimension,
        index_type=FaissIndex.INDEX_TYPE,
        elapsed_seconds=elapsed,
    )
