"""
RepositoryManager — single, reusable service responsible for the full
repository lifecycle: existence check → deletion → clone → status.

Design goals
------------
* One place owns all cloning/deletion logic (SOLID: Single Responsibility).
* No business logic in API routes.
* Every step is logged clearly.
* All exceptions are caught and re-raised as domain-level errors
  (RepositoryError) so the API layer never leaks raw Git / OS exceptions.
* Windows-safe deletion: uses a custom error handler for shutil.rmtree to
  clear read-only flags that the .git directory often sets on Windows.
"""

from __future__ import annotations

import logging
import os
import shutil
import stat
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import git

from app.config import settings
from app.utils.validators import parse_github_url

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Domain exception
# ---------------------------------------------------------------------------


class RepositoryError(Exception):
    """
    Raised by RepositoryManager for any clone/delete failure.

    The message is safe to surface to the frontend — no raw traceback
    or internal paths are included.
    """


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------


@dataclass
class CloneResult:
    """Structured return value from RepositoryManager.clone()."""

    clone_dir: Path
    owner: str
    repository_name: str
    branch: str
    already_existed: bool   # True → old copy was deleted and re-cloned
    status_message: str     # Human-readable summary for API/frontend


# ---------------------------------------------------------------------------
# Windows-safe rmtree helper
# ---------------------------------------------------------------------------


def _force_remove_readonly(func, path: str, _exc_info) -> None:
    """
    onerror callback for shutil.rmtree.

    On Windows, files inside .git are often marked read-only.
    This handler strips the read-only attribute and retries the removal.
    """
    try:
        os.chmod(path, stat.S_IWRITE)
        func(path)
    except Exception as inner:
        logger.warning("Could not remove '%s': %s", path, inner)


def _safe_rmtree(path: Path, *, retries: int = 3, delay: float = 0.5) -> None:
    """
    Recursively delete *path* with retry logic and read-only handling.

    Args:
        path:    Directory to remove.
        retries: How many times to retry after a transient OS error.
        delay:   Seconds to wait between retries.

    Raises:
        RepositoryError: If the directory still exists after all retries.
    """
    for attempt in range(1, retries + 1):
        try:
            shutil.rmtree(path, onerror=_force_remove_readonly)
        except Exception as exc:
            logger.warning(
                "rmtree attempt %d/%d failed for '%s': %s",
                attempt, retries, path, exc,
            )
            if attempt < retries:
                time.sleep(delay)
            continue

        # Verify it is really gone
        if not path.exists():
            return

        logger.warning(
            "Directory '%s' still exists after rmtree attempt %d/%d",
            path, attempt, retries,
        )
        if attempt < retries:
            time.sleep(delay)

    # Final check after all retries
    if path.exists():
        raise RepositoryError(
            f"Failed to delete the existing repository at '{path.name}'. "
            "Check file permissions or close any programs (e.g. an IDE) "
            "that may have the directory open, then try again."
        )


# ---------------------------------------------------------------------------
# RepositoryManager
# ---------------------------------------------------------------------------


class RepositoryManager:
    """
    Manages the lifecycle of a single locally cloned GitHub repository.

    Usage
    -----
    manager = RepositoryManager()
    result  = manager.clone("https://github.com/owner/repo")
    """

    def __init__(self, repos_dir: Optional[Path] = None) -> None:
        self._repos_dir: Path = repos_dir or settings.REPOS_DIR
        self._repos_dir.mkdir(parents=True, exist_ok=True)

    # ----------------------------------------------------------------
    # Public API
    # ----------------------------------------------------------------

    def clone(self, repository_url: str) -> CloneResult:
        """
        Full clone workflow:

        1. Parse the GitHub URL → owner, repo_name.
        2. Build the local target path.
        3. If it exists → log + delete completely.
        4. Clone from GitHub.
        5. Detect active branch.
        6. Return a CloneResult.

        Args:
            repository_url: Validated public GitHub HTTPS URL.

        Returns:
            CloneResult with clone path, owner, repo name, branch, and
            a status message suitable for display.

        Raises:
            RepositoryError: For any failure with a user-friendly message.
        """
        owner, repo_name = parse_github_url(repository_url)
        clone_url = f"https://github.com/{owner}/{repo_name}.git"
        target_dir = self._build_target(owner, repo_name)

        already_existed = self._prepare_target(target_dir, owner, repo_name)
        repo = self._clone(clone_url, target_dir, owner, repo_name)
        branch = self._detect_branch(repo)

        status_message = (
            f"Repository '{owner}/{repo_name}' updated successfully."
            if already_existed
            else f"Repository '{owner}/{repo_name}' cloned successfully."
        )
        logger.info(status_message)

        return CloneResult(
            clone_dir=target_dir,
            owner=owner,
            repository_name=repo_name,
            branch=branch,
            already_existed=already_existed,
            status_message=status_message,
        )

    def get_active_clone_dir(self) -> Optional[Path]:
        """
        Return the path of the first non-hidden directory inside REPOS_DIR.

        This app supports a single active repository at a time.
        Returns None if no repository has been cloned.
        """
        if not self._repos_dir.exists():
            return None
        for entry in sorted(self._repos_dir.iterdir()):
            if entry.is_dir() and not entry.name.startswith("."):
                return entry
        return None

    def delete_active_repository(self) -> bool:
        """
        Delete whichever repository is currently cloned.

        Returns:
            True  — a repository was found and removed.
            False — nothing was there to delete.

        Raises:
            RepositoryError: If deletion fails even after retries.
        """
        target = self.get_active_clone_dir()
        if target is None:
            logger.info("Delete requested but no repository is present.")
            return False

        logger.info("Deleting active repository at '%s'…", target)
        _safe_rmtree(target)
        logger.info("Repository at '%s' deleted successfully.", target.name)
        return True

    def repository_exists(self, owner: str, repo_name: str) -> bool:
        """Return True if the local clone directory for owner/repo exists."""
        return self._build_target(owner, repo_name).exists()

    # ----------------------------------------------------------------
    # Private helpers
    # ----------------------------------------------------------------

    def _build_target(self, owner: str, repo_name: str) -> Path:
        """Construct the local storage path: REPOS_DIR/owner__repo_name."""
        return self._repos_dir / f"{owner}__{repo_name}"

    def _prepare_target(
        self, target_dir: Path, owner: str, repo_name: str
    ) -> bool:
        """
        Since the app supports a single active repository at a time,
        delete ALL existing repositories in REPOS_DIR before cloning.

        Returns:
            True  if the target_dir already existed and was removed.
            False if target_dir was not present.
        """
        already_existed = target_dir.exists()

        for entry in self._repos_dir.iterdir():
            if entry.is_dir() and not entry.name.startswith("."):
                logger.info("Deleting existing repository at '%s' to ensure a single active clone…", entry)
                _safe_rmtree(entry)

        if already_existed:
            logger.info("Target repository deleted successfully.")

        return already_existed

    def _clone(
        self, clone_url: str, target_dir: Path, owner: str, repo_name: str
    ) -> git.Repo:
        """
        Execute the git clone and map all known failure modes to
        RepositoryError with user-friendly messages.
        """
        logger.info("Cloning '%s' → '%s'…", clone_url, target_dir)
        try:
            repo = git.Repo.clone_from(clone_url, str(target_dir))
            logger.info("Clone completed successfully.")
            return repo
        except git.exc.GitCommandNotFound:
            raise RepositoryError(
                "Git is not installed or not found on the system PATH. "
                "Please install Git and restart the server."
            )
        except git.exc.GitCommandError as exc:
            msg = str(exc)
            logger.error("GitCommandError while cloning '%s/%s': %s", owner, repo_name, msg)

            if any(kw in msg.lower() for kw in ("not found", "repository not found", "does not exist")):
                raise RepositoryError(
                    f"Repository '{owner}/{repo_name}' was not found on GitHub. "
                    "Make sure it is public and the URL is correct."
                )
            if "already exists and is not an empty directory" in msg:
                raise RepositoryError(
                    f"The local directory for '{owner}/{repo_name}' could not be "
                    "cleared before cloning. Check file permissions and try again."
                )
            if any(kw in msg.lower() for kw in ("could not resolve host", "unable to connect", "network")):
                raise RepositoryError(
                    "Network error: could not reach GitHub. "
                    "Check your internet connection and try again."
                )
            if "permission denied" in msg.lower():
                raise RepositoryError(
                    "Permission denied while cloning. "
                    "Check disk write permissions for the repositories directory."
                )
            if "authentication failed" in msg.lower():
                raise RepositoryError(
                    f"Authentication failed for '{owner}/{repo_name}'. "
                    "Only public repositories are supported."
                )
            raise RepositoryError(f"Clone failed for '{owner}/{repo_name}': {exc.stderr.strip() if exc.stderr else msg}")
        except OSError as exc:
            logger.error("OSError while cloning: %s", exc)
            raise RepositoryError(
                f"File system error during clone: {exc.strerror}. "
                "Check available disk space and permissions."
            )
        except Exception as exc:
            logger.exception("Unexpected error while cloning '%s/%s'", owner, repo_name)
            raise RepositoryError(f"Unexpected error during clone: {exc}") from exc

    @staticmethod
    def _detect_branch(repo: git.Repo) -> str:
        """Safely determine the active branch name."""
        try:
            return repo.active_branch.name
        except TypeError:
            # Detached HEAD (rare for a fresh clone, but possible)
            return "HEAD"


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------

#: Single shared instance — import this rather than constructing a new one.
repository_manager = RepositoryManager()
