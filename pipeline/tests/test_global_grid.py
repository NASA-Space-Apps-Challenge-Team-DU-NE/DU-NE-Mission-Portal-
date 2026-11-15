"""전역 확장(안 B): 북극 투영, 위도 띠 격자, 원통 PDS 표본기."""
import numpy as np
import pytest

from luna.geo.frames import great_circle_km, norm_lon
from luna.geo.polar import NORTH, BandGridSpec, GridSpec, aeqd_forward, aeqd_inverse, stereo_forward, stereo_inverse
from luna.io.pds import CylindricalPdsSampler, PolarPdsSampler, read_pds_image, sampler_for


@pytest.mark.parametrize("fwd,inv", [(aeqd_forward, aeqd_inverse), (stereo_forward, stereo_inverse)])
def test_north_roundtrip(fwd, inv):
    lat = np.array([89.99, 85.0, 80.0, 75.0])
    lon = np.array([0.0, 120.0, -179.9, 45.0])
    x, y = fwd(lat, lon, pole=NORTH)
    la, lo = inv(x, y, pole=NORTH)
    assert np.allclose(la, lat, atol=1e-9)
    assert np.allclose(norm_lon(lo - lon), 0, atol=1e-9)


def test_north_pds_convention():
    # PDS 북극 극 투영: 경도 0° 는 −y(아래), 90°E 는 +x
    x, y = aeqd_forward(89.0, 0.0, pole=NORTH)
    assert x == pytest.approx(0, abs=1e-9) and y < 0
    x, y = aeqd_forward(89.0, 90.0, pole=NORTH)
    assert x > 0 and y == pytest.approx(0, abs=1e-9)


def test_north_grid_spec():
    g = GridSpec(5.0, 75.0)
    assert g.pole == NORTH
    cells = g.cell_indices()
    assert cells.size == GridSpec(5.0, -75.0).cell_indices().size
    lat, _ = g.latlon(cells)
    assert lat.min() >= 75.0 - 1e-6 and lat.max() < 90.0


def test_band_grid_structure():
    g = BandGridSpec(15.0, 75.0)
    assert 150_000 < g.n_cells < 180_000
    assert g.lat_centers[0] > -75.0 and g.lat_centers[-1] < 75.0
    assert np.allclose(g.lat_centers, -g.lat_centers[::-1])  # 남북 대칭
    cells = g.cell_indices()
    assert cells.size == g.n_cells and cells[0] == 0 and cells[-1] == g.n_cells - 1
    lat, lon = g.latlon(cells)
    assert lon.min() >= -180.0 and lon.max() < 180.0
    # 칸 크기: 모든 행에서 동서 간격이 목표(15 km)에서 크게 벗어나지 않는다
    r = 1737.4 * np.radians(g.dlat_deg)
    ew = r * np.cos(np.radians(g.lat_centers)) * (360.0 / g.dlat_deg) / g.n_lon
    assert np.all(np.abs(ew / r - 1) < 0.1)
    assert r == pytest.approx(15.0, rel=0.02)


def test_band_grid_locate_roundtrip():
    g = BandGridSpec(15.0, 75.0)
    rng = np.random.default_rng(3)
    cells = rng.choice(g.n_cells, 500, replace=False)
    lat, lon = g.latlon(cells)
    assert np.array_equal(g.locate(lat, lon), cells)
    # 칸 중심에서 조금 옮겨도 같은 칸, 날짜변경선 근처 경도 감싸기
    assert np.array_equal(g.locate(lat + 0.2 * g.dlat_deg, lon), cells)
    c = g.locate(np.array([0.0, 0.0]), np.array([179.999, -179.999]))
    la, lo = g.latlon(c)
    assert great_circle_km(0, 179.999, la[0], lo[0]) < 15 and great_circle_km(0, -179.999, la[1], lo[1]) < 15


CYL = """PDS_VERSION_ID = PDS3
RECORD_TYPE = FIXED_LENGTH
RECORD_BYTES = 72
^IMAGE = ("CYL.IMG", 1)
OBJECT = IMAGE
  LINES = 18
  LINE_SAMPLES = 36
  SAMPLE_TYPE = LSB_INTEGER
  SAMPLE_BITS = 16
  SCALING_FACTOR = 1.0
  OFFSET = 1737400.0 <METER>
END_OBJECT = IMAGE
OBJECT = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE = "SIMPLE CYLINDRICAL"
  A_AXIS_RADIUS = 1737.4 <KM>
  CENTER_LATITUDE = 0.0 <DEG>
  CENTER_LONGITUDE = 180.0 <DEG>
  MAP_RESOLUTION = 0.1 <PIX/DEG>
  MAP_SCALE = 303.2 <KM/PIXEL>
  LINE_PROJECTION_OFFSET = 8.5 <PIXEL>
  SAMPLE_PROJECTION_OFFSET = 17.5 <PIXEL>
  POSITIVE_LONGITUDE_DIRECTION = "EAST"
END_OBJECT = IMAGE_MAP_PROJECTION
END
"""


def test_cylindrical_sampler(tmp_path):
    lbl = tmp_path / "CYL.LBL"
    lbl.write_text(CYL)
    rows, cols = np.mgrid[0:18, 0:36]
    dn = (rows * 100 + cols).astype("<i2")
    dn.tofile(tmp_path / "CYL.IMG")
    im = read_pds_image(lbl)
    s = sampler_for(im)
    assert isinstance(s, CylindricalPdsSampler) and not isinstance(s, PolarPdsSampler)
    assert s.scale_km == pytest.approx(1737.4 * np.pi / 180 / 0.1)
    # 화소 중심 ↔ 경위도 왕복
    lat, lon = s.pix_to_latlon(np.array([3.0, 10.0]), np.array([0.0, 20.0]))
    row, col = s.latlon_to_pix(lat, lon)
    assert np.allclose(row, [3, 10]) and np.allclose(norm_lon((col - [0, 20]) * 10), 0)
    # 첫 행 중심은 북위 85°, 0 열 중심은 0.5 화소 = 5° 동쪽 (경도 0° 가 왼쪽 끝)
    assert lat[0] == pytest.approx(55.0) and lon[0] == pytest.approx(5.0)
    assert s(lat[:1], lon[:1])[0] == pytest.approx(dn[3, 0])
    # 날짜변경선을 넘는 쌍선형 보간: 0 열과 35 열의 평균
    v = s(np.array([lat[0]]), np.array([0.0]))[0]
    assert v == pytest.approx((dn[3, 0] + dn[3, 35]) / 2)
