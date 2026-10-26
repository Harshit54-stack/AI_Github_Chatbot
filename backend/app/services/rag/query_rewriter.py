"""
Query Rewriter -- Phase 8: Query Intelligence.

Transforms a user query into a clearer, retrieval-oriented query before
it is encoded and sent to the FAISS vector index.

Design goals
------------
* Uses the existing Gemini GenerativeModel (same pattern as rag_service).
  Does NOT create a second API client or duplicate configuration.
* Fail-safe: any exception (API failure, timeout, bad response) causes
  the rewriter to return the original query unchanged. The RAG pipeline
  is never broken by a rewriting failure.
* Focused prompt: the rewriter is strictly instructed to rephrase -- it
  must NOT answer the question or invent repository details.
* Multi-turn aware: optionally receives recent conversation history so
  that follow-up queries like "how does it work?" can be resolved in
  the context of the previous exchange.
* Configurable: the rewriting prompt is a module-level constant that can
  be adjusted without changing business logic.
"""

from __future__ import annotations

import logging
from typing import List, Optional

import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Rewriting prompt template
# ---------------------------------------------------------------------------

_REWRITE_SYSTEM_INSTRUCTION = """\
You are a search query optimizer for a code repository assistant.

Your ONLY job is to rewrite the user's query into a clear, specific,
retrieval-oriented question that can be used to search a code repository.

Rules you MUST follow:
1. Do NOT answer the question.
2. Do NOT mention specific file names or class names unless the user already did.
3. Do NOT invent repository details.
4. Output ONLY the rewritten query -- nothing else, no explanation, no preamble.
5. Keep the rewritten query concise (one or two sentences maximum).
6. Preserve the user's original intent faithfully.
7. Make the query concrete enough to retrieve relevant code chunks.

If the query already clearly states what it wants, return it unchanged.
"""

_REWRITE_USER_TEMPLATE = """\
Conversation so far (last few turns, may be empty):
{history_text}

User's current query:
{query}

Rewritten retrieval query:"""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _get_gemini_model() -> genai.GenerativeModel:
    """
    Configure and return a Gemini GenerativeModel for rewriting.

    Follows the exact same pattern used in rag_service.py so we never
    create a second API client or duplicated configuration.

    Raises:
        ValueError: If GEMINI_API_KEY is not configured.
    """
    if not settings.GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is not set. Cannot use Gemini for query rewriting."
        )
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel(settings.GEMINI_MODEL)


def _format_history(history: Optional[List[dict]], max_turns: int = 3) -> str:
    """
    Convert a Gemini-format history list into a short text summary.

    Only the most recent `max_turns` exchanges are included to keep the
    rewriting prompt compact.

    Args:
        history: List of {"role": "user"/"model", "parts": [str]} dicts.
        max_turns: Maximum number of (user, model) pairs to include.

    Returns:
        A multi-line string, or "(none)" if history is empty.
    """
    if not history:
        return "(none)"

    # Keep at most max_turns * 2 individual messages (pairs of user/model).
    recent = history[-(max_turns * 2):]

    lines: List[str] = []
    for msg in recent:
        role = msg.get("role", "user")
        parts = msg.get("parts", [])
        text = parts[0] if parts else ""
        # Truncate long messages so we do not blow up the prompt.
        if len(text) > 200:
            text = text[:200] + "..."
        lines.append(f"{role.capitalize()}: {text}")

    return "\n".join(lines) if lines else "(none)"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class QueryRewriter:
    """
    Rewrites a user query into a clearer, retrieval-oriented query.

    Usage
    -----
    rewriter = QueryRewriter()
    rewritten = rewriter.rewrite(
        query="how does it work?",
        conversation_history=[...],  # from conversation_manager
    )
    # rewritten => "Explain how the repository's core implementation works..."
    """

    def rewrite(
        self,
        query: str,
        conversation_history: Optional[List[dict]] = None,
    ) -> str:
        """
        Rewrite *query* using Gemini, guided by conversation history.

        If Gemini is unavailable or any error occurs, the original query
        is returned unchanged so the RAG pipeline continues normally.

        Args:
            query:                The user's raw question string.
            conversation_history: Gemini-format message list from
                                  conversation_manager (may be None or []).

        Returns:
            The rewritten query string, or the original query on failure.
        """
        # Short-circuit: blank query is passed through unchanged (the
        # evaluator should have blocked it, but be defensive here).
        if not query or not query.strip():
            return query

        history_text = _format_history(conversation_history)

        prompt = _REWRITE_USER_TEMPLATE.format(
            history_text=history_text,
            query=query.strip(),
        )

        logger.info("QueryRewriter | original: %s", query[:120])

        try:
            model = _get_gemini_model()
            # Use a fresh chat with only the system instruction as context.
            chat = model.start_chat(
                history=[
                    {"role": "user", "parts": [_REWRITE_SYSTEM_INSTRUCTION]},
                    {"role": "model", "parts": ["Understood. I will only output the rewritten retrieval query."]},
                ]
            )
            response = chat.send_message(prompt)
            rewritten = response.text.strip()

            # Sanity checks -- if Gemini returns something unexpected,
            # fall back to the original.
            if not rewritten:
                logger.warning("QueryRewriter | Gemini returned empty response; using original.")
                return query

            if len(rewritten) > 600:
                logger.warning(
                    "QueryRewriter | Rewritten query too long (%d chars); using original.",
                    len(rewritten),
                )
                return query

            logger.info("QueryRewriter | rewritten: %s", rewritten[:120])
            return rewritten

        except ValueError as exc:
            # Missing API key -- expected in dev without credentials.
            logger.warning("QueryRewriter | Gemini not configured (%s); using original query.", exc)
            return query
        except Exception as exc:  # noqa: BLE001
            # Any other API / network error -- degrade gracefully.
            logger.warning(
                "QueryRewriter | Gemini rewriting failed (%s: %s); using original query.",
                type(exc).__name__,
                exc,
            )
            return query
