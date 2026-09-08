from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from nanodb.adapters.image_decoder import ImageDecoder
from nanodb.domain.errors import DomainError
from PIL import Image as PillowImage


def _write(path: Path, fmt: str) -> Path:
    PillowImage.new("RGB", (12, 8), color=(90, 90, 90)).save(path, format=fmt)
    return path


def test_tiff_is_accepted_with_tif_extension(tmp_path: Path) -> None:
    decoded = ImageDecoder().inspect(_write(tmp_path / "cross-section.tiff", "TIFF"))

    assert decoded.format == "TIFF"
    assert decoded.extension == ".tif"
    assert (decoded.pixel_width, decoded.pixel_height) == (12, 8)


def test_png_and_jpeg_still_accepted(tmp_path: Path) -> None:
    png = ImageDecoder().inspect(_write(tmp_path / "a.png", "PNG"))
    jpeg = ImageDecoder().inspect(_write(tmp_path / "a.jpg", "JPEG"))

    assert png.extension == ".png"
    assert jpeg.extension == ".jpg"


def test_unsupported_format_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(DomainError) as caught:
        ImageDecoder().inspect(_write(tmp_path / "a.bmp", "BMP"))

    assert caught.value.code == "UNSUPPORTED_IMAGE_FORMAT"


def test_non_image_is_rejected(tmp_path: Path) -> None:
    path = tmp_path / "notes.txt"
    path.write_bytes(BytesIO(b"not an image").getvalue())

    with pytest.raises(DomainError) as caught:
        ImageDecoder().inspect(path)

    assert caught.value.code == "INVALID_IMAGE_FILE"
