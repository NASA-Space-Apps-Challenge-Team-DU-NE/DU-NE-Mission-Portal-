"""s20 terrain: DEM 조립 (240 m·80 m PDS, 30 m GeoTIFF VRT) + 좌표계 확인 기록."""

from __future__ import annotations

import json

import numpy as np

from luna import log
from luna.geo.crs import CrsUnknown
from luna.io.archives import extract_member
from luna.io.geotiff import vrt_dependencies
from luna.io.pds import PolarPdsSampler, read_pds_image
from luna.preview import save_gray
from luna.stages.common import Ctx

NAME = "s20"


def _roundtrip_error_km(s: PolarPdsSampler) -> float:
    """픽셀 → 위경도 → 픽셀 왕복 오차 (km)."""
    rows = np.array([s.lines * 0.25, s.lines * 0.5, s.lines * 0.75])
    cols = np.array([s.samples * 0.3, s.samples * 0.5, s.samples * 0.6])
    lat, lon = s.pix_to_latlon(rows, cols)
    r2, c2 = s.latlon_to_pix(lat, lon)
    return float(np.max(np.hypot(r2 - rows, c2 - cols)) * s.scale_km)


def run(ctx: Ctx) -> int:
    d = ctx.data
    lbl240 = d.first("Raw_Data/LOLA_DEM/ldem_75s_240m.lbl")
    img240 = d.first("Raw_Data/LOLA_DEM/ldem_75s_240m.img")
    zip80 = d.first("Raw_Data/LOLA_DEM/ldem_80s_80m.img.zip")
    lbl80 = d.first("Raw_Data/LOLA_DEM/ldem_80s_80m.lbl")
    if not (lbl240 and img240):
        log.warn(NAME, "240 m DEM 이 없다 (필수)")
        return 1
    inputs = [p for p in (lbl240, img240, zip80, lbl80) if p]
    # 30 m VRT 와 실제 타일도 의존성에 넣는다 (고해상도 원본 갱신 → s30·s75 재계산)
    vrt0 = d.first("SouthPolar_75S_90S_v1/Regional/Terrain_30m/*.vrt")
    if vrt0:
        inputs += vrt_dependencies(vrt0)
    key = ctx.stamp_key(NAME, inputs, {"code": 3})
    if ctx.up_to_date(NAME, key):
        log.info(NAME, "변경 없음, 건너뜀")
        return 0

    meta: dict = {"provenance": []}
    try:
        im = read_pds_image(lbl240, img240)
    except CrsUnknown as e:
        log.warn(NAME, f"240 m 좌표계 미확인 → 사용 중단: {e}")
        return 1
    s240 = PolarPdsSampler(im)
    for p, role in ((img240, "dem240"), (lbl240, "dem240_label")):
        meta["provenance"].append(ctx.prov(p, role, source_crs=im.crs.summary(), transform="PDS label 확인 → PolarPdsSampler", lon_convention="-180..180").__dict__)
    meta["dem240"] = {"label": str(lbl240), "image": str(img240), "crs": im.crs.summary(), "roundtrip_km": _roundtrip_error_km(s240)}
    save_gray(np.asarray(im.data[::8, ::8], dtype=float) * im.scale, ctx.build_path("preview/dem240.png"))

    if zip80 and lbl80:
        img80 = extract_member(zip80, ".img", ctx.build_path("terrain/raw"), force=ctx.force)
        ctx.track_output(img80)
        try:
            im80 = read_pds_image(lbl80, img80)
            s80 = PolarPdsSampler(im80)
            for p, role in ((zip80, "dem80"), (lbl80, "dem80_label")):
                meta["provenance"].append(ctx.prov(p, role, source_crs=im80.crs.summary(), transform="PDS label 확인 → PolarPdsSampler", lon_convention="-180..180").__dict__)
            meta["dem80"] = {"label": str(lbl80), "image": str(img80), "crs": im80.crs.summary(), "roundtrip_km": _roundtrip_error_km(s80)}
            # 같은 지점을 두 DEM 에서 찍어 고도 차이 (CLAUDE.md 4.6 규칙 4)
            lat = np.linspace(-89.5, -81, 40)
            lon = np.linspace(-170, 170, 40)
            dh = s80(lat, lon) - s240(lat, lon)
            meta["dem80_vs_240"] = {"n": int(np.isfinite(dh).sum()), "mean_m": float(np.nanmean(dh)), "p95_abs_m": float(np.nanpercentile(np.abs(dh), 95))}
        except CrsUnknown as e:
            log.warn(NAME, f"80 m 좌표계 미확인 → 80 m 사용 안 함: {e}")
    else:
        log.warn(NAME, "80 m DEM 이 없다 → 240 m 만 사용")

    vrt = d.first("SouthPolar_75S_90S_v1/Regional/Terrain_30m/*.vrt")
    if vrt:
        try:
            from luna.geo.crs import from_geotiff

            meta["dem30_vrt"] = str(vrt)
            meta["dem30_crs"] = from_geotiff(vrt).summary()
            for source in vrt_dependencies(vrt):
                source_crs = from_geotiff(source).summary()
                meta["provenance"].append(ctx.prov(source, "dem30" if source == vrt.resolve() else "dem30_tile", allow_unlisted=True, source_crs=source_crs, transform="GeoTIFF/VRT CRS 확인 → 달 위경도 변환", lon_convention="-180..180").__dict__)
        except ImportError:
            log.warn(NAME, "rasterio 가 없어 30 m 타일을 건너뜀")
        except CrsUnknown as e:
            log.warn(NAME, f"30 m 좌표계 미확인 → 사용 안 함: {e}")
            meta.pop("dem30_vrt", None)

    f = ctx.build_path("terrain/meta.json")
    f.write_text(json.dumps(meta, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    log.info(NAME, f"DEM 메타 → {f}")
    for k in ("dem240", "dem80"):
        if k in meta:
            log.info(NAME, f"{k}: {meta[k]['crs']} · 왕복 오차 {meta[k]['roundtrip_km'] * 1000:.3f} m")
    ctx.mark_done(NAME, key)
    return 0
