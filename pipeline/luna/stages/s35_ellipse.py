"""s35 ellipse: 착륙 오차 타원 판정용 국지 경사 패치 (P3-05).

카탈로그 남극 착륙지마다 중심 ±6 km 정사각 패치를 원래 해상도로 자른다.
- 85°S 이남: LOLA LDEM_85S_10M (10 m), 그 밖(80°S 이남): LDEM_80S_20M (20 m)
- 타원이 닿을 수 있는 반경(장축 절반 5 km) 안에 그 DEM 범위 밖 픽셀이 있으면 패치 전체를 한 단계 낮은 해상도로 다시 만든다
  (10 m → 20 m → 30 m). 30 m 는 SouthPolar_75S_90S_v1/Regional/Terrain_30m (75°S 이남, float32 m). 해상도를 섞지 않는다.
- 30 m 제품에는 픽셀별 관측 수 지도가 없다 → 관측 비트 0, index 의 obs_known = false
- 값: 1바이트 = 경사(0.5° 단위, 0–126 → 0–63°, 126 = 63° 이상, 127 = 자료 없음) | 관측 비트(0x80, ldec ≥ 1)
- 경사는 고도(DN×0.5 m)의 중앙 차분(기준 길이 = 픽셀 2개). 극 평사도법 축척(85°S 에서 약 0.2%) 보정은 하지 않는다.
- DEM 은 결측 없이 보간값으로 채워져 있으므로 관측 비트를 반드시 함께 쓴다 (Raw_Data/LOLA_DEM_Polar_HiRes/README.md).
보간으로 해상도를 올리지 않는다. 화면은 원래 해상도와 관측 비율을 함께 보여 준다.
"""

from __future__ import annotations

import math

import numpy as np

from luna import log
from luna.catalogs import load_sites
from luna.contracts import Envelope
from luna.stages.common import Ctx, write_bin, write_envelope

NAME = "s35"
HALF_KM = 6.0
REACH_KM = 5.0  # 타원(10×5 km)이 닿을 수 있는 최대 반경
# 해상도 → (DEM, 관측 수 지도 또는 None, 고도 배율, 결측값, 이 DEM 이 덮는 최북단 위도)
SRC = {
    10: ("Raw_Data/LOLA_DEM_Polar_HiRes/ldem_85s_10m.lbl", "Raw_Data/LOLA_DEM_Polar_HiRes/ldec_85s_10m.lbl", 0.5, -32768, -85.0),
    20: ("Raw_Data/LOLA_DEM_Polar_HiRes/ldem_80s_20m.lbl", "Raw_Data/LOLA_DEM_Polar_HiRes/ldec_80s_20m.lbl", 0.5, -32768, -80.0),
    30: ("SouthPolar_75S_90S_v1/Regional/Terrain_30m/LOLA_LDEM_75S_30m.vrt", None, 1.0, None, -75.0),
}
ORDER = [10, 20, 30]


def run(ctx: Ctx) -> int:
    try:
        import rasterio
        from pyproj import CRS, Transformer
        from rasterio.windows import Window
    except ImportError:
        log.warn(NAME, "rasterio·pyproj 가 없어 건너뜀")
        return 0
    seed = ctx.data.first("Catalogs/sites.json")
    if not seed:
        log.warn(NAME, "Catalogs/sites.json 없음")
        return 0
    sites, _ = load_sites(seed)
    south = [s for s in sites if s["lat_deg"] <= -80.0 and (not ctx.only or s["id"] in ctx.only)]
    geo = CRS.from_proj4("+proj=longlat +R=1737400 +no_defs")
    opened: dict = {}
    prov: list = []
    index = []

    def open_src(res: int):
        if res in opened:
            return opened[res]
        dem_rel, dec_rel, *_ = SRC[res]
        dem_p = ctx.data.path(dem_rel)
        dec_p = ctx.data.path(dec_rel) if dec_rel else None
        if not dem_p.exists() or (dec_p is not None and not dec_p.exists()):
            log.warn(NAME, f"{dem_rel} 없음 → {res} m 건너뜀")
            opened[res] = None
        else:
            opened[res] = (rasterio.open(dem_p), rasterio.open(dec_p) if dec_p else None)
            prov.append(ctx.prov(dem_p, f"dem{res}", allow_unlisted=True))
            if dec_p:
                prov.append(ctx.prov(dec_p, f"ldec{res}", allow_unlisted=True))
        return opened[res]

    def build(s: dict, res: int):
        dem, dec = opened[res]
        _, _, scale, nod, _ = SRC[res]
        to_xy = Transformer.from_crs(geo, dem.crs, always_xy=True)
        x, y = to_xy.transform(s["lon_deg"], s["lat_deg"])
        col, row = ~dem.transform * (x, y)  # 픽셀 모서리 기준 연속 좌표
        n = int(round(2 * HALF_KM * 1000 / res))
        c0, r0 = int(round(col - n / 2)), int(round(row - n / 2))
        win = Window(c0 - 1, r0 - 1, n + 2, n + 2)  # 경사 차분용으로 한 픽셀씩 더
        z = dem.read(1, window=win, boundless=True, fill_value=nod if nod is not None else np.nan).astype(np.float32)
        if nod is not None:
            z[z == nod] = np.nan
        z *= scale  # 고도 m (극지 IMG 의 GDAL offset 1,737,400 은 반지름이라 쓰지 않음)
        gy, gx = np.gradient(z, res)
        slope = np.degrees(np.arctan(np.hypot(gx, gy)))[1:-1, 1:-1]
        q = np.where(np.isfinite(slope), np.clip(np.round(slope * 2), 0, 126), 127).astype(np.uint8)  # 127 = 자료 없음
        obs = dec.read(1, window=Window(c0, r0, n, n), boundless=True, fill_value=0) >= 1 if dec else np.zeros_like(q, dtype=bool)
        # 타원이 닿을 수 있는 반경 안의 자료 없음
        jj, ii = np.mgrid[0:n, 0:n]
        r_m = np.hypot((ii + 0.5 - (col - c0)) * res, (jj + 0.5 - (row - r0)) * res)
        gap = bool(((q == 127) & (r_m <= REACH_KM * 1000)).any())
        xe, ye = to_xy.transform(s["lon_deg"] + 1e-4, s["lat_deg"])
        xn, yn = to_xy.transform(s["lon_deg"], s["lat_deg"] + 1e-4)
        ne = math.hypot(xe - x, ye - y) or 1.0
        nn = math.hypot(xn - x, yn - y) or 1.0
        valid = q != 127
        info = {
            "id": s["id"], "file": f"ellipse/{s['id']}.u8", "res_m": res, "size": n,
            "center_px": [col - c0, row - r0],  # 패치 안 착륙지 위치 (픽셀 모서리 기준; 픽셀 i 의 중심 = i + 0.5)
            "east_xy": ((xe - x) / ne, (ye - y) / ne), "north_xy": ((xn - x) / nn, (yn - y) / nn),
            "obs_known": dec is not None,
            "observed_frac": round(float(obs[valid].mean()), 4) if (dec is not None and valid.any()) else None,
            "nodata_frac": round(float((~valid).mean()), 4),
            "source": SRC[res][0].split("/")[-1].rsplit(".", 1)[0],
        }
        return q | (obs.astype(np.uint8) << 7), info, gap

    for s in south:
        first = 10 if s["lat_deg"] <= SRC[10][4] else 20
        tried = []
        for res in ORDER[ORDER.index(first):]:
            if open_src(res) is None:
                continue
            byte, info, gap = build(s, res)
            tried.append(res)
            if not gap or res == ORDER[-1]:
                break
        else:
            continue
        if len(tried) > 1:
            info["fallback_from_m"] = tried[0]
        write_bin(ctx, f"ellipse/{s['id']}.u8", byte, "uint8")
        index.append(info)
        obs_txt = f"관측 {info['observed_frac'] * 100:.1f}%" if info["obs_known"] else "관측 수 지도 없음"
        fb = f" ({tried[0]} m 범위 밖이 타원 반경에 걸려 대체)" if len(tried) > 1 else ""
        log.info(NAME, f"{s['id']}: {info['res_m']} m 패치 {info['size']}², {obs_txt}, 자료 없음 {info['nodata_frac'] * 100:.1f}%{fb}")
    for v in opened.values():
        if v:
            v[0].close()
            if v[1]:
                v[1].close()
    if index:
        write_envelope(ctx, "ellipse/index.json", Envelope(
            "luna.ellipse.v1",
            {"half_km": HALF_KM, "encoding": "uint8: 하위 7비트 경사×2 (126=63° 이상, 127=자료 없음), 최상위 비트 = 관측(ldec≥1)", "sites": index},
            prov,
            notes=["원래 해상도 그대로(보간으로 해상도를 올리지 않음)", "경사 기준 길이 = 픽셀 2개", "관측 비트 0 = 레이저 측정 없이 보간한 픽셀 (obs_known=false 면 관측 정보 없음)",
                   "타원 반경 안에 DEM 범위 밖이 있으면 한 단계 낮은 해상도로 패치 전체를 다시 만듦 (fallback_from_m)"],
        ))
    return 0
