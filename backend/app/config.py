"""
Application configuration module.
Loads environment variables and exposes typed settings.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

# Absolute path to the backend/ directory (parent of app/)
_BASE_DIR = Path(__file__).resolve().parent.parent


class Settings:
    APP_NAME: str = "AI GitHub Repository Assistant"
    APP_VERSION: str = "0.7.0"
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # CORS
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://localhost:3000",
    ]

    # Google Gemini
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")

    # Repository storage — backend/repositories/
    REPOS_DIR: Path = _BASE_DIR / "repositories"

    # Embedding (Phase 5)
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-base-en-v1.5")
    EMBEDDING_BATCH_SIZE: int = int(os.getenv("EMBEDDING_BATCH_SIZE", "32"))
    EMBEDDING_MAX_CHARS: int = int(os.getenv("EMBEDDING_MAX_CHARS", "8192"))

    # Vector Store (Phase 6)
    VECTOR_STORE_DIR: Path = _BASE_DIR / "vector_store"
    VECTOR_TOP_K_DEFAULT: int = int(os.getenv("VECTOR_TOP_K_DEFAULT", "5"))
    # "cosine" uses L2-normalised IndexFlatIP (inner product ≡ cosine similarity)
    VECTOR_SIMILARITY_METRIC: str = os.getenv("VECTOR_SIMILARITY_METRIC", "cosine")

    # RAG Pipeline (Phase 7)
    RAG_TOP_K: int = int(os.getenv("RAG_TOP_K", "5"))
    RAG_MAX_CONTEXT_CHARS: int = int(os.getenv("RAG_MAX_CONTEXT_CHARS", "24000"))
    RAG_MAX_HISTORY_TURNS: int = int(os.getenv("RAG_MAX_HISTORY_TURNS", "6"))
    RAG_MIN_SCORE: float = float(os.getenv("RAG_MIN_SCORE", "0.0"))

    # Hybrid Search (Phase 9)
    # -------------------------------------------------------------------------
    # BM25_TOP_K      — keyword search candidates before fusion.
    # FAISS_CANDIDATE_TOP_K — semantic search candidates before fusion.
    #                   Using more candidates pre-fusion gives the merger more
    #                   material to work with before trimming to HYBRID_FINAL_TOP_K.
    # HYBRID_FINAL_TOP_K — final number of chunks returned after fusion.
    # HYBRID_SEMANTIC_WEIGHT — alpha for FAISS score in weighted combination:
    #   final_score = alpha * faiss_norm + (1 - alpha) * bm25_norm
    #   0.7 / 0.3 is a pragmatic starting point that emphasises semantics.
    #   Can be tuned via environment variable without code changes.
    BM25_TOP_K: int = int(os.getenv("BM25_TOP_K", "10"))
    FAISS_CANDIDATE_TOP_K: int = int(os.getenv("FAISS_CANDIDATE_TOP_K", "10"))
    HYBRID_FINAL_TOP_K: int = int(os.getenv("HYBRID_FINAL_TOP_K", "5"))
    HYBRID_SEMANTIC_WEIGHT: float = float(os.getenv("HYBRID_SEMANTIC_WEIGHT", "0.7"))

    # Advanced RAG & Reranking (Phase 10)
    # -------------------------------------------------------------------------
    # RERANKER_MODEL — lightweight cross-encoder model for relevance re-scoring.
    # RERANKER_ENABLED — toggle to enable/disable cross-encoder reranking.
    # RERANKER_CANDIDATE_TOP_K — number of candidate chunks fetched from hybrid
    #                            retrieval before reranking.
    # RERANKER_TOP_K_DEFAULT — default final number of chunks after reranking.
    RERANKER_MODEL: str = os.getenv("RERANKER_MODEL", "cross-encoder/ms-marco-MiniLM-L-6-v2")
    RERANKER_ENABLED: bool = os.getenv("RERANKER_ENABLED", "true").lower() == "true"
    RERANKER_CANDIDATE_TOP_K: int = int(os.getenv("RERANKER_CANDIDATE_TOP_K", "15"))
    RERANKER_TOP_K_DEFAULT: int = int(os.getenv("RERANKER_TOP_K_DEFAULT", "5"))


settings = Settings()

# Ensure storage directories always exist on startup
settings.REPOS_DIR.mkdir(parents=True, exist_ok=True)
settings.VECTOR_STORE_DIR.mkdir(parents=True, exist_ok=True)
