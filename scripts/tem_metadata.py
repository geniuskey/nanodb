"""Read and safely copy NanoDB custom metadata stored in TEM TIFF files.

Custom metadata values are stored as ASCII strings in private TIFF tags.
Writing always creates a different output file so the source sample remains
immutable. The generated file is a derived copy and may not retain unrelated
vendor-specific TIFF tags.

Example:
    from scripts.tem_metadata import read_meta, write_meta

    metadata = read_meta("data/samples/tem/images/tem_007.tif")
    write_meta(
        "data/samples/tem/images/tem_007.tif",
        "var/derived/tem_007_updated.tif",
        scrap_step="STEP_ETCH_01",
    )
"""

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from PIL import Image
from PIL.TiffImagePlugin import ImageFileDirectory_v2


TAGS = {
    "device": 65000,
    "scrap_step": 65001,
    "length_nm_per_pixel": 65002,
    "line_name": 65003,
    "hole_name": 65004,
}

_ASCII = 2


def read_meta(path: str | Path) -> dict[str, str]:
    """Return known NanoDB TIFF metadata using normalized field names."""
    result: dict[str, str] = {}
    with Image.open(path) as image:
        tags = getattr(image, "tag_v2", {})
        for name, tag_id in TAGS.items():
            if tag_id in tags:
                result[name] = str(tags[tag_id]).rstrip("\x00")
    return result


def _validate_fields(fields: dict[str, Any]) -> dict[str, str]:
    unknown = sorted(set(fields) - set(TAGS))
    if unknown:
        raise ValueError(f"Unknown metadata field(s): {', '.join(unknown)}")

    normalized = {name: str(value) for name, value in fields.items()}
    if "length_nm_per_pixel" in normalized:
        try:
            value = float(normalized["length_nm_per_pixel"])
        except ValueError as error:
            raise ValueError("length_nm_per_pixel must be numeric") from error
        if value <= 0:
            raise ValueError("length_nm_per_pixel must be greater than zero")
    return normalized


def write_meta(
    path: str | Path,
    out_path: str | Path,
    **fields: Any,
) -> Path:
    """Create a derived TIFF with updated custom metadata.

    ``out_path`` must differ from ``path``. This intentionally prevents an
    accidental overwrite of the source sample.
    """
    source = Path(path).resolve()
    destination = Path(out_path).resolve()
    if source == destination:
        raise ValueError("out_path must differ from the source path")

    updated = read_meta(source)
    updated.update(_validate_fields(fields))

    destination.parent.mkdir(parents=True, exist_ok=True)
    ifd = ImageFileDirectory_v2()
    for name, value in updated.items():
        tag_id = TAGS[name]
        ifd.tagtype[tag_id] = _ASCII
        ifd[tag_id] = value

    with Image.open(source) as image:
        image.load()
        image.save(destination, format="TIFF", tiffinfo=ifd)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description="Read NanoDB TEM TIFF metadata")
    parser.add_argument("path", type=Path, help="TIFF image to inspect")
    args = parser.parse_args()
    print(read_meta(args.path))


if __name__ == "__main__":
    main()
