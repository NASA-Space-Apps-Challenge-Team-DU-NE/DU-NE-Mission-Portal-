"""s60 textures: 3D 남극 텍스처(WAC 모자이크 → AEQD 원판)와 2D 지도 음영기복."""

from __future__ import annotations

import json
from pathlib import Path

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
    dem_lbl, dem_img = ctx.data.first(f"{RELIEF_DEMS['south'][0]}.lbl"), ctx.data.first(f"{RELIEF_DEMS['south'][0]}.img")
    if meta.exists() or (dem_lbl and dem_img):
        # build/terrain/meta.json(s20) 이 없으면 같은 LOLA 240 m DEM 을 직접 읽는다
        if meta.exists():
            dem = Terrain(meta).dem240
        else:
            from luna.io.pds import PolarPdsSampler, read_pds_image

            dem = PolarPdsSampler(read_pds_image(dem_lbl, dem_img))
        lat, lon, inside, rad = aeqd_raster_latlon(1024, g.lat_limit_deg)
        z = dem(lat.ravel(), lon.ravel()).reshape(lat.shape)
        hs = hillshade(np.nan_to_num(z, nan=np.nanmean(z)), 2 * rad / 1024)
        a = np.where(inside, (hs * 255).astype(np.uint8), 0).astype(np.uint8)
        alpha = np.where(inside, 255, 0).astype(np.uint8)
        Image.fromarray(np.dstack([a, a, a, alpha]), "RGBA").save(ctx.out_path("textures/south_hillshade_1024.png"))
        out["hillshade"] = {"file": "south_hillshade_1024.png", "size": 1024, "radius_km": rad, "projection": "AEQD south, x=ρ·sinλ, y=ρ·cosλ, 위=+y(경도 0)"}
        from luna.contracts import Provenance

        if meta.exists():
            prov += [Provenance(**p) for p in json.loads(meta.read_text(encoding="utf-8"))["provenance"] if p["role"] == "dem240"]
        else:
            prov.append(ctx.prov(dem_img, "dem240"))
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
    out.update(relief_textures(ctx, prov))
    if out:
        notes = ["3D 남극 캡·2D 지도 배경용 그림. 계산에는 쓰지 않는다", "relief_*: LOLA DEM 경사(동·북 방향 기울기)를 RGB 로 담은 3D 음영용 그림. 화면이 태양 방향으로 밝기를 계산한다. 계산(일조·경사 레이어)에는 쓰지 않는다", "전역 표면(globe_*)은 NASA SVS CGI Moon Kit 시각화 RGB를 회색으로 바꾼 것. 정량 반사율이 아니다"]
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


# ───────── 3D 지형 음영 (2026-11-15): DEM 기울기 텍스처 ─────────
#: 기울기 부호화: R = 128 + 255·∂z/∂동, G = 128 + 255·∂z/∂북 (±0.5 = ±26.6° 에서 잘림), B = 128.
RELIEF_GAIN = 255.0
RELIEF_DEMS = {
    "south": ("Raw_Data/LOLA_DEM/ldem_75s_240m", -1),
    "north": ("Raw_Data/LOLA_DEM_North_2026-11-15/ldem_75n_240m", 1),
}
RELIEF_GLOBAL = "Raw_Data/LOLA_DEM_Global_PDS_2026-11-15/ldem_64"


def _encode_relief(ge: np.ndarray, gn: np.ndarray, ok: np.ndarray) -> np.ndarray:
    def ch(g):
        return np.where(ok, np.clip(128.0 + RELIEF_GAIN * np.nan_to_num(g), 0, 255), 128).astype(np.uint8)

    return np.dstack([ch(ge), ch(gn), np.full(ge.shape, 128, np.uint8)])


def polar_relief(z: np.ndarray, px_km: float, lon: np.ndarray, pole: int):
    """AEQD 극 래스터(행 0 = +Y) 고도 → (∂z/∂동, ∂z/∂북). 남극 X=ρsinλ, Y=ρcosλ / 북극 X=ρsinλ, Y=−ρcosλ."""
    d_row, d_col = np.gradient(z, px_km * 1000.0)
    gX, gY = d_col, -d_row
    l = np.radians(lon)
    if pole < 0:  # ρ 증가 = 북쪽
        gn = gX * np.sin(l) + gY * np.cos(l)
        ge = gX * np.cos(l) - gY * np.sin(l)
    else:  # ρ 증가 = 남쪽
        gn = -(gX * np.sin(l) - gY * np.cos(l))
        ge = gX * np.cos(l) + gY * np.sin(l)
    return ge, gn


def cyl_relief(z: np.ndarray, lat: np.ndarray, dlat_deg: float, dlon_deg: float):
    """등장방형 래스터(행 0 = 북, 열 = 경도 증가, 경도 방향 이어짐) 고도 → (∂z/∂동, ∂z/∂북)."""
    from luna.constants import R_MOON_KM as R

    m_lat = R * 1000.0 * np.radians(dlat_deg)
    gn = np.empty_like(z)
    gn[1:-1] = (z[:-2] - z[2:]) / (2 * m_lat)
    gn[0], gn[-1] = gn[1], gn[-2]
    m_lon = R * 1000.0 * np.radians(dlon_deg) * np.maximum(np.cos(np.radians(lat)), np.cos(np.radians(85.0)))[:, None]
    ge = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2 * m_lon)
    return ge, gn


def relief_textures(ctx: Ctx, prov: list) -> dict:
    """3D 달 지형 음영: 남극·북극(75° 이상, AEQD 2048²)과 전역(등장방형, ldem_64 5×5 평균) DEM 기울기 텍스처."""
    from PIL import Image

    from luna.io.pds import CylindricalPdsSampler, PolarPdsSampler, read_pds_image

    g = ctx.settings.grid
    res = {}
    for region, (stem, pole) in RELIEF_DEMS.items():
        lbl, img_p = ctx.data.first(f"{stem}.lbl"), ctx.data.first(f"{stem}.img")
        if not (lbl and img_p):
            log.warn(NAME, f"{stem} 없음 → {region} 지형 음영 건너뜀")
            continue
        size = 2048
        rad = np.radians(90.0 + g.lat_limit_deg) * R_MOON_KM  # 남극 캡과 같은 반경 (15°)
        c = (np.arange(size) + 0.5) / size * 2 * rad - rad
        X, Y = np.meshgrid(c, -c)
        lat, lon = aeqd_inverse(X, Y, pole=pole)
        inside = np.hypot(X, Y) <= rad
        smp = PolarPdsSampler(read_pds_image(lbl, img_p))
        z = smp(lat.ravel(), lon.ravel()).reshape(lat.shape)
        ok = np.isfinite(z) & inside
        zf = np.where(np.isfinite(z), z, np.nanmean(z))
        ge, gn = polar_relief(zf, 2 * rad / size, lon, pole)
        name = f"relief_{region}_2048.jpg"
        Image.fromarray(_encode_relief(ge, gn, ok), "RGB").save(ctx.out_path(f"textures/{name}"), quality=90, subsampling=0, optimize=True)
        ys = "y=ρ·cosλ" if pole < 0 else "y=−ρ·cosλ"
        res[f"relief_{region}"] = {"file": name, "size": size, "radius_km": float(rad), "gain": RELIEF_GAIN,
                                   "projection": f"AEQD {'남극' if pole < 0 else '북극'}, x=ρ·sinλ, {ys}, 위=+y",
                                   "encoding": "R=128+gain·∂z/∂동, G=128+gain·∂z/∂북 (무차원 기울기)", "source": Path(stem).name}
        prov.append(ctx.prov(img_p, f"relief_{region}", allow_unlisted=True, source_crs=smp.img.crs.summary()))
        log.info(NAME, f"{region} 지형 음영 2048² 저장")

    lbl, img_p = ctx.data.first(f"{RELIEF_GLOBAL}.lbl"), ctx.data.first(f"{RELIEF_GLOBAL}.img")
    if lbl and img_p:
        img = read_pds_image(lbl, img_p)
        smp = CylindricalPdsSampler(img)
        k = 5
        L, S = (img.data.shape[0] // k) * k, (img.data.shape[1] // k) * k
        H, W = L // k, S // k
        z = np.empty((H, W), np.float32)
        for r in range(0, H, 128):  # 줄 묶음씩 5×5 평균 (메모리 절약)
            blk = img.data[r * k:min(H, r + 128) * k, :S].astype(np.float32)
            z[r:r + blk.shape[0] // k] = blk.reshape(-1, k, W, k).mean(axis=(1, 3)) * img.scale + img.offset
        rows, cols = np.arange(H) * k + (k - 1) / 2, np.arange(W) * k + (k - 1) / 2
        lat = smp.pix_to_latlon(rows, np.zeros(H))[0]
        lon = smp.pix_to_latlon(np.zeros(W), cols)[1]
        order = np.argsort(lon)  # 경도 −180…180 왼→오
        z, lon = z[:, order], lon[order]
        if lat[0] < lat[-1]:
            z, lat = z[::-1], lat[::-1]
        ge, gn = cyl_relief(z.astype(np.float64), lat, 180.0 / H, 360.0 / W)
        name = f"relief_global_{W}.jpg"
        Image.fromarray(_encode_relief(ge, gn, np.isfinite(z)), "RGB").save(ctx.out_path(f"textures/{name}"), quality=90, subsampling=0, optimize=True)
        res["relief_global"] = {"file": name, "width": W, "height": H, "gain": RELIEF_GAIN,
                                "projection": "등장방형, 경도 −180…180(왼→오), 위도 90…−90(위→아래)",
                                "encoding": "R=128+gain·∂z/∂동, G=128+gain·∂z/∂북 (무차원 기울기)",
                                "source": f"ldem_64 {k}×{k} 평균 (약 {R_MOON_KM * np.pi / 180 / 64 * k:.2f} km/화소)"}
        prov.append(ctx.prov(img_p, "relief_global", allow_unlisted=True, source_crs=img.crs.summary()))
        log.info(NAME, f"전역 지형 음영 {W}×{H} 저장")
    else:
        log.warn(NAME, f"{RELIEF_GLOBAL} 없음 → 전역 지형 음영 건너뜀")
    return res
