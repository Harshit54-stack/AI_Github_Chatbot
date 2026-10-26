"""
Git service — public facade for repository operations.

All business logic has moved to RepositoryManager (repository_manager.py).
This module re-exports the same functions the rest of the codebase
already imports, keeping backward compatibility.

  clone_repository()        →  async wrapper around RepositoryManager.clone()
  get_current_clone_dir()   →  RepositoryManager.get_active_clone_dir()
  delete_current_repository()→  RepositoryManager.delete_active_repository()
"""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from app.services.repository_manager import (
    RepositoryError,
    repository_manager,
    CloneResult,
)

logger = logging.getLogger(__name__)


async def clone_repository(repository_url: str) -> tuple[Path, str, str, str, str]:
    """
    Async facade: validate, clone, and return repository details.

    Delegates all logic to RepositoryManager.clone() which runs in a
    background thread to avoid blocking the event loop.

    Args:
        repository_url: A URL already confirmed to be a valid GitHub URL.

    Returns:
        (clone_dir, owner, repo_name, active_branch_name, status_message)

    Raises:
        ValueError: Wraps RepositoryError so callers need no new imports.
    """
    try:
        result: CloneResult = await asyncio.to_thread(
            repository_manager.clone, repository_url
        )
    except RepositoryError as exc:
        # Convert to ValueError — the API layer already handles ValueError
        raise ValueError(str(exc)) from exc

    return result.clone_dir, result.owner, result.repository_name, result.branch, result.status_message


def get_current_clone_dir() -> Path | None:
    """
    Return the path of the currently cloned repository, or None.

    Thin wrapper around RepositoryManager.get_active_clone_dir().
    """
    return repository_manager.get_active_clone_dir()


def delete_current_repository() -> bool:
    """
    Delete the currently cloned repository from disk.

    Returns:
        True  if a repository was found and removed.
        False if no repository existed.

    Raises:
        ValueError: If deletion fails (wraps RepositoryError).
    """
    try:
        return repository_manager.delete_active_repository()
    except RepositoryError as exc:
        raise ValueError(str(exc)) from exc
