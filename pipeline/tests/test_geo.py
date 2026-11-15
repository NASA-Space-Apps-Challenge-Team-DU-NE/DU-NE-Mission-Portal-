import numpy as np
import pytest

from luna.constants import R_MOON_KM
from luna.geo.frames import destination, detect_lon_convention, great_circle_km, latlon_to_unit, norm_lon, read_tk_frame, tk_matrix, unit_to_latlon
from luna.geo.polar import GridSpec, aeqd_forward, aeqd_inverse, stereo_forward, stereo_inverse


def test_norm_lon_range():
    assert norm_lon(190) == pytest.approx(-170)
    assert norm_lon(-180) == 180
    assert np.allclose(norm_lon(np.array([359.5, 0.0, 180.0])), [-0.5, 0.0, 180.0])


def test_lon_convention():
    assert detect_lon_convention([0, 90, 350]) == "0..360"
    assert detect_lon_convention([-170, 10]) == "-180..180"


def test_latlon_roundtrip():
    lat, lon = unit_to_latlon(latlon_to_unit(-85.3, -170.2))
    assert lat == pytest.approx(-85.3) and lon == pytest.approx(-170.2)


@pytest.mark.parametrize("fwd,inv", [(aeqd_forward, aeqd_inverse), (stereo_forward, stereo_inverse)])
def test_polar_roundtrip(fwd, inv):
    lat = np.array([-89.99, -85.0, -80.0, -75.0])
    lon = np.array([0.0, 120.0, -179.9, 45.0])
    x, y = fwd(lat, lon)
    la, lo = inv(x, y)
    assert np.allclose(la, lat, atol=1e-9)
    assert np.allclose(norm_lon(lo - lon), 0, atol=1e-9)


def test_aeqd_convention_lon0_is_plus_y():
    x, y = aeqd_forward(-89.0, 0.0)
    assert x == pytest.approx(0, abs=1e-9) and y > 0
    x, y = aeqd_forward(-89.0, 90.0)
    assert x > 0 and y == pytest.approx(0, abs=1e-9)


def test_destination_and_distance():
    lat, lon = destination(-89.0, 0.0, 180.0, 10.0)
    assert great_circle_km(-89.0, 0.0, lat, lon) == pytest.approx(10.0, rel=1e-6)
    assert great_circle_km(-90, 0, -89, 0) == pytest.approx(np.radians(1) * R_MOON_KM)


def test_grid_spec():
    g = GridSpec(5.0, -75.0)
    cells = g.cell_indices()
    assert 25000 < cells.size < 27500  # 반경 약 455 km 원판
    X, Y = g.centers()
    lat, _ = aeqd_inverse(X.ravel()[cells], Y.ravel()[cells])
    assert lat.max() <= -75.0 + 1e-6


TF = r"""
\begindata
   FRAME_MOON_ME            = 31099
   FRAME_31099_NAME         = 'MOON_ME'
   FRAME_31099_CLASS        = 4
   TKFRAME_31099_RELATIVE   = 'MOON_PA_TEST'
   TKFRAME_31099_SPEC       = 'ANGLES'
   TKFRAME_31099_UNITS      = 'ARCSECONDS'
   TKFRAME_31099_AXES       = ( 3, 2, 1 )
   TKFRAME_31099_ANGLES     = ( 10.0, 20.0, 0.5 )
\begintext
"""


def test_read_tk_frame(tmp_path):
    p = tmp_path / "t.tf"
    p.write_text(TF)
    ang, axes, units, rel = read_tk_frame(p)
    assert ang == [10.0, 20.0, 0.5] and axes == [3, 2, 1] and units == "ARCSECONDS" and rel == "MOON_PA_TEST"
    m = tk_matrix(ang, axes, units)
    assert np.allclose(m @ m.T, np.eye(3))


TF_ALIAS = r"""
\begindata
   FRAME_MOON_ME            = 31001
   TKFRAME_31001_SPEC       = 'MATRIX'
   TKFRAME_31001_RELATIVE   = 'MOON_ME_TEST'
   TKFRAME_31001_MATRIX     = ( 1 0 0
                                0 1 0
                                0 0 1 )
   FRAME_MOON_ME_TEST       = 31009
   TKFRAME_31009_SPEC       = 'ANGLES'
   TKFRAME_31009_RELATIVE   = 'MOON_PA_TEST'
   TKFRAME_31009_ANGLES     = ( 67.8, 78.6, 0.27 )
   TKFRAME_31009_AXES       = ( 3, 2, 1 )
   TKFRAME_31009_UNITS      = 'ARCSECONDS'
\begintext
"""


def test_read_tk_frame_follows_identity_matrix_alias(tmp_path):
    """moon_de440_250416.tf 처럼 MOON_ME 가 단위행렬 MATRIX 별칭이면 ANGLES 프레임까지 따라간다."""
    p = tmp_path / "a.tf"
    p.write_text(TF_ALIAS)
    ang, axes, units, rel = read_tk_frame(p)
    assert ang == [67.8, 78.6, 0.27] and axes == [3, 2, 1] and rel == "MOON_PA_TEST"


def test_read_tk_frame_rejects_non_identity_matrix(tmp_path):
    p = tmp_path / "b.tf"
    p.write_text(TF_ALIAS.replace("0 0 1 )", "0 0 2 )"))
    with pytest.raises(ValueError):
        read_tk_frame(p)
