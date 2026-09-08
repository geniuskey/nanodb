"""Unit tests for private-tag TIFF derivation.

Non-negotiable: the original file is never modified. Writing a tagged copy
always produces a new file, base registration tags survive, analysis tags are
added, and the source digest is recorded so the derivative is traceable.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from nanodb.adapters.tiff_tags import (
    BASE_TAGS,
    EXTENDED_TAGS,
    read_tags,
    sha256_of_file,
    write_tagged_tiff,
)
from nanodb.domain.errors import DomainError
from PIL import Image as PillowImage
from PIL.TiffImagePlugin import ImageFileDirectory_v2

_ASCII = 2


def _write_source_tiff(path: Path) -> Path:
    ifd = ImageFileDirectory_v2()
    ifd.tagtype[BASE_TAGS["device"]] = _ASCII
    ifd[BASE_TAGS["device"]] = "TEM-01"
    ifd.tagtype[BASE_TAGS["line_name"]] = _ASCII
    ifd[BASE_TAGS["line_name"]] = "Gate"
    PillowImage.new("L", (16, 12), color=90).save(path, format="TIFF", tiffinfo=ifd)
    return path


def test_write_tagged_tiff_never_modifies_the_source(tmp_path: Path) -> None:
    source = _write_source_tiff(tmp_path / "original.tif")
    digest_before = sha256_of_file(source)

    write_tagged_tiff(
        source,
        tmp_path / "tagged.tif",
        segmentation="multi-Otsu k=4",
        features={},
        class_area_nm2=[1.0, None],
        source_sha256=digest_before,
    )

    assert sha256_of_file(source) == digest_before


def test_tagged_copy_preserves_base_registration_tags(tmp_path: Path) -> None:
    source = _write_source_tiff(tmp_path / "original.tif")
    destination = tmp_path / "tagged.tif"

    write_tagged_tiff(
        source,
        destination,
        segmentation="multi-Otsu k=3",
        features={"pitch_nm": 12.5},
        class_area_nm2=[10.0, 20.0, None],
        source_sha256=sha256_of_file(source),
    )

    tags = read_tags(destination)
    assert tags["device"] == "TEM-01"
    assert tags["line_name"] == "Gate"


def test_tagged_copy_carries_the_analysis_tags(tmp_path: Path) -> None:
    source = _write_source_tiff(tmp_path / "original.tif")
    destination = tmp_path / "tagged.tif"
    digest = sha256_of_file(source)

    write_tagged_tiff(
        source,
        destination,
        segmentation="multi-Otsu k=4 · [0.2, 0.5, 0.8]",
        features={"pitch_nm": 12.5, "cd_nm": 4.0},
        class_area_nm2=[1.0, 2.0, None, 4.0],
        source_sha256=digest,
    )

    tags = read_tags(destination)
    assert tags["segmentation"].startswith("multi-Otsu k=4")
    assert json.loads(tags["features"]) == {"pitch_nm": 12.5, "cd_nm": 4.0}
    assert json.loads(tags["class_area_nm2"]) == [1.0, 2.0, None, 4.0]
    assert tags["source_sha256"] == digest


def test_write_refuses_to_overwrite_the_source(tmp_path: Path) -> None:
    source = _write_source_tiff(tmp_path / "original.tif")

    with pytest.raises(DomainError) as caught:
        write_tagged_tiff(
            source,
            source,
            segmentation="x",
            features={},
            class_area_nm2=[],
            source_sha256="deadbeef",
        )

    assert caught.value.code == "INVALID_TAG_DESTINATION"


def test_features_tag_serialises_deterministically(tmp_path: Path) -> None:
    source = _write_source_tiff(tmp_path / "original.tif")

    write_tagged_tiff(
        source,
        tmp_path / "a.tif",
        segmentation="s",
        features={"b": 2.0, "a": 1.0},
        class_area_nm2=[],
        source_sha256="x",
    )
    write_tagged_tiff(
        source,
        tmp_path / "b.tif",
        segmentation="s",
        features={"a": 1.0, "b": 2.0},
        class_area_nm2=[],
        source_sha256="x",
    )

    assert read_tags(tmp_path / "a.tif")["features"] == (
        read_tags(tmp_path / "b.tif")["features"]
    )


def test_sha256_of_file_matches_hashlib(tmp_path: Path) -> None:
    import hashlib

    path = tmp_path / "blob.bin"
    payload = b"nanodb" * 1000
    path.write_bytes(payload)

    assert sha256_of_file(path) == hashlib.sha256(payload).hexdigest()


def test_all_tag_ids_are_in_the_private_range() -> None:
    for tag_id in {**BASE_TAGS, **EXTENDED_TAGS}.values():
        assert 65000 <= tag_id <= 65535
