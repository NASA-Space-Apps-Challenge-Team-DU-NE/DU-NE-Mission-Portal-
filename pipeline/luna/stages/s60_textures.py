"""s60 textures: 3D 남극 텍스처(WAC 모자이크 → AEQD 원판)와 2D 지도 음영기복."""

from __future__ import annotations

import json

import numpy as np

from luna import log
from luna.constants import R_MOON_KM
from luna.contracts import Envelope
from luna.geo.polar import aeqd_inverse
from luna.stages.common import Ctx, write_envelope
from luna.terrain import Terrain

NAME = "s60"
SCHEMA = "luna.textures.v1"


def aeqd_raster_latlon(size: int, lat_limit: float):
    rad = np.radians(90.0 + lat_limit) * R_MOON_KM
    c = (np.arange(size) + 0.5) / size * 2 * rad - rad
    X, Y = np.meshgrid(c, -c)
    lat, lon = aeqd_inverse(X, Y)
    inside = np.hypot(X, Y) <= rad
    return lat, lon, inside, rad


def hillshade(z: np.ndarray, px_km: float, az_deg: float = 315.0, alt_deg: float = 30.0) -> np.ndarray:
    gy, gx = np.gradient(z, px_km * 1000.0)
    slope = np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    az, alt = np.radians(az_deg), np.radians(alt_deg)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect)
    return np.clip(hs, 0, 1)


def run(ctx: Ctx) -> int:
    from PIL import Image

    g = ctx.settings.grid
    prov = []
    meta = ctx.build / "terrain" / "meta.json"
    out = {}
    if meta.exists():
        terr = Terrain(meta)
        lat, lon, inside, rad = aeqd_raster_latlon(1024, g.lat_limit_deg)
        z = terr.dem240(lat.ravel(), lon.ravel()).reshape(lat.shape)
        hs = hillshade(np.nan_to_num(z, nan=np.nanmean(z)), 2 * rad / 1024)
        a = np.where(inside, (hs * 255).astype(np.uint8), 0).astype(np.uint8)
        alpha = np.where(inside, 255, 0).astype(np.uint8)
        Image.fromarray(np.dstack([a, a, a, alpha]), "RGBA").save(ctx.out_path("textures/south_hillshade_1024.png"))
        out["hillshade"] = {"file": "south_hillshade_1024.png", "size": 1024, "radius_km": rad, "projection": "AEQD south, x=ρ·sinλ, y=ρ·cosλ, 위=+y(경도 0)"}
        from luna.contracts import Provenance

        prov += [Provenance(**p) for p in json.loads(meta.read_text(encoding="utf-8"))["provenance"] if p["role"] == "dem240"]
        log.info(NAME, "음영기복 1024² 저장")

    tiles = ctx.data.glob("SouthPolar_75S_90S_v1/Regional/Imaging/wac_south_summer_75s_100m_*.tif")
    if tiles:
        try:
            from pyproj import CRS, Transformer

            from luna.constants import MOON_GEOG_PROJ4
            from luna.io.geotiff import read_downsampled

            size = 2048
            lat, lon, inside, rad = aeqd_raster_latlon(size, g.lat_limit_deg)
            img = np.full(lat.shape, np.nan)
            for t in tiles:
                arr, crs, T, shape = read_downsampled(t, (2048, 2048))
                fwd = Transformer.from_crs(CRS.from_proj4(MOON_GEOG_PROJ4), crs, always_xy=True)
                xs, ys = fwd.transform(lon.ravel(), lat.ravel())
                sx, sy = shape[1] / arr.shape[1], shape[0] / arr.shape[0]
                inv = ~T
                col = (inv.a * xs + inv.b * ys + inv.c) / sx
                row = (inv.d * xs + inv.e * ys + inv.f) / sy
                ci, ri = np.floor(col).astype(int), np.floor(row).astype(int)
                ok = (ci >= 0) & (ri >= 0) & (ci < arr.shape[1]) & (ri < arr.shape[0])
                v = np.full(ci.size, np.nan)
                v[ok] = arr[ri[ok], ci[ok]]
                flat = img.ravel()
                take = np.isfinite(v) & ~np.isfinite(flat)
                flat[take] = v[take]
                img = flat.reshape(lat.shape)
                prov.append(ctx.prov(t, "wac_mosaic", source_crs=str(crs)[:200]))
            fin = np.isfinite(img) & inside
            lo, hi = np.nanpercentile(img[fin], [1, 99])
            g8 = np.where(fin, np.clip((img - lo) / (hi - lo) * 255, 0, 255), 0).astype(np.uint8)
            Image.fromarray(g8).save(ctx.out_path("textures/south_wac_2048.jpg"), quality=88)
            out["wac"] = {"file": "south_wac_2048.jpg", "size": size, "radius_km": rad, "projection": out.get("hillshade", {}).get("projection", "AEQD south")}
            log.info(NAME, "WAC 남극 텍스처 2048² 저장")
        except ImportError:
            log.warn(NAME, "rasterio·pyproj 가 없어 WAC 텍스처를 건너뜀")
    out.update(globe_textures(ctx, prov))
    if out:
        notes = ["3D 남극 캡·2D 지도 배경용 그림. 계산에는 쓰지 않는다", "전역 표면(globe_*)은 NASA SVS CGI Moon Kit 시각화 RGB를 회색으로 바꾼 것. 정량 반사율이 아니다"]
        write_envelope(ctx, "textures/textures.json", Envelope(SCHEMA, out, prov, notes=notes))
    return 0


GLOBE_SRC = "Raw_Data/LROC_Global/lroc_color_poles_8k.tif"


def globe_textures(ctx: Ctx, prov: list) -> dict:
    """3D 달 전역 표면: NASA SVS 4720 CGI Moon Kit RGB(8192×4096, 0° 중심 등장방형) → 회색 JPEG 2k·8k.

    화면 표현 전용. 계산(일조·경사·자원)에는 쓰지 않는다 (DEVELOPER_DATA_INTEGRATION_GUIDE 8.2-6).
    원본 TIFF에 좌표 태그가 없어(identity) 제품 문서의 '0° 중심 전역 등장방형' 정의를 따른다.
    """
    src = ctx.data.path(GLOBE_SRC)
    if not src.exists():
        log.warn(NAME, f"{GLOBE_SRC} 없음 → 3D 전역 표면 텍스처 건너뜀 (화면은 '표면 텍스처 자료 없음')")
        return {}
    try:
        import rasterio
        from PIL import Image
    except ImportError:
        log.warn(NAME, "rasterio·pillow 가 없어 전역 표면 텍스처를 건너뜀")
        return {}
    p = ctx.prov(src, "globe_color", allow_unlisted=True)
    with rasterio.open(src) as ds:
        rgb = ds.read([1, 2, 3]).astype(np.float32)
    g = 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]  # BT.601 휘도
    img = Image.fromarray(np.clip(g, 0, 255).astype(np.uint8), "L")
    res = {}
    for w, name, q in ((2048, "globe_gray_2k.jpg", 88), (8192, "globe_gray_8k.jpg", 80)):
        im = img if img.width == w else img.resize((w, w // 2), Image.LANCZOS)
        im.save(ctx.out_path(f"textures/{name}"), quality=q, optimize=True)
        res[f"globe_{w // 1024}k"] = {
            "file": name, "width": w, "height": w // 2,
            "projection": "등장방형, 경도 −180…180(왼→오), 위도 90…−90(위→아래)",
            "source": "NASA SVS 4720 CGI Moon Kit (LROC WAC 70°N–70°S + 극지 LOLA 보완)",
        }
    prov.append(p)
    log.info(NAME, "전역 표면 회색 텍스처 2k·8k 저장")
    return res
