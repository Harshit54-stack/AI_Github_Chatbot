"""
Tests for Phase 10 -- Cross-Encoder Reranker.

Covers:
1. Normal reranking with real/mocked model
2. Multiple candidate re-ordering
3. Empty candidate list handling
4. Top-K truncation
5. Duplicate candidate handling
6. Empty or invalid query handling
7. Model load/predict failure handling & graceful fallback
8. Disabled reranker toggle behavior
9. Score normalisation (bounds [0.0, 1.0])
10. Hybrid + Reranking end-to-end flow

Run with: pytest backend/tests/test_reranker.py -v
"""

from unittest.mock import patch, MagicMock
import pytest

from app.services.rag.retriever import RetrievedChunk
from app.services.rag.reranker import (
    rerank,
    _normalise_scores,
    RerankerModel,
)


# ---------------------------------------------------------------------------
# Test Helpers
# ---------------------------------------------------------------------------


def _make_chunk(
    chunk_id: str,
    score: float,
    symbol_name: str = "func",
    file_path: str = "app/services/example.py",
    content_preview: str = "def func(): pass",
    repo: str = "test_repo",
) -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id=chunk_id,
        score=score,
        file_path=file_path,
        symbol_name=symbol_name,
        chunk_type="function",
        language="Python",
        start_line=1,
        end_line=20,
        repository_name=repo,
        content_preview=content_preview,
    )


# ---------------------------------------------------------------------------
# 1. Normalisation helper tests
# ---------------------------------------------------------------------------


class TestScoreNormalisation:
    def test_empty_list(self):
        assert _normalise_scores([]) == []

    def test_single_element(self):
        assert _normalise_scores([5.0]) == [1.0]

    def test_all_identical_elements(self):
        assert _normalise_scores([3.0, 3.0, 3.0]) == [1.0, 1.0, 1.0]

    def test_min_max_spread(self):
        res = _normalise_scores([0.0, 5.0, 10.0])
        assert res[0] == pytest.approx(0.0)
        assert res[1] == pytest.approx(0.5)
        assert res[2] == pytest.approx(1.0)

    def test_negative_logits_normalisation(self):
        # CrossEncoder typically produces negative logits for non-matches
        res = _normalise_scores([-10.0, -5.0, 0.0])
        assert res[0] == pytest.approx(0.0)
        assert res[1] == pytest.approx(0.5)
        assert res[2] == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# 2. Reranker Unit Tests (Mocked Predictor)
# ---------------------------------------------------------------------------


class TestRerankerUnit:
    @patch.object(RerankerModel, "get")
    def test_normal_reranking_reorders_candidates(self, mock_get_model):
        mock_model = MagicMock()
        # Candidate 0 gets low score (1.0), Candidate 1 gets high score (9.0)
        mock_model.predict.return_value = [1.0, 9.0]
        mock_get_model.return_value = mock_model

        c1 = _make_chunk("c1", 0.9, symbol_name="low_match", content_preview="print('hi')")
        c2 = _make_chunk("c2", 0.5, symbol_name="high_match", content_preview="def authenticate(): ...")

        # c1 came in first with hybrid score 0.9, c2 came in second with 0.5
        results = rerank("Where is authentication?", [c1, c2], top_k=2)

        # After reranking, c2 must be first because cross-encoder gave it 9.0 vs 1.0
        assert len(results) == 2
        assert results[0].chunk_id == "c2"
        assert results[1].chunk_id == "c1"
        assert results[0].score >= results[1].score

    def test_empty_candidates_returns_empty(self):
        assert rerank("any query", [], top_k=5) == []

    def test_single_candidate_returns_immediately(self):
        c = _make_chunk("c1", 0.85)
        results = rerank("any query", [c], top_k=5)
        assert len(results) == 1
        assert results[0].chunk_id == "c1"

    def test_empty_or_whitespace_query_returns_candidates_as_is(self):
        c1 = _make_chunk("c1", 0.9)
        c2 = _make_chunk("c2", 0.8)
        assert rerank("", [c1, c2], top_k=2) == [c1, c2]
        assert rerank("   ", [c1, c2], top_k=2) == [c1, c2]

    @patch("app.config.settings.RERANKER_ENABLED", False)
    def test_disabled_reranker_returns_candidates_truncated(self):
        c1 = _make_chunk("c1", 0.9)
        c2 = _make_chunk("c2", 0.8)
        c3 = _make_chunk("c3", 0.7)
        results = rerank("query", [c1, c2, c3], top_k=2)
        assert len(results) == 2
        assert [c.chunk_id for c in results] == ["c1", "c2"]

    @patch.object(RerankerModel, "get")
    def test_deduplicates_duplicate_candidates_before_reranking(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.predict.return_value = [5.0, 2.0]
        mock_get_model.return_value = mock_model

        c1 = _make_chunk("dup", 0.9)
        c2 = _make_chunk("dup", 0.7)  # duplicate chunk_id
        c3 = _make_chunk("unique", 0.5)

        results = rerank("query", [c1, c2, c3], top_k=5)
        chunk_ids = [c.chunk_id for c in results]
        assert chunk_ids.count("dup") == 1
        assert len(results) == 2

    @patch.object(RerankerModel, "get")
    def test_top_k_truncation(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.predict.return_value = [float(i) for i in range(10)]
        mock_get_model.return_value = mock_model

        candidates = [_make_chunk(f"c_{i}", 0.5) for i in range(10)]
        results = rerank("query", candidates, top_k=3)
        assert len(results) == 3

    @patch.object(RerankerModel, "get")
    def test_scores_are_normalized_between_zero_and_one(self, mock_get_model):
        mock_model = MagicMock()
        # Large arbitrary logits
        mock_model.predict.return_value = [-14.5, -2.1, 8.4]
        mock_get_model.return_value = mock_model

        candidates = [
            _make_chunk("c1", 0.1),
            _make_chunk("c2", 0.2),
            _make_chunk("c3", 0.3),
        ]
        results = rerank("query", candidates, top_k=3)
        for r in results:
            assert 0.0 <= r.score <= 1.0


# ---------------------------------------------------------------------------
# 3. Graceful Failure & Fallback Tests
# ---------------------------------------------------------------------------


class TestRerankerFallback:
    @patch.object(RerankerModel, "get")
    def test_model_load_exception_falls_back_to_candidates(self, mock_get_model):
        mock_get_model.side_effect = RuntimeError("Could not load cross-encoder weights")

        c1 = _make_chunk("c1", 0.9)
        c2 = _make_chunk("c2", 0.8)
        c3 = _make_chunk("c3", 0.7)

        # Should not raise; returns original order
        results = rerank("query", [c1, c2, c3], top_k=2)
        assert len(results) == 2
        assert results[0].chunk_id == "c1"
        assert results[1].chunk_id == "c2"

    @patch.object(RerankerModel, "get")
    def test_predict_exception_falls_back_to_candidates(self, mock_get_model):
        mock_model = MagicMock()
        mock_model.predict.side_effect = ValueError("Out of memory on inference")
        mock_get_model.return_value = mock_model

        c1 = _make_chunk("c1", 0.9)
        c2 = _make_chunk("c2", 0.8)

        results = rerank("query", [c1, c2], top_k=2)
        assert len(results) == 2
        assert results[0].chunk_id == "c1"
        assert results[1].chunk_id == "c2"


# ---------------------------------------------------------------------------
# 4. End-to-End Real Model Inference Test
# ---------------------------------------------------------------------------


class TestRealModelReranking:
    def test_real_cross_encoder_prioritizes_exact_concept(self):
        """Test with actual cached CrossEncoder model."""
        auth_chunk = _make_chunk(
            "chunk_auth",
            0.6,
            symbol_name="authenticate_user",
            file_path="app/auth/security.py",
            content_preview="def authenticate_user(username, password):\n    # verifies user password and returns jwt token\n    return token",
        )
        css_chunk = _make_chunk(
            "chunk_css",
            0.8,  # higher initial hybrid score
            symbol_name="layout_styles",
            file_path="frontend/styles.css",
            content_preview=".header { background: #333; color: white; display: flex; }",
        )

        query = "Where is user password authentication and JWT token handled?"
        results = rerank(query, [css_chunk, auth_chunk], top_k=2)

        # The cross encoder should recognise that auth_chunk is far more relevant
        assert results[0].chunk_id == "chunk_auth"
        assert results[0].score > results[1].score
