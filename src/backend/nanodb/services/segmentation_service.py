"""Run, store and serve multi-Otsu segmentation for registered images.

The original file is only ever read. Every artifact is a new file under
``<upload_root>/derived/{image_id}/`` written atomically, so a concurrent run or
a crash cannot corrupt a served file, and re-running replaces the fixed-name
outputs in place. Segmentation is deterministic: identical parameters yield
identical thresholds and statistics.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from time import perf_counter

from sqlalchemy.orm import Session, sessionmaker

from nanodb.adapters.derived_store import DerivedStore
from nanodb.adapters.file_store import FileStore
from nanodb.adapters.tiff_tags import sha256_of_file, write_tagged_tiff
from nanodb.domain.entities import Image, SegmentationResult
from nanodb.domain.errors import DomainError
from nanodb.domain.segmentation import (
    METHOD,
    SegmentationOutput,
    load_gray,
    render_boundary_png,
    render_map_png,
    run_segmentation,
)
from nanodb.persistence.repositories import (
    ImageRepository,
    SegmentationResultRepository,
)

LOGGER = logging.getLogger("nanodb.segmentation")

_MAP_NAME = "segmentation_map.png"
_BOUNDARY_NAME = "boundary_overlay.png"
_LABELS_NAME = "labels.npy"
_TAGGED_NAME = "tagged.tif"

_TIFF_SUFFIXES = (".tif", ".tiff")


@dataclass(frozen=True, slots=True)
class SegmentationParams:
    classes: int = 4
    denoise_weight: float = 0.08
    min_size: int = 400


@dataclass(frozen=True, slots=True)
class SegmentationRun:
    result: SegmentationResult
    replaced: bool


class SegmentationService:
    def __init__(
        self,
        session_factory: sessionmaker[Session],
        file_store: FileStore,
        derived_store: DerivedStore,
    ) -> None:
        self._session_factory = session_factory
        self._file_store = file_store
        self._derived_store = derived_store

    def _load_image(self, session: Session, image_id: int) -> Image:
        image = ImageRepository(session).find(image_id)
        if image is None:
            raise DomainError("IMAGE_NOT_FOUND", "Image was not found.")
        return image

    def run(self, image_id: int, params: SegmentationParams) -> SegmentationRun:
        if params.denoise_weight <= 0:
            raise DomainError(
                "INVALID_DENOISE_WEIGHT",
                "denoise_weight must be greater than zero.",
                field="denoise_weight",
            )
        if params.min_size < 0:
            raise DomainError(
                "INVALID_MIN_SIZE",
                "min_size must be zero or greater.",
                field="min_size",
            )

        with self._session_factory() as session:
            image = self._load_image(session, image_id)

        original_path = self._file_store.path_for_response(image.stored_filename)
        LOGGER.info(
            json.dumps(
                {
                    "event": "segmentation_start",
                    "image_id": image_id,
                    "classes": params.classes,
                    "denoise_weight": params.denoise_weight,
                    "min_size": params.min_size,
                }
            )
        )
        started = perf_counter()
        gray = load_gray(original_path)
        output = run_segmentation(
            gray,
            classes=params.classes,
            denoise_weight=params.denoise_weight,
            min_size=params.min_size,
            nm_per_pixel=image.calibration_nm_per_pixel,
        )

        map_key = self._derived_store.write_bytes(
            image_id, _MAP_NAME, render_map_png(output.labels, params.classes)
        )
        boundary_key = self._derived_store.write_bytes(
            image_id, _BOUNDARY_NAME, render_boundary_png(gray, output.labels)
        )
        labels_key = self._derived_store.write_array(
            image_id, _LABELS_NAME, output.labels
        )

        tagged_key = self._maybe_write_tagged(
            image_id=image_id,
            original_path=original_path,
            output=output,
            features={},
        )
        duration_ms = int(round((perf_counter() - started) * 1000))

        with self._session_factory() as session:
            repository = SegmentationResultRepository(session)
            replaced = repository.find_by_image(image_id) is not None
            result = repository.upsert(
                image_id=image_id,
                method=METHOD,
                classes=params.classes,
                denoise_weight=params.denoise_weight,
                min_size=params.min_size,
                thresholds=output.thresholds,
                class_stats=output.class_stats,
                map_path=map_key,
                boundary_path=boundary_key,
                labels_path=labels_key,
                tagged_path=tagged_key,
                duration_ms=duration_ms,
                downscaled=output.downscaled,
            )
            session.commit()

        LOGGER.info(
            json.dumps(
                {
                    "event": "segmentation_complete",
                    "image_id": image_id,
                    "duration_ms": duration_ms,
                    "downscaled": output.downscaled,
                    "replaced": replaced,
                    "thresholds": list(output.thresholds),
                }
            )
        )
        return SegmentationRun(result=result, replaced=replaced)

    def _is_tiff(self, stored_filename: str) -> bool:
        return stored_filename.lower().endswith(_TIFF_SUFFIXES)

    def _maybe_write_tagged(
        self,
        *,
        image_id: int,
        original_path: Path,
        output: SegmentationOutput,
        features: dict[str, float],
    ) -> str | None:
        """Write ``tagged.tif`` when the original is a TIFF; else return None."""
        if not self._is_tiff(original_path.name):
            return None
        summary = (
            f"multi-Otsu k={len(output.thresholds) + 1} · "
            f"{[round(t, 4) for t in output.thresholds]}"
        )
        class_area_nm2 = [stat.area_nm2 for stat in output.class_stats]
        tagged_key = self._derived_store.key_for(image_id, _TAGGED_NAME)
        destination = self._derived_store.resolve(tagged_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        write_tagged_tiff(
            original_path,
            destination,
            segmentation=summary,
            features=features,
            class_area_nm2=class_area_nm2,
            source_sha256=sha256_of_file(original_path),
        )
        return tagged_key

    def refresh_tags(self, image_id: int, features: dict[str, float]) -> None:
        """Rewrite ``tagged.tif`` so tag 65011 reflects extracted features.

        Called after feature extraction. A no-op when the image has no
        segmentation or is not a TIFF, so callers need not pre-check.
        """
        with self._session_factory() as session:
            image = self._load_image(session, image_id)
            result = SegmentationResultRepository(session).find_by_image(image_id)
        if result is None or not self._is_tiff(image.stored_filename):
            return
        original_path = self._file_store.path_for_response(image.stored_filename)
        summary = (
            f"multi-Otsu k={result.classes} · "
            f"{[round(t, 4) for t in result.thresholds]}"
        )
        class_area_nm2 = [stat.area_nm2 for stat in result.class_stats]
        tagged_key = self._derived_store.key_for(image_id, _TAGGED_NAME)
        destination = self._derived_store.resolve(tagged_key)
        destination.parent.mkdir(parents=True, exist_ok=True)
        write_tagged_tiff(
            original_path,
            destination,
            segmentation=summary,
            features=features,
            class_area_nm2=class_area_nm2,
            source_sha256=sha256_of_file(original_path),
        )
        with self._session_factory() as session:
            SegmentationResultRepository(session).set_tagged_path(image_id, tagged_key)
            session.commit()

    def get(self, image_id: int) -> SegmentationResult:
        with self._session_factory() as session:
            self._load_image(session, image_id)
            result = SegmentationResultRepository(session).find_by_image(image_id)
        if result is None:
            raise DomainError(
                "SEGMENTATION_NOT_FOUND", "No segmentation exists for this image."
            )
        return result

    def variant_path(self, image_id: int, variant: str) -> Path:
        result = self.get(image_id)
        if variant == "map":
            key = result.map_path
        elif variant == "boundary":
            key = result.boundary_path
        else:
            raise DomainError(
                "INVALID_SEGMENTATION_VARIANT",
                "Variant must be 'map' or 'boundary'.",
                field="variant",
                status=400,
            )
        return self._derived_store.path_for_response(key)

    def tagged_path(self, image_id: int) -> Path:
        with self._session_factory() as session:
            image = self._load_image(session, image_id)
            result = SegmentationResultRepository(session).find_by_image(image_id)
        if not self._is_tiff(image.stored_filename):
            raise DomainError(
                "IMAGE_NOT_TIFF",
                "A tagged copy is only available for TIFF originals.",
                status=409,
            )
        if result is None or result.tagged_path is None:
            raise DomainError(
                "TAGGED_IMAGE_NOT_FOUND",
                "No tagged copy exists. Run segmentation first.",
            )
        return self._derived_store.path_for_response(result.tagged_path)
