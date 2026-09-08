"""Write NanoDB analysis results into private TIFF tags on a derived copy.

The original sample is never modified: writing always produces a new file. The
five registration tags (65000-65004, defined by ``scripts/tem_metadata``) are
copied verbatim so tools that read them keep working, and four analysis tags are
added:

===== ================ ==================================================
tag   name             content
===== ================ ==================================================
65010 segmentation     ``multi-Otsu k=4 · [t1, t2, t3]`` summary string
65011 features         JSON object of feature name -> value
65012 class_area_nm2   JSON array of per-class area in nm^2 (null allowed)
65013 source_sha256    SHA-256 hex digest of the original file
===== ================ ==================================================
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image
from PIL.TiffImagePlugin import ImageFileDirectory_v2

from nanodb.domain.errors import DomainError

# Mirror of scripts/tem_metadata.TAGS; duplicated so the backend does not depend
# on the CLI scripts package. These are preserved unchanged on derived copies.
BASE_TAGS: dict[str, int] = {
    "device": 65000,
    "scrap_step": 65001,
    "length_nm_per_pixel": 65002,
    "line_name": 65003,
    "hole_name": 65004,
}

EXTENDED_TAGS: dict[str, int] = {
    "segmentation": 65010,
    "features": 65011,
    "class_area_nm2": 65012,
    "source_sha256": 65013,
}

_ALL_TAGS: dict[str, int] = {**BASE_TAGS, **EXTENDED_TAGS}
_TAG_NAME_BY_ID: dict[int, str] = {tag_id: name for name, tag_id in _ALL_TAGS.items()}
_ASCII = 2


def sha256_of_file(path: Path) -> str:
    """Return the SHA-256 hex digest of a file, read in bounded chunks."""
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def read_tags(path: str | Path) -> dict[str, str]:
    """Return every known NanoDB tag (base + extended) as a string."""
    result: dict[str, str] = {}
    with Image.open(path) as image:
        tags = getattr(image, "tag_v2", {})
        for tag_id, name in _TAG_NAME_BY_ID.items():
            if tag_id in tags:
                result[name] = str(tags[tag_id]).rstrip("\x00")
    return result


def write_tagged_tiff(
    source: str | Path,
    destination: str | Path,
    *,
    segmentation: str,
    features: dict[str, float],
    class_area_nm2: list[float | None],
    source_sha256: str,
) -> Path:
    """Create a derived TIFF carrying the analysis tags. Never touches source."""
    source_path = Path(source).resolve()
    destination_path = Path(destination).resolve()
    if source_path == destination_path:
        raise DomainError(
            "INVALID_TAG_DESTINATION", "Tagged copy must differ from the source."
        )

    ifd = ImageFileDirectory_v2()
    with Image.open(source_path) as image:
        existing = getattr(image, "tag_v2", {})
        for tag_id in BASE_TAGS.values():
            if tag_id in existing:
                ifd.tagtype[tag_id] = _ASCII
                ifd[tag_id] = str(existing[tag_id]).rstrip("\x00")

    values = {
        "segmentation": segmentation,
        "features": json.dumps(features, ensure_ascii=False, sort_keys=True),
        "class_area_nm2": json.dumps(class_area_nm2),
        "source_sha256": source_sha256,
    }
    for name, value in values.items():
        tag_id = EXTENDED_TAGS[name]
        ifd.tagtype[tag_id] = _ASCII
        ifd[tag_id] = value

    destination_path.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source_path) as image:
        image.load()
        image.save(destination_path, format="TIFF", tiffinfo=ifd)
    return destination_path
