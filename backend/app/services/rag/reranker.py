"""
Reranker -- Phase 10: Advanced RAG & Cross-Encoder Reranking.

Re-scores and re-orders candidate code chunks retrieved by Phase 9 Hybrid Retrieval
(BM25 + FAISS) using a lightweight, local cross-encoder model.

Why Reranking?
--------------
* Bi-encoders (FAISS) and Sparse retrievers (BM25) evaluate query and documents
  independently to enable fast index-based search across thousands of chunks.
* A Cross-Encoder performs full cross-attention between the query and each
  candidate document simultaneously, capturing deep semantic nuance and exact
  code token relevance that bi-encoders miss.
* Pipeline position:
    Rewritten Query
          |
    Hybrid Retrieval (BM25 + FAISS -> Fusion)
          |
    Candidates (~10-20 chunks)
          |
    Cross-Encoder Reranker
          |
    Top-K Best Relevant Chunks (e.g. 5)
          |
    Context Manager -> Prompt Builder -> Gemini -> SSE

Score Handling
--------------
* Cross-encoder predicts unconstrained relevance logits (higher = more relevant).
* Candidates are sorted strictly descending by cross-encoder score.
* Scores are normalised to [0.0, 1.0] using min-max scaling so downstream
  consumers (like response_formatter confidence estimation) receive clean,
  calibrated similarity metrics.

Fault Tolerance
---------------
* If the cross-encoder fails to load or predict, the system gracefully falls back
  to the hybrid candidate ranking without breaking the RAG pipeline.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import List, Optional, Tuple

from sentence_transformers import CrossEncoder

from app.config import settings
from app.services.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_cross_encoder_instance: Optional[CrossEncoder] = None


# ---------------------------------------------------------------------------
# CrossEncoder Singleton Accessor
# ---------------------------------------------------------------------------


class RerankerModel:
    """
    Thread-safe lazy-singleton wrapper for the cross-encoder model.
    """

    @classmethod
    def get(cls) -> CrossEncoder:
        global _cross_encoder_instance
        if _cross_encoder_instance is None:
            with _lock:
                if _cross_encoder_instance is None:
                    logger.info(
                        "Loading CrossEncoder model '%s'...",
                        settings.RERANKER_MODEL,
                    )
                    t0 = time.perf_counter()
                    _cross_encoder_instance = CrossEncoder(settings.RERANKER_MODEL)
                    elapsed = time.perf_counter() - t0
                    logger.info(
                        "CrossEncoder model loaded in %.2f s.", elapsed
                    )
        return _cross_encoder_instance


# ---------------------------------------------------------------------------
# Score Normalisation Helper
# ---------------------------------------------------------------------------


def _normalise_scores(scores: List[float]) -> List[float]:
    """
    Min-max normalise a list of raw scores into [0.0, 1.0].
    If all scores are equal, maps each to 1.0.
    """
    if not scores:
        return []
    min_s = min(scores)
    max_s = max(scores)
    if max_s == min_s:
        return [1.0] * len(scores)
    rng = max_s - min_s
    return [(s - min_s) / rng for s in scores]


# ---------------------------------------------------------------------------
# Public Reranker API
# ---------------------------------------------------------------------------


def rerank(
    query: str,
    candidates: List[RetrievedChunk],
    top_k: int | None = None,
) -> List[RetrievedChunk]:
    """
    Rerank a list of candidate RetrievedChunk items using the cross-encoder.

    Args:
        query:       The (rewritten) user query string.
        candidates:  List of RetrievedChunk items from hybrid retrieval.
        top_k:       Final number of top chunks to return. Defaults to
                     settings.RERANKER_TOP_K_DEFAULT.

    Returns:
        List of RetrievedChunk sorted by cross-encoder relevance descending.
        On any error or if reranking is disabled, falls back to the original
        candidate order.
    """
    if top_k is None:
        top_k = settings.RERANKER_TOP_K_DEFAULT

    if not candidates:
        return []

    # If disabled or query is empty, return top-k candidates as-is
    if not settings.RERANKER_ENABLED:
        logger.debug("Reranking disabled via settings. Returning candidates directly.")
        return candidates[:top_k]

    if not query or not query.strip():
        return candidates[:top_k]

    # Deduplicate candidates by chunk_id while preserving incoming rank order
    seen_ids = set()
    unique_candidates: List[RetrievedChunk] = []
    for c in candidates:
        if c.chunk_id not in seen_ids:
            seen_ids.add(c.chunk_id)
            unique_candidates.append(c)

    if len(unique_candidates) <= 1:
        return unique_candidates[:top_k]

    t0 = time.perf_counter()

    try:
        model = RerankerModel.get()

        # Construct (query, text) pairs for the cross-encoder
        # Include symbol name, file path, and preview content to give full context
        pairs: List[Tuple[str, str]] = []
        for c in unique_candidates:
            passage = (
                f"{c.symbol_name} ({c.chunk_type}) in {c.file_path}\n"
                f"{c.content_preview[:1500]}"
            )
            pairs.append((query, passage))

        # Predict relevance logits
        raw_scores = model.predict(pairs)
        raw_scores_list = [float(s) for s in raw_scores]

        # Normalise scores into [0, 1] range
        norm_scores = _normalise_scores(raw_scores_list)

        # Pair candidates with raw and normalised scores
        scored_candidates: List[Tuple[float, float, RetrievedChunk]] = []
        for raw_s, norm_s, chunk in zip(raw_scores_list, norm_scores, unique_candidates):
            scored_candidates.append((raw_s, norm_s, chunk))

        # Sort strictly descending by raw cross-encoder score
        scored_candidates.sort(key=lambda x: x[0], reverse=True)

        # Create updated RetrievedChunk instances with the reranked score
        reranked_chunks: List[RetrievedChunk] = []
        for raw_s, norm_s, c in scored_candidates[:top_k]:
            reranked_chunks.append(
                RetrievedChunk(
                    chunk_id=c.chunk_id,
                    score=round(norm_s, 6),
                    file_path=c.file_path,
                    symbol_name=c.symbol_name,
                    chunk_type=c.chunk_type,
                    language=c.language,
                    start_line=c.start_line,
                    end_line=c.end_line,
                    repository_name=c.repository_name,
                    content_preview=c.content_preview,
                )
            )

        elapsed_ms = (time.perf_counter() - t0) * 1000
        logger.info(
            "Reranked %d candidates -> %d final chunks in %.1f ms | top score=%.4f (repo='%s')",
            len(unique_candidates),
            len(reranked_chunks),
            elapsed_ms,
            reranked_chunks[0].score if reranked_chunks else 0.0,
            candidates[0].repository_name if candidates else "",
        )
        return reranked_chunks

    except Exception as exc:
        logger.warning(
            "Cross-encoder reranking failed (%s: %s). Falling back to hybrid ranking.",
            type(exc).__name__,
            exc,
        )
        return unique_candidates[:top_k]
