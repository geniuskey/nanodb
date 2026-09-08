"""Pillow adapter that validates actual PNG/JPEG/TIFF content."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from PIL import Image as PillowImage
from PIL import UnidentifiedImageError

from nanodb.domain.errors import DomainError


@dataclass(frozen=True, slots=True)
class DecodedImage:
    format: str
    pixel_width: int
    pixel_height: int

    @property
    def extension(self) -> str:
        return {"PNG": ".png", "JPEG": ".jpg", "TIFF": ".tif"}.get(self.format, ".png")


class ImageDecoder:
    supported_formats = frozenset({"PNG", "JPEG", "TIFF"})

    def inspect(self, path: Path) -> DecodedImage:
        try:
            with PillowImage.open(path) as image:
                image.verify()
            with PillowImage.open(path) as image:
                image.load()
                image_format = image.format or ""
                width, height = image.size
        except (OSError, UnidentifiedImageError) as error:
            raise DomainError(
                "INVALID_IMAGE_FILE",
                "File must be a decodable PNG, JPEG or TIFF image.",
                field="file",
            ) from error
        if image_format not in self.supported_formats:
            raise DomainError(
                "UNSUPPORTED_IMAGE_FORMAT",
                "Only PNG, JPEG and TIFF images are supported.",
                field="file",
            )
        if width <= 0 or height <= 0:
            raise DomainError(
                "INVALID_IMAGE_DIMENSIONS",
                "Decoded image dimensions must be positive.",
                field="file",
            )
        return DecodedImage(image_format, width, height)
