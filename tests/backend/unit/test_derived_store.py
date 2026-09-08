"""Unit tests for the derived-artifact store.

The store must lay files out per image, write atomically, refuse keys that
escape its base directory, and remove an image's artifacts as a unit. It never
touches original uploads (a separate FileStore owns those).
"""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from nanodb.adapters.derived_store import DerivedStore
from nanodb.domain.errors import DomainError


def test_write_bytes_groups_files_under_the_image_directory(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    key = store.write_bytes(7, "map.png", b"pixels")

    assert key == "derived/7/map.png"
    assert store.path_for_response(key).read_bytes() == b"pixels"


def test_write_array_round_trips_without_pickle(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)
    array = np.arange(12, dtype=np.uint8).reshape(3, 4)

    key = store.write_array(3, "labels.npy", array)
    loaded = store.load_array(key)

    assert np.array_equal(loaded, array)


def test_write_leaves_no_temporary_files_behind(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    store.write_bytes(1, "a.png", b"x")
    store.write_array(1, "b.npy", np.zeros(3, dtype=np.uint8))

    directory = tmp_path / "derived" / "1"
    leftovers = [p.name for p in directory.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []


def test_key_for_rejects_a_traversing_name(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    with pytest.raises(DomainError) as caught:
        store.key_for(1, "../escape.png")

    assert caught.value.code == "INVALID_DERIVED_KEY"


def test_resolve_rejects_a_key_that_escapes_the_base(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    with pytest.raises(DomainError) as caught:
        store.resolve("derived/../../secret.png")

    assert caught.value.code == "INVALID_DERIVED_KEY"


def test_image_directory_rejects_a_non_positive_id(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    with pytest.raises(DomainError) as caught:
        store.write_bytes(0, "map.png", b"x")

    assert caught.value.code == "INVALID_DERIVED_KEY"


def test_path_for_response_reports_a_missing_file(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    with pytest.raises(DomainError) as caught:
        store.path_for_response("derived/1/absent.png")

    assert caught.value.code == "DERIVED_FILE_NOT_FOUND"


def test_remove_image_dir_deletes_all_artifacts(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)
    key = store.write_bytes(5, "map.png", b"x")

    store.remove_image_dir(5)

    assert not (tmp_path / "derived" / "5").exists()
    with pytest.raises(DomainError):
        store.path_for_response(key)


def test_remove_image_dir_is_a_no_op_when_absent(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    store.remove_image_dir(42)  # must not raise


def test_rewriting_a_key_replaces_the_previous_content(tmp_path: Path) -> None:
    store = DerivedStore(tmp_path)

    store.write_bytes(2, "map.png", b"first")
    key = store.write_bytes(2, "map.png", b"second")

    assert store.path_for_response(key).read_bytes() == b"second"
