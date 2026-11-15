"""DEM 표본기 모음 (s20 산출 메타를 읽어 30 m → 80 m → 240 m 순서로 쓴다)."""

from __future__ import annotations

import json
from pathlib import Path

from luna.horizon import Sampler
from luna.io.pds import PolarPdsSampler, read_pds_image, sampler_for

# PROVISIONAL: 각 DEM 을 쓰는 최대 거리 (km)
NEAR_30M_KM = 15.0
MID_80M_KM = 90.0


class Terrain:
    def __init__(self, meta_path: Path):
        self.meta = json.loads(meta_path.read_text(encoding="utf-8"))
        self._240 = None
        self._80 = None
        self._grid: list | None = None

    @property
    def dem240(self) -> PolarPdsSampler:
        if self._240 is None:
            m = self.meta["dem240"]
            self._240 = PolarPdsSampler(read_pds_image(Path(m["label"]), Path(m["image"])))
        return self._240

    @property
    def dem80(self) -> PolarPdsSampler | None:
        if self._80 is None and self.meta.get("dem80"):
            m = self.meta["dem80"]
            self._80 = PolarPdsSampler(read_pds_image(Path(m["label"]), Path(m["image"])))
        return self._80

    def site_samplers(self, lat: float, lon: float, max_range_km: float) -> list[Sampler]:
        out: list[Sampler] = []
        vrt = self.meta.get("dem30_vrt")
        if vrt:
            try:
                from luna.io.geotiff import GeoTiffSampler

                out.append(Sampler("dem30", GeoTiffSampler(Path(vrt), lat, lon, NEAR_30M_KM + 1), NEAR_30M_KM, 0.015))
            except ImportError:
                pass
        if self.dem80 is not None:
            out.append(Sampler("dem80", self.dem80, MID_80M_KM, 0.04))
        out.append(Sampler("dem240", self.dem240, max_range_km, 0.12))
        return out

    def grid_samplers(self, max_range_km: float) -> list[Sampler]:
        # 북극·전역 메타는 쓸 DEM 목록(grid_dems)을 직접 적는다: 가까운 것부터, 마지막 DEM 은 최대 탐색 거리까지
        if self.meta.get("grid_dems"):
            if self._grid is None:
                self._grid = [(d, sampler_for(read_pds_image(Path(d["label"]), Path(d["image"])))) for d in self.meta["grid_dems"]]
            n = len(self._grid)
            return [Sampler(d["name"], s, max_range_km if i == n - 1 else float(d["max_km"]), float(d["min_step_km"])) for i, (d, s) in enumerate(self._grid)]
        out: list[Sampler] = []
        if self.dem80 is not None:
            out.append(Sampler("dem80", self.dem80, 40.0, 0.08))
        out.append(Sampler("dem240", self.dem240, max_range_km, 0.24))
        return out
