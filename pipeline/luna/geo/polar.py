"""극평사(polar stereographic)·방위 등거리(AEQD) 변환 (구, R=1737.4 km). 남극이 기본, pole=+1 이면 북극.

평면 좌표 규칙 (이 파이프라인 전체 공통, PDS 극평사 관례와 같다):
    남극 (pole=-1): x = ρ·sin(λ − λ0),  y = +ρ·cos(λ − λ0)   (남극에서 내려다본 평면, 경도 0 이 +y)
    북극 (pole=+1): x = ρ·sin(λ − λ0),  y = −ρ·cos(λ − λ0)   (북극에서 내려다본 평면, 경도 0 이 −y)
    AEQD: ρ = R·c          극평사: ρ = 2R·tan(c/2)        c = 극에서의 중심각 = 90° − pole·φ
원본 파일의 투영 방향(특히 PDS 라벨의 x·y 부호)은 crs.py 가 라벨을 읽어 확인하고, s20 이 전역 DEM 과 대조한다.
"""

from __future__ import annotations

import numpy as np

from luna.constants import R_MOON_KM
from luna.geo.frames import norm_lon

SOUTH, NORTH = -1, 1


def _colat(lat, pole: int):
    return np.radians(90.0 - pole * np.asarray(lat, dtype=float))


def _xy(rho, lon, lon0: float, pole: int):
    l = np.radians(np.asarray(lon, dtype=float) - lon0)
    return rho * np.sin(l), -pole * rho * np.cos(l)


def _lon(x, y, lon0: float, pole: int):
    return norm_lon(np.degrees(np.arctan2(x, -pole * y)) + lon0)


def aeqd_forward(lat, lon, lon0: float = 0.0, r_km: float = R_MOON_KM, pole: int = SOUTH):
    return _xy(r_km * _colat(lat, pole), lon, lon0, pole)


def aeqd_inverse(x_km, y_km, lon0: float = 0.0, r_km: float = R_MOON_KM, pole: int = SOUTH):
    x = np.asarray(x_km, dtype=float)
    y = np.asarray(y_km, dtype=float)
    lat = pole * (90.0 - np.degrees(np.hypot(x, y) / r_km))
    return lat, _lon(x, y, lon0, pole)


def stereo_forward(lat, lon, lon0: float = 0.0, r_km: float = R_MOON_KM, pole: int = SOUTH):
    return _xy(2.0 * r_km * np.tan(_colat(lat, pole) / 2.0), lon, lon0, pole)


def stereo_inverse(x_km, y_km, lon0: float = 0.0, r_km: float = R_MOON_KM, pole: int = SOUTH):
    x = np.asarray(x_km, dtype=float)
    y = np.asarray(y_km, dtype=float)
    lat = pole * (90.0 - np.degrees(2.0 * np.arctan(np.hypot(x, y) / (2.0 * r_km))))
    return lat, _lon(x, y, lon0, pole)


class GridSpec:
    """극 AEQD 격자 (ARCHITECTURE 5.4): 왼쪽 위 모서리 (x0, y0), 행은 아래로 갈수록 y 감소.

    lat_limit_deg 의 부호로 극을 고른다: 음수 = 남극(예 −75), 양수 = 북극(예 +75).
    """

    def __init__(self, cell_km: float, lat_limit_deg: float):
        self.cell_km = cell_km
        self.lat_limit_deg = lat_limit_deg
        self.pole = NORTH if lat_limit_deg > 0 else SOUTH
        radius = np.radians(90.0 - abs(lat_limit_deg)) * R_MOON_KM
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

    def latlon(self, cells: np.ndarray):
        X, Y = self.centers()
        return aeqd_inverse(X.ravel()[cells], Y.ravel()[cells], pole=self.pole)


class BandGridSpec:
    """중·저위도 위도 띠 격자 (전역 확장 안 B).

    위도 방향 칸 높이를 cell_km 로 고정하고, 띠마다 경도 칸 수를 cos(위도) 로 줄여 칸 면적을 거의 같게 한다.
    칸 번호는 남쪽 띠부터 행 우선: 띠 r 의 경도 칸 c → row_offset[r] + c. 띠의 경도 칸은 경도 −180° 에서 시작한다.
    """

    def __init__(self, cell_km: float, lat_max_deg: float):
        self.cell_km = cell_km
        self.lat_max_deg = abs(lat_max_deg)
        span = 2.0 * self.lat_max_deg
        target = np.degrees(cell_km / R_MOON_KM)
        self.n_rows = int(np.ceil(span / target))
        self.dlat_deg = span / self.n_rows
        self.lat_centers = -self.lat_max_deg + (np.arange(self.n_rows) + 0.5) * self.dlat_deg
        self.n_lon = np.maximum(1, np.round(360.0 * np.cos(np.radians(self.lat_centers)) / self.dlat_deg)).astype(np.int64)
        self.row_offset = np.concatenate([[0], np.cumsum(self.n_lon)[:-1]]).astype(np.int64)
        self.n_cells = int(self.n_lon.sum())

    def cell_indices(self) -> np.ndarray:
        return np.arange(self.n_cells, dtype=np.uint32)

    def latlon(self, cells: np.ndarray):
        cells = np.asarray(cells, dtype=np.int64)
        row = np.searchsorted(self.row_offset, cells, side="right") - 1
        col = cells - self.row_offset[row]
        lat = self.lat_centers[row]
        lon = norm_lon(-180.0 + (col + 0.5) * 360.0 / self.n_lon[row])
        return lat, lon

    def locate(self, lat, lon) -> np.ndarray:
        """위경도 → 칸 번호 (범위 밖 −1)."""
        lat = np.asarray(lat, dtype=float)
        lon = np.asarray(lon, dtype=float)
        row = np.floor((lat + self.lat_max_deg) / self.dlat_deg).astype(np.int64)
        ok = (row >= 0) & (row < self.n_rows)
        rr = np.clip(row, 0, self.n_rows - 1)
        col = np.floor(((lon + 180.0) % 360.0) / 360.0 * self.n_lon[rr]).astype(np.int64)
        col = np.minimum(col, self.n_lon[rr] - 1)
        return np.where(ok, self.row_offset[rr] + col, -1)
