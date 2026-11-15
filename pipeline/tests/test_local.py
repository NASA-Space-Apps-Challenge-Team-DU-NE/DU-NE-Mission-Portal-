"""s75 국지 음영기복: 국지 틀 방향, VRT 타일 읽기, 좌표계 확인."""

from pathlib import Path

import numpy as np
import pytest

from luna.io.geotiff import VrtTiles
from luna.stages.s75_local import check_polar_srs, local_grid, sample_vrt

SRS = ('PROJCS["Moon (2015) - Sphere / Ocentric / South Polar",GEOGCS["Moon (2015) - Sphere / Ocentric",DATUM["Moon (2015) - Sphere",'
       'SPHEROID["Moon (2015) - Sphere",1737400,0]],PRIMEM["Reference Meridian",0],UNIT["degree",0.0174532925199433]],'
       'PROJECTION["Polar_Stereographic"],PARAMETER["latitude_of_origin",-90],PARAMETER["central_meridian",0],'
       'PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],AXIS["Easting",NORTH],AXIS["Northing",NORTH]]')


def test_local_grid_north_up_east_right():
    lat, lon = local_grid(-85.0, 30.0, 5.0, 64)
    assert lat[0, 32] > -85.0 > lat[-1, 32]  # 위 = 북(위도 증가)
    # 오른쪽 = 동: 남반구에서도 동쪽은 경도가 커지는 쪽
    assert lon[32, -1] > 30.0 > lon[32, 0]
    assert abs(lat[32, 32] + 85.0) < 0.01


def test_check_polar_srs():
    assert "Polar" in check_polar_srs(SRS)
    with pytest.raises(ValueError):
        check_polar_srs(SRS.replace('"latitude_of_origin",-90', '"latitude_of_origin",90'))


def test_vrt_tiles_and_sampling(tmp_path: Path):
    from PIL import Image

    # 2×1 타일 (각 4×4), 30 m, 극 중심 −60 m ~ 60 m
    a = np.arange(16, dtype=np.float32).reshape(4, 4)
    Image.fromarray(a, "F").save(tmp_path / "t1.tif")
    Image.fromarray(a + 100, "F").save(tmp_path / "t2.tif")
    vrt = f"""<VRTDataset rasterXSize="8" rasterYSize="4"><SRS>{SRS.replace('"', '&quot;')}</SRS>
<GeoTransform>-120.0,30,0,60.0,0,-30</GeoTransform><VRTRasterBand dataType="Float32" band="1"><NoDataValue>nan</NoDataValue>
<SimpleSource><SourceFilename relativeToVRT="1">t1.tif</SourceFilename><SrcRect xOff="0" yOff="0" xSize="4" ySize="4"/><DstRect xOff="0" yOff="0" xSize="4" ySize="4"/></SimpleSource>
<SimpleSource><SourceFilename relativeToVRT="1">t2.tif</SourceFilename><SrcRect xOff="0" yOff="0" xSize="4" ySize="4"/><DstRect xOff="4" yOff="0" xSize="4" ySize="4"/></SimpleSource>
</VRTRasterBand></VRTDataset>"""
    (tmp_path / "m.vrt").write_text(vrt)
    v = VrtTiles(tmp_path / "m.vrt")
    w = v.read(0, 4, 2, 6)
    assert w[0, 0] == 2 and w[0, 2] == 100 and w[3, 3] == 113
    assert np.isnan(v.read(0, 1, 7, 9)[0, 1])
    # 남극점 = 화소 (2, 4) 의 왼쪽 위 모서리 → 주변 4화소 평균
    z = sample_vrt(v, np.array([-90.0]), np.array([0.0]))
    assert z[0] == pytest.approx((a[1, 3] + a[2, 3] + (a[1, 0] + 100) + (a[2, 0] + 100)) / 4)
