"""
Hybrid Retriever -- Phase 9: BM25 + FAISS Hybrid Search.

Combines BM25 keyword retrieval with FAISS semantic retrieval to produce
a richer, more robust set of retrieved chunks.

Why Hybrid?
-----------
* BM25 excels at exact keyword / identifier matching:
    "Where is generate_embedding implemented?"
    "Find the QueryRewriter class."
* FAISS excels at semantic / conceptual queries:
    "How does the project convert source code into vectors?"
    "How does the system remember previous conversation context?"
* Together they cover both query types. A chunk that scores well in
  BOTH systems is very likely relevant.

Score Normalisation
-------------------
BM25 and FAISS return scores on incompatible scales:
* FAISS: cosine similarity in [0, 1] (after L2-normalisation)
* BM25:  TF-IDF variant, unbounded, typically in [0, 20]

Strategy: min-max normalise each ranked list independently to [0, 1],
then compute a weighted combination:
    final_score = alpha * faiss_norm + (1 - alpha) * bm25_norm

This is simple, fast, and interpretable.

Deduplication
-------------
The same chunk may appear in both result sets. When that happens:
* The normalised scores from both systems are combined additively.
* The chunk is ranked by its combined score.
* It appears only once in the final list.

Failure Isolation
-----------------
* BM25 failure  -> fall back to FAISS-only results (logged as WARNING).
* FAISS failure -> fall back to BM25-only results (logged as WARNING).
* Both fail     -> return empty list (logged as ERROR).
"""

from __future__ import annotations

import logging
import time
from typing import Dict, List, Tuple

from app.config import settings
from app.services.rag.bm25_retriever import bm25_search
from app.services.rag.retriever import RetrievedChunk, retrieve

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Score normalisation helpers
# ---------------------------------------------------------------------------


def _normalise(scores: List[float]) -> List[float]:
    """
    Min-max normalise a list of scores to [0, 1].

    If all scores are equal (including the case of a single score),
    all are mapped to 1.0 so they receive full weight.

    Args:
        scores: Raw score values.

    Returns:
        Normalised float list in [0, 1].
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
# Fusion logic
# ---------------------------------------------------------------------------


def _fuse(
    faiss_chunks: List[RetrievedChunk],
    bm25_chunks: List[RetrievedChunk],
    semantic_weight: float,
) -> List[RetrievedChunk]:
    """
    Merge and re-rank FAISS and BM25 results.

    Algorithm
    ---------
    1. Normalise FAISS scores to [0, 1].
    2. Normalise BM25 scores to [0, 1].
    3. Build a dict keyed by chunk_id; each entry accumulates
       normalised_faiss_score and normalised_bm25_score.
    4. Final score = alpha * faiss_norm + (1 - alpha) * bm25_norm.
    5. Sort by final score descending.
    6. Return RetrievedChunk list with final scores attached.

    Args:
        faiss_chunks:    Results from FAISS retriever (any length).
        bm25_chunks:     Results from BM25 retriever (any length).
        semantic_weight: Weight alpha for FAISS scores (keyword gets 1-alpha).

    Returns:
        Merged, de-duplicated, re-ranked list of RetrievedChunk.
    """
    keyword_weight = 1.0 - semantic_weight

    # Normalise each list separately
    faiss_raw = [c.score for c in faiss_chunks]
    bm25_raw  = [c.score for c in bm25_chunks]

    faiss_norm = _normalise(faiss_raw)
    bm25_norm  = _normalise(bm25_raw)

    # Accumulate into a dict: chunk_id -> (chunk, faiss_norm_score, bm25_norm_score)
    # Using a Tuple[RetrievedChunk, float, float] to avoid mutable dict updates
    scores: Dict[str, Tuple[RetrievedChunk, float, float]] = {}

    for chunk, ns in zip(faiss_chunks, faiss_norm):
        scores[chunk.chunk_id] = (chunk, ns, 0.0)

    for chunk, ns in zip(bm25_chunks, bm25_norm):
        if chunk.chunk_id in scores:
            prev_chunk, prev_faiss, _ = scores[chunk.chunk_id]
            scores[chunk.chunk_id] = (prev_chunk, prev_faiss, ns)
        else:
            scores[chunk.chunk_id] = (chunk, 0.0, ns)

    # Compute final scores and produce sorted output
    result: List[RetrievedChunk] = []
    for chunk_id, (chunk, faiss_s, bm25_s) in scores.items():
        final = semantic_weight * faiss_s + keyword_weight * bm25_s
        result.append(RetrievedChunk(
            chunk_id=chunk.chunk_id,
            score=round(final, 6),
            file_path=chunk.file_path,
            symbol_name=chunk.symbol_name,
            chunk_type=chunk.chunk_type,
            language=chunk.language,
            start_line=chunk.start_line,
            end_line=chunk.end_line,
            repository_name=chunk.repository_name,
            content_preview=chunk.content_preview,
        ))

    result.sort(key=lambda c: c.score, reverse=True)
    return result


# ---------------------------------------------------------------------------
# Public hybrid retrieval function
# ---------------------------------------------------------------------------


def hybrid_retrieve(
    query: str,
    repository_name: str,
    top_k: int | None = None,
) -> List[RetrievedChunk]:
    """
    Perform hybrid BM25 + FAISS retrieval for *query*.

    This function is designed as a drop-in replacement for
    ``retriever.retrieve()``. It accepts the same arguments and returns
    the same type (List[RetrievedChunk]), so the rest of the RAG
    pipeline (context_manager, prompt_builder, etc.) is unchanged.

    Retrieval candidates
    --------------------
    * FAISS fetches settings.FAISS_TOP_K candidates.
    * BM25  fetches settings.BM25_TOP_K candidates.
    * After fusion, the top settings.HYBRID_FINAL_TOP_K results are kept.
      (If top_k is supplied by the caller it overrides HYBRID_FINAL_TOP_K.)

    Failure handling
    ----------------
    * FAISS fails  -> BM25-only results, logged as WARNING.
    * BM25 fails   -> FAISS-only results, logged as WARNING.
    * Both fail    -> empty list, logged as ERROR.

    Args:
        query:           The (possibly rewritten) user query.
        repository_name: Repository identifier.
        top_k:           Final number of results to return.

    Returns:
        Merged, de-duplicated, re-ranked list of RetrievedChunk.
    """
    if top_k is None:
        top_k = settings.HYBRID_FINAL_TOP_K

    t0 = time.perf_counter()

    # ---- FAISS retrieval -----------------------------------------------
    faiss_chunks: List[RetrievedChunk] = []
    faiss_ok = True
    try:
        faiss_chunks = retrieve(
            query=query,
            repository_name=repository_name,
            top_k=settings.FAISS_CANDIDATE_TOP_K,
        )
    except Exception as exc:
        faiss_ok = False
        logger.warning(
            "FAISS retrieval failed for '%s': %s: %s",
            repository_name, type(exc).__name__, exc,
        )

    # ---- BM25 retrieval ------------------------------------------------
    bm25_chunks: List[RetrievedChunk] = []
    bm25_ok = True
    try:
        bm25_chunks = bm25_search(
            query=query,
            repository_name=repository_name,
            top_k=settings.BM25_TOP_K,
        )
    except Exception as exc:
        bm25_ok = False
        logger.warning(
            "BM25 retrieval failed for '%s': %s: %s",
            repository_name, type(exc).__name__, exc,
        )

    elapsed_retrieval_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "Hybrid retrieval candidates | faiss=%d bm25=%d | %.1f ms | repo='%s'",
        len(faiss_chunks), len(bm25_chunks), elapsed_retrieval_ms, repository_name,
    )

    # ---- Failure handling ----------------------------------------------
    if not faiss_ok and not bm25_ok:
        logger.error(
            "Both FAISS and BM25 retrieval failed for '%s'. Returning empty.",
            repository_name,
        )
        return []

    if not faiss_ok:
        logger.warning("Using BM25-only results for '%s'.", repository_name)
        return bm25_chunks[:top_k]

    if not bm25_ok:
        logger.warning("Using FAISS-only results for '%s'.", repository_name)
        return faiss_chunks[:top_k]

    # ---- Fusion --------------------------------------------------------
    merged = _fuse(
        faiss_chunks=faiss_chunks,
        bm25_chunks=bm25_chunks,
        semantic_weight=settings.HYBRID_SEMANTIC_WEIGHT,
    )

    final = merged[:top_k]

    elapsed_total_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "Hybrid retrieval complete | merged=%d final=%d | %.1f ms | repo='%s' | "
        "alpha=%.2f (faiss) / %.2f (bm25)",
        len(merged),
        len(final),
        elapsed_total_ms,
        repository_name,
        settings.HYBRID_SEMANTIC_WEIGHT,
        1.0 - settings.HYBRID_SEMANTIC_WEIGHT,
    )
    return final
