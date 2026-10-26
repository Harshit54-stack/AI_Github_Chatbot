"""
Query Evaluator -- Phase 8: Query Intelligence.

Determines whether a user query is suitable for RAG retrieval before
sending it to the embedding model and FAISS index.

Design goals
------------
* Purely rule-based (no LLM, no network calls) -- never fails.
* Fast: runs in microseconds, adds no latency to the pipeline.
* Conservative: prefer to allow a query through rather than block it.
  It is better to attempt retrieval on a vague query than to silently
  refuse a genuine user request.
* Reusable: returns a structured result; callers decide what to do.

Query classes
-------------
EMPTY        -- blank or whitespace-only query.
GREETING     -- social small-talk that has nothing to do with code.
VAGUE        -- too short or too generic to retrieve anything useful.
CODE_KEYWORD -- a single technical word without a question context.
               Valid but may benefit from rewriting.
VALID        -- a meaningful, retrieval-ready query.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from enum import Enum
from typing import FrozenSet, List

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Query Intent Enum
# ---------------------------------------------------------------------------


class QueryIntent(str, Enum):
    """Coarse classification of the user query."""

    EMPTY = "empty"
    GREETING = "greeting"
    VAGUE = "vague"
    CODE_KEYWORD = "code_keyword"
    VALID = "valid"


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class QueryEvaluationResult:
    """
    Structured result from the query evaluator.

    Attributes
    ----------
    is_valid : bool
        True if the query should proceed to retrieval (possibly after rewriting).
    needs_rewriting : bool
        True if the query would benefit from being rewritten before retrieval.
    intent : QueryIntent
        Coarse classification of the query.
    reason : str
        Human-readable explanation of the decision (used for logging and
        for building user-facing fallback messages when is_valid is False).
    """

    is_valid: bool
    needs_rewriting: bool
    intent: QueryIntent
    reason: str


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Social greetings that should not be forwarded to retrieval.
_GREETINGS: FrozenSet[str] = frozenset(
    {
        "hi", "hello", "hey", "howdy", "greetings", "sup", "yo",
        "good morning", "good afternoon", "good evening", "good night",
        "hiya", "hi there", "hello there", "whats up", "what's up",
    }
)

# Words so generic they carry almost no retrieval signal on their own.
_GENERIC_WORDS: FrozenSet[str] = frozenset(
    {
        "what", "how", "why", "where", "who", "when", "which",
        "tell", "explain", "describe", "show", "give", "find",
        "help", "please", "thanks", "thank", "ok", "okay", "yes",
        "no", "nope", "yeah", "yep", "sure", "nothing", "something",
        "anything", "everything", "stuff", "thing", "things",
        "maybe", "probably", "definitely", "really", "very",
        "just", "only", "also", "too", "so", "well", "still",
    }
)

# Technical / code-related keywords -- single-word queries using these
# are classified as CODE_KEYWORD (valid but benefit from rewriting).
_CODE_KEYWORDS: FrozenSet[str] = frozenset(
    {
        "authentication", "auth", "login", "logout", "jwt", "oauth",
        "database", "db", "sql", "nosql", "orm", "model", "schema",
        "embedding", "embeddings", "vector", "vectors", "faiss",
        "parser", "parsing", "ast", "treesitter",
        "chunk", "chunking", "chunks", "chunker",
        "retrieval", "retriever", "rag", "llm",
        "gemini", "openai", "claude", "gpt",
        "repository", "repo", "git", "clone", "branch",
        "api", "endpoint", "route", "router",
        "config", "configuration", "settings", "env",
        "test", "tests", "testing", "pytest",
        "deploy", "deployment", "docker", "container",
        "service", "services", "pipeline", "workflow",
        "class", "function", "method", "module", "import",
        "frontend", "backend", "ui", "component",
        "hook", "state", "react", "vite", "tailwind",
        "streaming", "sse", "async", "await",
        "index", "indexing", "search", "query",
        "file", "files", "scan", "scanner",
        "error", "exception", "logging", "log",
        "cache", "caching", "memory", "storage",
        "prompt", "context", "conversation", "history", "session",
    }
)

# Minimum meaningful-word count thresholds.
_MIN_WORDS_FOR_VALID: int = 4
_MIN_WORDS_FOR_VAGUE: int = 2
_MIN_CHARS: int = 3


# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------


def _normalize(text: str) -> str:
    """Lowercase and strip excess whitespace."""
    return " ".join(text.lower().split())


def _extract_words(text: str) -> List[str]:
    """Split query into lowercase alphanumeric tokens."""
    return re.findall(r"[a-z][a-z0-9\-_]*", text.lower())


def _is_greeting(normalized: str) -> bool:
    """Return True if the entire query is a social greeting."""
    cleaned = re.sub(r"[!?.,]+$", "", normalized).strip()
    return cleaned in _GREETINGS


def _count_meaningful_words(words: List[str]) -> int:
    """Count words that are not in the generic stopword set."""
    return sum(1 for w in words if w not in _GENERIC_WORDS)


def _contains_code_keyword(words: List[str]) -> bool:
    """Return True if at least one code-domain keyword is present."""
    return any(w in _CODE_KEYWORDS for w in words)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class QueryEvaluator:
    """
    Evaluates whether a user query is suitable for RAG retrieval.

    Usage
    -----
    evaluator = QueryEvaluator()
    result = evaluator.evaluate("How does the FAISS search work?")

    if not result.is_valid:
        # Return a user-friendly fallback; skip retrieval.
        ...
    elif result.needs_rewriting:
        # Pass to the query rewriter before retrieval.
        ...
    else:
        # Forward directly to the retriever.
        ...
    """

    def evaluate(self, query: str) -> QueryEvaluationResult:
        """
        Evaluate a user query and return a structured result.

        Args:
            query: The raw user question string.

        Returns:
            QueryEvaluationResult describing validity, rewriting need,
            intent, and a human-readable reason.
        """
        # --- Guard: empty / whitespace -----------------------------------
        if not query or not query.strip():
            result = QueryEvaluationResult(
                is_valid=False,
                needs_rewriting=False,
                intent=QueryIntent.EMPTY,
                reason="The query is empty. Please ask a question about the repository.",
            )
            logger.debug("Query evaluation: EMPTY")
            return result

        normalized = _normalize(query)

        # --- Check: social greeting --------------------------------------
        if _is_greeting(normalized):
            result = QueryEvaluationResult(
                is_valid=False,
                needs_rewriting=False,
                intent=QueryIntent.GREETING,
                reason=(
                    "This looks like a greeting rather than a repository question. "
                    "Try asking something like 'How does the authentication work?' or "
                    "'Where is the FAISS index built?'"
                ),
            )
            logger.debug("Query evaluation: GREETING -- '%s'", normalized[:60])
            return result

        # --- Guard: too short (< _MIN_CHARS chars) -----------------------
        if len(normalized) < _MIN_CHARS:
            result = QueryEvaluationResult(
                is_valid=False,
                needs_rewriting=False,
                intent=QueryIntent.VAGUE,
                reason=(
                    "The query is too short to be meaningful. "
                    "Please provide more context about what you want to know."
                ),
            )
            logger.debug("Query evaluation: VAGUE (too short, %d chars)", len(normalized))
            return result

        words = _extract_words(normalized)
        meaningful_count = _count_meaningful_words(words)
        has_code_keyword = _contains_code_keyword(words)

        # --- Single-word or two-word code keyword ------------------------
        # These are technically valid (user knows the domain) but need
        # rewriting so the retriever gets a richer search string.
        if len(words) <= 2 and has_code_keyword:
            result = QueryEvaluationResult(
                is_valid=True,
                needs_rewriting=True,
                intent=QueryIntent.CODE_KEYWORD,
                reason=(
                    f"Short technical keyword query ('{normalized}'). "
                    "Will expand into a full retrieval query."
                ),
            )
            logger.debug(
                "Query evaluation: CODE_KEYWORD (needs rewriting) -- '%s'", normalized[:60]
            )
            return result

        # --- Vague: few meaningful words and no code keyword -------------
        if meaningful_count < _MIN_WORDS_FOR_VAGUE and not has_code_keyword:
            result = QueryEvaluationResult(
                is_valid=False,
                needs_rewriting=False,
                intent=QueryIntent.VAGUE,
                reason=(
                    "The query is too vague to search the repository effectively. "
                    "Please ask a specific question about the code, "
                    "such as 'How does the embedding generation work?' or "
                    "'Where is the repository cloning implemented?'"
                ),
            )
            logger.debug(
                "Query evaluation: VAGUE (meaningful=%d) -- '%s'",
                meaningful_count,
                normalized[:60],
            )
            return result

        # --- Valid: decide whether rewriting helps -----------------------
        # Queries with fewer than _MIN_WORDS_FOR_VALID meaningful tokens
        # benefit from rewriting (e.g., "where is parser?").
        needs_rewriting = meaningful_count < _MIN_WORDS_FOR_VALID

        result = QueryEvaluationResult(
            is_valid=True,
            needs_rewriting=needs_rewriting,
            intent=QueryIntent.VALID,
            reason="Query is suitable for retrieval.",
        )
        logger.debug(
            "Query evaluation: VALID (needs_rewriting=%s, meaningful=%d) -- '%s'",
            needs_rewriting,
            meaningful_count,
            normalized[:60],
        )
        return result
