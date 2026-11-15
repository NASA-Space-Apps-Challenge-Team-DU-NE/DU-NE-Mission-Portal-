"""provenance 기록: Drive 상대 경로·SHA-256·품질·원래 좌표계 (CLAUDE.md 3-3, 4.6)."""

from __future__ import annotations

import hashlib
from pathlib import Path

from luna.contracts import Provenance

_sha_cache: dict[tuple[str, float, int], str] = {}


def sha256_file(path: Path, chunk: int = 1 << 22) -> str:
    st = path.stat()
    key = (str(path.resolve()), st.st_mtime, st.st_size)
    if key in _sha_cache:
        return _sha_cache[key]
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    _sha_cache[key] = h.hexdigest()
    return _sha_cache[key]


def provenance_for(
    rel: str,
    path: Path | None,
    quality: str,
    role: str,
    source_crs: str | None = None,
    transform: str | None = None,
    lon_convention: str | None = None,
) -> Provenance:
    sha = sha256_file(path) if path is not None and path.exists() else ""
    return Provenance(rel, sha, quality, role, source_crs, transform, lon_convention)


def external(name: str, role: str, quality: str = "REVIEW_REQUIRED", source_crs: str | None = None) -> Provenance:
    """Drive 밖 자료 (예: JPL Horizons API)."""
    return Provenance(f"external:{name}", "", quality, role, source_crs, None, None)
