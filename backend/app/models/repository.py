"""
Pydantic schemas for repository-related request and response payloads.
"""

from typing import List
from pydantic import BaseModel, Field, HttpUrl


class CloneRequest(BaseModel):
    """Body for POST /repository/clone."""
    repository_url: str = Field(
        ...,
        min_length=1,
        description="Full public GitHub repository URL",
        examples=["https://github.com/owner/repository"],
    )


class RepositoryMeta(BaseModel):
    """Summary metadata returned after a successful clone + scan."""
    status: str = Field(default="success")
    message: str = Field(default="")
    repository_name: str
    owner: str
    branch: str
    total_files: int
    supported_files: int
    ignored_files: int
    folder_count: int
    languages: List[str]


class FileEntry(BaseModel):
    """A single source file discovered during the scan."""
    filename: str
    extension: str
    relative_path: str


class FilesResponse(BaseModel):
    """Response for GET /repository/files."""
    files: List[FileEntry]
    total: int


class TreeNode(BaseModel):
    """A single node in the repository folder hierarchy."""
    name: str
    path: str
    type: str          # "file" | "dir"
    children: List["TreeNode"] = []

# Resolve the self-referential annotation
TreeNode.model_rebuild()


class TreeResponse(BaseModel):
    """Response for GET /repository/tree."""
    tree: List[TreeNode]
