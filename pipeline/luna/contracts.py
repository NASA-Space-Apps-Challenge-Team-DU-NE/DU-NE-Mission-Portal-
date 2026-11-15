"""공용 계약 (CLAUDE.md 8.1, ARCHITECTURE 5절). web/src/core/types.ts 와 같은 내용.

바꾸려면 CLAUDE.md 12.5 절차: types.ts · 이 파일 · ARCHITECTURE 5절을 같은 PR 에서 고친다.
"""

from __future__ import annotations

import json
import math
from dataclasses import asdict, dataclass, field, is_dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

Quality = Literal["VALIDATED", "LIMITED_USE", "REVIEW_REQUIRED", "REFERENCE_ONLY", "VALIDATION_FAILED", "NO_DATA"]
DataKind = Literal["real", "approx", "assumed", "missing"]
TerrainKind = Literal["site", "grid", "flat"]

#: 낮은 쪽이 대표 (ARCHITECTURE 5.1)
QUALITY_ORDER: list[str] = ["VALIDATED", "LIMITED_USE", "REVIEW_REQUIRED", "REFERENCE_ONLY"]
USABLE_QUALITY = set(QUALITY_ORDER)
BLOCKED_QUALITY = {"VALIDATION_FAILED", "NO_DATA"}


def lowest_quality(qs: list[str]) -> str:
    if not qs:
        return "REFERENCE_ONLY"
    return max(qs, key=lambda q: QUALITY_ORDER.index(q) if q in QUALITY_ORDER else len(QUALITY_ORDER))


@dataclass
class Provenance:
    drive_path: str
    sha256: str
    quality: str
    role: str
    source_crs: str | None = None
    transform: str | None = None
    lon_convention: str | None = None


@dataclass
class Envelope:
    schema: str
    data: Any
    provenance: list[Provenance] = field(default_factory=list)
    kind: DataKind = "real"
    quality: str | None = None
    notes: list[str] = field(default_factory=list)
    generated_utc: str = field(default_factory=lambda: utc_now())

    def to_json(self) -> dict[str, Any]:
        q = self.quality or lowest_quality([p.quality for p in self.provenance])
        return {
            "schema": self.schema,
            "generated_utc": self.generated_utc,
            "provenance": [asdict(p) for p in self.provenance],
            "kind": self.kind,
            "quality": q,
            "notes": self.notes,
            "data": to_plain(self.data),
        }


@dataclass
class Site:
    id: str
    name: str
    category: str
    lat_deg: float
    lon_deg: float
    terrain: TerrainKind
    source_keys: list[str]
    verified: bool
    name_en: str | None = None
    elevation_m: float | None = None
    mask: str | None = None
    note: str | None = None
    #: 좌표 종류: landing_point(착륙점) | candidate_point(논문 착륙 후보점) | region_point(지역 대표점) | unknown
    coord_kind: str = "unknown"
    #: 좌표 근거 수준: official | peer_reviewed | inside_official_region | none
    coord_evidence: str = "none"
    coord_source_url: str | None = None
    #: 출처가 밝힌 위치 불확도 (m). 없으면 None
    coord_uncertainty_m: float | None = None


@dataclass
class HorizonMask:
    site_id: str
    lat_deg: float
    lon_deg: float
    ground_elev_m: float
    observer_height_m: float
    az_step_deg: float
    elevation_deg: list[float]
    terrain: TerrainKind
    max_range_km: list[float] | None = None
    dem_used: list[str] | None = None
    compare_drive: dict[str, float] | None = None


@dataclass
class GridManifest:
    projection: str
    cell_km: float
    nx: int
    ny: int
    x0_km: float
    y0_km: float
    lat_limit_deg: float
    n_cells: int
    cells: str
    horizon: dict[str, Any]
    observer_height_m: float


@dataclass
class BandGridManifest:
    """중·저위도 위도 띠 격자 (luna.grid_bands.v1). 칸 번호: 남쪽 띠부터, 띠 r 의 경도 칸 c → sum(n_lon[:r]) + c.

    띠 r 의 위도 범위 [−lat_max + r·dlat, −lat_max + (r+1)·dlat], 경도 칸 c 범위 [−180 + c·360/n_lon[r], …).
    """

    projection: str
    cell_km: float
    lat_max_deg: float
    dlat_deg: float
    n_rows: int
    n_lon: list[int]
    n_cells_total: int
    n_cells: int
    cells: str
    horizon: dict[str, Any]
    observer_height_m: float


@dataclass
class LayerMeta:
    name: str
    file: str
    unit: str
    kind: DataKind
    quality: str
    stat: str
    source_keys: list[str]
    coverage: dict[str, Any]
    caution: str | None = None
    nodata: str = "NaN"


@dataclass
class Mission:
    id: str
    name: str
    agency: str
    landing_utc: str
    lat_deg: float
    lon_deg: float
    duration_h: float | None
    outcome: Literal["success", "partial", "failure"]
    outcome_reason: str
    power: str
    comm: str
    approach: str
    source_keys: list[str]
    verified: bool
    site_id: str | None = None
    ephemeris: str | None = None
    #: 조명 관련 결과인가: yes | no | unknown (근거 문장이 있을 때만 yes/no)
    lighting_related: str = "unknown"
    lighting_evidence: dict[str, Any] | None = None
    #: 착륙 시각 정밀도: second | minute | date | unknown
    landing_precision: str = "unknown"
    #: 필드별 근거 {field: {level, source_url}}
    evidence: dict[str, Any] = field(default_factory=dict)


@dataclass
class Lander:
    id: str
    name: str
    #: 숫자 필드는 근거가 없으면 None (기본값을 주지 않는다, 2026-11-15)
    panel_area_m2: float | None
    efficiency: float | None
    mount: str
    battery_wh: float | None
    battery_min_fraction: float | None
    load_active_w: float | None
    load_idle_w: float | None
    load_survival_w: float | None
    rate_kbps: float | None
    source_keys: list[str]
    approximate: bool = True
    panel_azimuth_deg: float | None = None


@dataclass
class Antenna:
    id: str
    diameter_m: float | None = None
    lat_deg: float | None = None
    lon_deg: float | None = None
    height_m: float | None = None
    horizon_mask: dict[str, Any] | None = None


@dataclass
class Station:
    id: str
    name: str
    network: str
    lat_deg: float
    lon_deg: float
    height_m: float
    antennas: list[Antenna]
    min_elev_deg: float
    source_keys: list[str]
    verified: bool


@dataclass
class PowerRef:
    id: str
    name: str
    value: float
    unit: str
    source_keys: list[str]
    note: str | None = None


@dataclass
class SourceEntry:
    key: str
    name: str
    kind: DataKind
    url: str | None = None
    resolution: str | None = None
    description: str | None = None
    quality: str | None = None
    drive_paths: list[str] | None = None


@dataclass
class ValidationResult:
    metric: str
    n: int
    mean_diff: float
    rmse: float
    r: float | None
    max_abs: float
    conditions: dict[str, Any]
    worst: list[dict[str, Any]]
    passed: bool | None
    threshold: float | None

    def to_json(self) -> dict[str, Any]:
        d = to_plain(self)
        d["pass"] = d.pop("passed")
        return d


# ───────── 직렬화 ─────────
def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def to_plain(x: Any) -> Any:
    if is_dataclass(x) and not isinstance(x, type):
        return {k: to_plain(v) for k, v in asdict(x).items()}
    if isinstance(x, dict):
        return {k: to_plain(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [to_plain(v) for v in x]
    if isinstance(x, float):
        return None if not math.isfinite(x) else round(x, 6)
    if hasattr(x, "item") and callable(x.item):  # numpy 스칼라
        return to_plain(x.item())
    if isinstance(x, Path):
        return x.as_posix()
    return x


def write_json(path: Path, obj: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = obj.to_json() if hasattr(obj, "to_json") else to_plain(obj)
    path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
