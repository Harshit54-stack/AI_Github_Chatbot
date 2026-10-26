"""
Embedding Model — lazy singleton wrapper around a SentenceTransformer model.

Design choices
--------------
* Lazy loading: the model is NOT loaded at import time. The first call to
  EmbeddingModel.get() downloads and caches the model weights.  This keeps
  startup fast and allows the model name to be overridden in settings before
  the first request arrives.
* Thread safety: a threading.Lock ensures the model is initialised exactly
  once even under concurrent requests.
* Configurable: model name and device are read from settings so they can be
  changed via environment variables without touching code.
"""

from __future__ import annotations

import logging
import threading
from typing import List, Optional

import numpy as np
from sentence_transformers import SentenceTransformer

from app.config import settings

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_model: Optional[SentenceTransformer] = None


class EmbeddingModel:
    """
    Singleton wrapper around a SentenceTransformer encoder.

    Usage
    -----
    model = EmbeddingModel.get()
    vectors = model.encode_texts(["hello", "world"])
    """

    # ----------------------------------------------------------------
    # Singleton accessor
    # ----------------------------------------------------------------

    @classmethod
    def get(cls) -> "EmbeddingModel":
        """Return the module-level singleton, loading the model if needed."""
        global _model
        if _model is None:
            with _lock:
                if _model is None:
                    logger.info(
                        "Loading embedding model '%s'…", settings.EMBEDDING_MODEL
                    )
                    _model = SentenceTransformer(settings.EMBEDDING_MODEL)
                    logger.info(
                        "Embedding model loaded. Dimension: %d",
                        cls._get_dimension(_model),
                    )
        return cls(_model)

    @classmethod
    def _get_dimension(cls, model: SentenceTransformer) -> int:
        try:
            return model.get_sentence_embedding_dimension()
        except Exception:
            return 0

    # ----------------------------------------------------------------
    # Instance interface
    # ----------------------------------------------------------------

    def __init__(self, model: SentenceTransformer) -> None:
        self._model = model

    @property
    def model_name(self) -> str:
        return settings.EMBEDDING_MODEL

    @property
    def dimension(self) -> int:
        return EmbeddingModel._get_dimension(self._model)

    def encode_texts(
        self,
        texts: List[str],
        batch_size: int = 32,
        show_progress_bar: bool = False,
    ) -> np.ndarray:
        """
        Encode a list of text strings into L2-normalised float32 vectors.

        Args:
            texts:             Texts to embed.
            batch_size:        Number of texts per encoder forward pass.
            show_progress_bar: If True, tqdm bar is shown (useful for CLI).

        Returns:
            ndarray of shape (len(texts), dimension), dtype float32.
        """
        if not texts:
            return np.empty((0, self.dimension), dtype=np.float32)

        vectors = self._model.encode(
            texts,
            batch_size=batch_size,
            normalize_embeddings=True,   # L2-normalise for cosine similarity
            show_progress_bar=show_progress_bar,
            convert_to_numpy=True,
        )
        return vectors.astype(np.float32)
