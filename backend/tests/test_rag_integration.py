"""
Integration tests for Phase 8 -- RAG pipeline with Query Intelligence.

Mocks FAISS retriever and Gemini API to ensure fast, deterministic tests.
Run with:  pytest backend/tests/test_rag_integration.py -v
"""

import asyncio
import json
from unittest.mock import MagicMock, patch
import pytest

from app.models.rag_models import RAGRequest, RAGResponse
from app.services.rag.retriever import RetrievedChunk
from app.services.rag.rag_service import (
    _pipeline_retrieve_and_build,
    answer,
    answer_stream,
)


@pytest.fixture
def sample_chunk() -> RetrievedChunk:
    return RetrievedChunk(
        chunk_id="chunk_abc123",
        score=0.92,
        file_path="app/services/vector_store/faiss_service.py",
        symbol_name="build_index",
        chunk_type="function",
        language="Python",
        start_line=34,
        end_line=75,
        repository_name="test_repo",
        content_preview="def build_index(repository_name: str):\n    ...",
    )


# ---------------------------------------------------------------------------
# 1. Invalid query handling
# ---------------------------------------------------------------------------


class TestInvalidQueryPipeline:
    def test_greeting_query_rejected_in_pipeline(self):
        req = RAGRequest(
            repository="test_repo",
            question="hello",
            top_k=5,
        )
        with pytest.raises(RuntimeError) as exc_info:
            _pipeline_retrieve_and_build(req)
        assert "greeting" in str(exc_info.value).lower()

    def test_vague_query_rejected_in_pipeline(self):
        req = RAGRequest(
            repository="test_repo",
            question="tell me something",
            top_k=5,
        )
        with pytest.raises(RuntimeError) as exc_info:
            _pipeline_retrieve_and_build(req)
        assert "too vague" in str(exc_info.value).lower()

    def test_invalid_query_sse_stream_yields_error_event(self):
        req = RAGRequest(
            repository="test_repo",
            question="hi",
            top_k=5,
        )
        async def _collect():
            events = []
            async for sse_json in answer_stream(req):
                events.append(json.loads(sse_json))
            return events

        events = asyncio.run(_collect())
        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert "greeting" in events[0]["message"].lower()


# ---------------------------------------------------------------------------
# 2. Valid query retrieval and rewriting flow
# ---------------------------------------------------------------------------


class TestValidQueryFlow:
    @patch("app.services.rag.rag_service.hybrid_retrieve")
    def test_valid_query_reaches_retriever_without_rewrite(self, mock_retrieve, sample_chunk):
        mock_retrieve.return_value = [sample_chunk]

        req = RAGRequest(
            repository="test_repo",
            question="How does authentication work in this repository?",
            top_k=5,
        )
        all_chunks, included_chunks, context_str, messages, session_id = (
            _pipeline_retrieve_and_build(req)
        )

        from app.config import settings
        expected_k = max(5, settings.RERANKER_CANDIDATE_TOP_K) if settings.RERANKER_ENABLED else 5
        mock_retrieve.assert_called_once_with(
            query="How does authentication work in this repository?",
            repository_name="test_repo",
            top_k=expected_k,
        )
        assert len(included_chunks) == 1
        assert "build_index" in context_str

    @patch("app.services.rag.rag_service._rewriter.rewrite")
    @patch("app.services.rag.rag_service.hybrid_retrieve")
    def test_keyword_query_triggers_rewrite_and_passes_to_retriever(
        self, mock_retrieve, mock_rewrite, sample_chunk
    ):
        mock_rewrite.return_value = "Explain how FAISS is used for vector search in this repository."
        mock_retrieve.return_value = [sample_chunk]

        req = RAGRequest(
            repository="test_repo",
            question="faiss",
            top_k=5,
        )
        _pipeline_retrieve_and_build(req)

        # Rewriter should be called with "faiss"
        mock_rewrite.assert_called_once()
        assert mock_rewrite.call_args[1]["query"] == "faiss"

        from app.config import settings
        expected_k = max(5, settings.RERANKER_CANDIDATE_TOP_K) if settings.RERANKER_ENABLED else 5
        mock_retrieve.assert_called_once_with(
            query="Explain how FAISS is used for vector search in this repository.",
            repository_name="test_repo",
            top_k=expected_k,
        )

    @patch("app.services.rag.rag_service._rewriter.rewrite")
    @patch("app.services.rag.rag_service.hybrid_retrieve")
    def test_rewriter_failure_falls_back_to_original_query(
        self, mock_retrieve, mock_rewrite, sample_chunk
    ):
        # If rewriting fails and returns original query
        mock_rewrite.return_value = "embeddings"
        mock_retrieve.return_value = [sample_chunk]

        req = RAGRequest(
            repository="test_repo",
            question="embeddings",
            top_k=3,
        )
        _pipeline_retrieve_and_build(req)

        from app.config import settings
        expected_k = max(3, settings.RERANKER_CANDIDATE_TOP_K) if settings.RERANKER_ENABLED else 3
        mock_retrieve.assert_called_once_with(
            query="embeddings",
            repository_name="test_repo",
            top_k=expected_k,
        )


# ---------------------------------------------------------------------------
# 3. Full answer (non-streaming) end-to-end integration test
# ---------------------------------------------------------------------------


class TestFullAnswerIntegration:
    @patch("app.services.rag.rag_service._call_gemini")
    @patch("app.services.rag.rag_service.hybrid_retrieve")
    def test_full_answer_success(self, mock_retrieve, mock_call_gemini, sample_chunk):
        mock_retrieve.return_value = [sample_chunk]
        mock_call_gemini.return_value = (
            "FAISS index construction is handled by build_index() in faiss_service.py:34-75."
        )

        req = RAGRequest(
            repository="test_repo",
            question="Where is the FAISS index built?",
            top_k=5,
        )
        response: RAGResponse = asyncio.run(answer(req))

        assert isinstance(response, RAGResponse)
        assert "build_index" in response.answer
        assert len(response.sources) == 1
        assert response.sources[0].file == "app/services/vector_store/faiss_service.py"
        assert response.confidence > 0.0
        assert response.retrieved_chunks == 1


# ---------------------------------------------------------------------------
# 4. SSE streaming end-to-end integration test
# ---------------------------------------------------------------------------


class TestSSEStreamingIntegration:
    @patch("app.services.rag.rag_service._call_gemini_stream")
    @patch("app.services.rag.rag_service.hybrid_retrieve")
    def test_streaming_success(self, mock_retrieve, mock_call_gemini_stream, sample_chunk):
        mock_retrieve.return_value = [sample_chunk]

        # Mock token stream from Gemini
        mock_token_1 = MagicMock()
        mock_token_1.text = "FAISS is "
        mock_token_2 = MagicMock()
        mock_token_2.text = "initialized here."
        mock_call_gemini_stream.return_value = [mock_token_1, mock_token_2]

        req = RAGRequest(
            repository="test_repo",
            question="Where is FAISS initialized?",
            top_k=5,
        )
        async def _collect():
            events = []
            async for sse_json in answer_stream(req):
                events.append(json.loads(sse_json))
            return events

        events = asyncio.run(_collect())

        # Expected event sequence: chunk, chunk, sources, done
        event_types = [e["type"] for e in events]
        assert "chunk" in event_types
        assert "sources" in event_types
        assert "done" in event_types

        # Verify chunk texts
        chunks_text = "".join(e["text"] for e in events if e["type"] == "chunk")
        assert chunks_text == "FAISS is initialized here."
