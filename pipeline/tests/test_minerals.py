"""작업 5·6·7: 광물·지질 입력의 결측·품질 처리와 좌표 해석."""

from __future__ import annotations

import io
import zipfile

import numpy as np
import pandas as pd
import pytest

from luna.io.kaguya import FEO_MISSING, feo_values, read_raw_zip
from luna.io.minerals import rockfalls_south, tio2_numeric, wac_tio2_quality
from luna.stages.s50_layers import CellStats

AUX = """<PAMDataset><Metadata domain="xml:ESRI" format="xml"><GeodataXform>
<SpatialReference><WKT>PROJCS["Stereographic_South_Pole",GEOGCS["GCS_Moon_2000",DATUM["D_Moon_2000",SPHEROID["Moon_2000_IAU_IAG",1737400.0,0.0]]],PROJECTION["Stereographic_South_Pole"]]</WKT></SpatialReference>
<SourceGCPs><Double>0.04</Double><Double>0</Double><Double>0</Double><Double>0</Double><Double>0</Double><Double>0.04</Double><Double>0.04</Double><Double>0.04</Double></SourceGCPs>
<TargetGCPs><Double>2000</Double><Double>2000</Double><Double>-2000</Double><Double>2000</Double><Double>-2000</Double><Double>-2000</Double><Double>2000</Double><Double>-2000</Double></TargetGCPs>
</GeodataXform></Metadata></PAMDataset>"""


def _fake_zip(tmp_path, arr: np.ndarray):
    from PIL import Image

    buf = io.BytesIO()
    Image.fromarray(arr.astype(np.float32), mode="F").save(buf, format="TIFF", dpi=(100, 100))
    p = tmp_path / "fake.tif.zip"
    with zipfile.ZipFile(p, "w") as z:
        z.writestr("fake.tif", buf.getvalue())
        z.writestr("fake.tif.aux.xml", AUX)
    return p


def test_kaguya_raw_rows_flipped_and_corners(tmp_path):
    # 4×4, TIFF 0행(맨 위로 저장된 행)이 남쪽 끝이어야 한다 (IDL 아래 행부터 저장)
    a = np.arange(16, dtype=np.float32).reshape(4, 4)
    raw = read_raw_zip(_fake_zip(tmp_path, a))
    assert raw.flipped
    assert raw.cell_m == pytest.approx(1000.0)
    assert (raw.x0_m, raw.y0_m) == (-2000.0, 2000.0)
    assert np.array_equal(raw.data, a[::-1])


def test_feo_missing_marker_and_interpolated_cells_are_not_values(tmp_path):
    a = np.array([[FEO_MISSING, 5.0], [7.0, 9.0]], dtype=np.float32)
    raw = read_raw_zip(_fake_zip(tmp_path, np.pad(a, ((0, 2), (0, 2)), constant_values=FEO_MISSING)))
    counts = np.ones_like(raw.data)
    counts[raw.data == 9.0] = 0  # 관측 수 0 → 저자 보간
    v, q = feo_values(raw, counts)
    assert not np.any(v == FEO_MISSING)
    assert np.isnan(v[raw.data == 9.0]).all() and (q[raw.data == 9.0] == 4).all()
    assert (q[np.isclose(raw.data, FEO_MISSING)] == 0).all()
    assert np.nanmax(v) == 7.0  # FeO 는 이미 wt% — 100 을 곱하지 않는다


def test_wac_tio2_quality_codes():
    v = np.array([np.nan, 1.0, 1.5, 2.0, 8.0, 15.0, 15.01, 127995.0, -3.0])
    q = wac_tio2_quality(v)
    assert q.tolist() == [0, 2, 3, 1, 1, 1, 3, 3, 3]
    num = tio2_numeric(v, q)
    assert np.isnan(num[[0, 1, 2, 6, 7, 8]]).all()        # 표식 1·이상치·결측은 수치가 아니다
    assert np.nanmax(num) == 15.0                          # 잘라서 15 로 만든 값이 아니라 원래 15


def test_cell_median_and_fractions():
    st = CellStats(3, keep_values=True)
    idx = np.array([0, 0, 0, 1, 1, -1, 2])
    v = np.array([1.0, 3.0, 100.0, 2.0, 4.0, 9.0, np.nan])
    ok = np.isfinite(v) & (v <= 15)
    st.add(idx, v, ok, ge2=ok & (v >= 2))
    med = st.median()
    assert med[0] == 2.0 and med[1] == 3.0 and np.isnan(med[2])  # 이상치 100 은 중앙값에 들어가지 않음
    assert st.frac()[0] == pytest.approx(2 / 3)
    assert st.frac(st.extra["ge2"], st.valid)[0] == pytest.approx(0.5)


def test_rockfalls_exact_duplicates_only(tmp_path):
    p = tmp_path / "r.csv"
    pd.DataFrame({"NAC_ID": ["a", "a", "b", "c"], "C_LON": [350.0, 350.0, 10.0, 20.0], "C_LAT": [-85.0, -85.0, -85.00001, -60.0], "C": [0.7, 0.7, 0.8, 0.9]}).to_csv(p, index=False)
    s, info = rockfalls_south(p, -75.0)
    assert info["exact_duplicates_removed"] == 1
    assert len(s) == 2                     # 가까운 다른 영상 검출(b)은 묶지 않는다
    assert s["lon_deg"].max() <= 180       # 경도 (−180, 180]
