"""
Tests for Phase 8 -- QueryRewriter.

Mocks all Gemini API calls so tests run offline and deterministically.
Run with:  pytest backend/tests/test_query_rewriter.py -v
"""

from unittest.mock import MagicMock, patch
import pytest

from app.services.rag.query_rewriter import QueryRewriter, _format_history


@pytest.fixture
def rewriter() -> QueryRewriter:
    return QueryRewriter()


# ---------------------------------------------------------------------------
# 1. Format history helper tests
# ---------------------------------------------------------------------------


class TestFormatHistory:
    def test_empty_history(self):
        assert _format_history(None) == "(none)"
        assert _format_history([]) == "(none)"

    def test_history_formatting(self):
        history = [
            {"role": "user", "parts": ["Where is auth?"]},
            {"role": "model", "parts": ["Auth is in app/services/auth.py"]},
        ]
        result = _format_history(history, max_turns=1)
        assert "User: Where is auth?" in result
        assert "Model: Auth is in app/services/auth.py" in result

    def test_history_truncation_long_text(self):
        history = [
            {"role": "user", "parts": ["x" * 300]},
        ]
        result = _format_history(history)
        assert "..." in result
        assert len(result) < 300


# ---------------------------------------------------------------------------
# 2. Blank / Empty query handling (no LLM call)
# ---------------------------------------------------------------------------


class TestEmptyQueryPassThrough:
    def test_empty_string(self, rewriter):
        assert rewriter.rewrite("") == ""

    def test_whitespace_string(self, rewriter):
        assert rewriter.rewrite("   ") == "   "


# ---------------------------------------------------------------------------
# 3. Gemini Success tests (Mocked)
# ---------------------------------------------------------------------------


class TestGeminiSuccess:
    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_normal_query_rewritten(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "How does JWT authentication and password hashing work in this repository?"
        mock_chat.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        result = rewriter.rewrite("auth?")
        assert result == "How does JWT authentication and password hashing work in this repository?"
        mock_chat.send_message.assert_called_once()

    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_vague_query_rewritten(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "Explain the overall architecture and main entry points of the repository."
        mock_chat.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        result = rewriter.rewrite("how does it work?")
        assert result == "Explain the overall architecture and main entry points of the repository."

    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_multi_turn_history_passed(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "How does the Tree-sitter parser handle syntax trees in this repository?"
        mock_chat.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        history = [
            {"role": "user", "parts": ["Tell me about the parser."]},
            {"role": "model", "parts": ["The parser uses Tree-sitter."]},
        ]
        result = rewriter.rewrite("how does it work?", conversation_history=history)
        assert "Tree-sitter" in result
        # Check that the prompt sent to send_message included the history
        call_arg = mock_chat.send_message.call_args[0][0]
        assert "Tell me about the parser." in call_arg


# ---------------------------------------------------------------------------
# 4. Gemini Failure & Fallback tests
# ---------------------------------------------------------------------------


class TestGeminiFailureFallback:
    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_missing_api_key_fallback(self, mock_get_model, rewriter):
        mock_get_model.side_effect = ValueError("GEMINI_API_KEY is not set.")
        original = "Where are the embeddings?"
        assert rewriter.rewrite(original) == original

    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_network_or_api_exception_fallback(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_chat.send_message.side_effect = RuntimeError("Network timeout or connection reset")
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        original = "Explain FAISS search"
        assert rewriter.rewrite(original) == original

    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_empty_response_fallback(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_response = MagicMock()
        mock_response.text = "   "
        mock_chat.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        original = "where are classes?"
        assert rewriter.rewrite(original) == original

    @patch("app.services.rag.query_rewriter._get_gemini_model")
    def test_excessively_long_response_fallback(self, mock_get_model, rewriter):
        mock_model = MagicMock()
        mock_chat = MagicMock()
        mock_response = MagicMock()
        # If Gemini ignores instructions and generates a 1000-char essay
        mock_response.text = "A" * 700
        mock_chat.send_message.return_value = mock_response
        mock_model.start_chat.return_value = mock_chat
        mock_get_model.return_value = mock_model

        original = "where is git clone?"
        assert rewriter.rewrite(original) == original
