import numpy as np
import pytest

from luna.geo.polar import GridSpec, aeqd_forward
from luna.stages.s50_layers import Binner, HistAgg, MeanAgg, nearest_km, nearest_value


@pytest.fixture(scope="module")
def binner():
    g = GridSpec(5.0, -75.0)
    return Binner(g, g.cell_indices())


def test_binner_center_roundtrip(binner):
    from luna.geo.polar import aeqd_inverse

    lat, lon = aeqd_inverse(binner.cx[:50], binner.cy[:50])
    assert np.array_equal(binner.index(lat, lon), np.arange(50))
    assert binner.index(np.array([-60.0]), np.array([0.0]))[0] == -1


def test_aggregators():
    m = MeanAgg(3)
    m.add(np.array([0, 0, 1, -1]), np.array([1.0, 3.0, np.nan, 5.0]))
    r = m.result()
    assert r[0] == 2.0 and np.isnan(r[1]) and np.isnan(r[2])
    h = HistAgg(1)
    h.add(np.zeros(10, int), np.arange(10, dtype=float))
    assert h.quantile(0.9)[0] == pytest.approx(8.125)


def test_nearest(binner):
    x, y = aeqd_forward(np.array([-90.0]), np.array([0.0]))
    d = nearest_km(binner, x, y)
    assert np.nanmin(d) < 5.0
    v = nearest_value(binner, np.array([-90.0]), np.array([0.0]), np.array([7.0]), max_km=10.0)
    assert np.nanmax(v) == 7.0 and np.isnan(v).sum() > 0


def test_check_frac_rejects_out_of_range():
    """배율을 잘못 읽어 0–1 밖이 나오면 레이어를 만들지 않고 멈춘다 (예전 블록별 퍼센트 추측 버그)."""
    from luna.stages.s50_layers import _check_frac

    ok = np.array([0.0, 0.5, 1.0, np.nan])
    assert _check_frac("x", ok) is ok
    with pytest.raises(ValueError):
        _check_frac("x", np.array([0.2, 122.0]))


def test_band_scale_defaults_and_values():
    """PGDA69 GeoTIFF 는 int16 + 밴드 배율 (일조율 4e-5, 하늘 입체각 2e-4 + 6.2832)."""
    from types import SimpleNamespace

    from luna.io.geotiff import band_scale

    assert band_scale(SimpleNamespace(scales=(4e-5,), offsets=(0.0,))) == (4e-5, 0.0)
    assert band_scale(SimpleNamespace(scales=(2e-4,), offsets=(6.2832,))) == (2e-4, 6.2832)
    assert band_scale(SimpleNamespace(scales=None, offsets=None)) == (1.0, 0.0)
    assert 25000 * band_scale(SimpleNamespace(scales=(4e-5,), offsets=(0.0,)))[0] == pytest.approx(1.0)
