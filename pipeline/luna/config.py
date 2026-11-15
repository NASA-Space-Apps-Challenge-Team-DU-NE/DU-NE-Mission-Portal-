"""파이프라인 설정. 팀이 확정하지 않은 값은 # PROVISIONAL (CLAUDE.md 1.1)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def _load_env_file(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if not path.exists():
        return out
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.split(" #", 1)[0].strip().strip('"').strip("'")
        out[k.strip()] = v
    return out


def env(key: str, default: str = "") -> str:
    """환경 변수 → 저장소 루트 .env.local 순서로 찾는다."""
    if os.environ.get(key):
        return os.environ[key]
    return _load_env_file(REPO_ROOT / ".env.local").get(key, default)


@dataclass(frozen=True)
class GridConfig:
    cell_km: float = 5.0  # PROVISIONAL (CLAUDE.md 8.5)
    lat_limit_deg: float = -75.0  # PROVISIONAL
    az_step_deg: float = 5.0
    observer_height_m: float = 2.0  # PROVISIONAL
    max_range_km: float = 250.0  # PROVISIONAL
    horizon_scale_deg: float = 0.01
    # 전역 확장 안 B (2026-11-15 사용자 결정): 북극 5 km AEQD + 75°S–75°N 위도 띠 격자
    north_lat_limit_deg: float = 75.0  # PROVISIONAL
    global_cell_km: float = 15.0  # PROVISIONAL
    global_lat_max_deg: float = 75.0  # PROVISIONAL


@dataclass(frozen=True)
class MaskConfig:
    az_step_deg: float = 1.0
    observer_height_m: float = 2.0  # PROVISIONAL (Drive 지평선 마스크와 같음)
    max_range_km: float = 300.0
    #: PROVISIONAL: 근거리 제외 반경·지면 고도 평균 반경 (km). 30 m DEM 5화소. docs/validation.md 참고
    near_exclude_km: float = 0.15
    ground_radius_km: float = 0.15
    mast_heights_m: tuple[float, ...] = (0.0, 5.0, 10.0, 20.0, 30.0)  # P3-01


@dataclass(frozen=True)
class EphemerisConfig:
    range_start_utc: str = "2026-11-01T00:00:00Z"
    # 2026-11-15 사용자 결정: 착륙 허용 범위 + 1년 임무 시뮬레이션을 덮는다 (2029년 말 착륙까지 + 1년)
    range_stop_utc: str = "2031-01-01T00:00:00Z"
    #: 표를 만드는 경로: "spice"(주 경로, 네트워크 없음) | "horizons"(대조용, 이전 경로)
    source: str = "spice"
    step_h: float = 1.0
    mission_pad_days: float = 15.0
    # 장기 일조율 검증용 (CLAUDE.md 8.10): 1년 이상, 2.5일 간격
    longterm_step_h: float = 60.0


@dataclass(frozen=True)
class Settings:
    data_dir: Path | None
    out_dir: Path
    build_dir: Path
    horizons_cache: Path
    grid: GridConfig = field(default_factory=GridConfig)
    mask: MaskConfig = field(default_factory=MaskConfig)
    eph: EphemerisConfig = field(default_factory=EphemerisConfig)
    #: 웹 산출물 용량 예산 (ARCHITECTURE 8절)
    budget_total_mb: float = 100.0  # 2026-11-15 전역 확장(안 B) 60 → 80 MB, 3D 지형 음영 텍스처·국지 고도 PNG 로 80 → 100 MB
    budget_file_mb: float = 25.0


def load_settings() -> Settings:
    data = env("LUNA_DATA_DIR")
    out = env("LUNA_OUT_DIR") or str(REPO_ROOT / "web" / "public" / "data")
    cache = env("HORIZONS_CACHE_DIR") or str(REPO_ROOT / ".horizons_cache")
    return Settings(
        data_dir=Path(data) if data else None,
        out_dir=Path(out),
        build_dir=REPO_ROOT / "build",
        horizons_cache=Path(cache),
    )
