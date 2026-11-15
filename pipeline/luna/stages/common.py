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
    # 이번 단계에서 쓴 산출물 (mark_done 이 크기·해시를 도장에 남긴다)
    _written: list[Path] = field(default_factory=list)
    _inputs: dict[tuple[str, str, str], Provenance] = field(default_factory=dict)

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
        self._written.append(p)
        return p

    def build_path(self, rel: str) -> Path:
        p = self.build / rel
        assert_writable(p, self.data.root)
        p.parent.mkdir(parents=True, exist_ok=True)
        self.track_output(p)
        return p

    def track_output(self, path: Path) -> None:
        """이 단계가 계속 참조하는 기존 파일도 완료 도장에 포함한다."""
        self._written.append(path)

    def prov(self, path: Path, role: str, allow: set[str] | None = None, allow_unlisted: bool = False, **crs) -> Provenance:
        """Drive 파일 하나의 품질을 확인하고 provenance 를 만든다."""
        rel = self.data.rel(path)
        q = self.qi.require(rel, allow=allow, allow_unlisted=allow_unlisted)
        pv = provenance_for(rel, path, q, role, **crs)
        self._inputs[(pv.drive_path, pv.role, pv.sha256)] = pv
        return pv

    def record_input(self, path: Path, role: str, source_crs: str | None = None) -> None:
        """검증에서 실제로 읽은 파일의 해시를 기록한다. 산출물은 Drive 출처와 구별한다.

        산출물에 이미 적힌 원본 출처는 그대로 승계하며, 현재 원본을 다시
        검증했다고 주장하지 않는다. 확인하지 않은 CRS 는 채우지 않는다.
        """
        path = path.resolve()
        if path.is_relative_to(self.data.root.resolve()):
            rel = self.data.rel(path)
            quality = self.qi.quality_of(rel) if self.qi else None
        else:
            roots = {"out": self.out.resolve(), "build": self.build.resolve()}
            root = next((key for key, value in roots.items() if path.is_relative_to(value)), None)
            if root is None:
                raise ValueError(f"검증 입력 경로가 Drive/out/build 밖: {path}")
            rel = f"artifact:{root}/{path.relative_to(roots[root]).as_posix()}"
            quality = None
        if any(k[0] == rel and k[1] == role for k in self._inputs):
            return
        inherited = []
        if path.suffix.lower() == ".json":
            try:
                js = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(js, dict):
                    quality = js.get("quality") or quality
                    inherited = js.get("provenance", [])
            except (OSError, ValueError):
                pass
        pv = provenance_for(rel, path, quality or "REVIEW_REQUIRED", role, source_crs=source_crs)
        self._inputs[(pv.drive_path, pv.role, pv.sha256)] = pv
        for raw in inherited:
            pv = Provenance(**raw)
            self._inputs[(pv.drive_path, pv.role, pv.sha256)] = pv

    # ── 건너뛰기 ──
    def stamp_key(self, stage: str, inputs: list[Path], extra: dict | None = None) -> str:
        h = hashlib.sha256()
        for p in sorted(inputs):
            st = p.stat()
            h.update(f"{p}|{st.st_size}|{st.st_mtime_ns}".encode())
        h.update(json.dumps(extra or {}, sort_keys=True, default=str).encode())
        # 출력 폴더가 바뀌면 다시 만든다 (LUNA_OUT_DIR 변경)
        h.update(f"out={self.out.resolve()}".encode())
        h.update(f"build={self.build.resolve()}".encode())
        return h.hexdigest()

    def up_to_date(self, stage: str, key: str) -> bool:
        """입력 키·출력 폴더가 같고, 지난번에 쓴 산출물이 모두 같은 크기·해시로 남아 있을 때만 건너뛴다."""
        self._written = []
        f = self.build / stage / ".stamp"
        if self.force or not f.exists():
            return False
        try:
            st = json.loads(f.read_text(encoding="utf-8"))
        except (ValueError, OSError):
            return False  # 예전 형식(키만 적힌 도장) → 다시 계산
        roots = {"out": self.out.resolve(), "build": self.build.resolve()}
        if not isinstance(st, dict) or st.get("version") != 2 or st.get("key") != key or st.get("roots") != {k: str(v) for k, v in roots.items()}:
            return False
        try:
            outputs = st["outputs"]
            if not isinstance(outputs, list) or not outputs:
                return False
            for entry in outputs:
                root = roots[entry["root"]]
                p = (root / entry["path"]).resolve()
                if not p.is_relative_to(root) or not p.is_file() or p.stat().st_size != entry["bytes"] or _sha256(p) != entry["sha256"]:
                    return False
        except (OSError, KeyError, TypeError, ValueError):
            return False
        return True

    def invalidate(self, stage: str) -> None:
        """실패한 재계산에 이전 성공 도장을 남기지 않는다."""
        stamp = self.build / stage / ".stamp"
        assert_writable(stamp, self.data.root)
        stamp.unlink(missing_ok=True)

    def mark_done(self, stage: str, key: str) -> None:
        outs = []
        roots = {"out": self.out.resolve(), "build": self.build.resolve()}
        for p in dict.fromkeys(self._written):
            p = p.resolve()
            if p.is_file() and p.name != ".stamp":
                name = next((k for k, root in roots.items() if p.is_relative_to(root)), None)
                if name is None:
                    raise ValueError(f"산출물이 out/build 밖에 있음: {p}")
                outs.append({"root": name, "path": p.relative_to(roots[name]).as_posix(), "bytes": p.stat().st_size, "sha256": _sha256(p)})
        f = self.build_path(f"{stage}/.stamp")
        tmp = f.with_suffix(".tmp")
        tmp.write_text(json.dumps({"version": 2, "key": key, "roots": {k: str(v) for k, v in roots.items()}, "outputs": outs}, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(f)
        self._written = []


def _sha256(p: Path) -> str:
    h = hashlib.sha256()
    with p.open("rb") as r:
        for b in iter(lambda: r.read(1 << 22), b""):
            h.update(b)
    return h.hexdigest()


def write_envelope(ctx: Ctx, rel: str, env: Envelope) -> Path:
    p = ctx.out_path(rel)
    write_json(p, env)
    return p


def write_bin(ctx: Ctx, rel: str, arr: np.ndarray, dtype: str) -> Path:
    p = ctx.out_path(rel)
    np.ascontiguousarray(arr.astype(dtype, copy=False)).astype(np.dtype(dtype).newbyteorder("<")).tofile(p)
    return p
