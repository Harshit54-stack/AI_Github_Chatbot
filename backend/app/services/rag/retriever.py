"""
Retriever — Phase 7 RAG.

Encodes a natural-language query using the Phase-5 EmbeddingModel singleton,
then searches the Phase-6 FAISS index for the top-K most similar chunks.

Design decisions
----------------
* Reuses EmbeddingModel.get() — same model weights as embedding generation,
  guaranteeing vector-space consistency.
* Loads the FaissIndex from disk if it is not already in the registry
  (using get_or_create so a server restart doesn't break chat).
* Returns a plain list of RetrievedChunk dataclasses; no FAISS internals leak.
* Thread-safe: FAISS search is already guarded by an RLock inside FaissIndex.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass

from app.config import settings
from app.models.vector_result import SearchRequest
from app.services.embedding.embedding_model import EmbeddingModel
from app.services.vector_store.index_manager import get_or_create

logger = logging.getLogger(__name__)


@dataclass
class RetrievedChunk:
    """One FAISS hit enriched with its metadata."""

    chunk_id: str
    score: float           # cosine similarity 0–1
    file_path: str
    symbol_name: str
    chunk_type: str
    language: str
    start_line: int
    end_line: int
    repository_name: str
    content_preview: str   # first ~300 chars of source code


def retrieve(
    query: str,
    repository_name: str,
    top_k: int | None = None,
) -> list[RetrievedChunk]:
    """
    Encode *query* and return the top-K nearest chunks from the FAISS index.

    Args:
        query:           Natural-language question.
        repository_name: Must match the name used when building the FAISS index.
        top_k:           Number of results (defaults to settings.RAG_TOP_K).

    Returns:
        List of RetrievedChunk sorted by descending score.

    Raises:
        RuntimeError: If the FAISS index is not built or has no vectors.
    """
    if top_k is None:
        top_k = settings.RAG_TOP_K

    t0 = time.perf_counter()

    # --- Load / fetch the FAISS index -----------------------------------
    faiss_index = get_or_create(repository_name)
    if not faiss_index.is_ready:
        logger.info("FAISS index not ready for '%s'. Running auto-build...", repository_name)
        from app.services.vector_store.faiss_service import build_index
        try:
            build_index(repository_name)
            faiss_index = get_or_create(repository_name)
        except Exception as exc:
            logger.exception("Auto-building FAISS index failed")
            raise RuntimeError(f"Failed to auto-build FAISS index for '{repository_name}': {exc}") from exc

    if not faiss_index.is_ready:
        raise RuntimeError(
            f"No FAISS index found for '{repository_name}'. "
            "Run POST /vector/build first."
        )

    # --- Encode query ---------------------------------------------------
    model = EmbeddingModel.get()
    query_vec = model.encode_texts([query], batch_size=1)[0]

    # --- Search ---------------------------------------------------------
    hits = faiss_index.search(query_vec, top_k=top_k)

    chunks: list[RetrievedChunk] = []
    for faiss_id, score in hits:
        if score < settings.RAG_MIN_SCORE:
            continue
        entry = faiss_index.get_metadata(faiss_id)
        if entry is None:
            continue
        chunks.append(
            RetrievedChunk(
                chunk_id=entry.chunk_id,
                score=round(float(score), 6),
                file_path=entry.file_path,
                symbol_name=entry.symbol_name,
                chunk_type=entry.chunk_type,
                language=entry.language,
                start_line=entry.start_line,
                end_line=entry.end_line,
                repository_name=entry.repository_name,
                content_preview=entry.content_preview or "",
            )
        )

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "Retrieval '%s' → %d chunks in %.1f ms (repo='%s', top_k=%d).",
        query[:60],
        len(chunks),
        elapsed_ms,
        repository_name,
        top_k,
    )
    return chunks
