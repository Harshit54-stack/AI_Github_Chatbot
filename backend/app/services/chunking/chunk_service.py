"""
Chunk Service — orchestrates the full chunking pipeline.

Workflow
--------
1. Read the RepositoryIndex from Phase 3 (parser singleton).
2. Also scan the repository for Markdown / plain-text files that the
   Phase 3 parser intentionally skipped.
3. Run ChunkFactory.build() on every file.
4. Store the resulting ChunkIndex in the chunk_storage singleton.
5. Return a GenerateResponse for the API layer.

This service is completely independent of Tree-sitter and the parsing
infrastructure. It only consumes the stable ParsedFile schema.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from app.models.chunk import Chunk, GenerateResponse
from app.models.parsed_file import ParsedFile
from app.services.chunking.chunk_factory import ChunkFactory
from app.services.chunking.chunk_storage import ChunkIndex, store_chunk_index
from app.services.chunking.chunk_utils import language_from_extension
from app.services.file_scanner import IGNORED_DIRS, SUPPORTED_EXTENSIONS
from app.services.git_service import get_current_clone_dir
from app.services.parser.repository_index import get_index

logger = logging.getLogger(__name__)

# Extensions that the Phase 3 parser handles (code files)
_CODE_EXTENSIONS = frozenset(
    ext for ext in SUPPORTED_EXTENSIONS if ext not in (".md", ".txt")
)
# Extensions handled here (docs / plain text)
_DOC_EXTENSIONS = frozenset({".md", ".txt"})


def _is_ignored(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def _build_doc_parsed_file(file_path: Path, repo_dir: Path) -> ParsedFile:
    """
    Construct a minimal ParsedFile for a Markdown / text file.

    Phase 3 skips these; we create stub ParsedFiles here so ChunkFactory
    can produce Markdown/README chunks without any Tree-sitter involvement.
    """
    rel = file_path.relative_to(repo_dir).as_posix()
    ext = file_path.suffix.lower()
    try:
        size = file_path.stat().st_size
        lines = file_path.read_text(encoding="utf-8", errors="replace").count("\n") + 1
    except OSError:
        size = 0
        lines = 0

    return ParsedFile(
        filename=file_path.name,
        relative_path=rel,
        language=language_from_extension(ext),
        imports=[],
        classes=[],
        functions=[],
        total_lines=lines,
        file_size_bytes=size,
    )


def generate_chunks(repository_name: str) -> GenerateResponse:
    """
    Generate all chunks for the currently active repository and store them.

    Args:
        repository_name: Used in chunk IDs and the ChunkIndex header.

    Returns:
        GenerateResponse with totals and distribution.

    Raises:
        RuntimeError: If no parse index is available or no repo is cloned.
    """
    repo_dir = get_current_clone_dir()
    if repo_dir is None:
        raise RuntimeError(
            "No repository is cloned. Clone a repository first."
        )

    # ── Step 1: get Phase 3 index ─────────────────────────────────────
    parse_index = get_index()
    if parse_index is None:
        logger.info("No parse index found in memory. Running auto-parse...")
        from app.services.parser.parser_service import parse_repository
        try:
            parse_repository(repo_dir, repository_name)
            parse_index = get_index()
        except Exception as exc:
            logger.exception("Auto-parsing failed")
            raise RuntimeError(f"Failed to auto-parse repository during chunking: {exc}") from exc

    if parse_index is None:
        raise RuntimeError(
            "No parse index found. Run POST /parser/parse before chunking."
        )

    logger.info(
        "Starting chunk generation for '%s' (%d parsed files)",
        repository_name, len(parse_index.files),
    )

    factory = ChunkFactory()
    all_chunks: List[Chunk] = []

    # ── Step 2: chunk code files from Phase 3 index ───────────────────
    for parsed_file in parse_index.files:
        try:
            chunks = factory.build(parsed_file, repo_dir, repository_name)
            all_chunks.extend(chunks)
        except Exception as exc:
            logger.warning(
                "Chunking failed for '%s': %s", parsed_file.relative_path, exc
            )

    # ── Step 3: chunk Markdown / text files (Phase 3 skipped these) ───
    for file_path in sorted(repo_dir.rglob("*")):
        if not file_path.is_file():
            continue
        if _is_ignored(file_path):
            continue
        if file_path.suffix.lower() not in _DOC_EXTENSIONS:
            continue

        try:
            doc_file = _build_doc_parsed_file(file_path, repo_dir)
            chunks = factory.build(doc_file, repo_dir, repository_name)
            all_chunks.extend(chunks)
        except Exception as exc:
            logger.warning("Chunking failed for doc file '%s': %s", file_path, exc)

    # ── Step 4: store the index ───────────────────────────────────────
    index = ChunkIndex(repository_name=repository_name, chunks=all_chunks)
    store_chunk_index(index)

    logger.info(
        "Chunk generation complete — total_chunks=%d repository='%s'",
        len(all_chunks), repository_name,
    )

    return GenerateResponse(
        status="success",
        repository_name=repository_name,
        total_chunks=index.total_chunks,
        chunk_type_distribution=index.chunk_type_distribution,
        languages=index.languages,
    )
