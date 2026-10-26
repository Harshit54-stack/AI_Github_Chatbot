"""
Embedding utilities — pure, side-effect-free helpers.

All functions here are easy to unit-test because they have no I/O
or global state.
"""

from __future__ import annotations

import hashlib
from typing import List


def content_hash(text: str) -> str:
    """
    Compute a stable SHA-256 hex digest for *text*.

    Used as the cache key: if a chunk's content has not changed between
    two runs, its hash will be identical and the cached embedding is reused.

    Args:
        text: Raw source content of a chunk.

    Returns:
        64-character lowercase hex string.
    """
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def make_embedding_id(chunk_id: str, content: str) -> str:
    """
    Build a unique embedding ID by hashing both the chunk identity
    and its content.

    Using the content hash means the embedding ID changes whenever
    the source code changes, making stale embeddings easy to detect.

    Returns:
        16-character hex prefix — short enough for display, unique enough
        for practical use.
    """
    raw = f"{chunk_id}::{content_hash(content)}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def batch(items: List, size: int) -> List[List]:
    """
    Split *items* into consecutive sub-lists of at most *size* elements.

    >>> list(batch([1,2,3,4,5], 2))
    [[1, 2], [3, 4], [5]]
    """
    return [items[i : i + size] for i in range(0, len(items), size)]


def truncate_text(text: str, max_chars: int = 8192) -> str:
    """
    Hard-truncate *text* to *max_chars* characters.

    Most transformer models have a token limit (e.g. 512 tokens ≈ ~2 000
    chars). We truncate at the character level before tokenisation so
    oversized chunks do not silently produce truncated embeddings without
    a warning.
    """
    if len(text) <= max_chars:
        return text
    return text[:max_chars]
