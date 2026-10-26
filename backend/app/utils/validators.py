"""
URL validation utilities for the repository API.

Rules enforced:
  - URL must not be empty.
  - URL must start with https://github.com/.
  - URL must have exactly two path segments (owner/repo).
  - Common non-repository GitHub paths are rejected.
"""

import re
from urllib.parse import urlparse


# Paths that exist on github.com but are NOT repositories
_BLOCKED_PATH_PREFIXES = (
    "/features",
    "/pricing",
    "/about",
    "/login",
    "/signup",
    "/settings",
    "/notifications",
    "/explore",
    "/marketplace",
    "/topics",
    "/trending",
    "/orgs",
    "/sponsors",
)

# A valid repo slug: letters, digits, hyphens, underscores, dots
_SLUG_RE = re.compile(r"^[A-Za-z0-9_.\-]+$")


def validate_github_url(url: str) -> tuple[bool, str]:
    """
    Validate that *url* points to a public GitHub repository.

    Returns:
        (True, "") if the URL is valid.
        (False, "<reason>") if the URL is invalid.
    """
    if not url or not url.strip():
        return False, "Repository URL cannot be empty."

    url = url.strip().rstrip("/")

    parsed = urlparse(url)

    # Must use https scheme
    if parsed.scheme != "https":
        return False, "Only HTTPS GitHub URLs are accepted (e.g. https://github.com/owner/repo)."

    # Must be github.com
    if parsed.netloc.lower() not in ("github.com", "www.github.com"):
        return False, "URL must be a GitHub repository (github.com)."

    # Check blocked paths
    for prefix in _BLOCKED_PATH_PREFIXES:
        if parsed.path.lower().startswith(prefix):
            return False, f"'{url}' does not look like a repository URL."

    # Path must have exactly two non-empty segments: /owner/repo
    segments = [s for s in parsed.path.split("/") if s]
    if len(segments) < 2:
        return False, "URL must include both an owner and a repository name (e.g. https://github.com/owner/repo)."

    if len(segments) > 2:
        return False, (
            "URL must point to the repository root, not a sub-path. "
            f"Did you mean https://github.com/{segments[0]}/{segments[1]} ?"
        )

    owner, repo = segments
    if not _SLUG_RE.match(owner):
        return False, f"Invalid GitHub username/organisation: '{owner}'."
    if not _SLUG_RE.match(repo):
        return False, f"Invalid repository name: '{repo}'."

    return True, ""


def parse_github_url(url: str) -> tuple[str, str]:
    """
    Extract (owner, repo_name) from a validated GitHub URL.
    Strips a trailing .git suffix from the repo name if present.

    Args:
        url: A URL that has already passed validate_github_url().

    Returns:
        (owner, repo_name) tuple.
    """
    url = url.strip().rstrip("/")
    segments = [s for s in urlparse(url).path.split("/") if s]
    owner = segments[0]
    repo = segments[1].removesuffix(".git")
    return owner, repo
