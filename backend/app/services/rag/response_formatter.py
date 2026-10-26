"""
Response Formatter — Phase 7 RAG.

Converts raw Gemini text output + retrieved chunk metadata into the
structured RAGResponse Pydantic model returned to the frontend.

Responsibilities
----------------
* Build SourceReference objects from the chunks that were actually included
  in the context (not all retrieved chunks — only the ones sent to Gemini).
* Compute a confidence score as the mean of the top-3 chunk similarity scores.
* Ensure the answer text is clean (strip leading/trailing whitespace).
* Never expose internal prompt text or raw vectors.
"""

from __future__ import annotations

import logging

from app.models.rag_models import RAGResponse, SourceReference
from app.services.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)


def _compute_confidence(chunks: list[RetrievedChunk]) -> float:
    """Mean cosine similarity of the top-3 included chunks (0.0–1.0)."""
    if not chunks:
        return 0.0
    top = sorted(chunks, key=lambda c: c.score, reverse=True)[:3]
    return round(sum(c.score for c in top) / len(top), 4)


def format_response(
    gemini_text: str,
    included_chunks: list[RetrievedChunk],
    session_id: str,
    elapsed_ms: float,
) -> RAGResponse:
    """
    Assemble a RAGResponse from raw Gemini output and chunk metadata.

    Args:
        gemini_text:     Raw answer string from Gemini.
        included_chunks: Chunks that were included in the prompt context.
        session_id:      Active conversation session identifier.
        elapsed_ms:      Total pipeline time in milliseconds.

    Returns:
        RAGResponse ready to be serialised and sent to the client.
    """
    sources: list[SourceReference] = []
    seen_ids: set[str] = set()

    for chunk in included_chunks:
        if chunk.chunk_id in seen_ids:
            continue
        seen_ids.add(chunk.chunk_id)
        sources.append(
            SourceReference(
                file=chunk.file_path,
                symbol_name=chunk.symbol_name,
                chunk_type=chunk.chunk_type,
                language=chunk.language,
                start_line=chunk.start_line,
                end_line=chunk.end_line,
                score=chunk.score,
            )
        )

    confidence = _compute_confidence(included_chunks)

    response = RAGResponse(
        answer=gemini_text.strip(),
        sources=sources,
        retrieved_chunks=len(included_chunks),
        confidence=confidence,
        session_id=session_id,
        elapsed_ms=round(elapsed_ms, 2),
    )

    logger.info(
        "RAG response formatted — %d sources, confidence=%.3f, %.1f ms.",
        len(sources),
        confidence,
        elapsed_ms,
    )
    return response
