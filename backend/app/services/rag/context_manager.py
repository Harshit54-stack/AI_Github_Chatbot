"""
Context Manager — Phase 7 RAG.

Converts a list of RetrievedChunk objects into a single, well-formatted
context string that can be embedded into the Gemini prompt.

Responsibilities
----------------
* Deduplicate chunks by chunk_id (FAISS can return duplicates after rebuild).
* Preserve descending score order (most relevant first).
* Enforce the RAG_MAX_CONTEXT_CHARS budget so we never exceed Gemini's
  context window — chunks are dropped from the tail until it fits.
* Format each chunk with repo / file / lines / language metadata so the
  model can cite exact locations without hallucinating.
"""

from __future__ import annotations

import logging

from app.config import settings
from app.services.rag.retriever import RetrievedChunk

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

_CHUNK_TEMPLATE = """\
--- Source {index} ---
Repository : {repository_name}
File       : {file_path}
Symbol     : {symbol_name} ({chunk_type})
Language   : {language}
Lines      : {start_line}–{end_line}
Score      : {score:.3f}

{content}
"""


def _format_chunk(chunk: RetrievedChunk, index: int) -> str:
    content = chunk.content_preview.strip() if chunk.content_preview else "(no preview)"
    return _CHUNK_TEMPLATE.format(
        index=index,
        repository_name=chunk.repository_name,
        file_path=chunk.file_path,
        symbol_name=chunk.symbol_name or "(module)",
        chunk_type=chunk.chunk_type,
        language=chunk.language,
        start_line=chunk.start_line,
        end_line=chunk.end_line,
        score=chunk.score,
        content=content,
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def build_context(
    chunks: list[RetrievedChunk],
    max_chars: int | None = None,
) -> tuple[str, list[RetrievedChunk]]:
    """
    Build a context block from retrieved chunks.

    Args:
        chunks:    List of RetrievedChunk, sorted by descending score.
        max_chars: Character budget (defaults to settings.RAG_MAX_CONTEXT_CHARS).

    Returns:
        (context_string, included_chunks)
        context_string  — formatted text to inject into the prompt.
        included_chunks — subset of chunks that fit within the budget.
    """
    if max_chars is None:
        max_chars = settings.RAG_MAX_CONTEXT_CHARS

    # Deduplicate while preserving order
    seen: set[str] = set()
    unique: list[RetrievedChunk] = []
    for chunk in chunks:
        if chunk.chunk_id not in seen:
            seen.add(chunk.chunk_id)
            unique.append(chunk)

    # Trim to budget
    blocks: list[str] = []
    included: list[RetrievedChunk] = []
    total_chars = 0

    for i, chunk in enumerate(unique, start=1):
        block = _format_chunk(chunk, i)
        if total_chars + len(block) > max_chars and blocks:
            logger.debug(
                "Context budget reached at chunk %d/%d — dropping remaining.",
                i - 1,
                len(unique),
            )
            break
        blocks.append(block)
        included.append(chunk)
        total_chars += len(block)

    context = "\n".join(blocks)
    logger.debug(
        "Context built: %d/%d chunks, %d chars.",
        len(included),
        len(unique),
        total_chars,
    )
    return context, included
