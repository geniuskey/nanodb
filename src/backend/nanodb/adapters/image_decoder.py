"""Pillow adapter that validates actual PNG/JPEG/TIFF content."""

from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

from PIL import Image as PillowImage
from PIL import UnidentifiedImageError

from nanodb.domain.errors import DomainError

# Formats an <img> tag can display directly. Others (e.g. TIFF) need a
# browser-renderable derivative generated on registration.
BROWSER_RENDERABLE_FORMATS = frozenset({"PNG", "JPEG"})

# Pillow modes that PNG can store without conversion. Anything else (CMYK,
# 16-bit grayscale, etc.) is flattened to RGB for the display derivative.
_PNG_SAFE_MODES = frozenset({"1", "L", "LA", "P", "RGB", "RGBA"})


@dataclass(frozen=True, slots=True)
class DecodedImage:
    format: str
    pixel_width: int
    pixel_height: int

    @property
    def extension(self) -> str:
        return {"PNG": ".png", "JPEG": ".jpg", "TIFF": ".tif"}.get(self.format, ".png")

    @property
    def browser_renderable(self) -> bool:
        """Whether a browser can display the original in an <img> tag."""
        return self.format in BROWSER_RENDERABLE_FORMATS


class ImageDecoder:
    supported_formats = frozenset({"PNG", "JPEG", "TIFF"})

    def render_web_preview(self, path: Path) -> bytes:
        """Return PNG bytes rendering the image at its original pixel size.

        Used for formats browsers cannot display natively (e.g. TIFF). Pixel
        dimensions are preserved so saved measurement coordinates map 1:1 onto
        the derivative shown in the viewer.
        """
        try:
            with PillowImage.open(path) as image:
                image.load()
                prepared = (
                    image if image.mode in _PNG_SAFE_MODES else image.convert("RGB")
                )
                buffer = BytesIO()
                prepared.save(buffer, format="PNG")
        except (OSError, UnidentifiedImageError) as error:
            raise DomainError(
                "INVALID_IMAGE_FILE",
                "File must be a decodable PNG, JPEG or TIFF image.",
                field="file",
            ) from error
        return buffer.getvalue()

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
