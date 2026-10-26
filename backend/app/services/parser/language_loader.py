"""
Language loader — imports and caches Tree-sitter Language objects.

Each grammar is loaded once at module level and stored in a registry.
If a grammar package is not installed the language is silently skipped
and callers receive None, allowing graceful degradation.

Supported file extension → (module_name, language_callable) mapping:
  .py   → tree_sitter_python.language
  .js   → tree_sitter_javascript.language
  .jsx  → tree_sitter_javascript.language
  .ts   → tree_sitter_typescript.language_typescript
  .tsx  → tree_sitter_typescript.language_tsx
  .java → tree_sitter_java.language
  .cpp  → tree_sitter_cpp.language
  .c    → tree_sitter_c.language
  .go   → tree_sitter_go.language
  .rs   → tree_sitter_rust.language
"""

from __future__ import annotations

import logging
from typing import Callable, Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Registry: ext → (import_path, attribute_name)
# ---------------------------------------------------------------------------

_GRAMMAR_REGISTRY: Dict[str, Tuple[str, str]] = {
    ".py":   ("tree_sitter_python",     "language"),
    ".js":   ("tree_sitter_javascript", "language"),
    ".jsx":  ("tree_sitter_javascript", "language"),
    ".ts":   ("tree_sitter_typescript", "language_typescript"),
    ".tsx":  ("tree_sitter_typescript", "language_tsx"),
    ".java": ("tree_sitter_java",       "language"),
    ".cpp":  ("tree_sitter_cpp",        "language"),
    ".c":    ("tree_sitter_c",          "language"),
    ".go":   ("tree_sitter_go",         "language"),
    ".rs":   ("tree_sitter_rust",       "language"),
}

# Cache: ext → Language object (or None if unavailable)
_LANGUAGE_CACHE: Dict[str, object] = {}
_CACHE_POPULATED = False


def _load_all() -> None:
    """Attempt to import every registered grammar and cache the Language."""
    global _CACHE_POPULATED

    if _CACHE_POPULATED:
        return

    # Import Language here to avoid a hard dependency at module load time
    try:
        from tree_sitter import Language
    except ImportError:
        logger.error("tree-sitter core package is not installed.")
        _CACHE_POPULATED = True
        return

    for ext, (module_name, attr) in _GRAMMAR_REGISTRY.items():
        if ext in _LANGUAGE_CACHE:
            continue
        try:
            import importlib
            mod = importlib.import_module(module_name)
            lang_fn: Callable = getattr(mod, attr)
            _LANGUAGE_CACHE[ext] = Language(lang_fn())
            logger.debug("Loaded grammar for %s from %s.%s", ext, module_name, attr)
        except ImportError:
            logger.warning("Grammar package '%s' is not installed — %s files will use generic analysis.", module_name, ext)
            _LANGUAGE_CACHE[ext] = None
        except Exception as exc:
            logger.warning("Failed to load grammar for %s: %s", ext, exc)
            _LANGUAGE_CACHE[ext] = None

    _CACHE_POPULATED = True


def get_language(ext: str) -> Optional[object]:
    """
    Return the cached Tree-sitter Language for the given file extension.

    Args:
        ext: Lower-cased file extension including the dot (e.g. '.py').

    Returns:
        A tree_sitter.Language instance, or None if the grammar is unavailable.
    """
    _load_all()
    return _LANGUAGE_CACHE.get(ext)


def supported_extensions() -> list[str]:
    """Return list of extensions for which a grammar is registered."""
    return list(_GRAMMAR_REGISTRY.keys())
