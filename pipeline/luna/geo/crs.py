"""파일별 원래 좌표계 확인 (CLAUDE.md 4.6 규칙 2·3).

확인하지 못하면 CrsUnknown 예외 → 그 파일은 쓰지 않고 docs/validation.md "좌표계 미확인"에 올린다.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path


class CrsUnknown(RuntimeError):
    pass


@dataclass
class CrsInfo:
    kind: str  # polar_stereographic | geotiff | latlon_table | shapefile | spice_pa | other
    text: str
    params: dict = field(default_factory=dict)
    lon_convention: str | None = None

    def summary(self) -> str:
        p = ", ".join(f"{k}={v}" for k, v in self.params.items())
        return f"{self.kind}: {self.text}" + (f" ({p})" if p else "")


def from_pds_label(label: dict) -> CrsInfo:
    """PDS3 라벨의 IMAGE_MAP_PROJECTION 에서 투영 정보를 읽는다."""
    mp = label.get("IMAGE_MAP_PROJECTION") or {}
    for v in label.values():  # 중첩된 경우
        if not mp and isinstance(v, dict) and isinstance(v.get("IMAGE_MAP_PROJECTION"), dict):
            mp = v["IMAGE_MAP_PROJECTION"]
    if not mp:
        raise CrsUnknown("라벨에 IMAGE_MAP_PROJECTION 이 없다")
    ptype = str(mp.get("MAP_PROJECTION_TYPE", "")).upper()
    keys = [
        "MAP_PROJECTION_TYPE", "A_AXIS_RADIUS", "B_AXIS_RADIUS", "CENTER_LATITUDE", "CENTER_LONGITUDE",
        "MAP_SCALE", "MAP_RESOLUTION", "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET",
        "COORDINATE_SYSTEM_NAME", "COORDINATE_SYSTEM_TYPE", "POSITIVE_LONGITUDE_DIRECTION",
        "MINIMUM_LATITUDE", "MAXIMUM_LATITUDE", "LINE_FIRST_PIXEL", "SAMPLE_FIRST_PIXEL",
    ]
    params = {k: mp.get(k) for k in keys if k in mp}
    if "POLAR STEREOGRAPHIC" not in ptype:
        raise CrsUnknown(f"예상하지 못한 투영: {ptype}")
    for k in ("A_AXIS_RADIUS", "CENTER_LONGITUDE", "MAP_SCALE", "LINE_PROJECTION_OFFSET", "SAMPLE_PROJECTION_OFFSET"):
        if k not in mp:
            raise CrsUnknown(f"라벨에 {k} 가 없다")
    pos = str(mp.get("POSITIVE_LONGITUDE_DIRECTION", "EAST")).upper()
    return CrsInfo("polar_stereographic", f"PDS {ptype}", params, "east+" if "EAST" in pos else "west+")


def from_geotiff(path: Path) -> CrsInfo:
    import rasterio

    with rasterio.open(path) as ds:
        if ds.crs is None:
            raise CrsUnknown(f"GeoTIFF 에 CRS 가 없다: {path.name}")
        wkt = ds.crs.to_wkt()
        try:
            p4 = ds.crs.to_proj4()
        except Exception:  # noqa: BLE001
            p4 = ""
        return CrsInfo("geotiff", p4 or wkt[:200], {"transform": tuple(ds.transform)[:6], "shape": (ds.height, ds.width)})


def from_prj(path: Path) -> CrsInfo:
    if not path.exists():
        raise CrsUnknown(f".prj 가 없다: {path.name}")
    return CrsInfo("shapefile", path.read_text(encoding="latin-1")[:300])


def from_latlon_table(columns: list[str], lon_values) -> CrsInfo:
    from luna.geo.frames import detect_lon_convention

    conv = detect_lon_convention(lon_values)
    if conv == "unknown":
        raise CrsUnknown("경도 값이 없다")
    return CrsInfo("latlon_table", f"columns={columns}", {}, conv)
