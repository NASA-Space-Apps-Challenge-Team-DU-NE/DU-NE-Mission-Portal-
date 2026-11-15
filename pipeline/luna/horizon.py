"""지평선 마스크 계산 (CLAUDE.md 8.4).

높이 표본기(sampler)는 위경도 배열 → 고도(m, 1737.4 km 구면 기준, 범위 밖 NaN)를 돌려주는 함수들의 목록이다.
가까운 것부터: 30 m → 80 m → 240 m. 각 표본기는 자기 범위(max_km)까지만 쓴다.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Callable

import numpy as np

from luna.constants import R_MOON_KM
from luna.geo.frames import destination

HeightFn = Callable[[np.ndarray, np.ndarray], np.ndarray]


@dataclass
class Sampler:
    name: str
    fn: HeightFn
    #: 관측점에서 이 거리까지 이 DEM 을 쓴다 (km)
    max_km: float
    #: 표본 간격의 하한 (km) — 대개 해상도의 절반
    min_step_km: float


def distance_steps(samplers: list[Sampler], max_range_km: float, growth: float = 0.004) -> tuple[np.ndarray, np.ndarray]:
    """거리 표본과 각 거리에서 쓸 표본기 번호. 간격은 max(해상도/2, 거리×growth)."""
    ds_list, idx_list = [], []
    s = 0.0
    k = 0
    while s < max_range_km:
        while k < len(samplers) - 1 and s >= samplers[k].max_km:
            k += 1
        step = max(samplers[k].min_step_km, s * growth)
        s += step
        if s > max_range_km:
            break
        ds_list.append(s)
        idx_list.append(k)
    return np.array(ds_list), np.array(idx_list, dtype=int)


def ground_height(samplers: list[Sampler], lat: float, lon: float, radius_km: float = 0.0) -> tuple[float, str]:
    """관측점 지면 고도. radius_km > 0 이면 그 반경 원판의 평균 (가장 촘촘한 DEM).

    대표 지점 좌표가 30 m DEM 의 작은 구덩이·돌기 위에 떨어지면 지평선이 수 ° 틀어진다
    (shackleton_rim: 반경 90 m 안이 5–8 m 높아 지평선 +7°). 원판 평균으로 그 영향을 줄인다.
    """
    for sm in samplers:
        h = sm.fn(np.array([lat]), np.array([lon]))[0]
        if not np.isfinite(h):
            continue
        if radius_km <= 0:
            return float(h), sm.name
        rs = np.arange(sm.min_step_km * 2, radius_km + 1e-9, sm.min_step_km * 2)
        az = np.arange(0.0, 360.0, 30.0)
        R, A = np.meshgrid(rs, az)
        plat, plon = destination(lat, lon, A.ravel(), R.ravel())
        v = sm.fn(plat, plon)
        v = np.append(v[np.isfinite(v)], h)
        return float(v.mean()), sm.name
    raise ValueError(f"관측점 고도를 어느 DEM 에서도 찾지 못했다: {lat}, {lon}")


def compute_mask(
    samplers: list[Sampler],
    lat: float,
    lon: float,
    observer_height_m: float,
    az_step_deg: float,
    max_range_km: float,
    growth: float = 0.004,
    near_exclude_km: float = 0.0,
    ground_radius_km: float = 0.0,
):
    """방위별 지평선 고도(°)·실제 탐색 거리(km)·지면 고도(m).

    near_exclude_km: 이 거리 안의 표본은 지평선에서 뺀다 (관측점 바로 옆 DEM 화소 잡음 제외).
    ground_radius_km: 지면 고도를 이 반경 원판 평균으로 (ground_height 참고).
    """
    h0, dem0 = ground_height(samplers, lat, lon, ground_radius_km)
    r0 = R_MOON_KM + (h0 + observer_height_m) / 1000.0
    dist, which = distance_steps(samplers, max_range_km, growth)
    if near_exclude_km > 0:
        keep = dist >= near_exclude_km
        dist, which = dist[keep], which[keep]
    theta = dist / R_MOON_KM
    az = np.arange(0.0, 360.0, az_step_deg)
    elev = np.full(az.size, -90.0)
    reach = np.zeros(az.size)
    used = {dem0}
    for i, a in enumerate(az):
        plat, plon = destination(lat, lon, a, dist)
        h = np.full(dist.size, np.nan)
        for k, sm in enumerate(samplers):
            sel = which == k
            if sel.any():
                h[sel] = sm.fn(plat[sel], plon[sel])
        # 가까운 DEM 범위 밖(NaN)이면 다음 DEM 으로 메운다
        for sm in samplers:
            miss = ~np.isfinite(h)
            if not miss.any():
                break
            h[miss] = sm.fn(plat[miss], plon[miss])
        ok = np.isfinite(h)
        if not ok.any():
            reach[i] = 0.0
            elev[i] = -np.degrees(np.arccos(R_MOON_KM / r0))
            continue
        # 첫 결측 지점에서 멈춘다 (그 뒤는 탐색하지 않음)
        bad = np.flatnonzero(~ok)
        stop = bad[0] if bad.size else dist.size
        r = R_MOON_KM + h[:stop] / 1000.0
        th = theta[:stop]
        e = np.degrees(np.arctan2(r * np.cos(th) - r0, r * np.sin(th)))
        elev[i] = float(e.max()) if e.size else -np.degrees(np.arccos(R_MOON_KM / r0))
        reach[i] = float(dist[stop - 1]) if stop > 0 else 0.0
        used.update(samplers[k].name for k in np.unique(which[:stop]))
    return {"az_deg": az, "elevation_deg": elev, "max_range_km": reach, "ground_elev_m": h0, "dem_used": sorted(used)}
