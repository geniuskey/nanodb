"""Safe exception-to-response mapping."""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from nanodb.api.schemas import ErrorDetail, ErrorEnvelope
from nanodb.domain.errors import DomainError

LOGGER = logging.getLogger("nanodb.api")


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(
        _request: Request,
        error: DomainError,
    ) -> JSONResponse:
        status = 404 if error.code.endswith("NOT_FOUND") else 422
        envelope = ErrorEnvelope(
            code=error.code,
            message=error.message,
            detail=ErrorDetail(field=error.field) if error.field else None,
        )
        return JSONResponse(status_code=status, content=envelope.model_dump())

    @app.exception_handler(Exception)
    async def handle_unexpected_error(
        request: Request,
        error: Exception,
    ) -> JSONResponse:
        LOGGER.exception(
            "unexpected_request_failure",
            extra={
                "correlation_id": getattr(request.state, "correlation_id", None),
                "error_category": type(error).__name__,
            },
        )
        envelope = ErrorEnvelope(
            code="INTERNAL_ERROR",
            message="The request could not be completed. Please retry.",
        )
        return JSONResponse(status_code=500, content=envelope.model_dump())
