"""
RAG sub-package — Phase 7 + Phase 8 + Phase 9 + Phase 10: Retrieval-Augmented Generation pipeline.

Components (Phase 7)
---------------------
retriever          → embed query, search FAISS, return ranked chunks
context_manager    → deduplicate, trim, and format chunks into a context block
prompt_builder     → assemble system + context + history + question
rag_service        → orchestrate the full pipeline, call Gemini
response_formatter → parse Gemini output, attach sources and confidence
conversation_manager → multi-turn session store

Components (Phase 8 — Query Intelligence)
-----------------------------------------
query_evaluator    → rule-based gate: decide if the query is valid/needs rewrite
query_rewriter     → Gemini-powered query rephrasing with graceful fallback

Components (Phase 9 — Hybrid Search)
--------------------------------------
bm25_retriever     → BM25 keyword index built from existing FAISS metadata;
                     searches by exact identifiers, function names, file names
hybrid_retriever   → fuses BM25 + FAISS results via min-max normalisation
                     and weighted score combination; returns candidate list

Components (Phase 10 — Reranking & Advanced RAG)
-------------------------------------------------
reranker           → cross-encoder model (ms-marco-MiniLM-L-6-v2) for deep
                     cross-attention re-scoring and selection of best relevant chunks
"""
