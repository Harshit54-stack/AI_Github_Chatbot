"""
Pydantic schemas for parsed code structures.

These models represent the output of the Tree-sitter parsing phase
and form the repository index consumed by future phases (RAG, embeddings).
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Fine-grained code element models
# ---------------------------------------------------------------------------


class ParsedParameter(BaseModel):
    """A single function/method parameter."""

    name: str
    type_annotation: Optional[str] = None


class ParsedFunction(BaseModel):
    """A function or free-standing method extracted from a source file."""

    name: str
    parameters: List[ParsedParameter] = Field(default_factory=list)
    return_type: Optional[str] = None
    docstring: Optional[str] = None
    start_line: int = 0
    end_line: int = 0


class ParsedClass(BaseModel):
    """A class definition extracted from a source file."""

    name: str
    methods: List[ParsedFunction] = Field(default_factory=list)
    docstring: Optional[str] = None
    start_line: int = 0
    end_line: int = 0


class ParsedFile(BaseModel):
    """Complete parsed representation of a single source file."""

    filename: str
    relative_path: str
    language: str
    imports: List[str] = Field(default_factory=list)
    classes: List[ParsedClass] = Field(default_factory=list)
    functions: List[ParsedFunction] = Field(default_factory=list)
    total_lines: int = 0
    file_size_bytes: int = 0


# ---------------------------------------------------------------------------
# Aggregate / summary models (used by API responses)
# ---------------------------------------------------------------------------


class ParseSummary(BaseModel):
    """Response for POST /parser/parse."""

    status: str = "success"
    files_parsed: int
    classes: int
    functions: int
    languages: List[str]


class FileListEntry(BaseModel):
    """One row in the GET /parser/files response."""

    file: str          # relative path
    language: str
    classes: int
    functions: int


class FilesListResponse(BaseModel):
    """Response envelope for GET /parser/files."""

    files: List[FileListEntry]
    total: int


class RepositorySummary(BaseModel):
    """Response for GET /parser/repository-summary."""

    total_files: int
    total_classes: int
    total_functions: int
    languages: List[str]
