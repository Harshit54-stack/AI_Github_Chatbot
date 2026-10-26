"""
Tests for Phase 9 -- BM25 Retriever.

All tests are deterministic (no network, no FAISS index needed).
The BM25 index is built from synthetic MetadataEntry objects.
Run with:  pytest backend/tests/test_bm25_retriever.py -v
"""

import pytest

from app.services.rag.bm25_retriever import (
    BM25Index,
    tokenize,
    build_bm25_index,
    bm25_search,
    clear_bm25_index,
)
from app.services.rag.retriever import RetrievedChunk
from app.services.vector_store.metadata_store import MetadataEntry


# ---------------------------------------------------------------------------
# Helpers — build synthetic MetadataEntry objects
# ---------------------------------------------------------------------------


def _make_entry(
    faiss_id: int,
    chunk_id: str,
    symbol_name: str,
    file_path: str,
    content: str,
    chunk_type: str = "function",
    language: str = "Python",
) -> MetadataEntry:
    return MetadataEntry(
        faiss_id=faiss_id,
        chunk_id=chunk_id,
        repository_name="test_repo",
        file_path=file_path,
        symbol_name=symbol_name,
        chunk_type=chunk_type,
        language=language,
        start_line=1,
        end_line=10,
        content_preview=content,
    )


SAMPLE_ENTRIES = [
    _make_entry(
        0, "chunk_embed_001", "generate_embedding",
        "app/services/embedding/embedding_service.py",
        "def generate_embedding(text: str) -> np.ndarray: ..."
    ),
    _make_entry(
        1, "chunk_faiss_001", "build_index",
        "app/services/vector_store/faiss_service.py",
        "def build_index(repository_name: str) -> BuildResponse: ..."
    ),
    _make_entry(
        2, "chunk_rewriter_001", "QueryRewriter",
        "app/services/rag/query_rewriter.py",
        "class QueryRewriter: def rewrite(self, query, conversation_history): ...",
        chunk_type="class",
    ),
    _make_entry(
        3, "chunk_git_001", "clone_repository",
        "app/services/git/repository_manager.py",
        "def clone_repository(url: str, dest: Path) -> None: ..."
    ),
    _make_entry(
        4, "chunk_sse_001", "answer_stream",
        "app/services/rag/rag_service.py",
        "async def answer_stream(request: RAGRequest) -> AsyncIterator[str]: ..."
    ),
    _make_entry(
        5, "chunk_gemini_001", "generate_reply",
        "app/services/gemini_service.py",
        "def generate_reply(message: str) -> str: ..."
    ),
]


@pytest.fixture(scope="module")
def bm25_index() -> BM25Index:
    """Build a BM25Index from synthetic entries."""
    idx = BM25Index("test_repo")
    idx.build(SAMPLE_ENTRIES)
    return idx


# ---------------------------------------------------------------------------
# 1. Tokeniser tests
# ---------------------------------------------------------------------------


class TestTokenize:
    def test_snake_case_split(self):
        tokens = tokenize("generate_embedding")
        assert "generate" in tokens
        assert "embedding" in tokens

    def test_camel_case_split(self):
        tokens = tokenize("generateEmbedding")
        assert "generate" in tokens
        assert "embedding" in tokens

    def test_pascal_case_split(self):
        tokens = tokenize("QueryRewriter")
        assert "query" in tokens
        assert "rewriter" in tokens

    def test_mixed_case_split(self):
        tokens = tokenize("FAISSRetriever")
        assert "faiss" in tokens
        assert "retriever" in tokens

    def test_file_path_split(self):
        tokens = tokenize("vector_store.py")
        assert "vector" in tokens
        assert "store" in tokens
        # .py extension
        assert "py" in tokens

    def test_empty_string(self):
        assert tokenize("") == []

    def test_stop_words_removed(self):
        tokens = tokenize("def generate_embedding return the result")
        assert "def" not in tokens
        assert "the" not in tokens
        assert "return" not in tokens

    def test_short_tokens_filtered(self):
        tokens = tokenize("a b c generate")
        # 1-char tokens should be removed
        for t in tokens:
            assert len(t) >= 2


# ---------------------------------------------------------------------------
# 2. BM25Index construction
# ---------------------------------------------------------------------------


class TestBM25IndexBuild:
    def test_index_is_ready_after_build(self, bm25_index):
        assert bm25_index.is_ready is True

    def test_correct_document_count(self, bm25_index):
        assert bm25_index.total_documents == len(SAMPLE_ENTRIES)

    def test_empty_entries_does_not_crash(self):
        idx = BM25Index("empty_repo")
        idx.build([])
        assert idx.is_ready is False


# ---------------------------------------------------------------------------
# 3. Keyword retrieval — exact function/class/file name matching
# ---------------------------------------------------------------------------


class TestBM25Search:
    def test_exact_function_name_found(self, bm25_index):
        results = bm25_index.search("generate_embedding", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_embed_001" in chunk_ids

    def test_exact_class_name_found(self, bm25_index):
        results = bm25_index.search("QueryRewriter", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_rewriter_001" in chunk_ids

    def test_exact_function_in_file_name(self, bm25_index):
        results = bm25_index.search("faiss_service", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_faiss_001" in chunk_ids

    def test_github_clone_found(self, bm25_index):
        results = bm25_index.search("clone_repository", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_git_001" in chunk_ids

    def test_sse_streaming_found(self, bm25_index):
        results = bm25_index.search("answer_stream", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_sse_001" in chunk_ids

    def test_gemini_service_found(self, bm25_index):
        results = bm25_index.search("generate_reply gemini", top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert "chunk_gemini_001" in chunk_ids

    def test_no_match_returns_empty(self, bm25_index):
        # Query about something completely unrelated
        results = bm25_index.search("zzz_nonexistent_xyz_abc_987", top_k=5)
        assert results == []

    def test_empty_query_returns_empty(self, bm25_index):
        assert bm25_index.search("", top_k=5) == []
        assert bm25_index.search("   ", top_k=5) == []

    def test_top_k_respected(self, bm25_index):
        results = bm25_index.search("embedding faiss clone", top_k=2)
        assert len(results) <= 2

    def test_scores_are_positive(self, bm25_index):
        results = bm25_index.search("embedding", top_k=5)
        for r in results:
            assert r.score > 0.0

    def test_result_is_retrieved_chunk(self, bm25_index):
        results = bm25_index.search("build_index", top_k=3)
        assert len(results) > 0
        for r in results:
            assert isinstance(r, RetrievedChunk)
            assert r.chunk_id
            assert r.file_path
            assert r.repository_name == "test_repo"

    def test_results_sorted_descending(self, bm25_index):
        results = bm25_index.search("embedding faiss service", top_k=5)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)


# ---------------------------------------------------------------------------
# 4. High-level bm25_search() with registry & auto-build
# ---------------------------------------------------------------------------


class TestBM25SearchHighLevel:
    def test_bm25_search_returns_list(self):
        # bm25_search auto-builds from FaissIndex, but our test uses a registry
        # pre-registered from bm25_index fixture. Re-use same approach:
        idx = BM25Index("hl_test_repo")
        idx.build(SAMPLE_ENTRIES)

        from app.services.rag.bm25_retriever import _registry, _registry_lock
        with _registry_lock:
            _registry["hl_test_repo"] = idx

        results = bm25_search("generate_embedding", "hl_test_repo", top_k=5)
        assert isinstance(results, list)
        assert any(c.chunk_id == "chunk_embed_001" for c in results)

        # Cleanup
        clear_bm25_index("hl_test_repo")

    def test_bm25_search_graceful_on_missing_repo(self):
        # Should return empty list, not raise
        results = bm25_search("anything", "nonexistent_repo_xyz", top_k=5)
        assert results == []
