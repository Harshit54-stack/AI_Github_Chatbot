"""
Abstract base class for all language-specific analyzers.

Every concrete analyzer must implement parse() and return a ParsedFile.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from pathlib import Path

from app.models.parsed_file import ParsedFile


class BaseAnalyzer(ABC):
    """
    Interface for language analyzers.

    Subclasses receive a Tree-sitter Language object at construction time
    and expose a single parse() method.
    """

    def __init__(self, language: object) -> None:
        self._language = language

    @abstractmethod
    def parse(self, file_path: Path, relative_path: str) -> ParsedFile:
        """
        Parse *file_path* and return structured metadata.

        Args:
            file_path:     Absolute path to the source file.
            relative_path: Path relative to the repository root (for display).

        Returns:
            A fully populated ParsedFile instance.
        """

    # ------------------------------------------------------------------
    # Shared helpers available to all subclasses
    # ------------------------------------------------------------------

    @staticmethod
    def _read_bytes(file_path: Path) -> bytes:
        """Read file contents as bytes, falling back to empty on error."""
        try:
            return file_path.read_bytes()
        except (OSError, PermissionError):
            return b""

    @staticmethod
    def _line_count(content: bytes) -> int:
        """Count newlines in raw bytes."""
        return content.count(b"\n") + (1 if content else 0)

    @staticmethod
    def _node_text(node, source: bytes) -> str:
        """Extract the UTF-8 text for a tree-sitter node."""
        return source[node.start_byte:node.end_byte].decode("utf-8", errors="replace")
