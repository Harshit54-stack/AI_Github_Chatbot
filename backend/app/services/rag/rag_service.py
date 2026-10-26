"""
RAG Service — Phase 7 + Phase 8 + Phase 9 + Phase 10: full pipeline orchestrator.

Wires together (Phase 7):
    retriever → context_manager → prompt_builder → Gemini → response_formatter

Phase 8 additions:
    QueryEvaluator  — validates the query before retrieval.
    QueryRewriter   — rephrases vague/short queries for better recall.

Phase 9 additions:
    HybridRetriever — combines BM25 keyword search with FAISS semantic
                      search, normalises scores, fuses results.

Phase 10 additions:
    Reranker        — cross-encoder re-scoring of candidate chunks,
                      producing high-precision relevance ordering before
                      context building.

Exposes two execution modes:
    answer()        — blocking, returns a complete RAGResponse.
    answer_stream() — async generator, yields SSE-compatible JSON strings.

Gemini integration
------------------
* Uses google-generativeai SDK with model name from settings.GEMINI_MODEL.
* Blocking SDK calls are run in asyncio.to_thread() to keep the FastAPI
  event loop free.
* For streaming, we use model.generate_content(..., stream=True) and
  yield each chunk as a JSON-encoded SSE data line.
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from collections.abc import AsyncIterator
from typing import Optional

import google.generativeai as genai

from app.config import settings
from app.models.rag_models import RAGRequest, RAGResponse, SourceReference
from app.services.rag import context_manager as ctx_mgr
from app.services.rag import conversation_manager as conv_mgr
from app.services.rag import prompt_builder as pb
from app.services.rag import response_formatter as fmt
from app.services.rag.hybrid_retriever import hybrid_retrieve
from app.services.rag.query_evaluator import QueryEvaluator
from app.services.rag.query_rewriter import QueryRewriter
from app.services.rag.reranker import rerank
from app.services.rag.retriever import RetrievedChunk, retrieve

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Phase 8: module-level singletons (cheap — no model loading on import)
# ---------------------------------------------------------------------------

_evaluator = QueryEvaluator()
_rewriter = QueryRewriter()


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------


def _get_model() -> genai.GenerativeModel:
    """Configure and return the Gemini GenerativeModel singleton."""
    if not settings.GEMINI_API_KEY:
        raise ValueError(
            "GEMINI_API_KEY is not set. Add it to your .env file."
        )
    genai.configure(api_key=settings.GEMINI_API_KEY)
    return genai.GenerativeModel(settings.GEMINI_MODEL)


def _call_gemini(messages: list[dict]) -> str:
    """Blocking call to Gemini (runs inside asyncio.to_thread)."""
    model = _get_model()
    chat = model.start_chat(history=messages[:-1])
    last_user_text = messages[-1]["parts"][0]
    response = chat.send_message(last_user_text)
    return response.text


def _call_gemini_stream(messages: list[dict]):
    """Blocking streaming call (yields Gemini response chunks synchronously)."""
    model = _get_model()
    chat = model.start_chat(history=messages[:-1])
    last_user_text = messages[-1]["parts"][0]
    return chat.send_message(last_user_text, stream=True)


# ---------------------------------------------------------------------------
# Retrieval + prompt construction (shared)
# ---------------------------------------------------------------------------


def _pipeline_retrieve_and_build(
    request: RAGRequest,
) -> tuple[list[RetrievedChunk], list[RetrievedChunk], str, list[dict], str]:
    """
    Run retrieval → context building → prompt construction.

    Phase 8 additions (happen BEFORE retrieval):
        1. Query Evaluation — rejects empty/greeting/vague queries early.
        2. Query Rewriting  — enriches short/telegraphic queries so the
           FAISS search gets a better vector to match against.

    Returns:
        (all_chunks, included_chunks, context_str, messages, session_id)

    Raises:
        RuntimeError: If the query is evaluated as invalid (callers must
            catch this and return an appropriate user-facing response).
    """
    session = conv_mgr.get_or_create(request.session_id, request.repository)
    session_id = session.session_id

    # ------------------------------------------------------------------
    # Phase 8 — Step A: Query Evaluation
    # ------------------------------------------------------------------
    evaluation = _evaluator.evaluate(request.question)
    logger.info(
        "Query evaluation | valid=%s rewrite=%s intent=%s | '%s'",
        evaluation.is_valid,
        evaluation.needs_rewriting,
        evaluation.intent.value,
        request.question[:80],
    )

    if not evaluation.is_valid:
        # Build a polite fallback response using a Gemini-free path so
        # that the existing SSE pipeline is not broken.  We raise a
        # RuntimeError here; callers (answer / answer_stream) already
        # catch RuntimeError and map it to an appropriate HTTP / SSE error.
        raise RuntimeError(evaluation.reason)

    # ------------------------------------------------------------------
    # Phase 8 — Step B: Query Rewriting
    # ------------------------------------------------------------------
    if evaluation.needs_rewriting:
        # Pass recent history so the rewriter can resolve pronouns.
        effective_query = _rewriter.rewrite(
            query=request.question,
            conversation_history=session.get_history(),
        )
    else:
        effective_query = request.question

    logger.info(
        "Effective query for retrieval | '%s'",
        effective_query[:120],
    )

    # ------------------------------------------------------------------
    # Phase 9 — Step 1: Hybrid Retrieval (BM25 + FAISS -> Fusion)
    # Fetch a wider candidate set for cross-encoder reranking.
    # ------------------------------------------------------------------
    candidate_k = (
        max(request.top_k, settings.RERANKER_CANDIDATE_TOP_K)
        if settings.RERANKER_ENABLED
        else request.top_k
    )
    candidates = hybrid_retrieve(
        query=effective_query,
        repository_name=request.repository,
        top_k=candidate_k,
    )

    # ------------------------------------------------------------------
    # Phase 10 — Step 2: Cross-Encoder Reranking
    # Re-scores candidate chunks with deep cross-attention and selects
    # the best relevant top-K chunks for context building.
    # ------------------------------------------------------------------
    all_chunks = rerank(
        query=effective_query,
        candidates=candidates,
        top_k=request.top_k,
    )

    # ------------------------------------------------------------------
    # Phase 7 — Step 2: Build context + prompt (unchanged)
    # ------------------------------------------------------------------
    # Note: the original question (not the rewritten one) is shown to the
    # user in the prompt so Gemini's answer feels natural.
    if all_chunks:
        context_str, included_chunks = ctx_mgr.build_context(all_chunks)
        messages = pb.build_messages(
            context=context_str,
            question=request.question,
            history=session.get_history(),
            repository_name=request.repository,
        )
    else:
        included_chunks = []
        context_str = ""
        messages = pb.build_no_context_message(request.question)

    return all_chunks, included_chunks, context_str, messages, session_id


# ---------------------------------------------------------------------------
# Non-streaming answer
# ---------------------------------------------------------------------------


async def answer(request: RAGRequest) -> RAGResponse:
    """
    Full RAG pipeline — returns a complete RAGResponse.

    Args:
        request: RAGRequest with repository, question, top_k, session_id.

    Returns:
        RAGResponse with answer, sources, confidence, session_id.
    """
    t_start = time.perf_counter()

    all_chunks, included_chunks, _, messages, session_id = (
        _pipeline_retrieve_and_build(request)
    )

    # Call Gemini in a thread
    try:
        gemini_text = await asyncio.to_thread(_call_gemini, messages)
    except Exception as exc:
        logger.error("Gemini API error: %s", exc)
        raise

    elapsed_ms = (time.perf_counter() - t_start) * 1000

    # Persist turn to history
    session = conv_mgr.get_session(session_id)
    if session:
        session.append_turn(request.question, gemini_text)

    return fmt.format_response(
        gemini_text=gemini_text,
        included_chunks=included_chunks,
        session_id=session_id,
        elapsed_ms=elapsed_ms,
    )


# ---------------------------------------------------------------------------
# Streaming answer (SSE)
# ---------------------------------------------------------------------------


async def answer_stream(request: RAGRequest) -> AsyncIterator[str]:
    """
    Streaming RAG pipeline — yields JSON-encoded SSE event strings.

    Event types:
        {"type": "chunk",   "text": "..."}       ← incremental answer token
        {"type": "sources", "sources": [...]}     ← after full text
        {"type": "done",    "confidence": 0.92,
                            "retrieved_chunks": 5,
                            "session_id": "..."}  ← final event
        {"type": "error",   "message": "..."}     ← on failure

    Args:
        request: RAGRequest with repository, question, top_k, session_id.

    Yields:
        JSON-encoded strings (one per SSE data line).
    """
    t_start = time.perf_counter()

    try:
        all_chunks, included_chunks, _, messages, session_id = (
            _pipeline_retrieve_and_build(request)
        )
    except RuntimeError as exc:
        yield json.dumps({"type": "error", "message": str(exc)})
        return

    # --- Stream Gemini tokens -------------------------------------------
    full_text_parts: list[str] = []

    try:
        # get_content_stream must run in a thread because SDK is synchronous
        stream_response = await asyncio.to_thread(
            _call_gemini_stream, messages
        )

        # Iterate stream chunks — each chunk.text is a token fragment
        def _collect_stream():
            parts = []
            for chunk in stream_response:
                text = getattr(chunk, "text", "") or ""
                parts.append(text)
            return parts

        token_parts = await asyncio.to_thread(_collect_stream)

        for text in token_parts:
            if text:
                full_text_parts.append(text)
                yield json.dumps({"type": "chunk", "text": text})
                await asyncio.sleep(0)  # yield control to event loop

    except Exception as exc:
        logger.error("Gemini streaming error: %s", exc)
        yield json.dumps({"type": "error", "message": "AI service error. Please try again."})
        return

    full_text = "".join(full_text_parts).strip()
    elapsed_ms = (time.perf_counter() - t_start) * 1000

    # Persist to history
    session = conv_mgr.get_session(session_id)
    if session:
        session.append_turn(request.question, full_text)

    # --- Sources event --------------------------------------------------
    sources = [
        SourceReference(
            file=c.file_path,
            symbol_name=c.symbol_name,
            chunk_type=c.chunk_type,
            language=c.language,
            start_line=c.start_line,
            end_line=c.end_line,
            score=c.score,
        ).model_dump()
        for c in included_chunks
    ]
    yield json.dumps({"type": "sources", "sources": sources})

    # --- Done event -----------------------------------------------------
    from app.services.rag.response_formatter import _compute_confidence
    confidence = _compute_confidence(included_chunks)

    yield json.dumps({
        "type": "done",
        "confidence": confidence,
        "retrieved_chunks": len(included_chunks),
        "session_id": session_id,
        "elapsed_ms": round(elapsed_ms, 2),
    })

    logger.info(
        "Stream complete — session=%s, chunks=%d, confidence=%.3f, %.1f ms.",
        session_id,
        len(included_chunks),
        confidence,
        elapsed_ms,
    )
