"""
Chunk Factory — translates a single ParsedFile into a list of Chunks.

Design
------
* One factory method per chunk type, all private.
* Public interface: ChunkFactory.build(parsed_file, repo_dir, repo_name)
* The factory reads raw source lines from disk using chunk_utils.read_lines
  so each chunk contains the actual code, not AST text.
* Completely independent of the parsing infrastructure — it consumes the
  stable ParsedFile schema from app.models.parsed_file.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional

from app.models.chunk import Chunk, ChunkType
from app.models.parsed_file import ParsedClass, ParsedFile, ParsedFunction
from app.services.chunking.chunk_utils import (
    make_chunk_id,
    read_full_file,
    read_lines,
    sanitize_symbol_name,
    split_markdown_sections,
)

logger = logging.getLogger(__name__)


class ChunkFactory:
    """
    Converts a ParsedFile (Phase 3 output) into a list of Chunks.

    Rules
    -----
    1. For every top-level function → FunctionChunk.
    2. For every class → ClassChunk + one MethodChunk per method.
    3. For markdown files → split by heading → MarkdownSectionChunk;
       a README.md root gets chunk_type=readme for easy filtering.
    4. If a file has no functions, classes, or markdown sections →
       one ModuleChunk covering the entire file.
    """

    def build(
        self,
        parsed_file: ParsedFile,
        repo_dir: Path,
        repository_name: str,
    ) -> List[Chunk]:
        """
        Generate all chunks for *parsed_file*.

        Args:
            parsed_file:      Output of Phase 3 for a single file.
            repo_dir:         Absolute path to the repository root.
            repository_name:  Name used in chunk IDs and metadata.

        Returns:
            A (possibly empty) list of Chunk objects.
        """
        file_path = repo_dir / parsed_file.relative_path
        chunks: List[Chunk] = []

        # ── Markdown / README ────────────────────────────────────────
        if parsed_file.language in ("Markdown", "Text"):
            chunks = self._build_markdown_chunks(parsed_file, file_path, repository_name)
        else:
            # ── Code files ───────────────────────────────────────────
            # Classes first
            for cls in parsed_file.classes:
                chunks.extend(
                    self._build_class_chunks(
                        cls, parsed_file, file_path, repository_name
                    )
                )

            # Top-level functions
            for fn in parsed_file.functions:
                chunk = self._build_function_chunk(
                    fn,
                    parsed_file,
                    file_path,
                    repository_name,
                    parent_class=None,
                    chunk_type=ChunkType.FUNCTION,
                )
                if chunk:
                    chunks.append(chunk)

            # Fallback: whole file as a module chunk
            if not chunks:
                module_chunk = self._build_module_chunk(
                    parsed_file, file_path, repository_name
                )
                if module_chunk:
                    chunks.append(module_chunk)

        logger.debug(
            "Generated %d chunk(s) for '%s'", len(chunks), parsed_file.relative_path
        )
        return chunks

    # ------------------------------------------------------------------
    # Private builders
    # ------------------------------------------------------------------

    def _build_class_chunks(
        self,
        cls: ParsedClass,
        parsed_file: ParsedFile,
        file_path: Path,
        repository_name: str,
    ) -> List[Chunk]:
        """One ClassChunk + one MethodChunk per method."""
        chunks: List[Chunk] = []

        # Class-level chunk (entire class body)
        class_content = read_lines(file_path, cls.start_line, cls.end_line)
        if class_content:
            chunks.append(
                Chunk(
                    chunk_id=make_chunk_id(
                        repository_name, parsed_file.relative_path,
                        cls.name, cls.start_line,
                    ),
                    repository_name=repository_name,
                    file_path=parsed_file.relative_path,
                    language=parsed_file.language,
                    chunk_type=ChunkType.CLASS,
                    symbol_name=sanitize_symbol_name(cls.name),
                    parent_class=None,
                    start_line=cls.start_line,
                    end_line=cls.end_line,
                    total_lines=cls.end_line - cls.start_line + 1,
                    content=class_content,
                    imports=parsed_file.imports,
                    docstring=cls.docstring,
                )
            )

        # Method chunks
        for method in cls.methods:
            chunk = self._build_function_chunk(
                method,
                parsed_file,
                file_path,
                repository_name,
                parent_class=cls.name,
                chunk_type=ChunkType.METHOD,
            )
            if chunk:
                chunks.append(chunk)

        return chunks

    def _build_function_chunk(
        self,
        fn: ParsedFunction,
        parsed_file: ParsedFile,
        file_path: Path,
        repository_name: str,
        parent_class: Optional[str],
        chunk_type: ChunkType,
    ) -> Optional[Chunk]:
        """Build a function or method chunk from line numbers."""
        if fn.start_line == 0 or fn.end_line == 0:
            return None

        content = read_lines(file_path, fn.start_line, fn.end_line)
        if not content.strip():
            return None

        return Chunk(
            chunk_id=make_chunk_id(
                repository_name, parsed_file.relative_path,
                fn.name, fn.start_line,
            ),
            repository_name=repository_name,
            file_path=parsed_file.relative_path,
            language=parsed_file.language,
            chunk_type=chunk_type,
            symbol_name=sanitize_symbol_name(fn.name),
            parent_class=parent_class,
            start_line=fn.start_line,
            end_line=fn.end_line,
            total_lines=fn.end_line - fn.start_line + 1,
            content=content,
            imports=parsed_file.imports,
            docstring=fn.docstring,
        )

    def _build_module_chunk(
        self,
        parsed_file: ParsedFile,
        file_path: Path,
        repository_name: str,
    ) -> Optional[Chunk]:
        """Entire file as a single module chunk (fallback)."""
        content = read_full_file(file_path)
        if not content.strip():
            return None

        total_lines = parsed_file.total_lines or content.count("\n") + 1

        return Chunk(
            chunk_id=make_chunk_id(
                repository_name, parsed_file.relative_path,
                parsed_file.filename, 1,
            ),
            repository_name=repository_name,
            file_path=parsed_file.relative_path,
            language=parsed_file.language,
            chunk_type=ChunkType.MODULE,
            symbol_name=parsed_file.filename,
            parent_class=None,
            start_line=1,
            end_line=total_lines,
            total_lines=total_lines,
            content=content,
            imports=parsed_file.imports,
            docstring=None,
        )

    def _build_markdown_chunks(
        self,
        parsed_file: ParsedFile,
        file_path: Path,
        repository_name: str,
    ) -> List[Chunk]:
        """Split markdown file into heading-based section chunks."""
        content = read_full_file(file_path)
        if not content.strip():
            return []

        is_readme = parsed_file.filename.lower().startswith("readme")
        sections = split_markdown_sections(content)

        # If there are no headings, treat as a single module chunk
        if not sections:
            chunk_type = ChunkType.README if is_readme else ChunkType.MODULE
            total_lines = parsed_file.total_lines or content.count("\n") + 1
            return [
                Chunk(
                    chunk_id=make_chunk_id(
                        repository_name, parsed_file.relative_path,
                        parsed_file.filename, 1,
                    ),
                    repository_name=repository_name,
                    file_path=parsed_file.relative_path,
                    language=parsed_file.language,
                    chunk_type=chunk_type,
                    symbol_name=parsed_file.filename,
                    parent_class=None,
                    start_line=1,
                    end_line=total_lines,
                    total_lines=total_lines,
                    content=content,
                    imports=[],
                    docstring=None,
                )
            ]

        chunks: List[Chunk] = []
        for section in sections:
            # First section of a README → readme type, rest → markdown_section
            chunk_type = (
                ChunkType.README
                if is_readme and section["start"] == sections[0]["start"]
                else ChunkType.MARKDOWN_SECTION
            )
            total_lines = section["end"] - section["start"] + 1
            chunks.append(
                Chunk(
                    chunk_id=make_chunk_id(
                        repository_name, parsed_file.relative_path,
                        section["heading"], section["start"],
                    ),
                    repository_name=repository_name,
                    file_path=parsed_file.relative_path,
                    language=parsed_file.language,
                    chunk_type=chunk_type,
                    symbol_name=section["heading"],
                    parent_class=None,
                    start_line=section["start"],
                    end_line=section["end"],
                    total_lines=total_lines,
                    content=section["body"],
                    imports=[],
                    docstring=None,
                )
            )

        return chunks
