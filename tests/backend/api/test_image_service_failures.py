from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.errors import DomainError
from nanodb.services.image_service import ImageRegistration, ImageService
from PIL import Image as PillowImage


class FailingCommitSession:
    def execute(self, *_args: object, **_kwargs: object) -> None:
        # Registration upserts catalog values via the same session before
        # committing; accept and ignore that statement here.
        return None

    def rollback(self) -> None:
        pass

    def commit(self) -> None:
        raise RuntimeError("database commit failed")

    def close(self) -> None:
        pass


def registration() -> ImageRegistration:
    return ImageRegistration(
        original_filename="sample.png",
        image_type="TEM",
        product_id="P1",
        lot_id="L1",
        wafer_id="W1",
        calibration_nm_per_pixel=0.2,
    )


def png_bytes() -> BytesIO:
    content = BytesIO()
    PillowImage.new("L", (10, 10)).save(content, format="PNG")
    content.seek(0)
    return content


def test_bounded_write_removes_partial_oversized_file(tmp_path: Path) -> None:
    store = FileStore(tmp_path, size_limit=3)

    with pytest.raises(DomainError) as caught:
        store.write_temporary(BytesIO(b"four"))

    assert caught.value.code == "FILE_TOO_LARGE"
    assert list(store.staging_root.iterdir()) == []


def test_invalid_image_removes_temporary_file(tmp_path: Path) -> None:
    store = FileStore(tmp_path)
    service = ImageService(lambda: FailingCommitSession(), store, ImageDecoder())

    with pytest.raises(DomainError) as caught:
        service.register(BytesIO(b"not an image"), registration())

    assert caught.value.code == "INVALID_IMAGE_FILE"
    assert list(store.staging_root.iterdir()) == []


def test_database_commit_failure_removes_promoted_file(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    store = FileStore(tmp_path)
    service = ImageService(lambda: FailingCommitSession(), store, ImageDecoder())

    class FakeRepository:
        def __init__(self, _session: object) -> None:
            pass

        def create(self, **_values: object) -> object:
            return object()

    monkeypatch.setattr(
        "nanodb.services.image_service.ImageRepository",
        FakeRepository,
    )

    with pytest.raises(RuntimeError, match="commit failed"):
        service.register(png_bytes(), registration())

    assert [path for path in tmp_path.iterdir() if path.name != ".staging"] == []
    assert list(store.staging_root.iterdir()) == []
