"""Correlation and duration middleware with bounded log fields."""

from __future__ import annotations

import json
import logging
from time import perf_counter
from uuid import uuid4

from fastapi import FastAPI, Request
from starlette.middleware.base import RequestResponseEndpoint
from starlette.responses import Response

LOGGER = logging.getLogger("nanodb.request")


def install_request_middleware(app: FastAPI) -> None:
    @app.middleware("http")
    async def request_context(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        correlation_id = request.headers.get("x-correlation-id") or uuid4().hex
        request.state.correlation_id = correlation_id
        started = perf_counter()
        response = await call_next(request)
        response.headers["x-correlation-id"] = correlation_id
        LOGGER.info(
            json.dumps(
                {
                    "event": "request_complete",
                    "correlation_id": correlation_id,
                    "method": request.method,
                    "route": request.url.path,
                    "status": response.status_code,
                    "duration_ms": round((perf_counter() - started) * 1000, 2),
                }
            )
        )
        return response
