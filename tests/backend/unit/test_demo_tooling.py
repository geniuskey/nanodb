"""US-01 tests for the offline demo preparation, preflight and reset guards.

These tests exercise the demo tooling against an isolated temporary source and
demo tree so the real repository samples and derivatives are never touched.
The database-backed reset path is covered in the integration suite.
"""

from __future__ import annotations

import csv
import hashlib
from pathlib import Path
from types import SimpleNamespace

import pytest
from PIL import Image as PillowImage

from scripts import preflight_demo, prepare_demo_samples, reset_demo

MANIFEST_FIELDS = prepare_demo_samples.MANIFEST_FIELDS


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _make_tif(path: Path, size: tuple[int, int]) -> None:
    PillowImage.new("RGB", size, color=(120, 120, 120)).save(path, format="TIFF")


def _read_manifest(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8", newline="") as stream:
        return list(csv.DictReader(stream))


def _write_manifest(path: Path, rows: list[dict[str, str]]) -> None:
    with path.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(MANIFEST_FIELDS))
        writer.writeheader()
        writer.writerows(rows)


@pytest.fixture
def demo_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> SimpleNamespace:
    source_root = tmp_path / "samples" / "tem"
    source_images = source_root / "images"
    source_images.mkdir(parents=True)
    source_manifest = source_root / "metadata.csv"

    demo_root = tmp_path / "demo"
    demo_images = demo_root / "images"
    demo_manifest = demo_root / "manifest.csv"

    specs = (
        prepare_demo_samples.DemoSpec("s1", "demo_s1.png", "TEM", "P1", "L1", "W1"),
        prepare_demo_samples.DemoSpec("s2", "demo_s2.png", "TEM", "P2", "L2", "W2"),
        prepare_demo_samples.DemoSpec("s3", "demo_s3.png", "SEM", "P3", "L3", "W3"),
    )

    source_rows: list[dict[str, str]] = []
    for index, spec in enumerate(specs, start=1):
        tif_path = source_images / f"{spec.source_id}.tif"
        _make_tif(tif_path, size=(40 + index, 30 + index))
        source_rows.append(
            {
                "sample_id": spec.source_id,
                "filename": f"{spec.source_id}.tif",
                "length_nm_per_pixel": f"{0.5 + index * 0.1:.4f}",
                "sha256": _sha256(tif_path),
                "license": prepare_demo_samples.AUTHORIZED_LICENSE,
            }
        )
    with source_manifest.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(
            stream,
            fieldnames=[
                "sample_id",
                "filename",
                "length_nm_per_pixel",
                "sha256",
                "license",
            ],
        )
        writer.writeheader()
        writer.writerows(source_rows)

    for module in (prepare_demo_samples, preflight_demo):
        monkeypatch.setattr(module, "SOURCE_IMAGE_ROOT", source_images)
        monkeypatch.setattr(module, "SOURCE_MANIFEST", source_manifest)
        monkeypatch.setattr(module, "DEMO_IMAGE_ROOT", demo_images)
        monkeypatch.setattr(module, "DEMO_MANIFEST", demo_manifest)
    monkeypatch.setattr(prepare_demo_samples, "DEMO_ROOT", demo_root)
    monkeypatch.setattr(prepare_demo_samples, "DEMO_SPECS", specs)

    rows = prepare_demo_samples.prepare()

    return SimpleNamespace(
        source_images=source_images,
        source_manifest=source_manifest,
        source_rows=source_rows,
        demo_images=demo_images,
        demo_manifest=demo_manifest,
        rows=rows,
    )


# --- prepare -------------------------------------------------------------


def test_prepare_creates_derivatives_and_manifest(demo_env: SimpleNamespace) -> None:
    assert len(demo_env.rows) == 3
    assert demo_env.demo_manifest.is_file()
    for row in demo_env.rows:
        derivative = demo_env.demo_images / row["demo_filename"]
        assert derivative.is_file()
        with PillowImage.open(derivative) as image:
            assert image.format == "PNG"


def test_prepare_does_not_modify_source_samples(demo_env: SimpleNamespace) -> None:
    for source in demo_env.source_rows:
        tif_path = demo_env.source_images / source["filename"]
        assert _sha256(tif_path) == source["sha256"]


def test_prepare_rejects_unauthorized_source(
    demo_env: SimpleNamespace, monkeypatch: pytest.MonkeyPatch
) -> None:
    unknown = (
        prepare_demo_samples.DemoSpec("unknown", "demo_x.png", "TEM", "P", "L", "W"),
    )
    monkeypatch.setattr(prepare_demo_samples, "DEMO_SPECS", unknown)
    with pytest.raises(prepare_demo_samples.PreparationError, match="unauthorized"):
        prepare_demo_samples.prepare()


# --- preflight -----------------------------------------------------------


def test_preflight_passes_for_prepared_demo(demo_env: SimpleNamespace) -> None:
    errors, warnings = preflight_demo.run()
    assert errors == []
    assert warnings == []


def test_preflight_flags_missing_manifest(demo_env: SimpleNamespace) -> None:
    demo_env.demo_manifest.unlink()
    errors, _ = preflight_demo.run()
    assert any("manifest is missing" in error for error in errors)


def test_preflight_flags_missing_derivative(demo_env: SimpleNamespace) -> None:
    (demo_env.demo_images / "demo_s1.png").unlink()
    errors, _ = preflight_demo.run()
    assert any("missing demo derivative" in error for error in errors)


def test_preflight_flags_unlisted_derivative(demo_env: SimpleNamespace) -> None:
    PillowImage.new("RGB", (10, 10)).save(
        demo_env.demo_images / "extra.png", format="PNG"
    )
    errors, _ = preflight_demo.run()
    assert any("is not listed in manifest" in error for error in errors)


def test_preflight_flags_undecodable_derivative(demo_env: SimpleNamespace) -> None:
    (demo_env.demo_images / "demo_s1.png").write_bytes(b"not an image")
    errors, _ = preflight_demo.run()
    assert any("cannot decode derivative" in error for error in errors)


def test_preflight_flags_non_png_format(demo_env: SimpleNamespace) -> None:
    PillowImage.new("RGB", (41, 31)).save(
        demo_env.demo_images / "demo_s1.png", format="JPEG"
    )
    errors, _ = preflight_demo.run()
    assert any("cannot decode derivative" in error for error in errors)


def test_preflight_flags_dimension_mismatch(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["original_pixel_width"] = "9999"
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("recorded dimensions do not match" in error for error in errors)


def test_preflight_flags_derivative_hash_mismatch(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["derivative_sha256"] = "0" * 64
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("derivative SHA-256 mismatch" in error for error in errors)


def test_preflight_flags_source_hash_mismatch(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["source_sha256"] = "0" * 64
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("source SHA-256" in error for error in errors)


def test_preflight_flags_non_positive_calibration(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["calibration_nm_per_pixel"] = "0"
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("calibration must be positive" in error for error in errors)


def test_preflight_flags_non_numeric_calibration(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["calibration_nm_per_pixel"] = "abc"
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("calibration is not numeric" in error for error in errors)


def test_preflight_flags_unauthorized_source(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["source_id"] = "not_approved"
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("source is not authorized" in error for error in errors)


def test_preflight_flags_invalid_timestamp(demo_env: SimpleNamespace) -> None:
    rows = _read_manifest(demo_env.demo_manifest)
    rows[0]["converted_at"] = "not-a-timestamp"
    _write_manifest(demo_env.demo_manifest, rows)
    errors, _ = preflight_demo.run()
    assert any("converted_at is not a valid timestamp" in error for error in errors)


def test_root_errors_flags_source_overlap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    shared = tmp_path / "shared"
    shared.mkdir()
    monkeypatch.setattr(preflight_demo, "SOURCE_IMAGE_ROOT", shared)
    monkeypatch.setattr(preflight_demo, "DEMO_IMAGE_ROOT", shared)
    errors = preflight_demo._root_errors(tmp_path / "uploads")
    assert any("source sample" in error for error in errors)


def test_root_errors_flags_runtime_overlap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    demo = tmp_path / "demo"
    demo.mkdir()
    monkeypatch.setattr(preflight_demo, "SOURCE_IMAGE_ROOT", tmp_path / "src")
    monkeypatch.setattr(preflight_demo, "DEMO_IMAGE_ROOT", demo)
    errors = preflight_demo._root_errors(demo)
    assert any("runtime upload" in error for error in errors)


# --- reset guards --------------------------------------------------------


def test_reset_requires_demo_profile(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NANODB_PROFILE", "prod")
    with pytest.raises(reset_demo.ResetGuardError, match="NANODB_PROFILE"):
        reset_demo.reset(confirmed=True)


def test_reset_requires_explicit_confirmation(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    upload_root = tmp_path / "var" / "uploads"
    monkeypatch.setenv("NANODB_PROFILE", "demo")
    monkeypatch.setenv("UPLOAD_ROOT", str(upload_root))
    monkeypatch.setattr(reset_demo, "EXPECTED_UPLOAD_ROOT", upload_root)
    with pytest.raises(reset_demo.ResetGuardError, match="--yes"):
        reset_demo.reset(confirmed=False)


def test_assert_safe_upload_root_rejects_mismatch(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        reset_demo, "EXPECTED_UPLOAD_ROOT", tmp_path / "var" / "uploads"
    )
    with pytest.raises(reset_demo.ResetGuardError, match="dedicated demo target"):
        reset_demo._assert_safe_upload_root(tmp_path / "somewhere" / "else")


def test_assert_safe_upload_root_rejects_source_overlap(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source_root = tmp_path / "data" / "samples"
    target = source_root / "uploads"
    monkeypatch.setattr(reset_demo, "SOURCE_ROOT", source_root)
    monkeypatch.setattr(reset_demo, "EXPECTED_UPLOAD_ROOT", target)
    with pytest.raises(reset_demo.ResetGuardError, match="overlaps"):
        reset_demo._assert_safe_upload_root(target)


def test_assert_safe_upload_root_accepts_expected_target(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    target = tmp_path / "var" / "uploads"
    monkeypatch.setattr(reset_demo, "EXPECTED_UPLOAD_ROOT", target)
    assert reset_demo._assert_safe_upload_root(target) == target.resolve()


def test_clear_directory_empties_target_but_keeps_staging(tmp_path: Path) -> None:
    root = tmp_path / "uploads"
    staging = root / ".staging"
    staging.mkdir(parents=True)
    (root / "image.png").write_bytes(b"binary")
    (staging / "leftover.upload").write_bytes(b"partial")
    (root / "subdir").mkdir()
    (root / "subdir" / "nested.bin").write_bytes(b"x")

    reset_demo._clear_directory(root)

    assert root.is_dir()
    assert list(root.iterdir()) == [staging]
    assert list(staging.iterdir()) == []


def test_clear_directory_creates_missing_root(tmp_path: Path) -> None:
    root = tmp_path / "uploads"
    reset_demo._clear_directory(root)
    assert root.is_dir()
    assert list(root.iterdir()) == []
