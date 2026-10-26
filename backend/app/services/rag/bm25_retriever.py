"""
BM25 Retriever -- Phase 9: Hybrid Search Enhancement.

Provides keyword-based BM25 retrieval over the same semantic chunks
that are used by the FAISS vector index (Phase 6).

Design goals
------------
* Reuse -- operates over the existing MetadataStore in the FaissIndex.
  No separate chunking pipeline is created. Phase 4 chunks are the
  single source of truth for both FAISS and BM25.
* Fail-safe -- any failure in BM25 (build or search) is caught and
  logged. The calling hybrid retriever falls back to FAISS-only results.
* Code-aware tokenisation -- splits on snake_case, camelCase, dots,
  and underscores so identifiers like `generate_embedding` or
  `FAISSRetriever` are tokenised into useful sub-tokens.
* Persistence -- BM25 indexes are held in memory (BM25 indexes are
  cheap to rebuild, ~milliseconds; no disk serialisation needed).
* Thread safety -- a threading.Lock guards the in-memory index registry.

Relationship to FAISS
---------------------
                 MetadataStore (FaissIndex)
                        |
             content_preview field
                   /         \\
           BM25 index       FAISS index
         (keyword)          (semantic)
              |                  |
          BM25 Search       FAISS Search
               \\                /
            HybridRetriever.search()
"""

from __future__ import annotations

import logging
import re
import threading
import time
from dataclasses import dataclass
from typing import Dict, List, Optional

from rank_bm25 import BM25Okapi

from app.config import settings
from app.services.rag.retriever import RetrievedChunk
from app.services.vector_store.index_manager import get_or_create
from app.services.vector_store.metadata_store import MetadataEntry

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Code-aware tokeniser
# ---------------------------------------------------------------------------


_SPLIT_RE = re.compile(
    r"""
    # Split on any of:
    [_\.\-\/\\,;\s]+        # underscores, dots, path separators, whitespace
    | (?<=[a-z])(?=[A-Z])   # camelCase boundary: lower->upper
    | (?<=[A-Z])(?=[A-Z][a-z])  # run of caps then lower: 'HTTPSConn' -> 'HTTPS', 'Conn'
    """,
    re.VERBOSE,
)

# Tokens shorter than this are dropped (removes single-letter noise)
_MIN_TOKEN_LEN = 2

# Common programming stop-words that carry almost no retrieval signal
_STOP_WORDS: frozenset[str] = frozenset(
    {
        "the", "a", "an", "is", "it", "to", "of", "in", "and", "or",
        "for", "on", "with", "as", "by", "be", "this", "that", "at",
        "from", "not", "are", "was", "were", "has", "have", "had",
        "def", "class", "return", "import", "if", "else", "elif",
        "while", "for", "try", "except", "pass", "none", "true", "false",
        "self", "cls", "super", "init", "str", "int", "bool", "list",
        "dict", "set", "tuple", "type", "any", "none",
    }
)


def tokenize(text: str) -> List[str]:
    """
    Tokenise source code or natural-language text for BM25 indexing.

    Handles:
    * snake_case identifiers   -- generate_embedding -> [generate, embedding]
    * camelCase identifiers    -- generateEmbedding  -> [generate, Embedding]
    * PascalCase identifiers   -- FAISSRetriever     -> [FAISS, Retriever]
    * File/path separators     -- vector_store.py    -> [vector, store, py]
    * Normal English words     -- kept as-is
    * Numbers                  -- kept as tokens

    Returns a list of lower-cased tokens, filtered by length and stop-words.
    """
    if not text:
        return []

    # Split on boundaries defined by the regex
    raw_tokens = _SPLIT_RE.split(text)

    tokens: List[str] = []
    for tok in raw_tokens:
        tok = tok.strip().lower()
        if len(tok) < _MIN_TOKEN_LEN:
            continue
        if tok in _STOP_WORDS:
            continue
        tokens.append(tok)

    return tokens


# ---------------------------------------------------------------------------
# In-memory BM25 index for one repository
# ---------------------------------------------------------------------------


@dataclass
class _BM25Entry:
    """Associates a BM25 document position with its metadata."""
    position: int          # index in the BM25 corpus list
    chunk_id: str
    file_path: str
    symbol_name: str
    chunk_type: str
    language: str
    start_line: int
    end_line: int
    repository_name: str
    content_preview: str


class BM25Index:
    """
    BM25 index for a single repository.

    Builds from the MetadataEntry list in the matching FaissIndex,
    reusing the content_preview field as the document text.

    Thread-safe: a reentrant lock guards all reads and writes.
    """

    def __init__(self, repository_name: str) -> None:
        self.repository_name = repository_name
        self._lock = threading.RLock()
        self._bm25: Optional[BM25Okapi] = None
        self._entries: List[_BM25Entry] = []
        self.total_documents: int = 0

    # ----------------------------------------------------------------
    # Building
    # ----------------------------------------------------------------

    def build(self, entries: List[MetadataEntry]) -> None:
        """
        Build the BM25 index from a list of MetadataEntry objects.

        Each entry's content_preview becomes one BM25 document.
        The symbol_name and file_path are prepended to the text so
        that identifier searches benefit from the keyword boost.

        Args:
            entries: MetadataEntry list from the FaissIndex.
        """
        if not entries:
            logger.warning(
                "BM25Index.build called with empty entries for '%s'. "
                "No index created.",
                self.repository_name,
            )
            return

        bm25_entries: List[_BM25Entry] = []
        corpus: List[List[str]] = []

        for i, entry in enumerate(entries):
            # Combine symbol_name + file_path + content_preview for richer search
            doc_text = " ".join([
                entry.symbol_name or "",
                entry.file_path or "",
                entry.content_preview or "",
            ])
            tokens = tokenize(doc_text)
            if not tokens:
                tokens = ["__empty__"]

            corpus.append(tokens)
            bm25_entries.append(_BM25Entry(
                position=i,
                chunk_id=entry.chunk_id,
                file_path=entry.file_path,
                symbol_name=entry.symbol_name,
                chunk_type=entry.chunk_type,
                language=entry.language,
                start_line=entry.start_line,
                end_line=entry.end_line,
                repository_name=entry.repository_name,
                content_preview=entry.content_preview or "",
            ))

        with self._lock:
            self._bm25 = BM25Okapi(corpus)
            self._entries = bm25_entries
            self.total_documents = len(bm25_entries)

        logger.info(
            "BM25Index built for '%s' — %d documents.",
            self.repository_name,
            self.total_documents,
        )

    @property
    def is_ready(self) -> bool:
        with self._lock:
            return self._bm25 is not None and self.total_documents > 0

    # ----------------------------------------------------------------
    # Searching
    # ----------------------------------------------------------------

    def search(self, query: str, top_k: int) -> List[RetrievedChunk]:
        """
        Search the BM25 index and return top-K results as RetrievedChunk.

        The BM25 score is stored in the ``score`` field.
        Note: BM25 scores are NOT normalised here; normalisation is the
        responsibility of HybridRetriever.

        Args:
            query:  The (rewritten) user query string.
            top_k:  Number of results to return.

        Returns:
            List of RetrievedChunk sorted by BM25 score descending.
            Returns an empty list on failure or if no results.
        """
        if not self.is_ready:
            logger.warning("BM25Index not ready for '%s'.", self.repository_name)
            return []

        if not query or not query.strip():
            return []

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        with self._lock:
            # get_scores returns a float64 ndarray, one score per document
            raw_scores = self._bm25.get_scores(query_tokens)
            entries = self._entries[:]

        # Pair up scores with entries and sort descending
        scored = sorted(
            zip(raw_scores, entries),
            key=lambda x: x[0],
            reverse=True,
        )[:top_k]

        chunks: List[RetrievedChunk] = []
        for score, entry in scored:
            if float(score) <= 0.0:
                # BM25 returns 0 for non-matching documents; skip them
                continue
            chunks.append(RetrievedChunk(
                chunk_id=entry.chunk_id,
                score=round(float(score), 6),
                file_path=entry.file_path,
                symbol_name=entry.symbol_name,
                chunk_type=entry.chunk_type,
                language=entry.language,
                start_line=entry.start_line,
                end_line=entry.end_line,
                repository_name=entry.repository_name,
                content_preview=entry.content_preview,
            ))

        logger.info(
            "BM25 search '%s' -> %d results (repo='%s', top_k=%d).",
            query[:60],
            len(chunks),
            self.repository_name,
            top_k,
        )
        return chunks


# ---------------------------------------------------------------------------
# Module-level registry — one BM25Index per repository name
# ---------------------------------------------------------------------------

_registry: Dict[str, BM25Index] = {}
_registry_lock = threading.RLock()


def _get_or_create_bm25_index(repository_name: str) -> BM25Index:
    """Return the BM25Index for *repository_name*, creating it if needed."""
    with _registry_lock:
        if repository_name not in _registry:
            _registry[repository_name] = BM25Index(repository_name)
        return _registry[repository_name]


def build_bm25_index(repository_name: str) -> BM25Index:
    """
    Build (or rebuild) the BM25 index for *repository_name*.

    Reads chunk metadata from the matching FaissIndex so the same set
    of documents is indexed by both retrieval systems.

    This function is called automatically by HybridRetriever when the
    index is not yet ready.

    Args:
        repository_name: Must match the FAISS index name.

    Returns:
        The populated BM25Index instance.

    Raises:
        RuntimeError: If the FAISS metadata store has no entries.
    """
    t0 = time.perf_counter()
    faiss_index = get_or_create(repository_name)
    entries = faiss_index._meta.all()   # MetadataEntry list from FaissIndex

    if not entries:
        raise RuntimeError(
            f"No metadata entries found for repository '{repository_name}'. "
            "Run POST /vector/build first to build the FAISS index."
        )

    bm25_idx = _get_or_create_bm25_index(repository_name)
    bm25_idx.build(entries)

    elapsed_ms = round((time.perf_counter() - t0) * 1000, 1)
    logger.info(
        "BM25 index build complete for '%s' — %d docs in %.1f ms.",
        repository_name,
        bm25_idx.total_documents,
        elapsed_ms,
    )
    return bm25_idx


def get_bm25_index(repository_name: str) -> Optional[BM25Index]:
    """Return an existing BM25Index, or None if not yet built."""
    with _registry_lock:
        return _registry.get(repository_name)


def clear_bm25_index(repository_name: str) -> None:
    """Remove the BM25Index from the registry (e.g. after index rebuild)."""
    with _registry_lock:
        _registry.pop(repository_name, None)


# ---------------------------------------------------------------------------
# High-level search function (mirrors retriever.retrieve() signature)
# ---------------------------------------------------------------------------


def bm25_search(
    query: str,
    repository_name: str,
    top_k: int | None = None,
) -> List[RetrievedChunk]:
    """
    Perform BM25 keyword search for *query* in *repository_name*.

    Lazily builds the BM25 index on the first call if it is not ready.
    Falls back gracefully to an empty list on any failure.

    Args:
        query:           Natural-language or code-identifier query.
        repository_name: Must match the FAISS index name.
        top_k:           Number of results (defaults to settings.BM25_TOP_K).

    Returns:
        List of RetrievedChunk sorted by BM25 score descending.
        BM25 scores are raw (not normalised). Normalisation happens in
        HybridRetriever.
    """
    if top_k is None:
        top_k = settings.BM25_TOP_K

    try:
        bm25_idx = _get_or_create_bm25_index(repository_name)
        if not bm25_idx.is_ready:
            logger.info(
                "BM25 index not ready for '%s'. Auto-building...", repository_name
            )
            bm25_idx = build_bm25_index(repository_name)
        return bm25_idx.search(query, top_k=top_k)
    except Exception as exc:
        logger.warning(
            "BM25 search failed for repo '%s': %s: %s — returning empty results.",
            repository_name,
            type(exc).__name__,
            exc,
        )
        return []
