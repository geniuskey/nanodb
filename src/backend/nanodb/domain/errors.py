"""Domain-level failures safe to map to API error responses."""

from __future__ import annotations


class DomainError(ValueError):
    """A caller-correctable domain rule violation."""

    def __init__(
        self,
        code: str,
        message: str,
        *,
        field: str | None = None,
        status: int | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.field = field
        # Optional explicit HTTP status. When unset, the API maps *_NOT_FOUND to
        # 404 and every other correctable failure to 422.
        self.status = status
