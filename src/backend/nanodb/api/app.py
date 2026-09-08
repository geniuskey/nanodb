"""NANoDB FastAPI application factory."""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from nanodb.adapters import DerivedStore, FileStore, ImageDecoder
from nanodb.api.errors import install_error_handlers
from nanodb.api.middleware import install_request_middleware
from nanodb.api.routes import router
from nanodb.persistence.database import create_session_factory
from nanodb.services.catalog_service import CatalogService
from nanodb.services.context_export_service import ContextExportService
from nanodb.services.feature_service import FeatureExtractionService
from nanodb.services.image_service import ImageService
from nanodb.services.measurement_item_service import MeasurementItemService
from nanodb.services.measurement_service import MeasurementService
from nanodb.services.segmentation_service import SegmentationService
from nanodb.services.summary_service import SummaryService
from nanodb.settings import Settings


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = settings or Settings()
    logging.basicConfig(level=resolved.log_level)
    engine, session_factory = create_session_factory(
        resolved.database_url,
        pool_size=resolved.database_pool_size,
        max_overflow=resolved.database_max_overflow,
        pool_timeout=resolved.database_pool_timeout,
    )
    file_store = FileStore(resolved.upload_root)
    derived_store = DerivedStore(resolved.upload_root)

    app = FastAPI(title="NANoDB Core", version="0.1.0")
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.file_store = file_store
    app.state.derived_store = derived_store
    app.state.image_service = ImageService(
        session_factory,
        file_store,
        ImageDecoder(),
        derived_store,
    )
    app.state.measurement_service = MeasurementService(session_factory)
    segmentation_service = SegmentationService(
        session_factory,
        file_store,
        derived_store,
    )
    app.state.segmentation_service = segmentation_service
    app.state.feature_service = FeatureExtractionService(
        session_factory,
        derived_store,
        segmentation_service,
    )
    app.state.measurement_item_service = MeasurementItemService(session_factory)
    app.state.catalog_service = CatalogService(session_factory)
    app.state.summary_service = SummaryService(session_factory)
    app.state.context_export_service = ContextExportService(session_factory)
    app.include_router(router)
    install_error_handlers(app)
    install_request_middleware(app)
    _install_frontend(app, resolved.frontend_dist)
    return app


def _install_frontend(app: FastAPI, frontend_dist: Path) -> None:
    index = frontend_dist / "index.html"
    assets = frontend_dist / "assets"
    if assets.is_dir():
        app.mount("/assets", StaticFiles(directory=assets), name="frontend-assets")
    if not index.is_file():
        return

    @app.get("/{frontend_path:path}", include_in_schema=False)
    def frontend(frontend_path: str) -> FileResponse:
        candidate = frontend_dist / frontend_path
        if frontend_path and candidate.is_file() and candidate.parent == frontend_dist:
            return FileResponse(candidate)
        return FileResponse(index)


app = create_app()
