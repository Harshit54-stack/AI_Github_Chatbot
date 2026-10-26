"""
Parser factory — maps file extensions to the correct BaseAnalyzer instance.

This is the single place where extension → analyzer binding lives.
Adding a new language only requires:
  1. Installing the tree-sitter-<lang> grammar package.
  2. Adding an entry to language_loader._GRAMMAR_REGISTRY.
  3. Adding a case here (or reusing GenericAnalyzer).
"""

from __future__ import annotations

import logging
from typing import Optional

from app.services.analyzers.base_analyzer import BaseAnalyzer
from app.services.analyzers.python_analyzer import PythonAnalyzer
from app.services.analyzers.javascript_analyzer import JavaScriptAnalyzer
from app.services.analyzers.typescript_analyzer import TypeScriptAnalyzer
from app.services.analyzers.generic_analyzer import GenericAnalyzer
from app.services.parser.language_loader import get_language

logger = logging.getLogger(__name__)


def get_analyzer(ext: str) -> Optional[BaseAnalyzer]:
    """
    Return the appropriate analyzer for the given file extension.

    Args:
        ext: Lower-cased file extension including the dot (e.g. '.py').

    Returns:
        A concrete BaseAnalyzer instance, or None if the extension is
        not supported or the grammar package is not installed.
    """
    language = get_language(ext)

    # Deep analyzers (full AST walking)
    if ext == ".py":
        if language is None:
            logger.warning("Python grammar unavailable — skipping .py files.")
            return None
        return PythonAnalyzer(language)

    if ext in (".js", ".jsx"):
        if language is None:
            logger.warning("JavaScript grammar unavailable — skipping %s files.", ext)
            return None
        lang_name = "JavaScript" if ext == ".js" else "React (JSX)"
        return JavaScriptAnalyzer(language, lang_name=lang_name)

    if ext in (".ts", ".tsx"):
        if language is None:
            logger.warning("TypeScript grammar unavailable — skipping %s files.", ext)
            return None
        lang_name = "TypeScript" if ext == ".ts" else "React (TSX)"
        return TypeScriptAnalyzer(language, lang_name=lang_name)

    # Generic analyzers (shallow AST)
    _GENERIC_MAP = {
        ".java": "Java",
        ".cpp":  "C++",
        ".c":    "C",
        ".go":   "Go",
        ".rs":   "Rust",
    }
    if ext in _GENERIC_MAP:
        lang_name = _GENERIC_MAP[ext]
        return GenericAnalyzer(language, lang_name=lang_name)

    # Plain-text files — no parsing, just metadata
    _TEXT_MAP = {
        ".md":  "Markdown",
        ".txt": "Text",
    }
    if ext in _TEXT_MAP:
        lang_name = _TEXT_MAP[ext]
        return GenericAnalyzer(None, lang_name=lang_name)

    return None
