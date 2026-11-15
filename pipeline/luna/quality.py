"""Drive 목록 엑셀(DU-NE_Drive_파일목록_2026-11-14.xlsx)로 파일 품질 상태를 조회하고 금지 파일을 막는다."""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

from luna.contracts import BLOCKED_QUALITY, USABLE_QUALITY
from luna.paths import FORBIDDEN

SHEET = "파일 목록"
COL_NAME = "파일명"
COL_QUALITY = "품질 상태"
COL_FOLDER = "폴더 경로"
COL_SIZE = "크기 (바이트)"
COL_MISSIONS = "관련 과학 임무"


class QualityError(RuntimeError):
    pass


@dataclass
class FileRecord:
    rel: str
    name: str
    quality: str
    size: str
    missions: str


def _norm_rel(folder: str, name: str) -> str:
    f = (folder or "").replace("\\", "/").strip().strip("/")
    if f in (".", "./"):
        f = ""
    if f.startswith("./"):
        f = f[2:]
    for prefix in ("DU_NE Data/", "DU_NE Data", "내 드라이브/DU_NE Data/"):
        if f.startswith(prefix):
            f = f[len(prefix):].strip("/")
    return f"{f}/{name}" if f else name


class QualityIndex:
    def __init__(self, records: list[FileRecord]):
        self.records = records
        self.by_rel = {r.rel.lower(): r for r in records}
        self.by_name: dict[str, list[FileRecord]] = {}
        for r in records:
            self.by_name.setdefault(r.name.lower(), []).append(r)

    @classmethod
    def from_xlsx(cls, path: Path) -> "QualityIndex":
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        if SHEET not in wb.sheetnames:
            raise QualityError(f"엑셀에 '{SHEET}' 시트가 없다: {wb.sheetnames}")
        rows = wb[SHEET].iter_rows(values_only=True)
        # 제목 줄이 몇 줄 있으므로 '파일명' 이 있는 줄을 머리줄로 쓴다
        header: list[str] = []
        for _ in range(30):
            r = next(rows, None)
            if r is None:
                break
            cells = [str(h).strip() if h is not None else "" for h in r]
            if COL_NAME in cells:
                header = cells
                break
        need = [COL_NAME, COL_QUALITY, COL_FOLDER]
        missing = [c for c in need if c not in header]
        if missing:
            raise QualityError(f"엑셀 열이 없다: {missing} (있는 열: {header})")
        ix = {c: header.index(c) for c in header if c}
        recs: list[FileRecord] = []
        for row in rows:
            if row is None or row[ix[COL_NAME]] is None:
                continue
            name = str(row[ix[COL_NAME]]).strip()
            recs.append(
                FileRecord(
                    rel=_norm_rel(str(row[ix[COL_FOLDER]] or ""), name),
                    name=name,
                    quality=str(row[ix[COL_QUALITY]] or "").strip(),
                    size=str(row[ix[COL_SIZE]] or "") if COL_SIZE in ix else "",
                    missions=str(row[ix[COL_MISSIONS]] or "") if COL_MISSIONS in ix else "",
                )
            )
        return cls(recs)

    def lookup(self, rel: str) -> FileRecord | None:
        r = self.by_rel.get(rel.replace("\\", "/").lower())
        if r:
            return r
        hits = self.by_name.get(Path(rel).name.lower(), [])
        return hits[0] if len(hits) == 1 else None

    def quality_of(self, rel: str) -> str | None:
        r = self.lookup(rel)
        return r.quality if r else None

    def require(self, rel: str, allow: set[str] | None = None, allow_unlisted: bool = False) -> str:
        """사용 전 품질 확인. VALIDATION_FAILED·NO_DATA·금지 파일은 예외."""
        check_forbidden(rel)
        q = self.quality_of(rel)
        if q is None:
            if allow_unlisted:
                return "REVIEW_REQUIRED"
            raise QualityError(f"Drive 목록 엑셀에 없는 파일: {rel} (CLAUDE.md 4.4 에 추가 후 사용)")
        if q in BLOCKED_QUALITY:
            raise QualityError(f"사용 금지 품질 {q}: {rel}")
        if q not in USABLE_QUALITY:
            raise QualityError(f"알 수 없는 품질 상태 '{q}': {rel}")
        if allow is not None and q not in allow:
            raise QualityError(f"이 용도에 허용되지 않는 품질 {q} (허용 {sorted(allow)}): {rel}")
        return q


def check_forbidden(rel: str) -> None:
    norm = rel.replace("\\", "/")
    for bad in FORBIDDEN:
        if bad in norm:
            raise QualityError(f"쓰면 안 되는 파일 (CLAUDE.md 4.5): {rel}")
    if re.search(r"diviner.*(^|[_/])st([_.]|$)", norm, re.IGNORECASE):
        raise QualityError(f"Diviner ST 온도 제품은 분석 제외 (CLAUDE.md 4.5): {rel}")


def find_inventory(data_root: Path) -> Path:
    from luna.paths import INVENTORY_XLSX_GLOB

    hits = sorted(data_root.glob(INVENTORY_XLSX_GLOB)) or sorted(data_root.glob(f"**/{INVENTORY_XLSX_GLOB}"))
    if not hits:
        raise QualityError(f"Drive 목록 엑셀({INVENTORY_XLSX_GLOB})을 {data_root} 에서 찾지 못했다")
    return hits[0]
