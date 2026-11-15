import zipfile

import numpy as np
import pytest

from luna.io.archives import extract_member, join_parts
from luna.io.horizons import horizons_time_to_iso, parse_result
from luna.io.pds import PolarPdsSampler, parse_label, read_pds_image
from luna.io.tables import read_csv
from luna.provenance import sha256_file

LABEL = """PDS_VERSION_ID = PDS3
RECORD_TYPE = FIXED_LENGTH
RECORD_BYTES = 20
^IMAGE = ("TEST.IMG", 1)
OBJECT = IMAGE
  LINES = 10
  LINE_SAMPLES = 10
  SAMPLE_TYPE = LSB_INTEGER
  SAMPLE_BITS = 16
  SCALING_FACTOR = 0.5
  OFFSET = 1737400.0 <METER>
END_OBJECT = IMAGE
OBJECT = IMAGE_MAP_PROJECTION
  MAP_PROJECTION_TYPE = "POLAR STEREOGRAPHIC"
  A_AXIS_RADIUS = 1737.4 <KM>
  CENTER_LATITUDE = -90.0 <DEG>
  CENTER_LONGITUDE = 0.0 <DEG>
  MAP_SCALE = 10.0 <KM/PIXEL>
  LINE_PROJECTION_OFFSET = 4.5 <PIXEL>
  SAMPLE_PROJECTION_OFFSET = 4.5 <PIXEL>
  POSITIVE_LONGITUDE_DIRECTION = "EAST"
  DESCRIPTION = "multi
   line"
END_OBJECT = IMAGE_MAP_PROJECTION
END
"""


def test_label_and_sampler(tmp_path):
    lbl = tmp_path / "TEST.LBL"
    lbl.write_text(LABEL)
    dn = (np.arange(100, dtype="<i2").reshape(10, 10) * 2)
    dn.tofile(tmp_path / "TEST.IMG")
    lab = parse_label(LABEL)
    assert lab["IMAGE_MAP_PROJECTION"]["MAP_SCALE"] == {"value": 10.0, "unit": "KM/PIXEL"}
    im = read_pds_image(lbl)
    assert im.offset == 0.0 and im.scale == 0.5
    s = PolarPdsSampler(im)
    lat, lon = s.pix_to_latlon(np.array([2.0]), np.array([7.0]))
    row, col = s.latlon_to_pix(lat, lon)
    assert row[0] == pytest.approx(2.0) and col[0] == pytest.approx(7.0)
    h = s(lat, lon)
    assert h[0] == pytest.approx(dn[2, 7] * 0.5)
    assert np.isnan(s(np.array([-75.0]), np.array([0.0]))[0])  # 범위 밖


def test_join_parts_sha(tmp_path):
    src = tmp_path / "a.bin"
    data = np.random.default_rng(1).bytes(10000)
    src.write_bytes(data)
    parts = []
    for i in range(3):
        p = tmp_path / f"a.zip.part00{i + 1}"
        p.write_bytes(data[i * 4000:(i + 1) * 4000])
        parts.append(p)
    out = join_parts(parts, tmp_path / "build" / "a.joined")
    assert sha256_file(out) == sha256_file(src)


def test_extract_member(tmp_path):
    z = tmp_path / "x.zip"
    with zipfile.ZipFile(z, "w") as f:
        f.writestr("dir/ldem.img", b"abc")
    out = extract_member(z, ".img", tmp_path / "out")
    assert out.read_bytes() == b"abc"


HZ = """*******
 Target body name: Moon (301)
 Target pole/equ : MOON_ME                         {East-longitude positive}
 Date__(UT)__HR:MN, , , ObsSub-LON, ObsSub-LAT, SunSub-LON, SunSub-LAT, r, rdot, delta, deldot,
$$SOE
 2026-Nov-01 00:00, , , 1.5, -2.5, 120.0, 1.2, 0.99, 0.1, 0.0025, 0.1,
 2026-Nov-01 01:00, , , 1.6, -2.4, 119.5, 1.2, 0.99, 0.1, 0.0025, 0.1,
$$EOE
"""


def test_horizons_parse():
    t = parse_result(HZ)
    assert t.earth_lon.tolist() == [1.5, 1.6]
    assert t.sun_lat[0] == 1.2
    assert t.earth_dist_km[0] == pytest.approx(0.0025 * 149597870.7)
    assert t.frame_note == "MOON_ME"
    assert "East-longitude positive" in t.lon_note
    assert horizons_time_to_iso(t.times_utc[1]) == "2026-11-01T01:00:00Z"


def test_read_csv_encodings(tmp_path):
    p = tmp_path / "k.csv"
    p.write_bytes("lat,lon,값\n-80,350,1\n".encode("cp949"))
    df = read_csv(p)
    assert list(df.columns)[2] == "값"
