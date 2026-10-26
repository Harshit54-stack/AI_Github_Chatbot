"""
Search Service — converts a query string into a vector and executes
similarity search against the FAISS index.

Design
------
* Reuses the EmbeddingModel singleton from Phase 5 so the same model
  encodes both chunks and queries — guaranteeing vector space consistency.
* Returns SearchResultItem list (never raw vectors).
* Timing is measured for the API response.
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional

from app.models.vector_result import SearchRequest, SearchResponse, SearchResultItem
from app.services.embedding.embedding_model import EmbeddingModel
from app.services.vector_store.index_manager import get as get_index
from app.services.vector_store.metadata_store import MetadataEntry

logger = logging.getLogger(__name__)


def search(
    repository_name: str,
    request: SearchRequest,
) -> SearchResponse:
    """
    Perform semantic similarity search against the FAISS index.

    Workflow
    --------
    1. Encode the query text with the SentenceTransformer model.
    2. Call FaissIndex.search() to get (faiss_id, score) pairs.
    3. Map faiss_ids → MetadataEntry via the MetadataStore.
    4. Build and return SearchResponse.

    Args:
        repository_name: Name of the repository whose index to search.
        request:         SearchRequest (query string + top_k).

    Returns:
        SearchResponse with ranked result list.

    Raises:
        RuntimeError: If the index has not been built.
    """
    t_start = time.perf_counter()

    faiss_index = get_index(repository_name)
    if faiss_index is None or not faiss_index.is_ready:
        raise RuntimeError(
            f"No FAISS index found for repository '{repository_name}'. "
            "Run POST /vector/build first."
        )

    # Encode the query using the same model as Phase 5
    model = EmbeddingModel.get()
    query_vec = model.encode_texts([request.query], batch_size=1)[0]

    # Similarity search
    hits = faiss_index.search(query_vec, top_k=request.top_k)

    results: List[SearchResultItem] = []
    for faiss_id, score in hits:
        entry: Optional[MetadataEntry] = faiss_index.get_metadata(faiss_id)
        if entry is None:
            continue
        results.append(SearchResultItem(
            chunk_id=entry.chunk_id,
            score=round(score, 6),
            file_path=entry.file_path,
            symbol_name=entry.symbol_name,
            chunk_type=entry.chunk_type,
            language=entry.language,
            start_line=entry.start_line,
            end_line=entry.end_line,
            repository_name=entry.repository_name,
            content_preview=entry.content_preview or None,
        ))

    elapsed_ms = round((time.perf_counter() - t_start) * 1000, 2)
    logger.info(
        "Search '%s' → %d results in %.1f ms (repo='%s').",
        request.query[:60], len(results), elapsed_ms, repository_name,
    )

    return SearchResponse(
        query=request.query,
        top_k=request.top_k,
        results=results,
        elapsed_ms=elapsed_ms,
    )
