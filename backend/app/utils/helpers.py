"""
Utility helpers shared across the application.
"""

from fastapi.responses import JSONResponse


def error_response(detail: str, status_code: int = 500) -> JSONResponse:
    """Return a standardised JSON error response."""
    return JSONResponse(
        status_code=status_code,
        content={"error": detail},
    )
