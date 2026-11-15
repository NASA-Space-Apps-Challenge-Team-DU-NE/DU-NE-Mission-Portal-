"""압축 파일: 분할 zip 결합, zip 안 파일 꺼내기, 7z. 결과는 build/ 아래 임시 폴더에만 쓴다."""

from __future__ import annotations

import shutil
import zipfile
from pathlib import Path

from luna.provenance import sha256_file


def join_parts(parts: list[Path], out_path: Path) -> Path:
    """`*.zip.part001` … 를 이어 붙인다. 이미 같은 크기의 결과가 있으면 재사용."""
    parts = sorted(parts)
    total = sum(p.stat().st_size for p in parts)
    if out_path.exists() and out_path.stat().st_size == total:
        return out_path
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp = out_path.with_suffix(out_path.suffix + ".tmp")
    with tmp.open("wb") as w:
        for p in parts:
            with p.open("rb") as r:
                shutil.copyfileobj(r, w, length=1 << 22)
    tmp.replace(out_path)
    return out_path


def extract_member(zip_path: Path, member_suffix: str, out_dir: Path) -> Path:
    """zip 안에서 이름이 member_suffix 로 끝나는 파일 하나를 out_dir 에 꺼낸다."""
    with zipfile.ZipFile(zip_path) as z:
        names = [n for n in z.namelist() if n.lower().endswith(member_suffix.lower())]
        if len(names) != 1:
            raise FileNotFoundError(f"{zip_path.name} 안에 '{member_suffix}' 가 {len(names)}개: {z.namelist()[:10]}")
        info = z.getinfo(names[0])
        target = out_dir / Path(names[0]).name
        if target.exists() and target.stat().st_size == info.file_size:
            return target
        out_dir.mkdir(parents=True, exist_ok=True)
        with z.open(info) as r, target.open("wb") as w:
            shutil.copyfileobj(r, w, length=1 << 22)
        return target


def extract_all(zip_path: Path, out_dir: Path) -> list[Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as z:
        z.extractall(out_dir)
        return [out_dir / n for n in z.namelist() if not n.endswith("/")]


def extract_7z(path: Path, out_dir: Path) -> list[Path]:
    import py7zr

    out_dir.mkdir(parents=True, exist_ok=True)
    with py7zr.SevenZipFile(path, "r") as z:
        z.extractall(out_dir)
    return [p for p in out_dir.rglob("*") if p.is_file()]


def same_sha(a: Path, b: Path) -> bool:
    return sha256_file(a) == sha256_file(b)


def restore_bundle_members(manifest: Path, archive_name: str, members: list[str], build_dir: Path) -> dict[str, Path]:
    """광물 묶음(DOWNLOAD_AND_INSTALL.json) 의 분할 ZIP 을 build/ 에 이어 붙이고 필요한 파일만 꺼낸다.

    조각별 크기·SHA-256 → 이어 붙인 ZIP SHA-256 → 꺼낸 파일 SHA-256 을 매니페스트와 모두 대조한다.
    Drive 쪽(조각이 있는 폴더)에는 아무것도 쓰지 않는다 (공통 규칙 2·7). 묶음의 INSTALL_BUNDLE.py 는
    조립본을 조각 옆에 쓰므로 쓰지 않는다.
    """
    import json

    cfg = json.loads(manifest.read_text(encoding="utf-8"))
    pkg = next((p for p in cfg["packages"] if p["archive"] == archive_name), None)
    if pkg is None:
        raise KeyError(f"{manifest.name} 에 {archive_name} 없음")
    folder = manifest.parent
    out_zip = build_dir / "bundles" / archive_name
    if not (out_zip.exists() and out_zip.stat().st_size == pkg["archive_bytes"] and sha256_file(out_zip) == pkg["archive_sha256"]):
        parts = []
        for part in pkg["parts"]:
            p = folder / part["file"]
            if not p.is_file():
                # Drive 에서 내려받으면 첫 조각 이름 뒤에 .zip 이 붙는 경우가 있다 (내용은 같음, 아래 해시로 확인)
                alt = p.with_name(p.name + ".zip")
                if alt.is_file():
                    p = alt
            if not p.is_file() or p.stat().st_size != part["bytes"]:
                raise ValueError(f"조각 없음 또는 크기 다름 (OneDrive 자리 표시 상태일 수 있음): {p}")
            if sha256_file(p) != part["sha256"]:
                raise ValueError(f"조각 해시 불일치: {p.name}")
            parts.append(p)
        out_zip.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_zip.with_suffix(".assembling")
        with tmp.open("wb") as w:
            for p in parts:  # 매니페스트 배열 순서대로 (sorted 하지 않는다)
                with p.open("rb") as r:
                    shutil.copyfileobj(r, w, length=1 << 22)
        if sha256_file(tmp) != pkg["archive_sha256"]:
            tmp.unlink()
            raise ValueError(f"이어 붙인 {archive_name} 해시 불일치")
        tmp.replace(out_zip)
    want = {c["path"]: c for c in pkg["contents"]}
    out: dict[str, Path] = {}
    dest_root = build_dir / "bundles" / archive_name.removesuffix(".zip")
    with zipfile.ZipFile(out_zip) as z:
        for m in members:
            if m not in want:
                raise KeyError(f"{archive_name} 목록에 {m} 없음")
            target = (dest_root / m).resolve()
            if not target.is_relative_to(dest_root.resolve()):
                raise ValueError(f"안전하지 않은 경로: {m}")
            if not (target.exists() and target.stat().st_size == want[m]["bytes"] and sha256_file(target) == want[m]["sha256"]):
                target.parent.mkdir(parents=True, exist_ok=True)
                with z.open(m) as r, target.open("wb") as w:
                    shutil.copyfileobj(r, w, length=1 << 22)
                if sha256_file(target) != want[m]["sha256"]:
                    raise ValueError(f"꺼낸 파일 해시 불일치: {m}")
            out[m] = target
    return out
