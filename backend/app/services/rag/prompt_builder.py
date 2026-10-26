"""
Prompt Builder — Phase 7 RAG.

Constructs the message list that is sent to Gemini's generateContent API.

Message structure
-----------------
1. SYSTEM instruction  — tells the model to answer from context only.
2. CONTEXT block       — formatted repository code from context_manager.
3. HISTORY turns       — previous (user, assistant) pairs (last N turns).
4. USER question       — the current question.

Design notes
------------
* The system instruction is injected as a leading "user" message followed
  by a "model" acknowledgement — this matches the google-generativeai SDK's
  expected format for system-level guidance without using the system_instruction
  kwarg (which is not available in all SDK versions).
* History is trimmed to RAG_MAX_HISTORY_TURNS pairs to keep token usage bounded.
* Raw context and prompt text are never returned to the client.
"""

from __future__ import annotations

from app.config import settings

# ---------------------------------------------------------------------------
# System prompt text
# ---------------------------------------------------------------------------

_SYSTEM_INSTRUCTION = """\
You are an expert software engineer and code analyst assistant.

Your ONLY source of truth is the repository code provided in the context below.

Rules you must follow:
1. Answer questions using ONLY the code snippets and metadata in the provided context.
2. NEVER invent functions, classes, files, or modules that are not present in the context.
3. If the repository context does not contain the answer, say explicitly:
   "The repository does not contain sufficient information to answer this question."
4. When referencing code, always cite the source file and line numbers.
5. Format code using markdown code blocks with the correct language tag.
6. Be concise but thorough. Prefer structured answers (bullet points, numbered steps).
"""

_SYSTEM_ACK = "Understood. I will answer only from the provided repository context."


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

ConversationHistory = list[dict[str, str]]  # [{"role": "user"/"model", "parts": [...]}]


def build_messages(
    context: str,
    question: str,
    history: ConversationHistory | None = None,
    repository_name: str = "",
) -> list[dict]:
    """
    Build the full message list for Gemini's chat API.

    Args:
        context:         Formatted context string from context_manager.
        question:        The user's current question.
        history:         Previous conversation turns (user/model pairs).
        repository_name: Used to personalise the system prompt header.

    Returns:
        List of message dicts compatible with google-generativeai ChatSession.
    """
    history = history or []

    # Trim history to configured limit (in pairs)
    max_turns = settings.RAG_MAX_HISTORY_TURNS
    if len(history) > max_turns * 2:
        history = history[-(max_turns * 2):]

    # --- System preamble ---
    repo_header = (
        f"Repository under analysis: **{repository_name}**\n\n"
        if repository_name
        else ""
    )

    system_user_part = (
        f"{_SYSTEM_INSTRUCTION}\n\n"
        f"{repo_header}"
        f"=== REPOSITORY CONTEXT ===\n\n"
        f"{context}\n\n"
        f"=== END OF CONTEXT ==="
    )

    messages: list[dict] = [
        {"role": "user", "parts": [system_user_part]},
        {"role": "model", "parts": [_SYSTEM_ACK]},
    ]

    # --- Conversation history ---
    messages.extend(history)

    # --- Current question ---
    messages.append({"role": "user", "parts": [question]})

    return messages


def build_no_context_message(question: str) -> list[dict]:
    """
    Fallback prompt when retrieval returns no useful chunks.
    The model is instructed to state that information is unavailable.
    """
    fallback = (
        "You are a repository assistant. "
        "The vector search returned no relevant code chunks for the user's question. "
        "Politely inform the user that the repository does not contain "
        "sufficient context to answer their question, and suggest they "
        "ensure the repository has been parsed, chunked, embedded, and indexed."
    )
    return [
        {"role": "user", "parts": [fallback]},
        {"role": "model", "parts": ["Understood."]},
        {"role": "user", "parts": [question]},
    ]
