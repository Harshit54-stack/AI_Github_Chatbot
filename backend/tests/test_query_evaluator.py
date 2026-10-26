"""
Tests for Phase 8 -- QueryEvaluator.

All tests are deterministic (no network, no LLM calls).
Run with:  pytest backend/tests/test_query_evaluator.py -v
"""

import pytest

from app.services.rag.query_evaluator import (
    QueryEvaluator,
    QueryIntent,
)


@pytest.fixture(scope="module")
def evaluator() -> QueryEvaluator:
    """Shared evaluator instance -- creation is free (no model loading)."""
    return QueryEvaluator()


# ---------------------------------------------------------------------------
# 1. Valid repository-related queries
# ---------------------------------------------------------------------------


class TestValidQueries:
    def test_how_auth_works(self, evaluator):
        result = evaluator.evaluate("How does authentication work in this repository?")
        assert result.is_valid is True
        assert result.intent == QueryIntent.VALID

    def test_where_github_clone(self, evaluator):
        result = evaluator.evaluate("Where is the GitHub repository cloned?")
        assert result.is_valid is True
        assert result.intent == QueryIntent.VALID

    def test_python_parsing(self, evaluator):
        result = evaluator.evaluate("How are Python files parsed using Tree-sitter?")
        assert result.is_valid is True

    def test_faiss_explanation(self, evaluator):
        result = evaluator.evaluate("Explain the FAISS vector search implementation.")
        assert result.is_valid is True

    def test_embedding_model(self, evaluator):
        result = evaluator.evaluate("Where is the embedding model initialized?")
        assert result.is_valid is True

    def test_rag_pipeline_explanation(self, evaluator):
        result = evaluator.evaluate("Can you explain how the RAG pipeline orchestrates retrieval and generation?")
        assert result.is_valid is True
        assert result.needs_rewriting is False


# ---------------------------------------------------------------------------
# 2. Empty query
# ---------------------------------------------------------------------------


class TestEmptyQueries:
    def test_empty_string(self, evaluator):
        result = evaluator.evaluate("")
        assert result.is_valid is False
        assert result.intent == QueryIntent.EMPTY

    def test_whitespace_only(self, evaluator):
        result = evaluator.evaluate("   ")
        assert result.is_valid is False
        assert result.intent == QueryIntent.EMPTY

    def test_none_like_empty(self, evaluator):
        result = evaluator.evaluate("")
        assert result.is_valid is False


# ---------------------------------------------------------------------------
# 3. Very short queries
# ---------------------------------------------------------------------------


class TestShortQueries:
    def test_single_letter(self, evaluator):
        result = evaluator.evaluate("a")
        assert result.is_valid is False
        assert result.intent == QueryIntent.VAGUE

    def test_two_char_query(self, evaluator):
        result = evaluator.evaluate("hi")
        # "hi" is a greeting -- should be classified as GREETING, not VAGUE
        assert result.is_valid is False


# ---------------------------------------------------------------------------
# 4. Vague queries
# ---------------------------------------------------------------------------


class TestVagueQueries:
    def test_help(self, evaluator):
        result = evaluator.evaluate("help")
        # "help" alone is not a code keyword -- should be vague or rejected
        assert result.is_valid is False

    def test_tell_me_something(self, evaluator):
        result = evaluator.evaluate("tell me something")
        assert result.is_valid is False

    def test_what(self, evaluator):
        result = evaluator.evaluate("what?")
        assert result.is_valid is False

    def test_code_generic(self, evaluator):
        result = evaluator.evaluate("code")
        # "code" is very generic; should be invalid or needs rewriting
        assert result.is_valid is False or result.needs_rewriting is True


# ---------------------------------------------------------------------------
# 5. Greeting queries
# ---------------------------------------------------------------------------


class TestGreetingQueries:
    def test_hello(self, evaluator):
        result = evaluator.evaluate("hello")
        assert result.is_valid is False
        assert result.intent == QueryIntent.GREETING

    def test_hi(self, evaluator):
        result = evaluator.evaluate("hi")
        assert result.is_valid is False
        assert result.intent == QueryIntent.GREETING

    def test_hey(self, evaluator):
        result = evaluator.evaluate("hey")
        assert result.is_valid is False
        assert result.intent == QueryIntent.GREETING

    def test_hi_with_exclamation(self, evaluator):
        result = evaluator.evaluate("hi!")
        assert result.is_valid is False

    def test_good_morning(self, evaluator):
        result = evaluator.evaluate("good morning")
        assert result.is_valid is False
        assert result.intent == QueryIntent.GREETING


# ---------------------------------------------------------------------------
# 6. Repository-oriented keyword queries (single word)
# ---------------------------------------------------------------------------


class TestCodeKeywordQueries:
    def test_faiss(self, evaluator):
        result = evaluator.evaluate("faiss")
        assert result.is_valid is True
        assert result.needs_rewriting is True
        assert result.intent == QueryIntent.CODE_KEYWORD

    def test_embeddings(self, evaluator):
        result = evaluator.evaluate("embeddings")
        assert result.is_valid is True
        assert result.needs_rewriting is True

    def test_authentication(self, evaluator):
        result = evaluator.evaluate("authentication")
        assert result.is_valid is True
        assert result.needs_rewriting is True

    def test_parser(self, evaluator):
        result = evaluator.evaluate("parser")
        assert result.is_valid is True
        assert result.needs_rewriting is True

    def test_two_word_code_keyword(self, evaluator):
        result = evaluator.evaluate("faiss index")
        # Two-word query with a code keyword -- should be valid, might need rewriting
        assert result.is_valid is True


# ---------------------------------------------------------------------------
# 7. Queries that need rewriting (short but not single-word keyword)
# ---------------------------------------------------------------------------


class TestNeedsRewriting:
    def test_where_parser(self, evaluator):
        result = evaluator.evaluate("where is parser?")
        assert result.is_valid is True
        # "where is parser?" -- 3 words, "parser" is a keyword but "where is" are generic
        # should flag needs_rewriting

    def test_how_embeddings_work(self, evaluator):
        result = evaluator.evaluate("how embeddings work")
        assert result.is_valid is True

    def test_short_question(self, evaluator):
        result = evaluator.evaluate("explain faiss")
        assert result.is_valid is True
        # "explain" is generic + "faiss" is a code keyword -- may need rewriting


# ---------------------------------------------------------------------------
# 8. Result structure validation
# ---------------------------------------------------------------------------


class TestResultStructure:
    def test_result_has_required_fields(self, evaluator):
        result = evaluator.evaluate("How does the FAISS index work?")
        assert hasattr(result, "is_valid")
        assert hasattr(result, "needs_rewriting")
        assert hasattr(result, "intent")
        assert hasattr(result, "reason")

    def test_reason_is_string(self, evaluator):
        result = evaluator.evaluate("hello")
        assert isinstance(result.reason, str)
        assert len(result.reason) > 0

    def test_intent_is_enum(self, evaluator):
        result = evaluator.evaluate("How does FAISS retrieval work?")
        assert isinstance(result.intent, QueryIntent)

    def test_invalid_never_needs_rewriting(self, evaluator):
        # When is_valid is False, needs_rewriting must always be False.
        for query in ["", "   ", "hi", "hello", "tell me something"]:
            result = evaluator.evaluate(query)
            if not result.is_valid:
                assert result.needs_rewriting is False, (
                    f"Query '{query}': invalid result must not set needs_rewriting=True"
                )
