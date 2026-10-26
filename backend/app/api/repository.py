"""
Repository API router.

Endpoints
---------
POST   /repository/clone   Clone a public GitHub repository and return metadata.
GET    /repository/files   List all supported source files in the active clone.
GET    /repository/tree    Return the full directory tree of the active clone.
DELETE /repository         Delete the currently cloned repository from disk.
"""

import logging

from fastapi import APIRouter, HTTPException

from app.models import (
    CloneRequest,
    RepositoryMeta,
    FilesResponse,
    FileEntry,
    TreeResponse,
    TreeNode,
)
from app.services.git_service import (
    clone_repository,
    get_current_clone_dir,
    delete_current_repository,
)
from app.services.file_scanner import scan_repository, TreeNode as ScanTreeNode
from app.utils.validators import validate_github_url

logger = logging.getLogger(__name__)

repository_router = APIRouter(prefix="/repository", tags=["Repository"])


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_active_clone_or_404():
    """Return the current clone directory or raise 404."""
    clone_dir = get_current_clone_dir()
    if clone_dir is None:
        raise HTTPException(
            status_code=404,
            detail="No repository has been cloned yet. POST /repository/clone first.",
        )
    return clone_dir


def _scan_tree_node_to_schema(node: ScanTreeNode) -> TreeNode:
    """Recursively convert a scanner TreeNode to the Pydantic schema."""
    return TreeNode(
        name=node.name,
        path=node.path,
        type=node.node_type,
        children=[_scan_tree_node_to_schema(c) for c in node.children],
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@repository_router.post("/clone", response_model=RepositoryMeta, status_code=200)
async def clone_repo(payload: CloneRequest):
    """
    Validate the URL, clone the repository, scan it, and return metadata.

    - Existing clones of the *same* repository are deleted before re-cloning.
    - Returns structured metadata including detected languages and file counts.
    """
    # 1. Validate URL
    is_valid, error_msg = validate_github_url(payload.repository_url)
    if not is_valid:
        raise HTTPException(status_code=422, detail=error_msg)

    # 2. Clone (runs in a thread so the event loop is not blocked)
    try:
        clone_dir, owner, repo_name, branch, status_message = await clone_repository(
            payload.repository_url
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    # 3. Scan
    try:
        result = scan_repository(clone_dir, owner, repo_name, branch)
    except Exception as exc:
        logger.exception("Scan failed after successful clone")
        raise HTTPException(
            status_code=500,
            detail=f"Repository cloned but scan failed: {exc}",
        ) from exc

    return RepositoryMeta(
        status="success",
        message=status_message,
        repository_name=result.repository_name,
        owner=result.owner,
        branch=result.branch,
        total_files=result.total_files,
        supported_files=result.supported_files,
        ignored_files=result.ignored_files,
        folder_count=result.folder_count,
        languages=result.languages,
    )


@repository_router.get("/files", response_model=FilesResponse)
def get_files():
    """
    Return every supported source file in the active repository clone.

    Each entry includes the filename, extension, and relative path.
    """
    clone_dir = _get_active_clone_or_404()

    # Derive owner/repo/branch from the folder name (owner__repo convention)
    folder_name = clone_dir.name
    parts = folder_name.split("__", 1)
    owner = parts[0] if len(parts) >= 1 else "unknown"
    repo_name = parts[1] if len(parts) == 2 else folder_name

    result = scan_repository(clone_dir, owner, repo_name, branch="")

    files = [
        FileEntry(
            filename=f.filename,
            extension=f.extension,
            relative_path=f.relative_path,
        )
        for f in result.file_entries
    ]

    return FilesResponse(files=files, total=len(files))


@repository_router.get("/tree", response_model=TreeResponse)
def get_tree():
    """
    Return the hierarchical directory tree of the active repository clone.

    Ignored directories (.git, node_modules, etc.) are excluded.
    """
    clone_dir = _get_active_clone_or_404()

    folder_name = clone_dir.name
    parts = folder_name.split("__", 1)
    owner = parts[0] if len(parts) >= 1 else "unknown"
    repo_name = parts[1] if len(parts) == 2 else folder_name

    result = scan_repository(clone_dir, owner, repo_name, branch="")

    tree = [_scan_tree_node_to_schema(node) for node in result.tree]
    return TreeResponse(tree=tree)


@repository_router.delete("", status_code=200)
def delete_repo():
    """
    Delete the currently cloned repository from disk.

    Returns 200 with a status message whether or not a repository existed.
    """
    deleted = delete_current_repository()
    if deleted:
        return {"status": "deleted", "message": "Repository removed successfully."}
    return {"status": "no_op", "message": "No repository was present to delete."}
