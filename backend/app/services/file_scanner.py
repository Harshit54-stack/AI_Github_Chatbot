"""
File scanner service — recursively walks a cloned repository and collects
metadata about its contents.

Ignored directories
-------------------
.git, node_modules, venv, __pycache__, .idea, .vscode, dist, build, coverage

Supported extensions
--------------------
.py .js .ts .jsx .tsx .java .cpp .c .cs .go .rs .md .txt
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Dict

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

IGNORED_DIRS: frozenset[str] = frozenset(
    {
        ".git",
        "node_modules",
        "venv",
        ".venv",
        "__pycache__",
        ".idea",
        ".vscode",
        "dist",
        "build",
        "coverage",
        ".mypy_cache",
        ".pytest_cache",
        ".tox",
        "eggs",
        ".eggs",
    }
)

# Maps file extension → display language name
SUPPORTED_EXTENSIONS: Dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".jsx": "React (JSX)",
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


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass
class FileEntry:
    """A single source file discovered during scanning."""

    filename: str
    extension: str
    relative_path: str


@dataclass
class TreeNode:
    """A node in the repository directory tree."""

    name: str
    path: str
    node_type: str  # "file" | "dir"
    children: List["TreeNode"] = field(default_factory=list)


@dataclass
class ScanResult:
    """Aggregated result from scanning a repository."""

    repository_name: str
    owner: str
    branch: str
    total_files: int
    supported_files: int
    ignored_files: int
    folder_count: int
    languages: List[str]
    file_entries: List[FileEntry]
    tree: List[TreeNode]


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_ignored_dir(name: str) -> bool:
    """Return True if a directory name should be skipped during scanning."""
    return name in IGNORED_DIRS or name.startswith(".")


def _build_tree(directory: Path, root: Path) -> List[TreeNode]:
    """
    Recursively build a TreeNode list for *directory*.

    Args:
        directory: The directory to walk.
        root:      The repository root (used for computing relative paths).

    Returns:
        List of TreeNode objects representing the direct children of *directory*.
    """
    nodes: List[TreeNode] = []

    try:
        entries = sorted(directory.iterdir(), key=lambda e: (e.is_file(), e.name.lower()))
    except PermissionError:
        return nodes

    for entry in entries:
        rel_path = entry.relative_to(root).as_posix()

        if entry.is_dir():
            if _is_ignored_dir(entry.name):
                continue
            children = _build_tree(entry, root)
            nodes.append(
                TreeNode(
                    name=entry.name,
                    path=rel_path,
                    node_type="dir",
                    children=children,
                )
            )
        else:
            nodes.append(
                TreeNode(
                    name=entry.name,
                    path=rel_path,
                    node_type="file",
                    children=[],
                )
            )

    return nodes


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def scan_repository(
    repo_dir: Path,
    owner: str,
    repo_name: str,
    branch: str,
) -> ScanResult:
    """
    Recursively scan *repo_dir* and return a :class:`ScanResult`.

    Args:
        repo_dir:  Absolute path to the cloned repository root.
        owner:     GitHub organisation / username.
        repo_name: Repository name.
        branch:    Active branch name.

    Returns:
        A fully populated :class:`ScanResult` instance.
    """
    total_files = 0
    ignored_files = 0
    folder_count = 0
    file_entries: List[FileEntry] = []
    detected_languages: set[str] = set()

    logger.info("Scanning repository at %s", repo_dir)

    for item in repo_dir.rglob("*"):
        # Skip ignored directories at every level
        if any(_is_ignored_dir(part) for part in item.parts):
            if item.is_file():
                ignored_files += 1
            continue

        if item.is_dir():
            folder_count += 1
            continue

        # It's a file outside any ignored directory
        total_files += 1
        ext = item.suffix.lower()

        if ext in SUPPORTED_EXTENSIONS:
            lang = SUPPORTED_EXTENSIONS[ext]
            detected_languages.add(lang)
            rel_path = item.relative_to(repo_dir).as_posix()
            file_entries.append(
                FileEntry(
                    filename=item.name,
                    extension=ext,
                    relative_path=rel_path,
                )
            )
        else:
            ignored_files += 1

    tree = _build_tree(repo_dir, repo_dir)

    logger.info(
        "Scan complete — total=%d supported=%d ignored=%d folders=%d languages=%d",
        total_files,
        len(file_entries),
        ignored_files,
        folder_count,
        len(detected_languages),
    )

    return ScanResult(
        repository_name=repo_name,
        owner=owner,
        branch=branch,
        total_files=total_files,
        supported_files=len(file_entries),
        ignored_files=ignored_files,
        folder_count=folder_count,
        languages=sorted(detected_languages),
        file_entries=file_entries,
        tree=tree,
    )
