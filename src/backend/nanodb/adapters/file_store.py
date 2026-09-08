"""Safe single-host storage with staged writes and atomic promotion."""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path
from typing import BinaryIO
from uuid import uuid4

from nanodb.domain.errors import DomainError


class FileStore:
    def __init__(self, root: Path, *, size_limit: int = 20 * 1024 * 1024) -> None:
        self.root = root.resolve()
        self.staging_root = self.root / ".staging"
        self.size_limit = size_limit
        self.root.mkdir(parents=True, exist_ok=True)
        self.staging_root.mkdir(parents=True, exist_ok=True)

    @staticmethod
    def _safe_key(key: str) -> str:
        if not key or Path(key).name != key or key in {".", ".."}:
            raise DomainError("INVALID_FILE_KEY", "Stored file key is invalid.")
        return key

    def write_temporary(self, stream: BinaryIO) -> str:
        key = f"{uuid4().hex}.upload"
        path = self.staging_root / key
        total = 0
        try:
            with path.open("xb") as destination:
                while chunk := stream.read(1024 * 1024):
                    total += len(chunk)
                    if total > self.size_limit:
                        raise DomainError(
                            "FILE_TOO_LARGE",
                            "Image must be 20MB or smaller.",
                            field="file",
                        )
                    destination.write(chunk)
            if total == 0:
                raise DomainError(
                    "EMPTY_FILE",
                    "Image file must not be empty.",
                    field="file",
                )
        except BaseException:
            path.unlink(missing_ok=True)
            raise
        return key

    def temporary_path(self, temporary_key: str) -> Path:
        return self.staging_root / self._safe_key(temporary_key)

    def promote(self, temporary_key: str, final_key: str) -> None:
        source = self.temporary_path(temporary_key)
        destination = self.root / self._safe_key(final_key)
        os.replace(source, destination)

    @contextmanager
    def open(self, key: str) -> Iterator[BinaryIO]:
        path = self.root / self._safe_key(key)
        with path.open("rb") as stream:
            yield stream

    def path_for_response(self, key: str) -> Path:
        path = self.root / self._safe_key(key)
        if not path.is_file():
            raise DomainError(
                "IMAGE_FILE_NOT_FOUND",
                "Stored image file is unavailable.",
            )
        return path

    def delete_if_exists(self, key: str, *, temporary: bool = False) -> None:
        root = self.staging_root if temporary else self.root
        (root / self._safe_key(key)).unlink(missing_ok=True)

    def check_read_write(self) -> None:
        probe = self.staging_root / f"{uuid4().hex}.probe"
        try:
            probe.write_bytes(b"ready")
            if probe.read_bytes() != b"ready":
                raise OSError("upload readiness probe returned unexpected data")
        finally:
            probe.unlink(missing_ok=True)
