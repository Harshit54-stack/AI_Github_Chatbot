"""
Tests for Phase 9 -- Hybrid Retriever.

All external services (FAISS, BM25, Gemini) are mocked.
Run with:  pytest backend/tests/test_hybrid_retriever.py -v
"""

from unittest.mock import patch, MagicMock
import pytest

from app.services.rag.retriever import RetrievedChunk
from app.services.rag.hybrid_retriever import (
    _normalise,
    _fuse,
    hybrid_retrieve,
)


# ---------------------------------------------------------------------------
# Helpers — build synthetic RetrievedChunk objects
# ---------------------------------------------------------------------------


def _chunk(chunk_id, score, symbol="func", file="app/foo.py", repo="repo") -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        score=score,
        file_path=file,
        symbol_name=symbol,
        chunk_type="function",
        language="Python",
        start_line=1,
        end_line=10,
        repository_name=repo,
        content_preview="# code",
    )


# ---------------------------------------------------------------------------
# 1. Score normalisation
# ---------------------------------------------------------------------------


class TestNormalise:
    def test_basic_normalisation(self):
        result = _normalise([0.0, 0.5, 1.0])
        assert result[0] == pytest.approx(0.0)
        assert result[1] == pytest.approx(0.5)
        assert result[2] == pytest.approx(1.0)

    def test_all_same_value(self):
        # All same -> all 1.0
        result = _normalise([0.5, 0.5, 0.5])
        assert result == [1.0, 1.0, 1.0]

    def test_single_element(self):
        result = _normalise([0.7])
        assert result == [1.0]

    def test_empty_list(self):
        assert _normalise([]) == []

    def test_different_scales(self):
        # BM25-style raw scores
        result = _normalise([10.0, 5.0, 0.0])
        assert result[0] == pytest.approx(1.0)
        assert result[1] == pytest.approx(0.5)
        assert result[2] == pytest.approx(0.0)


# ---------------------------------------------------------------------------
# 2. Score fusion
# ---------------------------------------------------------------------------


class TestFuse:
    def test_deduplication_same_chunk(self):
        faiss = [_chunk("c1", 0.9), _chunk("c2", 0.8)]
        bm25  = [_chunk("c1", 15.0)]  # c1 appears in both
        result = _fuse(faiss, bm25, semantic_weight=0.7)
        chunk_ids = [c.chunk_id for c in result]
        # c1 should appear only once
        assert chunk_ids.count("c1") == 1

    def test_merged_chunk_has_higher_score_than_faiss_only(self):
        # c1 appears in both, c2 only in FAISS
        faiss = [_chunk("c1", 0.9), _chunk("c2", 0.8)]
        bm25  = [_chunk("c1", 15.0)]
        result = _fuse(faiss, bm25, semantic_weight=0.7)
        c1 = next(c for c in result if c.chunk_id == "c1")
        c2 = next(c for c in result if c.chunk_id == "c2")
        # c1 benefits from both systems; its combined score should be highest
        assert c1.score >= c2.score

    def test_empty_faiss_returns_bm25_only(self):
        bm25 = [_chunk("b1", 8.0), _chunk("b2", 4.0)]
        result = _fuse([], bm25, semantic_weight=0.7)
        # Both BM25 chunks should be in output
        ids = {c.chunk_id for c in result}
        assert "b1" in ids and "b2" in ids

    def test_empty_bm25_returns_faiss_only(self):
        faiss = [_chunk("f1", 0.9), _chunk("f2", 0.7)]
        result = _fuse(faiss, [], semantic_weight=0.7)
        ids = {c.chunk_id for c in result}
        assert "f1" in ids and "f2" in ids

    def test_both_empty_returns_empty(self):
        assert _fuse([], [], semantic_weight=0.7) == []

    def test_final_scores_in_descending_order(self):
        faiss = [_chunk("f1", 0.9), _chunk("f2", 0.5)]
        bm25  = [_chunk("b1", 10.0), _chunk("f1", 8.0)]
        result = _fuse(faiss, bm25, semantic_weight=0.7)
        scores = [c.score for c in result]
        assert scores == sorted(scores, reverse=True)

    def test_pure_bm25_chunk_included(self):
        # A chunk that only appears in BM25 should still be in the output
        faiss = [_chunk("f1", 0.9)]
        bm25  = [_chunk("f1", 8.0), _chunk("bm25_only", 5.0)]
        result = _fuse(faiss, bm25, semantic_weight=0.7)
        ids = {c.chunk_id for c in result}
        assert "bm25_only" in ids


# ---------------------------------------------------------------------------
# 3. hybrid_retrieve() — full integration with mocks
# ---------------------------------------------------------------------------


class TestHybridRetrieve:
    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_returns_merged_results(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = [
            _chunk("f1", 0.9),
            _chunk("f2", 0.7),
        ]
        mock_bm25.return_value = [
            _chunk("b1", 10.0),
            _chunk("f1", 8.0),  # duplicate with FAISS
        ]

        results = hybrid_retrieve("generate_embedding", "repo", top_k=5)
        ids = {c.chunk_id for c in results}
        assert "f1" in ids  # from both
        assert "f2" in ids  # from FAISS only
        assert "b1" in ids  # from BM25 only
        # f1 should appear once (deduplicated)
        assert [c.chunk_id for c in results].count("f1") == 1

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_top_k_limiting(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = [
            _chunk(f"f{i}", 0.9 - i * 0.1) for i in range(8)
        ]
        mock_bm25.return_value = [
            _chunk(f"b{i}", 10.0 - i) for i in range(8)
        ]
        results = hybrid_retrieve("query", "repo", top_k=3)
        assert len(results) <= 3

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_faiss_failure_falls_back_to_bm25(self, mock_retrieve, mock_bm25):
        mock_retrieve.side_effect = RuntimeError("FAISS index not ready")
        mock_bm25.return_value = [_chunk("b1", 8.0)]

        results = hybrid_retrieve("query", "repo", top_k=5)
        assert len(results) == 1
        assert results[0].chunk_id == "b1"

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_bm25_failure_falls_back_to_faiss(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = [_chunk("f1", 0.9)]
        mock_bm25.side_effect = RuntimeError("BM25 exploded")

        results = hybrid_retrieve("query", "repo", top_k=5)
        assert len(results) == 1
        assert results[0].chunk_id == "f1"

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_both_failure_returns_empty(self, mock_retrieve, mock_bm25):
        mock_retrieve.side_effect = RuntimeError("FAISS down")
        mock_bm25.side_effect = RuntimeError("BM25 down")

        results = hybrid_retrieve("query", "repo", top_k=5)
        assert results == []

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_empty_results_from_both(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = []
        mock_bm25.return_value = []

        results = hybrid_retrieve("query", "repo", top_k=5)
        assert results == []

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_result_scores_are_normalised(self, mock_retrieve, mock_bm25):
        """Final scores from the fuser should be in [0, 1]."""
        mock_retrieve.return_value = [_chunk("f1", 0.9), _chunk("f2", 0.3)]
        mock_bm25.return_value = [_chunk("b1", 12.0), _chunk("f1", 8.0)]

        results = hybrid_retrieve("query", "repo", top_k=10)
        for r in results:
            assert 0.0 <= r.score <= 1.0, f"Score out of range: {r.score}"

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_results_sorted_descending(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = [_chunk(f"f{i}", float(i) * 0.2) for i in range(1, 6)]
        mock_bm25.return_value = [_chunk(f"b{i}", float(i) * 3.0) for i in range(1, 6)]

        results = hybrid_retrieve("query", "repo", top_k=10)
        scores = [r.score for r in results]
        assert scores == sorted(scores, reverse=True)

    @patch("app.services.rag.hybrid_retriever.bm25_search")
    @patch("app.services.rag.hybrid_retriever.retrieve")
    def test_correct_arguments_passed_to_retrievers(self, mock_retrieve, mock_bm25):
        mock_retrieve.return_value = []
        mock_bm25.return_value = []

        from app.config import settings
        hybrid_retrieve("test query", "my_repo", top_k=5)

        mock_retrieve.assert_called_once_with(
            query="test query",
            repository_name="my_repo",
            top_k=settings.FAISS_CANDIDATE_TOP_K,
        )
        mock_bm25.assert_called_once_with(
            query="test query",
            repository_name="my_repo",
            top_k=settings.BM25_TOP_K,
        )
