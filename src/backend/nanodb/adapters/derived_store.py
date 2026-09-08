"""Storage for generated (derived) artifacts under ``<upload_root>/derived``.

Unlike :class:`FileStore`, which owns flat opaque keys for original uploads,
this store lays files out per image (``derived/{image_id}/name``) so an image's
segmentation output is grouped and can be removed as a unit. Writes are staged
to a temporary file and atomically renamed into place, so a reader never sees a
half-written file and two concurrent runs cannot corrupt one another.
"""

from __future__ import annotations

import os
import shutil
from pathlib import Path
from uuid import uuid4

import numpy as np
from numpy.typing import NDArray

from nanodb.domain.errors import DomainError

_DERIVED_DIRNAME = "derived"


class DerivedStore:
    def __init__(self, root: Path) -> None:
        self.root = root.resolve()
        self.base = self.root / _DERIVED_DIRNAME
        self.base.mkdir(parents=True, exist_ok=True)

    def _image_dir(self, image_id: int) -> Path:
        if image_id <= 0:
            raise DomainError("INVALID_DERIVED_KEY", "Image id must be positive.")
        return self.base / str(image_id)

    @staticmethod
    def _safe_name(name: str) -> str:
        if not name or Path(name).name != name or name in {".", ".."}:
            raise DomainError("INVALID_DERIVED_KEY", "Derived file name is invalid.")
        return name

    def key_for(self, image_id: int, name: str) -> str:
        """The stored key (relative to the upload root) for a derived file."""
        return f"{_DERIVED_DIRNAME}/{image_id}/{self._safe_name(name)}"

    def _atomic_replace(self, temporary: Path, destination: Path) -> None:
        try:
            os.replace(temporary, destination)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise

    def write_bytes(self, image_id: int, name: str, data: bytes) -> str:
        directory = self._image_dir(image_id)
        directory.mkdir(parents=True, exist_ok=True)
        safe_name = self._safe_name(name)
        temporary = directory / f".{uuid4().hex}.tmp"
        temporary.write_bytes(data)
        self._atomic_replace(temporary, directory / safe_name)
        return self.key_for(image_id, safe_name)

    def write_array(self, image_id: int, name: str, array: NDArray[np.generic]) -> str:
        directory = self._image_dir(image_id)
        directory.mkdir(parents=True, exist_ok=True)
        safe_name = self._safe_name(name)
        temporary = directory / f".{uuid4().hex}.npy.tmp"
        try:
            with temporary.open("wb") as handle:
                np.save(handle, array, allow_pickle=False)
            self._atomic_replace(temporary, directory / safe_name)
        except BaseException:
            temporary.unlink(missing_ok=True)
            raise
        return self.key_for(image_id, safe_name)

    def resolve(self, key: str) -> Path:
        """Absolute path for a stored key, guarded against path traversal."""
        candidate = (self.root / key).resolve()
        if not candidate.is_relative_to(self.base):
            raise DomainError("INVALID_DERIVED_KEY", "Derived key escapes the store.")
        return candidate

    def path_for_response(self, key: str) -> Path:
        path = self.resolve(key)
        if not path.is_file():
            raise DomainError(
                "DERIVED_FILE_NOT_FOUND", "Derived file is unavailable."
            )
        return path

    def load_array(self, key: str) -> NDArray[np.generic]:
        path = self.path_for_response(key)
        return np.asarray(np.load(path, allow_pickle=False))

    def remove_image_dir(self, image_id: int) -> None:
        """Delete every derived file for an image; a no-op when none exist."""
        shutil.rmtree(self._image_dir(image_id), ignore_errors=True)
