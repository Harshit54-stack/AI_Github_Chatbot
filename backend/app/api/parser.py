"""
Parser API router.

Endpoints
---------
POST  /parser/parse                   Parse the active clone; build index.
GET   /parser/files                   List all parsed files with counts.
GET   /parser/file/{path}             Full parsed detail for one file.
GET   /parser/repository-summary      Aggregate statistics for the index.
"""

from __future__ import annotations

import asyncio
import logging
import urllib.parse

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.models.parsed_file import (
    ParseSummary,
    FileListEntry,
    FilesListResponse,
    ParsedFile,
    RepositorySummary,
)
from app.services.git_service import get_current_clone_dir
from app.services.parser.parser_service import parse_repository
from app.services.parser.repository_index import get_index

logger = logging.getLogger(__name__)

parser_router = APIRouter(prefix="/parser", tags=["Parser"])


# ---------------------------------------------------------------------------
# Request / helper models
# ---------------------------------------------------------------------------


class ParseRequest(BaseModel):
    """Body for POST /parser/parse."""
    repository_name: str = ""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_clone():
    """Return current clone dir or raise 404."""
    clone_dir = get_current_clone_dir()
    if clone_dir is None:
        raise HTTPException(
            status_code=404,
            detail="No repository cloned. POST /repository/clone first.",
        )
    return clone_dir


def _require_index():
    """Return current index or raise 404."""
    index = get_index()
    if index is None:
        raise HTTPException(
            status_code=404,
            detail="Repository has not been parsed yet. POST /parser/parse first.",
        )
    return index


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@parser_router.post("/parse", response_model=ParseSummary)
async def parse_repo(payload: ParseRequest):
    """
    Parse the currently cloned repository.

    Discovers all supported source files, runs the Tree-sitter analyzer
    for each one, and stores the result in the in-memory repository index.
    """
    clone_dir = _require_clone()

    # Derive the repo name from the folder if not supplied in the body
    folder_name = clone_dir.name
    parts = folder_name.split("__", 1)
    repo_name = payload.repository_name or (parts[1] if len(parts) == 2 else folder_name)

    try:
        # Run synchronous I/O in a thread to avoid blocking the event loop
        summary = await asyncio.to_thread(parse_repository, clone_dir, repo_name)
    except Exception as exc:
        logger.exception("Parsing failed")
        raise HTTPException(status_code=500, detail=f"Parsing failed: {exc}") from exc

    return summary


@parser_router.get("/files", response_model=FilesListResponse)
def list_parsed_files():
    """
    Return a summary list of every file in the repository index.

    Each entry includes the relative path, language, class count, and
    function count (including methods inside classes).
    """
    index = _require_index()

    entries = [
        FileListEntry(
            file=f.relative_path,
            language=f.language,
            classes=len(f.classes),
            functions=len(f.functions) + sum(len(c.methods) for c in f.classes),
        )
        for f in index.files
    ]

    return FilesListResponse(files=entries, total=len(entries))


@parser_router.get("/file/{path:path}", response_model=ParsedFile)
def get_file_detail(path: str):
    """
    Return the full parsed detail for a single file.

    *path* is the relative path from the repository root
    (e.g. ``src/main.py``).
    """
    index = _require_index()

    # Normalise URL-encoded paths
    decoded = urllib.parse.unquote(path)
    parsed_file = index.get_file(decoded)

    if parsed_file is None:
        raise HTTPException(
            status_code=404,
            detail=f"File '{decoded}' not found in the parsed index.",
        )

    return parsed_file


@parser_router.get("/repository-summary", response_model=RepositorySummary)
def get_repository_summary():
    """Return aggregate statistics for the parsed repository index."""
    index = _require_index()

    return RepositorySummary(
        total_files=len(index.files),
        total_classes=index.total_classes,
        total_functions=index.total_functions,
        languages=index.languages,
    )
