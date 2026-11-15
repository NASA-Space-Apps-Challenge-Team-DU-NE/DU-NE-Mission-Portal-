import numpy as np
import pytest

from luna.constants import R_MOON_KM
from luna.geo.frames import great_circle_km
from luna.horizon import Sampler, compute_mask


def flat(lat, lon):
    return np.zeros(np.shape(lat))


def test_flat_dem_gives_curvature_dip():
    """평평한 DEM → 지평선은 관측 높이에 따른 곡률만큼 음수 (CLAUDE.md 13절)."""
    r = compute_mask([Sampler("flat", flat, 300, 0.05)], -89.0, 0.0, 2.0, 10.0, 50.0)
    dip = -np.degrees(np.arccos(R_MOON_KM / (R_MOON_KM + 0.002)))
    # 표본이 유한해서 정확한 접선점보다 약간 아래가 나온다
    assert np.all(r["elevation_deg"] <= dip + 1e-6)
    assert np.all(r["elevation_deg"] > dip - 0.05)


def test_single_peak_only_that_azimuth():
    """단일 봉우리 DEM → 그 방위만 높고 수식값과 일치."""
    plat, plon = -88.0, 0.0  # 관측점(−89, 0)에서 북쪽(방위 0°) 약 30.3 km

    def peak(lat, lon):
        d = great_circle_km(lat, lon, plat, plon)
        return np.where(d < 1.0, 1000.0, 0.0)

    r = compute_mask([Sampler("peak", peak, 300, 0.05)], -89.0, 0.0, 0.0, 1.0, 60.0)
    el = r["elevation_deg"]
    i = int(np.argmax(el))
    assert i in (0, 359, 1)
    s = great_circle_km(-89.0, 0.0, plat, plon) - 1.0  # 봉우리 가장자리
    th = s / R_MOON_KM
    rr = R_MOON_KM + 1.0
    expect = np.degrees(np.arctan2(rr * np.cos(th) - R_MOON_KM, rr * np.sin(th)))
    assert el[i] == pytest.approx(expect, abs=0.05)
    assert el[180] < 0


def test_stops_at_missing_data():
    def half(lat, lon):
        d = great_circle_km(lat, lon, -89.0, 0.0)
        return np.where(d < 20.0, 0.0, np.nan)

    r = compute_mask([Sampler("h", half, 300, 0.05)], -89.0, 0.0, 2.0, 30.0, 100.0)
    assert np.all(r["max_range_km"] < 20.1)


def test_pit_under_observer_is_smoothed():
    """관측점이 30 m DEM 의 작은 구덩이(반경 60 m, 깊이 6 m)에 떨어진 경우 (shackleton_rim 사례).

    옵션 없이는 구덩이 벽이 지평선을 수 ° 올리고, 근거리 제외·지면 원판 평균을 쓰면 평지 수준으로 돌아온다.
    """

    def pit(lat, lon):
        d = great_circle_km(lat, lon, -89.0, 0.0)
        return np.where(d < 0.06, -6.0, 0.0)

    smp = [Sampler("dem30", pit, 300, 0.015)]
    raw = compute_mask(smp, -89.0, 0.0, 2.0, 30.0, 20.0)
    fixed = compute_mask(smp, -89.0, 0.0, 2.0, 30.0, 20.0, near_exclude_km=0.15, ground_radius_km=0.15)
    assert raw["elevation_deg"].min() > 2.0
    assert fixed["elevation_deg"].max() < 0.5
