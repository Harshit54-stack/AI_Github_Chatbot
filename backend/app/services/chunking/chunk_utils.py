"""
Chunk utilities — shared helpers used across the chunking pipeline.

Functions here are pure / side-effect-free so they are easy to unit-test.
"""

from __future__ import annotations

import hashlib
import re
from pathlib import Path
from typing import List, Optional


# ---------------------------------------------------------------------------
# Chunk-ID generation
# ---------------------------------------------------------------------------


def make_chunk_id(repository_name: str, file_path: str, symbol_name: str, start_line: int) -> str:
    """
    Generate a stable, deterministic chunk ID.

    Uses SHA-256 over the composite key so IDs are consistent across
    re-runs of the chunking pipeline (useful for deduplication in Phase 5).

    Args:
        repository_name: Name of the repository.
        file_path:        Relative file path within the repo.
        symbol_name:      Name of the function, class, section, or file.
        start_line:       Line number where the chunk starts.

    Returns:
        16-character hex prefix of the SHA-256 digest.
    """
    raw = f"{repository_name}::{file_path}::{symbol_name}::{start_line}"
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Content helpers
# ---------------------------------------------------------------------------


def read_lines(file_path: Path, start: int, end: int) -> str:
    """
    Read lines [start, end] (1-indexed, inclusive) from a file.

    Falls back to an empty string on I/O errors so a single unreadable
    file never aborts the entire chunking run.

    Args:
        file_path: Absolute path to the file.
        start:     First line to read (1-indexed).
        end:       Last line to read (1-indexed, inclusive).

    Returns:
        The extracted lines joined by newlines.
    """
    try:
        all_lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
        # Clamp to valid range
        s = max(0, start - 1)
        e = min(len(all_lines), end)
        return "\n".join(all_lines[s:e])
    except (OSError, PermissionError):
        return ""


def read_full_file(file_path: Path) -> str:
    """Read the entire file as a string, returning empty string on error."""
    try:
        return file_path.read_text(encoding="utf-8", errors="replace")
    except (OSError, PermissionError):
        return ""


# ---------------------------------------------------------------------------
# Markdown helpers
# ---------------------------------------------------------------------------

# Matches lines that begin a Markdown heading (# / ## / ###)
_HEADING_RE = re.compile(r"^(#{1,3})\s+(.+)$", re.MULTILINE)


def split_markdown_sections(content: str) -> List[dict]:
    """
    Split Markdown content into sections at heading boundaries (#, ##, ###).

    Each section is a dict with:
        heading  – the heading text (e.g. "Installation")
        level    – heading depth (1, 2, or 3)
        body     – full text of the section including the heading line
        start    – 1-indexed start line
        end      – 1-indexed end line

    A leading block before the first heading is treated as a preamble
    section with heading "Introduction".
    """
    lines = content.splitlines()
    sections: List[dict] = []
    current_start = 1
    current_heading = "Introduction"
    current_level = 1
    current_body: List[str] = []

    for i, line in enumerate(lines, start=1):
        m = _HEADING_RE.match(line)
        if m and i > 1:
            # Save previous section
            if current_body:
                sections.append({
                    "heading": current_heading,
                    "level": current_level,
                    "body": "\n".join(current_body),
                    "start": current_start,
                    "end": i - 1,
                })
            current_heading = m.group(2).strip()
            current_level = len(m.group(1))
            current_start = i
            current_body = [line]
        else:
            current_body.append(line)

    # Flush last section
    if current_body:
        sections.append({
            "heading": current_heading,
            "level": current_level,
            "body": "\n".join(current_body),
            "start": current_start,
            "end": len(lines),
        })

    return sections


# ---------------------------------------------------------------------------
# Language helpers
# ---------------------------------------------------------------------------


def language_from_extension(ext: str) -> str:
    """Map a file extension to a display language name."""
    _MAP = {
        ".py": "Python",
        ".js": "JavaScript",
        ".jsx": "React (JSX)",
        ".ts": "TypeScript",
        ".tsx": "React (TSX)",
        ".java": "Java",
        ".cpp": "C++",
        ".c": "C",
        ".cs": "C#",
        ".go": "Go",
        ".rs": "Rust",
        ".md": "Markdown",
        ".txt": "Text",
    }
    return _MAP.get(ext.lower(), ext.lstrip(".").upper())


def sanitize_symbol_name(name: Optional[str]) -> str:
    """Return a clean display name, falling back to '<anonymous>'."""
    return (name or "").strip() or "<anonymous>"
