"""남극 극평사(polar stereographic)·방위 등거리(AEQD) 변환 (구, R=1737.4 km).

남극 기준 평면 좌표 규칙 (이 파이프라인 전체 공통):
    x = ρ·sin(λ − λ0),  y = ρ·cos(λ − λ0)      (남극에서 내려다본 평면, 경도 0 이 +y)
    AEQD: ρ = R·c          극평사: ρ = 2R·tan(c/2)        c = 극에서의 중심각 = (90° + φ)
원본 파일의 투영 방향(특히 PDS 라벨의 x·y 부호)은 crs.py 가 라벨을 읽어 확인한다.
"""

from __future__ import annotations

import numpy as np

from luna.constants import R_MOON_KM
from luna.geo.frames import norm_lon


def aeqd_forward(lat, lon, lon0: float = 0.0, r_km: float = R_MOON_KM):
    c = np.radians(90.0 + np.asarray(lat, dtype=float))
    rho = r_km * c
    l = np.radians(np.asarray(lon, dtype=float) - lon0)
    return rho * np.sin(l), rho * np.cos(l)


def aeqd_inverse(x_km, y_km, lon0: float = 0.0, r_km: float = R_MOON_KM):
    x = np.asarray(x_km, dtype=float)
    y = np.asarray(y_km, dtype=float)
    rho = np.hypot(x, y)
    lat = np.degrees(rho / r_km) - 90.0
    lon = norm_lon(np.degrees(np.arctan2(x, y)) + lon0)
    return lat, lon


def stereo_forward(lat, lon, lon0: float = 0.0, r_km: float = R_MOON_KM):
    c = np.radians(90.0 + np.asarray(lat, dtype=float))
    rho = 2.0 * r_km * np.tan(c / 2.0)
    l = np.radians(np.asarray(lon, dtype=float) - lon0)
    return rho * np.sin(l), rho * np.cos(l)


def stereo_inverse(x_km, y_km, lon0: float = 0.0, r_km: float = R_MOON_KM):
    x = np.asarray(x_km, dtype=float)
    y = np.asarray(y_km, dtype=float)
    rho = np.hypot(x, y)
    lat = np.degrees(2.0 * np.arctan(rho / (2.0 * r_km))) - 90.0
    lon = norm_lon(np.degrees(np.arctan2(x, y)) + lon0)
    return lat, lon


class GridSpec:
    """남극 AEQD 격자 (ARCHITECTURE 5.4): 왼쪽 위 모서리 (x0, y0), 행은 아래로 갈수록 y 감소."""

    def __init__(self, cell_km: float, lat_limit_deg: float):
        self.cell_km = cell_km
        self.lat_limit_deg = lat_limit_deg
        radius = np.radians(90.0 + lat_limit_deg) * R_MOON_KM
        self.n = int(np.ceil(2 * radius / cell_km))
        half = self.n * cell_km / 2.0
        self.x0_km = -half
        self.y0_km = half
        self.radius_km = radius

    def centers(self):
        idx = np.arange(self.n)
        xc = self.x0_km + (idx + 0.5) * self.cell_km
        yc = self.y0_km - (idx + 0.5) * self.cell_km
        X, Y = np.meshgrid(xc, yc)
        return X, Y

    def valid(self):
        X, Y = self.centers()
        return np.hypot(X, Y) <= self.radius_km

    def cell_indices(self) -> np.ndarray:
        """유효 칸의 row*nx+col (행 우선)."""
        return np.flatnonzero(self.valid().ravel()).astype(np.uint32)
