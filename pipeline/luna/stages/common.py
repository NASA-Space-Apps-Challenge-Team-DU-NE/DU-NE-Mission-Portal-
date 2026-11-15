"""단계 공통: 실행 문맥, 건너뛰기 도장(stamp), 산출물 쓰기."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from luna.config import Settings
from luna.contracts import Envelope, Provenance, write_json
from luna.paths import DataDir, assert_writable
from luna.provenance import provenance_for
from luna.quality import QualityIndex


@dataclass
class Ctx:
    settings: Settings
    data: DataDir
    qi: QualityIndex
    force: bool = False
    only: list[str] = field(default_factory=list)
    workers: int = 1

    @property
    def out(self) -> Path:
        return self.settings.out_dir

    @property
    def build(self) -> Path:
        return self.settings.build_dir

    def out_path(self, rel: str) -> Path:
        p = self.out / rel
        assert_writable(p, self.data.root)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def build_path(self, rel: str) -> Path:
        p = self.build / rel
        assert_writable(p, self.data.root)
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    def prov(self, path: Path, role: str, allow: set[str] | None = None, allow_unlisted: bool = False, **crs) -> Provenance:
        """Drive 파일 하나의 품질을 확인하고 provenance 를 만든다."""
        rel = self.data.rel(path)
        q = self.qi.require(rel, allow=allow, allow_unlisted=allow_unlisted)
        return provenance_for(rel, path, q, role, **crs)

    # ── 건너뛰기 ──
    def stamp_key(self, stage: str, inputs: list[Path], extra: dict | None = None) -> str:
        h = hashlib.sha256()
        for p in sorted(inputs):
            st = p.stat()
            h.update(f"{p}|{st.st_size}|{st.st_mtime_ns}".encode())
        h.update(json.dumps(extra or {}, sort_keys=True, default=str).encode())
        return h.hexdigest()

    def up_to_date(self, stage: str, key: str) -> bool:
        f = self.build / stage / ".stamp"
        return (not self.force) and f.exists() and f.read_text() == key

    def mark_done(self, stage: str, key: str) -> None:
        f = self.build_path(f"{stage}/.stamp")
        f.write_text(key)


def write_envelope(ctx: Ctx, rel: str, env: Envelope) -> Path:
    p = ctx.out_path(rel)
    write_json(p, env)
    return p


def write_bin(ctx: Ctx, rel: str, arr: np.ndarray, dtype: str) -> Path:
    p = ctx.out_path(rel)
    np.ascontiguousarray(arr.astype(dtype, copy=False)).astype(np.dtype(dtype).newbyteorder("<")).tofile(p)
    return p
