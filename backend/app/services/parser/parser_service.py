"""
Parser service — orchestrates the full repository parse pipeline.

Workflow
--------
1. Discover all supported source files in the repository directory.
2. Dispatch each file to the correct language analyzer via the factory.
3. Collect ParsedFile results into a RepositoryIndex.
4. Store the index in the in-memory singleton.
5. Return a ParseSummary to the API layer.

Heavy I/O is done synchronously; the API route wraps this in
asyncio.to_thread to avoid blocking the event loop.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from app.models.parsed_file import ParsedFile, ParseSummary
from app.services.file_scanner import SUPPORTED_EXTENSIONS, IGNORED_DIRS
from app.services.parser.parser_factory import get_analyzer
from app.services.parser.repository_index import RepositoryIndex, store_index

logger = logging.getLogger(__name__)

# Only parse code files — skip Markdown/Text for the AST index
_PARSEABLE_EXTENSIONS = frozenset(
    ext for ext in SUPPORTED_EXTENSIONS if ext not in (".md", ".txt")
)


def _is_ignored(path: Path) -> bool:
    """Return True if the path passes through an ignored directory."""
    return any(part in IGNORED_DIRS for part in path.parts)


def parse_repository(repo_dir: Path, repository_name: str) -> ParseSummary:
    """
    Parse every supported source file under *repo_dir* and build the index.

    Args:
        repo_dir:        Absolute path to the cloned repository root.
        repository_name: Human-readable name stored in the index.

    Returns:
        A ParseSummary with aggregate statistics.
    """
    parsed_files: List[ParsedFile] = []
    skipped = 0

    logger.info("Starting parse of '%s' at %s", repository_name, repo_dir)

    for file_path in sorted(repo_dir.rglob("*")):
        if not file_path.is_file():
            continue
        if _is_ignored(file_path):
            continue

        ext = file_path.suffix.lower()
        if ext not in _PARSEABLE_EXTENSIONS:
            continue

        relative_path = file_path.relative_to(repo_dir).as_posix()
        analyzer = get_analyzer(ext)

        if analyzer is None:
            skipped += 1
            logger.debug("No analyzer for %s — skipped", relative_path)
            continue

        try:
            parsed = analyzer.parse(file_path, relative_path)
            parsed_files.append(parsed)
        except Exception as exc:
            skipped += 1
            logger.warning("Failed to parse %s: %s", relative_path, exc)

    # Build and store the index
    index = RepositoryIndex(repository_name=repository_name, files=parsed_files)
    store_index(index)

    languages = sorted({f.language for f in parsed_files})
    total_classes = sum(len(f.classes) for f in parsed_files)
    total_functions = sum(
        len(f.functions) + sum(len(c.methods) for c in f.classes)
        for f in parsed_files
    )

    logger.info(
        "Parse complete — files=%d classes=%d functions=%d languages=%s skipped=%d",
        len(parsed_files),
        total_classes,
        total_functions,
        languages,
        skipped,
    )

    return ParseSummary(
        status="success",
        files_parsed=len(parsed_files),
        classes=total_classes,
        functions=total_functions,
        languages=languages,
    )
