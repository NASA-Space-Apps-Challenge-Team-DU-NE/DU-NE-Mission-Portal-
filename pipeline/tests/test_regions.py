"""s50 북극·전역 레이어 도우미 (s50_regions)."""
import io
import zipfile

import numpy as np
import pytest

from luna.geo.polar import BandGridSpec
from luna.stages.s50_regions import Cells, SlopeAgg, _cmp, _polyline_vertices, _read_lp_hydrogen, _read_lp_table, _stereo_k


def _band_cells() -> Cells:
    """파일 없이 전역 띠 격자 Cells 를 만든다 (모든 칸 사용)."""
    c = Cells.__new__(Cells)
    c.region = "global"
    c.spec = BandGridSpec(15.0, 75.0)
    c.cells = np.arange(c.spec.n_cells, dtype=np.uint32)
    c.lut = np.arange(c.spec.n_cells, dtype=np.int64)
    c.lat, c.lon = (np.asarray(a, float) for a in c.spec.latlon(c.cells))
    c.n = c.cells.size
    return c


def test_band_index_matches_web_reference():
    # 웹 terrainGrids.test.ts 와 같은 기준 칸
    c = _band_cells()
    got = c.index(np.array([0.674, -43.3, 17.0, 80.0, np.nan]), np.array([23.473, -11.36, 59.1, 0.0, 0.0]))
    assert got.tolist() == [82978, 23851, 106751, -1, -1]


def test_cell_centers_index_to_themselves():
    c = _band_cells()
    k = np.arange(0, c.n, 997)
    assert np.array_equal(c.index(c.lat[k], c.lon[k]), k)


def test_slope_agg_mean_and_quantile():
    a = SlopeAgg(2)
    a.add(np.array([0, 0, 0, 0, 1, -1, 1]), np.array([1.0, 2.0, 3.0, 10.0, np.nan, 50.0, 5.0]))
    m = a.mean()
    assert m[0] == pytest.approx(4.0) and m[1] == pytest.approx(5.0)
    # 0.25° 구간 중앙값으로 분위수: 90분위는 10° 가 든 구간
    assert a.quantile(0.9)[0] == pytest.approx(10.125)
    e = SlopeAgg(1)
    assert np.isnan(e.mean()[0]) and np.isnan(e.quantile(0.5)[0])


def test_stereo_k_is_one_at_pole():
    assert _stereo_k(np.array([90.0]))[0] == pytest.approx(1.0)
    assert _stereo_k(np.array([-75.0]))[0] > 1.0


def test_cmp_reports_difference():
    r = _cmp(np.array([1.0, 2.0, 3.0, np.nan]), np.array([0.0, 1.0, 2.0, 5.0]))
    assert r["n"] == 3 and r["mean_diff_deg"] == pytest.approx(1.0) and r["corr"] == pytest.approx(1.0)
    assert _cmp(np.array([1.0]), np.array([1.0])) == {"n": 1}


def test_read_lp_table_checks_column_count(tmp_path):
    fmt = tmp_path / "a.fmt"
    fmt.write_text('OBJECT = COLUMN\n NAME = "A"\nEND_OBJECT\nOBJECT = COLUMN\n NAME = "B"\nEND_OBJECT\n')
    tab = tmp_path / "a.tab"
    tab.write_text("1 2\n3 4\n")
    df = _read_lp_table(tab, fmt)
    assert list(df.columns) == ["A", "B"] and df["B"].tolist() == [2, 4]
    tab.write_text("1 2 3\n")
    with pytest.raises(ValueError):
        _read_lp_table(tab, fmt)


def test_read_lp_hydrogen(tmp_path):
    p = tmp_path / "h.txt"
    p.write_text("# comment\n-90, -88, -180, -90, 120.5\n\n88 90 0 180 33\n")
    (la0, la1, lo0, lo1), h = _read_lp_hydrogen(p)
    assert la0.tolist() == [-90, 88] and lo1.tolist() == [-90, 180] and h.tolist() == [120.5, 33]


def _shp_zip(tmp_path, prj: str):
    import shapefile

    b = {k: io.BytesIO() for k in ("shp", "shx", "dbf")}
    w = shapefile.Writer(shp=b["shp"], shx=b["shx"], dbf=b["dbf"], shapeType=shapefile.POLYLINE)
    w.field("ID", "N")
    w.line([[[0.0, 0.0], [1.0, 0.0]]])
    w.record(1)
    w.close()
    zp = tmp_path / "S.ZIP"
    with zipfile.ZipFile(zp, "w") as z:
        for k, v in b.items():
            z.writestr(f"S.{k.upper()}", v.getvalue())
        z.writestr("S.PRJ", prj)
    return zp


def test_polyline_accepts_unnamed_lunar_sphere(tmp_path):
    prj = 'GEOGCS["unnamed ellipse",DATUM["D_unknown",SPHEROID["Unknown",1737400,0]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'
    la, lo = _polyline_vertices(_shp_zip(tmp_path, prj), "S", step_km=1.0)
    # 1° 적도 = 약 30.3 km → 31 구간 + 끝점
    assert la.size == 32 and lo.min() == 0.0 and lo.max() == 1.0 and np.all(la == 0)


def test_polyline_rejects_earth(tmp_path):
    prj = 'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["Degree",0.017453292519943295]]'
    with pytest.raises(ValueError):
        _polyline_vertices(_shp_zip(tmp_path, prj), "S")


# ───────── s60 3D 지형 음영 기울기 ─────────
def test_polar_relief_east_north_slopes():
    from luna.geo.polar import aeqd_forward
    from luna.stages.s60_textures import polar_relief

    # 극 근처 국지 평면에서 "동쪽으로 오르는" 면: 경도 30° 지점 주변에서 z = 동쪽 거리(m) × 0.1
    for pole in (-1, 1):
        n, px = 81, 1.0
        c = (np.arange(n) - n // 2) * px
        lat0 = pole * 80.0
        x0, y0 = aeqd_forward(lat0, 30.0, pole=pole)
        X, Y = np.meshgrid(x0 + c, y0 - c)
        l = np.radians(30.0)
        east = np.array([np.cos(l), np.sin(l)]) if pole > 0 else np.array([np.cos(l), -np.sin(l)])
        z = 0.1 * 1000.0 * ((X - x0) * east[0] + (Y - y0) * east[1])
        ge, gn = polar_relief(z, px, np.full(z.shape, 30.0), pole)
        assert ge[n // 2, n // 2] == pytest.approx(0.1, abs=1e-6)
        assert gn[n // 2, n // 2] == pytest.approx(0.0, abs=1e-6)


def test_cyl_relief_north_slope_and_wrap():
    from luna.constants import R_MOON_KM
    from luna.stages.s60_textures import cyl_relief

    H, W = 90, 180
    lat = 90 - (np.arange(H) + 0.5) * 2.0
    z = np.repeat((np.radians(lat) * R_MOON_KM * 1000 * 0.05)[:, None], W, axis=1)  # 북쪽으로 0.05 기울기
    ge, gn = cyl_relief(z, lat, 2.0, 2.0)
    assert np.allclose(gn[1:-1], 0.05) and np.allclose(ge, 0.0)
    zl = np.tile(np.arange(W, dtype=float), (H, 1))  # 경도 방향 경사, 열 끝에서 이어 붙는지
    ge2, _ = cyl_relief(zl, lat, 2.0, 2.0)
    assert np.isfinite(ge2).all() and ge2[45, 0] < 0  # 열 0 은 이웃이 179 → 음의 차분
