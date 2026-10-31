"""
Tests for Repository Metadata & Statistics API.

Tests:
1. GET /repository/active returns 200 and valid RepositoryMeta when a repo is present.
2. Response contract matches all required fields (owner, repository_name, branch, stats).
3. Field types and values: counts are integers >= 0, not undefined or null.
4. GET /repository/active returns 404 when no repository is cloned.
5. URL validation: validate_github_url handles URLs with and without .git.
6. POST /repository/clone with invalid URL returns 422.
"""

from pathlib import Path
from unittest.mock import patch
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.utils.validators import validate_github_url, parse_github_url


@pytest.fixture
def client():
    return TestClient(app)


def test_url_parser_with_and_without_git():
    """Verify GitHub URL parsing for standard and .git HTTPS URLs."""
    urls = [
        "https://github.com/owner-test/repo-test",
        "https://github.com/owner-test/repo-test.git",
        "https://www.github.com/owner-test/repo-test",
        "https://www.github.com/owner-test/repo-test.git",
    ]
    for url in urls:
        is_valid, msg = validate_github_url(url)
        assert is_valid is True, f"Failed for {url}: {msg}"
        owner, repo = parse_github_url(url)
        assert owner == "owner-test"
        assert repo == "repo-test"


def test_url_parser_invalid_urls():
    """Verify rejection of invalid repository URLs."""
    invalid_urls = [
        "https://gitlab.com/owner/repo",
        "not-a-url",
        "https://github.com/only-owner",
        "https://github.com/",
        "",
    ]
    for url in invalid_urls:
        is_valid, msg = validate_github_url(url)
        assert is_valid is False, f"Expected invalid for {url}"


def test_get_active_repository_returns_metadata(client):
    """GET /repository/active returns 200 with full RepositoryMeta when repo exists."""
    response = client.get("/repository/active")
    # If a repo is cloned in backend/repositories/ (e.g. Smart-Split-Ticket-Booking-System)
    if response.status_code == 200:
        data = response.json()
        assert "owner" in data and isinstance(data["owner"], str) and len(data["owner"]) > 0
        assert "repository_name" in data and isinstance(data["repository_name"], str) and len(data["repository_name"]) > 0
        assert "branch" in data
        assert isinstance(data["total_files"], int)
        assert isinstance(data["supported_files"], int)
        assert isinstance(data["ignored_files"], int)
        assert isinstance(data["folder_count"], int)
        assert isinstance(data["languages"], list)
        assert data["total_files"] >= 0
        assert data["supported_files"] >= 0
    else:
        assert response.status_code == 404


def test_get_active_repository_404_when_none_present(client):
    """GET /repository/active raises 404 when get_current_clone_dir returns None."""
    with patch("app.api.repository.get_current_clone_dir", return_value=None):
        response = client.get("/repository/active")
        assert response.status_code == 404
        assert "No repository has been cloned yet" in response.json()["detail"]


def test_clone_invalid_url_returns_422(client):
    """POST /repository/clone with invalid URL returns 422 Validation Error."""
    response = client.post("/repository/clone", json={"repository_url": "invalid-url"})
    assert response.status_code == 422
